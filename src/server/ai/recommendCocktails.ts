import { generateJsonText, parseGeminiJson, sanitizeLlmText } from "@/shared/lib/geminiClient";
import { prisma } from "@/shared/lib/prisma";
import type { EmotionVector, CocktailVector, RecommendedCocktail } from "@/shared/types";

const DESCRIPTION_PROMPT = `당신은 칵테일을 잘 아는 바텐더입니다.
고객 감정을 보고, 각 칵테일이 지금 기분에 왜 어울리는지 자연스럽고 생생하게 설명해주세요.

규칙:
- 반드시 한국어
- 반드시 ~요 또는 ~ㅂ니다 로 끝낼 것 — 반말(~야, ~거야, ~줄게 등) 절대 금지
- 칵테일의 실제 맛·향 특성이 감정과 어떻게 맞는지 구체적으로 (맛, 향, 느낌 직접 언급)
- 모든 설명이 비슷한 패턴으로 시작하거나 끝나면 안 됨 — 각각 다르게
- 1~3문장, 느낌표·말줄임표 자유롭게
- "을(를)", "이(가)" 같은 이중 조사 절대 금지
- 반드시 JSON 배열로만 반환: ["설명1", "설명2", ...]`;

function emotionToVector(e: EmotionVector): CocktailVector {
  return {
    // joy·sadness → sweet (comfort), low excitement → more sweet
    sweetness: e.joy * 0.35 + e.sadness * 0.40 + (1 - e.excitement) * 0.15 + (1 - e.stress) * 0.10,
    // excitement·joy → bright/sour, low fatigue → more sour
    sourness: e.excitement * 0.50 + e.joy * 0.25 + (1 - e.fatigue) * 0.25,
    // stress·sadness·fatigue → bitter
    bitterness: e.stress * 0.45 + e.sadness * 0.30 + e.fatigue * 0.25,
    // stress·excitement → strong, low fatigue → slightly stronger
    strength: e.stress * 0.40 + e.excitement * 0.35 + e.joy * 0.15 + (1 - e.fatigue) * 0.10,
    // low stress·fatigue → fresh, excitement → fresh
    freshness: (1 - e.stress) * 0.35 + (1 - e.fatigue) * 0.35 + e.excitement * 0.20 + (1 - e.sadness) * 0.10,
  };
}

function euclideanSim(a: CocktailVector, b: CocktailVector): number {
  const keys: (keyof CocktailVector)[] = ["sweetness", "sourness", "bitterness", "strength", "freshness"];
  const dist = Math.sqrt(keys.reduce((s, k) => s + (a[k] - b[k]) ** 2, 0));
  return 1 / (1 + dist);
}

function volumeFitScore(capacity: string, strength: number): number {
  if (capacity === "VERY_LOW") return strength < 0.25 ? 1 : strength < 0.45 ? 0.5 : 0.1;
  if (capacity === "LOW")      return strength < 0.4  ? 1 : strength < 0.6  ? 0.5 : 0.1;
  if (capacity === "HIGH")     return strength > 0.6  ? 1 : strength > 0.4  ? 0.6 : 0.3;
  if (capacity === "VERY_HIGH") return strength > 0.75 ? 1 : strength > 0.5 ? 0.6 : 0.3;
  return 1 - Math.abs(strength - 0.5); // MEDIUM
}

// 한국어 받침 여부에 따라 조사 선택
function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  if (!word) return withoutBatchim;
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 === 0 ? withoutBatchim : withBatchim;
  }
  return withoutBatchim;
}

function fallbackDesc(name: string): string {
  const eul = josa(name, "을", "를");
  return `오늘 기분에 ${name}${eul} 추천드려요. 이 한 잔이 오늘을 조금 더 특별하게 만들어 줄 거예요.`;
}

