import { generateJsonText, parseGeminiJson, sanitizeLlmText } from "@/shared/lib/geminiClient";
import { prisma } from "@/shared/lib/prisma";
import { emotionToTarget } from "@/shared/lib/emotionTaste";
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

function euclideanSim(a: CocktailVector, b: CocktailVector): number {
  const keys: (keyof CocktailVector)[] = ["sweetness", "sourness", "bitterness", "strength", "freshness"];
  const dist = Math.sqrt(keys.reduce((s, k) => s + (a[k] - b[k]) ** 2, 0));
  return 1 / (1 + dist);
}

/**
 * 주량 적합도. strength 는 flavorModel 의 ABV/40 스케일 (IBA 79종 중앙값 ≈ 0.41, 최대 ≈ 0.92).
 * 기준값은 이 분포에 맞춰 정했다 — 맛 모델 앵커가 바뀌면 같이 재조정할 것.
 */
function volumeFitScore(capacity: string, strength: number): number {
  if (capacity === "VERY_LOW") return strength < 0.2 ? 1 : strength < 0.35 ? 0.5 : 0.1;
  if (capacity === "LOW")      return strength < 0.32 ? 1 : strength < 0.5  ? 0.5 : 0.1;
  if (capacity === "HIGH")     return strength > 0.5  ? 1 : strength > 0.35 ? 0.6 : 0.3;
  if (capacity === "VERY_HIGH") return strength > 0.62 ? 1 : strength > 0.45 ? 0.6 : 0.3;
  return 1 - Math.abs(strength - 0.42); // MEDIUM
}

/**
 * 점수 지터 폭(균일분포 전체 범위). 상위 12개 후보풀의 점수 간격(1위-12위 ≈ 0.04)보다 작게 유지해야
 * 지터가 순위를 뒤집지 않고 동점 근처만 섞는다. 다양성은 후보풀 가중 샘플링이 담당.
 */
export const JITTER_RANGE = 0.06;

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

  // 감정 목표는 실제 칵테일 분포(분위수)에 맞춰 보정된 벡터 — emotionTaste.ts 참고
  const targetVector: CocktailVector = emotionToTarget(emotionVector);

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
  const olderRecs = uniquePastRecs.slice(5); // 6번째 이후 기록: 오래전에 본 것과 비슷한 칵테일은 감점 (장기 반복 방지)

  // 단기 novelty: 최근 5개와 다른 칵테일 우선
  const recentVector: CocktailVector | null = recentFive.length > 0 ? avgVector(recentFive) : null;
  // 장기 이력: 오래된 추천 기록의 평균 벡터 (3개 이상일 때만 반영) — 점수에서 감점(-)으로 쓰인다
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
      const jitter = (Math.random() - 0.5) * JITTER_RANGE;

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
