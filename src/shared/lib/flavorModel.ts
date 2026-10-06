/**
 * 결정론적 칵테일 맛 모델 (순수 TS — 서버/클라이언트 공용).
 *
 * 같은 재료·용량·제조법이면 어디서 계산하든(시드, 재계산 스크립트, 모의 제조, 저장 API) 같은 숫자가 나온다.
 * Gemini 는 글(이름/설명/향)만 쓰고 숫자는 이 모델만 만든다.
 *
 * 재료별 값은 100ml 기준: 당(sugarG), 산(acidG, 구연산 환산), 도수(abv), 쓴맛 지수(bitter 0~1).
 * 최종 부피 = 재료 합 / (1 - 희석률) 이며, 최종 도수 = 기본 도수 × (1 - 희석률) 과 같은 기준이다.
 */
import type { MixMethod } from "@/shared/types";
import { SYNONYMS } from "@/shared/lib/ingredientSynonyms";

// ───────────────────────── 상수 ─────────────────────────

/** 제조법별 희석률 (최종 부피 중 얼음 녹은 물의 비율). */
export const DILUTION_RATES: Record<MixMethod, number> = {
  shaking: 0.30,
  stirring: 0.225,
  build: 0.125,
  blending: 0.35,
  neat: 0,
  floating: 0.05,
};

/**
 * 정규화 앵커 — 한 번 보정 후 고정. (축별 선형 스케일이므로 순위는 바꾸지 않는다.)
 * sweetness = 체감 당도(sugarPct × (1 - 쓴맛 억제)) / SUGAR_PCT, sourness = acidPct / ACID_PCT,
 * strength = abv / ABV, bitterness = (Σ ml·bitter·potency / 최종 ml) / BITTER.
 */
export const FLAVOR_ANCHORS = {
  SUGAR_PCT: 19,
  ACID_PCT: 1.7,
  ABV: 40,
  BITTER: 0.45,
  /** 탄산 재료가 최종 부피의 이 비율 이상이면 탄산 항 만점 */
  CARB_SHARE: 0.4,
  /** 시트러스 재료 비율 앵커 */
  CITRUS_SHARE: 0.2,
  /** 허브 재료 비율 앵커 */
  HERBAL_SHARE: 0.04,
  /** 크림류 비율 앵커 (청량감 감점) */
  CREAMY_SHARE: 0.15,
} as const;

/** 쓴맛이 단맛 지각을 억제하는 정도 (쓴맛 만점일 때 체감 단맛 -35%). 앵커가 아닌 모델 구조 — 변경 금지 */
const SWEET_BITTER_MASK = 0.35;
/** 쓴맛 지수가 이 값 이상이면 억제 최대 (BITTER 앵커와 독립) */
const SWEET_BITTER_MASK_REF = 0.30;

/** 상쾌함 가중치 (앵커가 아닌 모델 구조 — 변경 금지) */
const FRESH_WEIGHTS = { carb: 0.40, citrus: 0.35, herbal: 0.25, creamyPenalty: 0.20 } as const;

/** 부피 0 (가니시/적당량) 재료가 플래그 계산에서 갖는 가상 부피(ml). 당·산·부피에는 반영 안 됨. */
export const GARNISH_FLAG_ML = 5;
/** "top / 채우기" 소다 토핑 고정 부피(ml) */
export const TOP_ML = 80;
export const DASH_ML = 0.6;
export const TSP_ML = 5;
export const SPLASH_ML = 10;
export const DROP_ML = 0.05;
export const SUGAR_CUBE_ML = 5;
const OZ_ML = 29.57;

// ───────────────────────── 타입 ─────────────────────────

export type IngredientCategory =
  | "spirit" | "liqueur" | "syrup" | "juice-citrus" | "juice-sweet"
  | "bitters" | "soda" | "wine" | "cream" | "other";

export interface FlavorFlags {
  carbonated?: boolean;
  herbal?: boolean;
  citrus?: boolean;
  creamy?: boolean;
}

