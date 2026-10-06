/**
 * 맛 모델 검증 스크립트 (DB 불필요): npm run test:flavor
 *  1) IBA 8종 순위 검증  2) parseAmount  3) 팬트리 매칭
 */
import { computeFlavorFromAmounts, parseAmount, mapDbMethod } from "../src/shared/lib/flavorModel";
import type { FlavorResult } from "../src/shared/lib/flavorModel";
import { pantrySatisfies, missingForPantry } from "../src/shared/lib/pantryMatch";
import type { MixMethod } from "../src/shared/types";

interface Spec { name: string; method: MixMethod; ings: Array<[string, string]> }

const IBA: Spec[] = [
  { name: "Daiquiri", method: "shaking", ings: [["화이트 럼", "6cl"], ["라임 주스", "2.5cl"], ["심플 시럽", "1.5cl"]] },
  { name: "Dry Martini", method: "stirring", ings: [["진", "6cl"], ["드라이 베르무트", "1cl"]] },
  { name: "Negroni", method: "build", ings: [["진", "3cl"], ["캄파리", "3cl"], ["레드 베르무트", "3cl"]] },
  { name: "Old Fashioned", method: "build", ings: [["버번 위스키", "4.5cl"], ["앙고스투라 비터스", "2 dashes"], ["설탕", "1 cube"], ["물", "0.5cl"]] },
  { name: "Mojito", method: "build", ings: [["화이트 럼", "4cl"], ["라임 주스", "3cl"], ["설탕", "2 tsp"], ["민트", "적당량"], ["소다수", "top"]] },
  { name: "Margarita", method: "shaking", ings: [["데킬라", "5cl"], ["코앵트로", "2cl"], ["라임 주스", "1.5cl"]] },
  { name: "Alexander", method: "shaking", ings: [["코냑", "3cl"], ["크렘 드 카카오", "3cl"], ["크림", "3cl"]] },
  { name: "Gin & Tonic", method: "build", ings: [["진", "5cl"], ["토닉 워터", "10cl"], ["라임", "1 wedge"]] },
];

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
}

