import { generateJsonText, parseGeminiJson, clampText, sanitizeLlmText } from "@/shared/lib/geminiClient";

const RECIPE_PROMPT = `당신은 IBA 공인 바텐더입니다. 칵테일 정보를 받아 정확하고 실용적인 제조 단계를 작성하세요.

규칙:
- 반드시 JSON 배열만 반환: ["단계1", "단계2", ...]
- 4~7단계로 구성
- 각 단계는 한국어로, 구체적인 행동 중심 (예: "셰이커에 얼음을 가득 채워요.")
- 재료명과 정확한 용량을 단계에 포함
- 제조법(method)에 맞는 도구와 기법 사용
- 잔 종류에 맞는 서빙 방법 적용
- 가니시가 있으면 마지막 단계에 포함`;

interface RecipeInput {
  name: string;
  method: string | null;
  glassType: string | null;
  ingredients: { name: string; amount: string | null }[];
}

function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  if (!word) return withoutBatchim;
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 === 0 ? withoutBatchim : withBatchim;
  }
  return withoutBatchim;
}

function buildFallbackSteps(input: RecipeInput): string[] {
  const { method, glassType, ingredients } = input;
  const ingList = ingredients
    .filter(i => i.amount && i.amount !== "적당량")
    .map(i => `${i.name} ${i.amount}`)
    .join(", ");
  const garnishes = ingredients
    .filter(i => !i.amount || i.amount === "적당량")
    .map(i => i.name);
  const garnishStep = garnishes.length > 0
    ? `${garnishes.join(", ")}으로 가니시하고 서빙해요.`
    : "잔을 들고 향을 느끼며 즐겨요.";

  const m = method ?? "shaking";
  switch (m) {
    case "shaking":
      return [
        `셰이커에 ${ingList}${josa(ingList, "을", "를")} 계량해 넣어요.`,
        "얼음을 가득 채우고 뚜껑을 닫아요.",
        "15~20초간 힘차게 셰이크해요.",
        "차갑게 칠링한 잔에 더블 스트레이너로 걸러 따라요.",
        garnishStep,
      ];
    case "stirring":
      return [
        "믹싱 글라스에 큰 얼음을 채워요.",
        `${ingList}${josa(ingList, "을", "를")} 순서대로 넣어요.`,
        "바 스푼으로 30초간 부드럽게 스터해요.",
        "칠링한 잔에 스트레이너로 걸러 따라요.",
        garnishStep,
      ];
    case "build":
      if (glassType === "flute") {
        return [
          "플루트 잔을 냉장고에서 미리 칠링해요.",
          `재료를 순서대로 넣어요: ${ingList}.`,
          "바 스푼으로 가볍게 1~2회 스터해요.",
          garnishStep,
        ];
      }
      return [
        "잔에 큰 얼음을 가득 채워요.",
        `도수 높은 술부터 순서대로 넣어요: ${ingList}.`,
        "바 스푼으로 가볍게 2~3회 스터해요.",
        garnishStep,
      ];
    case "blending":
      return [
        `블렌더에 ${ingList}${josa(ingList, "과", "와")} 얼음 한 컵을 넣어요.`,
        "고속으로 20~30초 블렌드해요.",
        "차가운 잔에 천천히 따라요.",
        garnishStep,
      ];
    default:
      return [
        `재료를 계량해요: ${ingList}.`,
        "잔과 도구를 준비해요.",
        "레시피대로 섞어요.",
        garnishStep,
      ];
  }
}

export async function generateRecipeSteps(input: RecipeInput): Promise<string[]> {
  try {
    const ingDesc = input.ingredients
      .slice(0, 20)
      .map(i => `${clampText(i.name, 50)} ${clampText(i.amount ?? "적당량", 30)}`)
      .join(", ");

    const prompt = `칵테일명: ${clampText(input.name, 60)}
제조법: ${input.method ?? "shaking"}
잔: ${input.glassType ?? "rocks"}
재료: ${ingDesc}

위 칵테일의 제조 단계를 JSON 배열로 반환하세요.`;

    const raw = await generateJsonText(prompt, RECIPE_PROMPT);
    const parsed = parseGeminiJson<unknown>(raw);

    if (Array.isArray(parsed)) {
      // DB에 저장되어 모든 사용자에게 노출되므로 평문 문자열만, 최대 12단계/300자
      const steps = parsed
        .filter((s): s is string => typeof s === "string")
        .map((s) => sanitizeLlmText(s, 300))
        .filter((s) => s.length > 0)
        .slice(0, 12);
      if (steps.length >= 3) return steps;
    }
    return buildFallbackSteps(input);
  } catch (e) {
    console.error("[generateRecipeSteps] Gemini 실패, fallback 사용:", (e as Error).message);
    return buildFallbackSteps(input);
  }
}