export interface IngredientProfile {
  category: IngredientCategory;
  /** g / 100ml */
  sugarG: number;
  /** g / 100ml (구연산 환산) */
  acidG: number;
  /** % */
  abv: number;
  /** 0~1, 원액 기준 쓴맛 세기 */
  bitter: number;
  /** 쓴맛 기여 증폭 (비터스 팅크처 등 소량으로도 강하게 느껴지는 재료). 기본 1 */
  potency?: number;
  /** 고체(설탕 등): 부피 기여 비율 (녹아서 부피에 더해지는 비율). 기본 1 */
  volFactor?: number;
  flags?: FlavorFlags;
}

export interface FlavorIngredientInput {
  name: string;
  /** 부피(ml). 0 이하면 가니시/적당량 — 플래그만 적용 */
  ml: number;
  /** 사용자가 지정한 도수(%). 있으면 표의 도수보다 우선 */
  abv?: number;
}

export interface FlavorResult {
  /** 최종 도수(%), 소수 1자리 */
  abv: number;
  sugarPct: number;
  acidPct: number;
  sweetness: number;
  sourness: number;
  bitterness: number;
  strength: number;
  freshness: number;
  /** 정규화 전 쓴맛 지수 (Σ ml·bitter·potency / 최종 ml) — 순위 비교용 */
  bitterIndex: number;
  /** 최종 부피(ml) */
  finalMl: number;
  /** 표에 없어 아키타입으로 근사한 재료 이름 (조용히 무시하지 않는다) */
  unknown: string[];
}

// ───────────────────────── 재료 표 ─────────────────────────

function p(
  category: IngredientCategory,
  sugarG: number,
  acidG: number,
  abv: number,
  bitter: number,
  extra: { potency?: number; volFactor?: number; flags?: FlavorFlags } = {},
): IngredientProfile {
  return { category, sugarG, acidG, abv, bitter, ...extra };
}

const CITRUS: FlavorFlags = { citrus: true };
const CARB: FlavorFlags = { carbonated: true };
const HERB: FlavorFlags = { herbal: true };
const CREAMY: FlavorFlags = { creamy: true };