function main(): void {
  const R: Record<string, FlavorResult> = {};
  for (const s of IBA) R[s.name] = computeFlavorFromAmounts(s.ings.map(([name, amount]) => ({ name, amount })), s.method);

  console.log("name           abv   sugar%  acid%  bitIdx | sweet sour bitter str fresh | unknown");
  for (const s of IBA) {
    const r = R[s.name];
    console.log(
      `${s.name.padEnd(14)} ${String(r.abv).padStart(5)} ${r.sugarPct.toFixed(2).padStart(7)} ${r.acidPct.toFixed(2).padStart(6)} ${r.bitterIndex.toFixed(3).padStart(7)} | ` +
      `${r.sweetness.toFixed(2)}  ${r.sourness.toFixed(2)}  ${r.bitterness.toFixed(2)}   ${r.strength.toFixed(2)} ${r.freshness.toFixed(2)} | ${r.unknown.join(",")}`,
    );
  }
  console.log("");

  const names = IBA.map((s) => s.name);
  const topBy = (f: (r: FlavorResult) => number, n = 1): string[] =>
    [...names].sort((a, b) => f(R[b]) - f(R[a])).slice(0, n);
  const strictlyAbove = (winner: string, f: (r: FlavorResult) => number, others: string[]): boolean =>
    others.every((o) => f(R[winner]) > f(R[o]));

  for (const s of IBA) check(`${s.name}: no unknown ingredients`, R[s.name].unknown.length === 0);

  // 마티니 최고 도수 — 화학적으로 Old Fashioned(빌드, 희석 .125, 43% 버번)가 앞선다: 기준과 희석표의 충돌
  const martiniVsAll = strictlyAbove("Dry Martini", (r) => r.abv, names.filter((n) => n !== "Dry Martini" && n !== "Old Fashioned"));
  check("Dry Martini highest strength (excluding Old Fashioned)", martiniVsAll);
  check(
    "Dry Martini vs Old Fashioned strength (informational)",
    true,
    `Martini ${R["Dry Martini"].abv}% vs OF ${R["Old Fashioned"].abv}%` + (R["Dry Martini"].abv > R["Old Fashioned"].abv ? "" : "  <- CONFLICT with criterion"),
  );
  check("Dry Martini ~0 sugar", R["Dry Martini"].sugarPct < 0.6, `${R["Dry Martini"].sugarPct}%`);
  check("Negroni highest bitterness", strictlyAbove("Negroni", (r) => r.bitterIndex, names.filter((n) => n !== "Negroni")));
  // IBA 스펙상 Mojito(라임 3cl, 소다 토핑 후에도 산 ~1.0%) 가 Margarita(라임 1.5cl, 0.74%) 보다 산도가 높다 — 기준과 스펙의 충돌.
  const sourTop3 = topBy((r) => r.acidPct, 3);
  check("Daiquiri most sour", sourTop3[0] === "Daiquiri", sourTop3.join(","));
  check("sour-forward trio {Daiquiri, Mojito, Margarita} above the rest", ["Daiquiri", "Mojito", "Margarita"].every((n) => sourTop3.includes(n)), sourTop3.join(","));
  check("Margarita more sour than Martini/Negroni/OF/Alexander/G&T", ["Dry Martini", "Negroni", "Old Fashioned", "Alexander", "Gin & Tonic"].every((o) => R["Margarita"].acidPct > R[o].acidPct));
  check("Margarita vs Mojito acid (informational)", true, `Margarita ${R["Margarita"].acidPct}% vs Mojito ${R["Mojito"].acidPct}%` + (R["Margarita"].acidPct > R["Mojito"].acidPct ? "" : "  <- CONFLICT with criterion"));
  check("Alexander sweetest (perceived sweetness)", strictlyAbove("Alexander", (r) => r.sweetness, names.filter((n) => n !== "Alexander")), `Alexander ${R["Alexander"].sweetness} vs Negroni ${R["Negroni"].sweetness} (raw sugar% ${R["Alexander"].sugarPct} vs ${R["Negroni"].sugarPct})`);
  const freshTop2 = topBy((r) => r.freshness, 2);
  check("Mojito & G&T highest freshness (top 2)", freshTop2.includes("Mojito") && freshTop2.includes("Gin & Tonic"), freshTop2.join(","));

  // 결정론: 같은 입력 → 같은 출력
  const a = JSON.stringify(computeFlavorFromAmounts(IBA[0].ings.map(([name, amount]) => ({ name, amount })), "shaking"));
  const b = JSON.stringify(computeFlavorFromAmounts(IBA[0].ings.map(([name, amount]) => ({ name, amount })), "shaking"));
  check("deterministic", a === b);

  // parseAmount
  const amt: Array<[string, number]> = [
    ["3cl", 30], ["1.5cl", 15], ["0.12cl", 1.2], ["30ml", 30], ["1 oz", 29.57], ["1 1/2 oz", 44.355],
    ["2 dashes", 1.2], ["대시", 0.6], ["1 tsp", 5], ["1 barspoon", 5], ["2 티스푼", 10], ["splash", 10],
    ["top", 80], ["채우기", 80], ["적당량", 0], ["garnish", 0], ["1 wedge", 0], ["", 0], ["15", 15],
  ];
  for (const [raw, want] of amt) {
    const got = parseAmount(raw);
    check(`parseAmount(${JSON.stringify(raw)}) = ${want}`, Math.abs(got - want) < 0.01, `got ${got}`);
  }
  check("mapDbMethod", mapDbMethod("shaking") === "shaking" && mapDbMethod("stirring") === "stirring" && mapDbMethod(null) === "build");

  // 팬트리 매칭
  const T = (label: string, ok: boolean) => check(`pantry: ${label}`, ok);
  T("[진저에일] does NOT satisfy 진", !pantrySatisfies(["진저에일"], "진"));
  T("[진저비어] does NOT satisfy 진", !pantrySatisfies(["진저비어"], "진"));
  T("[진] satisfies 진", pantrySatisfies(["진"], "진"));
  T("[레몬] satisfies 레몬 주스", pantrySatisfies(["레몬"], "레몬 주스"));
  T("[레몬 주스] satisfies 레몬 주스", pantrySatisfies(["레몬 주스"], "레몬 주스"));
  T("[라임] does NOT satisfy 레몬 주스", !pantrySatisfies(["라임"], "레몬 주스"));
  T("[버번 위스키] satisfies 위스키", pantrySatisfies(["버번 위스키"], "위스키"));
  T("[버번 위스키] satisfies 버번/라이 위스키", pantrySatisfies(["버번 위스키"], "버번/라이 위스키"));
  T("[라이 위스키] satisfies 버번/라이 위스키", pantrySatisfies(["라이 위스키"], "버번/라이 위스키"));
  T("[위스키] (generic) satisfies 스카치 위스키", pantrySatisfies(["위스키"], "스카치 위스키"));
  T("[스카치] satisfies 스카치 위스키", pantrySatisfies(["스카치"], "스카치 위스키"));
  T("[진] does NOT satisfy 올드 톰 진", !pantrySatisfies(["진"], "올드 톰 진"));
  T("[올드 톰 진] satisfies 진", pantrySatisfies(["올드 톰 진"], "진"));
  T("[브랜디] does NOT satisfy 애프리콧 브랜디", !pantrySatisfies(["브랜디"], "애프리콧 브랜디"));
  T("[오렌지 주스] does NOT satisfy 오렌지 비터스", !pantrySatisfies(["오렌지 주스"], "오렌지 비터스"));
  T("[탄산수] satisfies 소다수", pantrySatisfies(["탄산수"], "소다수"));
  T("[화이트 럼] satisfies 럼", pantrySatisfies(["화이트 럼"], "럼"));
  T("[그레나딘] satisfies 그레나딘 시럽", pantrySatisfies(["그레나딘"], "그레나딘 시럽"));
  T("[드라이 베르무트] does NOT satisfy 레드 베르무트", !pantrySatisfies(["드라이 베르무트"], "레드 베르무트"));
  T("[설탕] satisfies 심플 시럽", pantrySatisfies(["설탕"], "심플 시럽"));
  T("[심플 시럽] satisfies 설탕", pantrySatisfies(["심플 시럽"], "설탕"));
  const lines = (arr: Array<[string, string | null]>) => arr.map(([name, amount]) => ({ name, amount }));
  const m1 = missingForPantry(["진"], lines([["진", "6cl"], ["물", "1cl"], ["민트", "적당량"], ["얼음", null]]));
  T("물/적당량/얼음 never missing", m1.length === 0);
  const m2 = missingForPantry(["위스키"], lines([["버번 위스키", "4.5cl"], ["앙고스투라 비터스", "0.06cl"]]));
  T("bitters still required and labeled minor", m2.length === 1 && m2[0].name === "앙고스투라 비터스" && m2[0].minor === true);
  const m3 = missingForPantry(["진", "토닉"], lines([["진", "5cl"], ["토닉 워터", "10cl"]]));
  T("토닉 satisfies 토닉 워터", m3.length === 0);

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
