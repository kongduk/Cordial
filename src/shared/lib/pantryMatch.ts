/**
 * 내 술장 ↔ 레시피 재료 매칭 (순수 TS).
 * 부분 문자열 매칭은 쓰지 않는다 — 정규 키(canonical key) 집합 비교만 사용.
 *   예) 진저에일은 "진"을 충족하지 못한다.
 */
import { SYNONYMS } from "@/shared/lib/ingredientSynonyms";
import { resolveCanonicalName, parseAmount, isGarnishAmount } from "@/shared/lib/flavorModel";

/** 공백 제거 + 소문자 */
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, "");

/** 같은 재료의 다른 DB 표기 */
const EQUIV_GROUPS: string[][] = [
  ["그레나딘", "그레나딘 시럽"],
  ["심플 시럽", "슈거 시럽"],
  ["스카치", "스카치 위스키"],
  ["트리플 섹", "코앵트로"],
  ["레몬 주스", "레몬즙"],
  ["라임 주스", "라임즙"],
];
const EQUIV: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const g of EQUIV_GROUPS) for (const n of g) m.set(norm(n), norm(g[0]));
  return m;
})();

function canonKey(name: string): string {
  const canon = resolveCanonicalName(name) ?? name;
  const k = norm(canon);
  return EQUIV.get(k) ?? k;
}

/** 구체 재료 → 그 재료가 대신할 수 있는 상위(일반) 재료 */
const PARENTS: Record<string, string[]> = {
  "버번 위스키": ["위스키", "버번"], "라이 위스키": ["위스키", "라이"],
  "스카치": ["위스키"], "스카치 위스키": ["위스키"], "아이리시 위스키": ["위스키"],
  "화이트 럼": ["럼"], "다크 럼": ["럼"], "골드 럼": ["럼"],
  "올드 톰 진": ["진"], "시트론 보드카": ["보드카"],
  "드라이 베르무트": ["베르무트"], "레드 베르무트": ["베르무트"],
  "앙고스투라 비터스": ["비터스"], "오렌지 비터스": ["비터스"], "페이쇼 비터스": ["비터스"], "피치 비터스": ["비터스"],
  "달걀 흰자": ["달걀"], "달걀 노른자": ["달걀"],
  "레몬": ["레몬 주스"], "라임": ["라임 주스"],
};

/** 단맛 재료끼리는 서로 대체 가능 (설탕 ↔ 시럽류) */
const SWEETENERS = ["설탕", "브라운 슈가", "심플 시럽", "슈거 시럽", "꿀", "아가베 넥타"].map(norm);

/** 항상 충족으로 보는 재료 (집에 있거나 레시피상 필수가 아님) */
const TRIVIAL = new Set(["물", "얼음", "ice", "water", "크러시드 아이스"].map(norm));

/** 술장 아이템 하나가 충족시키는 정규 키 집합 */
function providedKeys(pantryName: string): Set<string> {
  const keys = new Set<string>();
  const name = pantryName.trim();
  const canon = resolveCanonicalName(name) ?? name;
  keys.add(canonKey(name));
  const add = (n: string) => keys.add(canonKey(n));

  // 일반 재료(위스키, 럼, 비터스 …) 는 SYNONYMS 의 정확한 키로만 구체 재료로 확장
  for (const src of new Set([name, canon])) {
    const syn = SYNONYMS[src];
    if (syn) syn.forEach(add);
  }
  for (const parent of PARENTS[canon] ?? []) add(parent);
  if (SWEETENERS.includes(canonKey(name))) SWEETENERS.forEach((k) => keys.add(k));
  return keys;
}

/** 레시피 재료명("버번/라이 위스키" 등) → 대안 키들 (하나라도 충족하면 OK) */
function requiredAlternatives(recipeName: string): string[] {
  const trimmed = recipeName.trim();
  if (resolveCanonicalName(trimmed) && !trimmed.includes("/")) return [canonKey(trimmed)];
  const whole = canonKey(trimmed);
  const parts = trimmed.split("/").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? [whole, ...parts.map(canonKey)] : [whole];
}

export function pantrySatisfies(pantryNames: string[], recipeIngredient: string): boolean {
  const provided = new Set<string>();
  for (const p of pantryNames) for (const k of providedKeys(p)) provided.add(k);
  return requiredAlternatives(recipeIngredient).some((k) => provided.has(k));
}

export interface RecipeLine { name: string; amount: string | null | undefined }
export interface MissingIngredient {
  name: string;
  /** 비터스 대시·소량(≤3대시) 라인: 필요하지만 소량 */
  minor: boolean;
}

/** 소량(대시 단위) 판정 기준 ml */
const MINOR_ML = 1.8;

/** 가니시/적당량/물/얼음은 부족 목록에서 제외. 설탕류는 시럽류로 대체 가능. */
export function missingForPantry(pantryNames: string[], lines: RecipeLine[]): MissingIngredient[] {
  const provided = new Set<string>();
  for (const p of pantryNames) for (const k of providedKeys(p)) provided.add(k);

  const missing: MissingIngredient[] = [];
  for (const line of lines) {
    if (TRIVIAL.has(norm(line.name))) continue;
    if (isGarnishAmount(line.amount)) continue;
    const alts = requiredAlternatives(line.name);
    if (alts.some((k) => provided.has(k))) continue;
    // 레시피가 설탕류를 요구하면 단맛 재료 아무거나 충족
    if (alts.some((k) => SWEETENERS.includes(k)) && SWEETENERS.some((k) => provided.has(k))) continue;
    const ml = parseAmount(line.amount);
    const isBitters = /비터스/.test(line.name);
    missing.push({ name: line.name, minor: isBitters || (ml > 0 && ml <= MINOR_ML) });
  }
  return missing;
}

/** 판정 대상(비-사소) 라인 수 — matchRatio 분모 */
export function countRequiredLines(lines: RecipeLine[]): number {
  return lines.filter((l) => !TRIVIAL.has(norm(l.name)) && !isGarnishAmount(l.amount)).length;
}