/** 정규 이름(공백 포함 DB 표기) → 프로파일. 값은 Dave Arnold "Liquid Intelligence" 및 제조사 스펙 근사. */
export const INGREDIENT_TABLE: Record<string, IngredientProfile> = {
  // 증류주 (당 거의 없음, 약한 쓴맛 기저)
  "진": p("spirit", 0, 0, 40, 0.06),
  "올드 톰 진": p("spirit", 4, 0, 40, 0.05),
  "보드카": p("spirit", 0, 0, 40, 0.03),
  "시트론 보드카": p("spirit", 0.5, 0, 40, 0.03),
  "화이트 럼": p("spirit", 0.3, 0, 40, 0.04),
  "골드 럼": p("spirit", 1, 0, 40, 0.06),
  "다크 럼": p("spirit", 1.5, 0, 40, 0.08),
  "카샤사": p("spirit", 0.5, 0, 40, 0.05),
  "데킬라": p("spirit", 0, 0, 40, 0.05),
  "버번 위스키": p("spirit", 0, 0, 43, 0.08),
  "라이 위스키": p("spirit", 0, 0, 45, 0.09),
  "버번/라이 위스키": p("spirit", 0, 0, 43, 0.08),
  "스카치": p("spirit", 0, 0, 43, 0.10),
  "스카치 위스키": p("spirit", 0, 0, 43, 0.10),
  "아이리시 위스키": p("spirit", 0, 0, 40, 0.06),
  "브랜디": p("spirit", 1, 0, 40, 0.06),
  "코냑": p("spirit", 0.8, 0, 40, 0.06),
  "칼바도스": p("spirit", 1, 0, 40, 0.05),
  "피스코": p("spirit", 0, 0, 40, 0.04),
  "키르쉬": p("spirit", 0, 0, 40, 0.04),

  // 리큐어
  "트리플 섹": p("liqueur", 25, 0, 40, 0.06),
  "코앵트로": p("liqueur", 25, 0, 40, 0.06),
  "그랑 마르니에": p("liqueur", 26, 0, 40, 0.08),
  "오렌지 큐라소": p("liqueur", 26, 0, 40, 0.08),
  "마라스키노": p("liqueur", 28, 0, 32, 0.06),
  "애프리콧 브랜디": p("liqueur", 25, 0.1, 30, 0.04),
  "체리 리큐어": p("liqueur", 30, 0.2, 25, 0.05),
  "베네딕틴": p("liqueur", 28, 0, 40, 0.20),
  "갈리아노": p("liqueur", 22, 0, 42, 0.15),
  "드람부이": p("liqueur", 32, 0, 40, 0.05),
  "디사론노": p("liqueur", 35, 0, 28, 0.10),
  "크렘 드 카카오": p("liqueur", 32, 0, 25, 0.10),
  "크렘 드 민트": p("liqueur", 35, 0, 25, 0.03, { flags: HERB }),
  "크렘 드 카시스": p("liqueur", 38, 0.6, 20, 0.05),
  "라즈베리 리큐어": p("liqueur", 30, 0.3, 20, 0.04),
  "블랙베리 리큐어": p("liqueur", 28, 0.4, 20, 0.04),
  "피치 슈납스": p("liqueur", 28, 0, 20, 0.02),
  "커피 리큐어": p("liqueur", 38, 0, 20, 0.12),
  "칼루아": p("liqueur", 42, 0, 20, 0.12),
  "베일리스": p("liqueur", 23, 0, 17, 0.05, { flags: CREAMY }),
  "미도리": p("liqueur", 28, 0.3, 20, 0.02),
  "아페롤": p("liqueur", 20, 0.1, 11, 0.55),
  "캄파리": p("liqueur", 24, 0.1, 24, 0.90),
  "압생트": p("liqueur", 0.5, 0, 70, 0.40, { flags: HERB }),

  // 와인류 / 베르무트
  "드라이 베르무트": p("wine", 3, 0.4, 18, 0.20),
  "레드 베르무트": p("wine", 16, 0.4, 18, 0.25),
  "릴렛 블랑": p("wine", 8, 0.4, 17, 0.12),
  "레드 포트": p("wine", 11, 0.5, 20, 0.10),
  "화이트 와인": p("wine", 0.8, 0.6, 12, 0.05),
  "샴페인": p("wine", 1, 0.55, 12, 0.05, { flags: CARB }),
  "프로세코": p("wine", 1.5, 0.6, 12, 0.05, { flags: CARB }),

  // 비터스 (소량으로도 크게 작용 → potency)
  "앙고스투라 비터스": p("bitters", 3, 0, 44, 1.0, { potency: 8 }),
  "오렌지 비터스": p("bitters", 3, 0, 28, 0.85, { potency: 8 }),
  "페이쇼 비터스": p("bitters", 3, 0, 35, 0.80, { potency: 8 }),
  "피치 비터스": p("bitters", 3, 0, 35, 0.60, { potency: 8 }),

  // 시럽 / 감미료
  "심플 시럽": p("syrup", 61.5, 0, 0, 0),
  "슈거 시럽": p("syrup", 61.5, 0, 0, 0),
  "그레나딘": p("syrup", 60, 0.5, 0, 0),
  "그레나딘 시럽": p("syrup", 60, 0.5, 0, 0),
  "딸기 시럽": p("syrup", 60, 0.3, 0, 0),
  "라즈베리 시럽": p("syrup", 60, 0.5, 0, 0),
  "오르자 시럽": p("syrup", 55, 0, 0, 0.02),
  "아가베 넥타": p("syrup", 90, 0.1, 0, 0),
  "꿀": p("syrup", 110, 0.2, 0, 0.02),
  "설탕": p("syrup", 85, 0, 0, 0, { volFactor: 0.55 }),
  "브라운 슈가": p("syrup", 80, 0, 0, 0.02, { volFactor: 0.55 }),

  // 주스
  "레몬 주스": p("juice-citrus", 2.0, 6.0, 0, 0.03, { flags: CITRUS }),
  "라임 주스": p("juice-citrus", 1.7, 6.0, 0, 0.03, { flags: CITRUS }),
  "레몬": p("juice-citrus", 2.0, 4.5, 0, 0.05, { flags: CITRUS }),
  "라임": p("juice-citrus", 1.7, 4.5, 0, 0.05, { flags: CITRUS }),
  "그레이프프루트 주스": p("juice-citrus", 8, 1.7, 0, 0.20, { flags: CITRUS }),
  "오렌지 주스": p("juice-citrus", 9.5, 0.8, 0, 0.03, { flags: CITRUS }),
  "사워 앤 스윗 믹서": p("juice-citrus", 10, 1.5, 0, 0, { flags: CITRUS }),
  "파인애플 주스": p("juice-sweet", 10, 0.7, 0, 0),
  "크랜베리 주스": p("juice-sweet", 11, 1.0, 0, 0.10),
  "토마토 주스": p("juice-sweet", 3.5, 0.5, 0, 0.05),
  "피치 퓨레": p("juice-sweet", 8.5, 0.5, 0, 0),
  "수박": p("juice-sweet", 6, 0.1, 0, 0, { volFactor: 1 }),
  "올리브 주스": p("juice-sweet", 0, 0.3, 0, 0.03),
  "우스터 소스": p("other", 15, 2.0, 0, 0.15),

  // 탄산 / 소프트드링크
  "소다수": p("soda", 0, 0, 0, 0, { flags: CARB }),
  "토닉 워터": p("soda", 9, 0.1, 0, 0.30, { flags: CARB }),
  "진저비어": p("soda", 9, 0.3, 0, 0.10, { flags: CARB }),
  "진저에일": p("soda", 8.5, 0.2, 0, 0.03, { flags: CARB }),
  "콜라": p("soda", 10.6, 0.1, 0, 0.10, { flags: CARB }),

  // 유제품 / 달걀 / 기타
  "크림": p("cream", 3, 0, 0, 0, { flags: CREAMY }),
  "코코넛 밀크": p("cream", 8, 0.1, 0, 0, { flags: CREAMY }),
  "달걀 흰자": p("cream", 0.4, 0, 0, 0, { flags: CREAMY }),
  "달걀 노른자": p("cream", 0.3, 0, 0, 0, { flags: CREAMY }),
  "에스프레소": p("other", 0, 0.3, 0, 0.55),
  "핫 커피": p("other", 0, 0.1, 0, 0.45),
  "오렌지 플라워 워터": p("other", 0, 0, 0, 0.02),
  "민트": p("other", 0, 0, 0, 0.02, { flags: HERB, volFactor: 0.5 }),
  "물": p("other", 0, 0, 0, 0),
  "얼음": p("other", 0, 0, 0, 0),
};

