export interface EmotionVector {
  joy: number;
  sadness: number;
  stress: number;
  fatigue: number;
  excitement: number;
}

export interface CocktailVector {
  sweetness: number;
  sourness: number;
  bitterness: number;
  strength: number;
  freshness: number;
}

export interface UserFlavorProfile extends CocktailVector {}

export interface RecommendedCocktail {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  glassType: string | null;
  abv: number;
  imageUrl: string | null;
  sweetness: number;
  sourness: number;
  bitterness: number;
  strength: number;
  freshness: number;
  popularity: number;
  aiDescription: string;
  score: number;
}

export interface MixIngredient {
  name: string;
  amount: number;
  abv: number;
}

export type MixMethod = "shaking" | "stirring" | "build" | "blending" | "neat" | "floating";

export interface MixAnalysisResult {
  calculatedAbv: number;
  taste: CocktailVector;
  aroma: string;
  description: string;
  name: string;
  /** 맛 모델 표에 없어 근사 계산된 재료 이름 */
  unknownIngredients?: string[];
}

export interface BarData {
  id: string;
  name: string;
  address: string;
  area: string | null;
  moodTags: string[];
  purposeTags: string[];
  cocktailStyles: string[];
  signature: string | null;
  imageUrl: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  priceLevel: number | null;
  reviewCount: number | null;
  placeId: string | null;
}

export type BarMood = "조용한" | "활기찬" | "로맨틱" | "힙한" | "클래식";
export type BarPurpose = "혼술" | "데이트" | "친구모임" | "비즈니스";
export type BarBudget = "3만원 이하" | "3~5만원" | "5만원 이상";
export type CocktailStyle = "달콤한" | "신" | "쓴" | "강한" | "가벼운";

export interface BarSurvey {
  mood: BarMood;
  cocktailStyle: CocktailStyle;
  purpose: BarPurpose;
  budget: BarBudget;
}

export interface RecommendedBar extends BarData {
  score: number;
  distanceKm: number;
  matchReasons: string[];
}

export type DrinkingCapacity = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