async function generateDescriptions(names: string[], emotion: EmotionVector): Promise<string[]> {
  try {
    const emotionSummary = [
      emotion.joy > 0.6 ? "기쁨" : emotion.sadness > 0.6 ? "우울함" : "",
      emotion.stress > 0.6 ? "스트레스" : "",
      emotion.fatigue > 0.6 ? "피로" : "",
      emotion.excitement > 0.6 ? "설렘" : "",
    ].filter(Boolean).join(", ") || "평온함";

    const prompt = `고객 감정: ${emotionSummary} (세부: ${JSON.stringify(emotion)})\n\n추천 칵테일 목록 (${names.length}개):\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\n위 ${names.length}개 칵테일 각각에 대해 2~3문장 추천 설명을 JSON 배열로 반환하세요.`;
    const raw = await generateJsonText(prompt, DESCRIPTION_PROMPT, { maxOutputTokens: 1024 });
    const parsed = parseGeminiJson<unknown>(raw);

    if (Array.isArray(parsed)) {
      // 길이가 다를 경우 부족한 부분은 fallback으로 채움
      return names.map((n, i) => {
        const d = typeof parsed[i] === "string" ? sanitizeLlmText(parsed[i], 400) : "";
        return d ? d : fallbackDesc(n);
      });
    }
    return names.map(fallbackDesc);
  } catch {
    return names.map(fallbackDesc);
  }
}

interface RecommendOptions {
  emotionVector: EmotionVector;
  userId?: string;
  drinkingCapacity?: string;
}