/** 표기 변형 → 정규 이름 (정확히 일치하는 별칭만; 부분 문자열 매칭 없음) */
const ALIASES: Record<string, string> = {
  "탄산수": "소다수", "클럽소다": "소다수", "클럽 소다": "소다수", "소다": "소다수",
  "토닉": "토닉 워터", "토닉워터": "토닉 워터",
  "라임즙": "라임 주스", "레몬즙": "레몬 주스",
  "설탕 시럽": "슈거 시럽", "단순 시럽": "심플 시럽", "슈가 시럽": "슈거 시럽",
  "깔루아": "칼루아", "카루아": "칼루아",
  "쿠앵트로": "코앵트로", "쿠엥트로": "코앵트로", "코인트로": "코앵트로",
  "스위트 베르무트": "레드 베르무트", "로쏘 베르무트": "레드 베르무트",
  "아브생트": "압생트", "에그 화이트": "달걀 흰자", "흰자": "달걀 흰자", "노른자": "달걀 노른자",
  "스카치위스키": "스카치 위스키", "버번": "버번 위스키", "버본": "버번 위스키",
  "라이위스키": "라이 위스키", "테킬라": "데킬라", "오렌지 큐라소 리큐어": "오렌지 큐라소",
  "블루 큐라소": "오렌지 큐라소", "삼부카": "압생트",
  "포트와인": "레드 포트", "포트": "레드 포트",
  "아몬드 시럽": "오르자 시럽", "석류 시럽": "그레나딘 시럽",
  "생강맥주": "진저비어", "진저 비어": "진저비어", "진저 에일": "진저에일",
};
// 삼부카는 압생트와 다르므로 위 별칭에서 제외 (아래 보정)
delete ALIASES["삼부카"];

const SPACELESS_INDEX: Record<string, string> = (() => {
  const idx: Record<string, string> = {};
  for (const k of Object.keys(INGREDIENT_TABLE)) idx[k.replace(/\s+/g, "")] = k;
  for (const [a, canon] of Object.entries(ALIASES)) idx[a.replace(/\s+/g, "")] = canon;
  return idx;
})();

