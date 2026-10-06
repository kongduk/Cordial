import type { EmotionVector, CocktailVector } from "@/shared/types";

/**
 * 감정 → 맛 목표 벡터.
 *
 * emotionToVector 는 감정을 0~1 "원점수"로 바꾸고, emotionToTarget 은 이 원점수를
 * 실제 칵테일 분포의 분위수로 보정한다 (원점수 0.5 → 해당 축의 중앙값).
 * 이렇게 해야 쓴맛처럼 실제 칵테일이 대체로 낮은 축에서 목표가 분포 밖(예: 0.5)으로 나가
 * 항상 같은 칵테일만 뽑히는 왜곡이 생기지 않는다.
 */
export function emotionToVector(e: EmotionVector): CocktailVector {
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

/**
 * flavorModel 재계산 후 IBA 79종의 축별 분위수 (0,10,...,100 퍼센타일).
 * `npm run db:recompute-flavor` 출력(FLAVOR_QUANTILES)으로 갱신한다. 맛 모델 앵커와 함께 고정.
 */
export const FLAVOR_QUANTILES: Record<keyof CocktailVector, readonly number[]> = {
  sweetness: [0, 0.14, 0.2, 0.24, 0.27, 0.3, 0.32, 0.4, 0.46, 0.54, 1],
  sourness: [0, 0, 0.03, 0.08, 0.14, 0.25, 0.35, 0.46, 0.5, 0.66, 1],
  bitterness: [0.01, 0.05, 0.06, 0.07, 0.08, 0.09, 0.11, 0.14, 0.19, 0.36, 1],
  strength: [0.13, 0.21, 0.26, 0.32, 0.38, 0.41, 0.46, 0.54, 0.58, 0.74, 0.92],
  freshness: [0, 0, 0, 0.09, 0.17, 0.25, 0.26, 0.35, 0.35, 0.4, 0.93],
};

function quantileAt(table: readonly number[], p: number): number {
  const x = Math.min(1, Math.max(0, p)) * (table.length - 1);
  const lo = Math.floor(x);
  const hi = Math.min(table.length - 1, lo + 1);
  return table[lo] + (table[hi] - table[lo]) * (x - lo);
}

/** 원점수(0~1) → 실제 칵테일 분포 위의 값 */
export function calibrateToCocktailScale(raw: CocktailVector): CocktailVector {
  return {
    sweetness: quantileAt(FLAVOR_QUANTILES.sweetness, raw.sweetness),
    sourness: quantileAt(FLAVOR_QUANTILES.sourness, raw.sourness),
    bitterness: quantileAt(FLAVOR_QUANTILES.bitterness, raw.bitterness),
    strength: quantileAt(FLAVOR_QUANTILES.strength, raw.strength),
    freshness: quantileAt(FLAVOR_QUANTILES.freshness, raw.freshness),
  };
}

export function emotionToTarget(e: EmotionVector): CocktailVector {
  return calibrateToCocktailScale(emotionToVector(e));
}