export async function recommendCocktails({
  emotionVector,
  userId,
  drinkingCapacity,
}: RecommendOptions): Promise<RecommendedCocktail[]> {
  const [cocktails, user, pastRecs] = await Promise.all([
    prisma.cocktail.findMany({
      where: userId
        ? { OR: [{ isCustom: false }, { isCustom: true, createdBy: userId }] }
        : { isCustom: false },
    }),
    userId ? prisma.user.findUnique({ where: { id: userId } }) : null,
    userId
      ? prisma.recommendation.findMany({
          where: { userId },
          include: { cocktail: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [],
  ]);

  if (cocktails.length === 0) return [];

  // 같은 칵테일이 여러 번 추천된 경우 중복 제거 (최신 것 유지)
  const seenIds = new Set<string>();
  const uniquePastRecs = pastRecs.filter(r => {
    if (seenIds.has(r.cocktail.id)) return false;
    seenIds.add(r.cocktail.id);
    return true;
  });

  const keys: (keyof CocktailVector)[] = ["sweetness", "sourness", "bitterness", "strength", "freshness"];

  // Scale emotion-derived target to match actual cocktail vector distribution.
  // emotionToVector outputs [0,1] per dimension, but cocktail vectors have much
  // narrower ranges (e.g. sourness max ~0.37). Without scaling, cosine similarity
  // ignores magnitude and always returns the same 3 cocktails regardless of emotion.
  const maxPerDim = keys.reduce<Record<keyof CocktailVector, number>>(
    (acc, k) => { acc[k] = Math.max(...cocktails.map(c => c[k])); return acc; },
    { sweetness: 1, sourness: 1, bitterness: 1, strength: 1, freshness: 1 }
  );
  const rawTarget = emotionToVector(emotionVector);
  const targetVector: CocktailVector = {
    sweetness:  rawTarget.sweetness  * maxPerDim.sweetness,
    sourness:   rawTarget.sourness   * maxPerDim.sourness,
    bitterness: rawTarget.bitterness * maxPerDim.bitterness,
    strength:   rawTarget.strength   * maxPerDim.strength,
    freshness:  rawTarget.freshness  * maxPerDim.freshness,
  };

  const userPrefVector: CocktailVector | null = user
    ? {
        sweetness: user.sweetPref,
        sourness: user.sourPref,
        bitterness: user.bitterPref,
        strength: user.strongPref,
        freshness: user.freshPref,
      }
    : null;

  const avgVector = (recs: typeof pastRecs): CocktailVector => {
    const avg = (key: keyof CocktailVector) =>
      recs.reduce((s, r) => s + r.cocktail[key], 0) / recs.length;
    return {
      sweetness: avg("sweetness"),
      sourness: avg("sourness"),
      bitterness: avg("bitterness"),
      strength: avg("strength"),
      freshness: avg("freshness"),
    };
  };

  const recentFive = uniquePastRecs.slice(0, 5);
  const olderRecs = uniquePastRecs.slice(5); // 6번째 이후 기록: 장기 취향 신호

  // 단기 novelty: 최근 5개와 다른 칵테일 우선
  const recentVector: CocktailVector | null = recentFive.length > 0 ? avgVector(recentFive) : null;
  // 장기 취향: 오래된 추천 기록으로 선호 패턴 추출 (3개 이상일 때만 반영)
  const historyVector: CocktailVector | null = olderRecs.length >= 3 ? avgVector(olderRecs) : null;

  const recentIds = new Set(recentFive.map(r => r.cocktail.id));
  const effectiveCapacity = drinkingCapacity ?? user?.drinkingCapacity ?? "MEDIUM";

  const ranked = cocktails
    .map((c) => {
      const cv: CocktailVector = {
        sweetness: c.sweetness,
        sourness: c.sourness,
        bitterness: c.bitterness,
        strength: c.strength,
        freshness: c.freshness,
      };

      const emotionSim = euclideanSim(targetVector, cv);
      const popularity = c.popularity;
      const jitter = (Math.random() - 0.5) * 0.30;

      let score: number;
      if (user && userPrefVector) {
        const volumeFit = volumeFitScore(effectiveCapacity, c.strength);
        const pastNovelty = recentVector ? 1 - euclideanSim(recentVector, cv) : 0.5;

        const histWeight = historyVector ? Math.min(olderRecs.length / 10, 1) * 0.1 : 0;
        const histSim = historyVector ? euclideanSim(historyVector, cv) : 0;
        const tasteSim = 0.2 * euclideanSim(userPrefVector, cv);

        score =
          0.4 * emotionSim +
          tasteSim -
          histWeight * histSim +
          0.15 * volumeFit +
          0.15 * pastNovelty +
          0.1 * popularity +
          jitter;
      } else {
        const volumeFit = volumeFitScore(effectiveCapacity, c.strength);
        score = 0.4 * emotionSim + 0.1 * popularity + 0.1 * volumeFit + jitter;
      }

      if (recentIds.has(c.id)) score *= 0.3;

      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);

  // 상위 후보풀에서 가중치 기반 랜덤 샘플링 — 매 요청마다 다른 결과 보장
  const POOL_SIZE = Math.min(12, ranked.length);
  const pool = ranked.slice(0, POOL_SIZE);
  const selected: typeof pool = [];
  const remaining = [...pool];

  while (selected.length < 9 && remaining.length > 0) {
    const totalWeight = remaining.reduce((s, c) => s + Math.max(c.score, 0.01), 0);
    let rand = Math.random() * totalWeight;
    let picked = 0;
    for (let i = 0; i < remaining.length; i++) {
      rand -= Math.max(remaining[i].score, 0.01);
      if (rand <= 0) { picked = i; break; }
    }
    selected.push(...remaining.splice(picked, 1));
  }

  // 설명 생성은 출력 길이에 비례해 느려지므로 3개씩 나눠 병렬 호출 (9개 일괄 ≈ 10s+ → ≈ 3~4s)
  const names = selected.map(c => c.name);
  const chunks: string[][] = [];
  for (let i = 0; i < names.length; i += 3) chunks.push(names.slice(i, i + 3));
  const descriptions = (await Promise.all(chunks.map(chunk => generateDescriptions(chunk, emotionVector)))).flat();

  return selected.map((c, i) => ({
    ...c,
    aiDescription: descriptions[i] ?? fallbackDesc(c.name),
  } as RecommendedCocktail));
}