/** 이름 → 정규 이름. 표에 없으면 null. (정확 일치 → 별칭 → 공백 제거 일치 → SYNONYMS 단일 후보 순) */
export function resolveCanonicalName(rawName: string): string | null {
  const name = rawName.trim();
  if (name in INGREDIENT_TABLE) return name;
  const alias = ALIASES[name];
  if (alias) return alias;
  const spaceless = SPACELESS_INDEX[name.replace(/\s+/g, "")];
  if (spaceless) return spaceless;
  const syn = SYNONYMS[name];
  if (syn && syn.length === 1 && syn[0] in INGREDIENT_TABLE) return syn[0];
  return null;
}

// ───────────────────────── 아키타입 (표에 없는 재료) ─────────────────────────

interface Archetype { profile: IngredientProfile; defaultAbv: number }

const ARCH: Record<IngredientCategory, Archetype> = {
  spirit: { profile: p("spirit", 0, 0, 40, 0.05), defaultAbv: 40 },
  liqueur: { profile: p("liqueur", 28, 0, 25, 0.08), defaultAbv: 25 },
  syrup: { profile: p("syrup", 55, 0, 0, 0), defaultAbv: 0 },
  "juice-citrus": { profile: p("juice-citrus", 3, 5, 0, 0.05, { flags: CITRUS }), defaultAbv: 0 },
  "juice-sweet": { profile: p("juice-sweet", 10, 0.6, 0, 0), defaultAbv: 0 },
  bitters: { profile: p("bitters", 3, 0, 40, 0.8, { potency: 8 }), defaultAbv: 40 },
  soda: { profile: p("soda", 9, 0.1, 0, 0.05, { flags: CARB }), defaultAbv: 0 },
  wine: { profile: p("wine", 2, 0.5, 12, 0.1), defaultAbv: 12 },
  cream: { profile: p("cream", 3, 0, 0, 0, { flags: CREAMY }), defaultAbv: 0 },
  other: { profile: p("other", 0, 0, 0, 0), defaultAbv: 0 },
};

/** 키워드 → 카테고리. 구체적인 것(비터스·시럽·탄산)이 일반적인 것(증류주)보다 먼저. */
export function classifyUnknown(rawName: string): IngredientCategory {
  const n = rawName.toLowerCase().trim();
  const tokens = n.split(/[\s/]+/).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  const has = (re: RegExp) => re.test(n);

  if (has(/비터스|bitters?/)) return "bitters";
  if (has(/시럽|syrup|넥타|꿀|honey|설탕|슈가|sugar/)) return "syrup";
  if (has(/토닉|소다|탄산|사이다|스프라이트|진저|콜라|맥주|비어|라거|스타우트|tonic|soda|cola|beer/)) return "soda";
  if (has(/리큐어|리큐르|슈납스|큐라소|liqueur|schnapps|크렘 ?드/)) return "liqueur";
  if (has(/크림|우유|밀크|요거트|요구르트|연유|아이스크림|달걀|계란|cream|milk|egg/)) return "cream";
  if (has(/레몬|라임|유자|자몽|그레이프프루트|오렌지|시트러스|lemon|lime|yuzu|grapefruit|orange/)) {
    return has(/주스|즙|juice/) || tokens.length === 1 ? "juice-citrus" : "juice-sweet";
  }
  if (has(/주스|즙|퓨레|과즙|스무디|juice|puree/)) return "juice-sweet";
  if (has(/와인|샴페인|프로세코|카바|베르무트|버무스|셰리|포트|사케|막걸리|wine|vermouth|sherry|champagne|prosecco/)) return "wine";
  if (
    last === "진" || has(/보드카|럼$|럼 |위스키|위스퀴|데킬라|테킬라|브랜디|코냑|소주|whisk|vodka|rum|gin\b|tequila|brandy|cognac|mezcal|메즈칼/)
  ) return "spirit";
  return "other";
}

// ───────────────────────── 용량 파싱 ─────────────────────────

const GARNISH_RE = /적당량|약간|가니쉬|가니시|장식|garnish|as needed|to taste|pinch|한 꼬집|꼬집|wedge|웨지|슬라이스|slice|twist|zest|peel|leaf|leaves|잎|sprig|가지/i;
const TOP_RE = /top|fill|채우|채움|가득|토핑|up with/i;

export function isGarnishAmount(raw: string | null | undefined): boolean {
  if (!raw) return true;
  return GARNISH_RE.test(raw.trim());
}

const FRACTIONS: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" };

function parseNumber(s: string): number | null {
  // "1 1/2", "1/2", "2-3", "1.5"
  const t = s.trim();
  const range = t.match(/^(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const UNIT_ML: Array<[RegExp, number]> = [
  [/^(cl|센티리터)/, 10],
  [/^(ml|밀리리터|밀리)/, 1],
  [/^(dl)/, 100],
  [/^(oz|온스|ounce)/, OZ_ML],
  [/^(tbsp|tablespoon|큰술|큰 술)/, 15],
  [/^(tsp|teaspoon|티스푼|작은술|작은 술|bsp|bar ?spoon|바 ?스푼|바스푼)/, TSP_ML],
  [/^(dashes|dash|대시|대쉬)/, DASH_ML],
  [/^(drops|drop|방울)/, DROP_ML],
  [/^(splash|스플래시|스플래쉬)/, SPLASH_ML],
  [/^(cubes|cube|각설탕|각)/, SUGAR_CUBE_ML],
  [/^(l\b|리터)/, 1000],
];

/** "3cl", "1.5 oz", "2 dashes", "1 tsp", "top", "적당량" … → ml. 가니시/적당량은 0. */
export function parseAmount(raw: string | null | undefined): number {
  if (raw == null) return 0;
  let s = raw.toLowerCase().trim();
  if (!s) return 0;
  for (const [k, v] of Object.entries(FRACTIONS)) s = s.split(k).join(` ${v}`);
  s = s.replace(/,/g, "").replace(/\s+/g, " ").trim();

  if (TOP_RE.test(s) && !/\d/.test(s)) return TOP_ML;

  const m = s.match(/^(\d+(?:\.\d+)?\s*[-~]\s*\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) {
    // 숫자 없이 단위 단어만 ("splash", "dash")
    for (const [re, ml] of UNIT_ML) if (re.test(s)) return ml;
    return 0; // 적당량/가니시/인식 불가
  }
  const num = parseNumber(m[1]);
  if (num === null || num < 0) return 0;
  const rest = m[2].trim();
  if (!rest) return num; // 단위 없음 → ml
  if (TOP_RE.test(rest) && !/(cl|ml|oz)/.test(rest)) return TOP_ML;
  for (const [re, ml] of UNIT_ML) {
    if (re.test(rest)) return Math.round(num * ml * 1000) / 1000;
  }
  // 개/조각/슬라이스/웨지 등 → 가니시
  return 0;
}

// ───────────────────────── 제조법 매핑 ─────────────────────────

const METHOD_ALIASES: Record<string, MixMethod> = {
  shaking: "shaking", shake: "shaking", shaken: "shaking", 쉐이킹: "shaking", 셰이킹: "shaking", 쉐이크: "shaking",
  stirring: "stirring", stir: "stirring", stirred: "stirring", 스터: "stirring", 스터링: "stirring", 스티어: "stirring",
  build: "build", building: "build", 빌드: "build", 빌딩: "build",
  blending: "blending", blend: "blending", blended: "blending", 블렌딩: "blending", 블렌드: "blending",
  neat: "neat", floating: "floating", float: "floating", layering: "floating", 플로팅: "floating",
};

/** DB Cocktail.method 문자열 → MixMethod. 알 수 없으면 build. */
export function mapDbMethod(method: string | null | undefined): MixMethod {
  if (!method) return "build";
  return METHOD_ALIASES[method.trim().toLowerCase()] ?? "build";
}

// ───────────────────────── 계산 ─────────────────────────

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

interface Resolved { profile: IngredientProfile; known: boolean }

function resolveProfile(name: string, abvOverride: number | undefined): Resolved {
  const canon = resolveCanonicalName(name);
  if (canon) return { profile: INGREDIENT_TABLE[canon], known: true };
  const cat = classifyUnknown(name);
  const arch = ARCH[cat];
  const abv = abvOverride !== undefined ? abvOverride : arch.defaultAbv;
  return { profile: { ...arch.profile, abv }, known: false };
}

export function computeFlavor(ingredients: FlavorIngredientInput[], method: MixMethod): FlavorResult {
  const dilution = DILUTION_RATES[method] ?? 0;
  const unknown: string[] = [];

  let rawMl = 0;      // 투입 부피(용해 보정 포함)
  let alcoholMl = 0;
  let sugarG = 0;
  let acidG = 0;
  let bitterUnits = 0;
  let carbMl = 0;
  let citrusMl = 0;
  let herbalMl = 0;
  let creamyMl = 0;

  for (const ing of ingredients) {
    const name = ing.name.trim();
    const abvOverride = typeof ing.abv === "number" && Number.isFinite(ing.abv) ? Math.min(100, Math.max(0, ing.abv)) : undefined;
    const { profile, known } = resolveProfile(name, abvOverride);
    if (!known && !unknown.includes(name)) unknown.push(name);

    const ml = Number.isFinite(ing.ml) && ing.ml > 0 ? ing.ml : 0;
    const abv = known && abvOverride !== undefined ? abvOverride : profile.abv;
    const flagMl = ml > 0 ? ml : GARNISH_FLAG_ML;
    const f = profile.flags ?? {};

    if (f.carbonated) carbMl += flagMl;
    if (f.citrus) citrusMl += flagMl;
    if (f.herbal) herbalMl += flagMl;
    if (f.creamy) creamyMl += flagMl;

    if (ml <= 0) continue;
    const vol = ml * (profile.volFactor ?? 1);
    rawMl += vol;
    alcoholMl += ml * (abv / 100);
    sugarG += (ml / 100) * profile.sugarG;
    acidG += (ml / 100) * profile.acidG;
    bitterUnits += ml * profile.bitter * (profile.potency ?? 1);
  }

  if (rawMl <= 0) {
    return { abv: 0, sugarPct: 0, acidPct: 0, sweetness: 0, sourness: 0, bitterness: 0, strength: 0, freshness: 0, bitterIndex: 0, finalMl: 0, unknown };
  }

  const finalMl = rawMl / (1 - dilution);
  const abv = (alcoholMl / finalMl) * 100;
  const sugarPct = (sugarG / finalMl) * 100;
  const acidPct = (acidG / finalMl) * 100;
  const bitterIdx = bitterUnits / finalMl;
  const A = FLAVOR_ANCHORS;

  const carb = clamp01(carbMl / finalMl / A.CARB_SHARE);
  const citrus = clamp01(citrusMl / finalMl / A.CITRUS_SHARE);
  const herbal = clamp01(herbalMl / finalMl / A.HERBAL_SHARE);
  const creamy = clamp01(creamyMl / finalMl / A.CREAMY_SHARE);
  const freshness =
    FRESH_WEIGHTS.carb * carb + FRESH_WEIGHTS.citrus * citrus + FRESH_WEIGHTS.herbal * herbal -
    FRESH_WEIGHTS.creamyPenalty * creamy;

  return {
    abv: Math.round(abv * 10) / 10,
    sugarPct: r3(sugarPct),
    acidPct: r3(acidPct),
    sweetness: r3(clamp01((sugarPct * (1 - SWEET_BITTER_MASK * clamp01(bitterIdx / SWEET_BITTER_MASK_REF))) / A.SUGAR_PCT)),
    sourness: r3(clamp01(acidPct / A.ACID_PCT)),
    bitterness: r3(clamp01(bitterIdx / A.BITTER)),
    strength: r3(clamp01(abv / A.ABV)),
    freshness: r3(clamp01(freshness)),
    bitterIndex: r3(bitterIdx),
    finalMl: Math.round(finalMl * 10) / 10,
    unknown,
  };
}

/** DB 의 amount 문자열("3cl", "2 dashes", "적당량" …)을 그대로 받아 계산 */
export function computeFlavorFromAmounts(
  items: Array<{ name: string; amount: string | null | undefined; abv?: number }>,
  method: MixMethod,
): FlavorResult {
  return computeFlavor(
    items.map((i) => ({ name: i.name, ml: parseAmount(i.amount), abv: i.abv })),
    method,
  );
}
