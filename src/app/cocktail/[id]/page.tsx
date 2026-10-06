"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/shared/lib/api";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { WebNav } from "@/shared/ui/WebNav";
import type { GlassType } from "@/shared/ui/GlassSilhouette";
import type { RecommendedCocktail } from "@/shared/types";
import { W, T } from "@/shared/lib/theme";

interface IngredientItem {
  name: string;
  nameEn: string | null;
  amount: string | null;
}

type MixMethod = "shaking" | "stirring" | "build" | "blending" | "neat" | "floating";

function formatAmount(amount: string | null): string {
  if (!amount) return "적당량";
  const match = amount.match(/^([\d.]+)cl$/);
  if (match) {
    const ml = Math.round(parseFloat(match[1]) * 10);
    return `${ml}ml`;
  }
  return amount;
}

function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  if (!word) return withoutBatchim;
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 === 0 ? withoutBatchim : withBatchim;
  }
  return withoutBatchim;
}

function buildMethodSteps(method: string | null, ingredients: IngredientItem[], glassType?: string | null): string[] {
  const m = (method ?? "shaking") as MixMethod;
  const ingList = ingredients
    .filter(i => i.amount && i.amount !== "적당량")
    .map(i => `${i.name} ${formatAmount(i.amount)}`)
    .join(", ");
  const garnishes = ingredients
    .filter(i => !i.amount || i.amount === "적당량")
    .map(i => i.name);

  const garnishStep = garnishes.length > 0
    ? `${garnishes.join(", ")}으로 마무리하고 천천히 음미해요.`
    : "잔을 들고 천천히 향을 느끼며 음미해요.";

  switch (m) {
    case "shaking":
      return [
        `셰이커에 ${ingList}${josa(ingList, "을", "를")} 넣어요.`,
        "얼음 없이 10초간 드라이 셰이크해요.",
        "큰 얼음을 채우고 다시 15초 세게 셰이크해요.",
        "차갑게 칠링한 잔에 더블 스트레이너로 걸러 따라요.",
        garnishStep,
      ];
    case "stirring":
      return [
        "믹싱 글라스에 큰 얼음을 채워요.",
        `${ingList}${josa(ingList, "을", "를")} 순서대로 투입해요.`,
        "바 스푼으로 30초간 부드럽게 스터해요.",
        "칠링한 잔에 스트레이너로 걸러 따라요.",
        garnishStep,
      ];
    case "build":
      // 플루트/쿠프 잔 스파클링 칵테일은 얼음 없이 빌드
      if (glassType === "flute") {
        return [
          "잔을 미리 냉장고에서 차갑게 칠링해요.",
          `재료를 순서대로 넣어요: ${ingList}.`,
          "바 스푼으로 아주 가볍게 1~2회만 스터해요.",
          garnishStep,
          "빨대 없이 바로 서빙해요.",
        ];
      }
      return [
        "잔에 큰 얼음을 가득 채워요.",
        `도수가 높은 술부터 순서대로 넣어요: ${ingList}.`,
        "바 스푼으로 가볍게 2~3회 스터해요.",
        garnishStep,
        "빨대와 함께 바로 서빙해요.",
      ];
    case "blending":
      return [
        `블렌더에 ${ingList}${josa(ingList, "과", "와")} 얼음 한 컵을 넣어요.`,
        "고속으로 20~30초 블렌드해요.",
        "부드러운 질감이 될 때까지 필요하면 반복해요.",
        "차가운 잔에 천천히 따라요.",
        garnishStep,
      ];
    case "neat":
      return [
        "잔을 미리 냉동실에서 칠링해요.",
        `${ingList}${josa(ingList, "을", "를")} 계량해요.`,
        "칠링된 잔에 바로 따라요.",
        "얼음 없이 그대로 즐겨요.",
        garnishStep,
      ];
    default:
      return [
        `재료를 준비해요: ${ingList}.`,
        "잔과 도구를 준비해요.",
        "레시피대로 재료를 계량해요.",
        "잘 섞어서 잔에 따라요.",
        garnishStep,
      ];
  }
}

const CAT_KO: Record<string, string> = {
  "All Day Cocktail":      "올 데이",
  "Before Dinner Cocktail": "식전주",
  "After Dinner Cocktail":  "식후주",
  "Longdrink":              "롱드링크",
  "Sparkling Cocktail":     "스파클링",
  "Hot Drink":              "핫 드링크",
};
const catKo = (cat: string | null | undefined) => (cat && CAT_KO[cat]) ? CAT_KO[cat] : (cat ?? "클래식");

function toBarValue(val: number) { return Math.round(val * 5); }

function pickGlass(name: string): GlassType {
  const n = name.toLowerCase();
  if (n.includes("martini") || n.includes("aviation") || n.includes("gimlet")) return "martini";
  if (n.includes("coupe") || n.includes("sidecar") || n.includes("negroni")) return "coupe";
  if (n.includes("highball") || n.includes("mojito") || n.includes("collins")) return "highball";
  if (n.includes("flute") || n.includes("champagne")) return "flute";
  return "rocks";
}

interface ApiCocktailDetail {
  id: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  category?: string | null;
  glassType?: string | null;
  abv: number;
  imageUrl?: string | null;
  sweetness: number;
  sourness: number;
  bitterness: number;
  strength: number;
  freshness: number;
  popularity: number;
  isCustom?: boolean;
  method?: string | null;
  ingredients?: { ingredient: { name: string; nameEn: string | null }; amount: string | null }[];
}

export default function CocktailDetailPage() {
  const router = useRouter();
  const params = useParams();
  const urlId = params?.id as string | undefined;
  const [cocktail, setCocktail] = useState<RecommendedCocktail | null>(null);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCustom, setIsCustom] = useState(false);
  const [aiSteps, setAiSteps] = useState<string[] | null>(null);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [notFound, setNotFound] = useState<"cocktail" | "creative" | null>(null);

  const loadAiSteps = useCallback(async (id: string) => {
    if (!id || id === "creative") return;
    setStepsLoading(true);
    try {
      const res = await api.get<{ steps: string[] }>(`/cocktails/${id}/recipe-steps`);
      if (res.data.steps?.length > 0) setAiSteps(res.data.steps);
    } catch {
      // fallback to static steps
    } finally {
      setStepsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sel = typeof window !== "undefined" ? sessionStorage.getItem("selectedCocktail") : null;
    const targetId = urlId;
    const fail = () => { if (!cancelled) setNotFound(targetId === "creative" ? "creative" : "cocktail"); };

    async function loadDetail(id: string) {
      try {
        const res = await api.get<ApiCocktailDetail>(`/cocktails/${id}`);
        const data = res.data;
        if (cancelled) return null;
        if (data.ingredients) {
          setIngredients(data.ingredients.map(ci => ({
            name: ci.ingredient.name,
            nameEn: ci.ingredient.nameEn,
            amount: ci.amount,
          })));
        }
        if (data.method) setMethod(data.method);
        if (data.imageUrl) setImageUrl(data.imageUrl);
        if (data.isCustom) setIsCustom(true);
        return data;
      } catch (e) {
        console.error("[loadDetail] fetch error:", e);
        return null;
      }
    }

    async function init() {
      if (sel) {
        let c: RecommendedCocktail;
        try {
          c = JSON.parse(sel) as RecommendedCocktail;
        } catch {
          sessionStorage.removeItem("selectedCocktail");
          if (targetId && targetId !== "creative") {
            const data = await loadDetail(targetId);
            if (cancelled) { setLoading(false); return; }
            if (data) {
              setCocktail({
                id: data.id, name: data.name, description: data.description ?? null,
                category: data.category ?? null, glassType: data.glassType ?? null,
                abv: data.abv, imageUrl: data.imageUrl ?? null,
                sweetness: data.sweetness, sourness: data.sourness,
                bitterness: data.bitterness, strength: data.strength, freshness: data.freshness,
                popularity: data.popularity, aiDescription: "", score: 0,
              });
            } else { fail(); }
          } else { fail(); }
          setLoading(false);
          return;
        }
        // Use sessionStorage if it matches the URL id (or no URL id)
        if (!targetId || c.id === targetId) {
          if (!cancelled) setCocktail(c);
          if (c.id && c.id !== "creative") {
            await loadDetail(c.id);
            if (!cancelled) void loadAiSteps(c.id);
          }
          if (!cancelled) setLoading(false);
          return;
        }
      }
      // Fallback: fetch from API using URL id
      if (targetId && targetId !== "creative") {
        const data = await loadDetail(targetId);
        if (cancelled) return;
        if (data) {
          setCocktail({
            id: data.id,
            name: data.name,
            description: data.description ?? null,
            category: data.category ?? null,
            glassType: data.glassType ?? null,
            abv: data.abv,
            imageUrl: data.imageUrl ?? null,
            sweetness: data.sweetness,
            sourness: data.sourness,
            bitterness: data.bitterness,
            strength: data.strength,
            freshness: data.freshness,
            popularity: data.popularity,
            aiDescription: "",
            score: 0,
          });
          void loadAiSteps(targetId);
        } else {
          fail();
        }
      } else {
        fail();
      }
      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [loadAiSteps, urlId]);

  if (notFound) {
    const toPantry = notFound === "creative";
    return (
      <>
        <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", fontFamily: W.sans, display: "flex", flexDirection: "column" }}>
          <WebNav />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 24px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.4, margin: 0, color: W.text }}>칵테일을 찾을 수 없어요</h2>
            <p style={{ fontSize: 14, color: W.textMuted, margin: 0, textAlign: "center" }}>{toPantry ? "AI가 만든 칵테일 정보가 사라졌어요. 내 술장에서 다시 찾아보세요." : "삭제되었거나 잘못된 주소일 수 있어요."}</p>
            <Link href={toPantry ? "/pantry" : "/cocktails"} style={{ marginTop: 8, padding: "12px 24px", borderRadius: 12, background: W.accent, color: W.bg, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>{toPantry ? "내 술장으로" : "칵테일 목록으로"}</Link>
          </div>
        </div>
        <div className="cordial-mob">
          <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 32px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.4, margin: 0 }}>칵테일을 찾을 수 없어요</h2>
            <p style={{ fontSize: 14, color: T.darkTextMuted, margin: 0, textAlign: "center" }}>{toPantry ? "AI가 만든 칵테일 정보가 사라졌어요. 내 술장에서 다시 찾아보세요." : "삭제되었거나 잘못된 주소일 수 있어요."}</p>
            <Link href={toPantry ? "/pantry" : "/cocktails"} style={{ marginTop: 8, padding: "12px 24px", borderRadius: 14, background: T.accent, color: T.darkBg, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>{toPantry ? "내 술장으로" : "칵테일 목록으로"}</Link>
          </div>
        </div>
      </>
    );
  }

  if (!cocktail || loading) {
    return (
      <>
        <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", fontFamily: W.sans }}>
          <WebNav />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 60px)", gap: 40 }}>
            <GlassSilhouette type="rocks" size={140} stroke={W.accent} liquid={W.accent} fillLevel={0.55} strokeWidth={1.3} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: W.mono, fontSize: 11, letterSpacing: 1.8, color: W.accent, marginBottom: 14, textTransform: "uppercase" }}>LOADING</div>
              <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.45, margin: 0, color: W.text }}>레시피를 불러오고 있어요.</h2>
            </div>
          </div>
        </div>
        <div className="cordial-mob">
          <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 40px" }}>
            <GlassSilhouette type="rocks" size={140} stroke={T.accent} liquid={T.accent} fillLevel={0.55} strokeWidth={1.3} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 1.8, color: T.accent, marginBottom: 16, textTransform: "uppercase" }}>LOADING</div>
              <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.45, margin: 0 }}>레시피를 불러오고 있어요.</h2>
            </div>
          </div>
        </div>
      </>
    );
  }

  const glassType: GlassType = (cocktail.glassType as GlassType | null) ?? pickGlass(cocktail.name);
  const profile = [
    ["SOUR", toBarValue(cocktail.sourness)],
    ["SWEET", toBarValue(cocktail.sweetness)],
    ["BITTER", toBarValue(cocktail.bitterness)],
    ["STRONG", toBarValue(cocktail.strength)],
    ["FRESH", toBarValue(cocktail.freshness)],
  ] as const;

  const methodSteps = aiSteps ?? buildMethodSteps(method, ingredients, cocktail.glassType);

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans }}>
        <WebNav />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 40px 60px" }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: W.textMuted, fontFamily: W.sans, marginBottom: 40, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M12 4 L6 10 L12 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            뒤로
          </button>

          <div style={{ display: "flex", gap: 64 }}>
            <div style={{ flex: "0 0 300px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              {imageUrl ? (
                <img src={imageUrl} alt={cocktail.name} style={{ width: 220, height: 220, objectFit: "cover", borderRadius: 14, border: `1px solid ${W.border}` }} />
              ) : (
                <GlassSilhouette type={glassType} size={200} stroke={W.accent} liquid={W.accent} fillLevel={0.78} garnish strokeWidth={1.2} />
              )}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.4, color: W.accent, marginBottom: 8, textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {isCustom ? "CUSTOM" : catKo(cocktail.category)}
                  {isCustom && <span style={{ background: W.accent, color: W.bg, fontSize: 9, padding: "2px 6px", borderRadius: 4, letterSpacing: 0.8 }}>MY RECIPE</span>}
                </div>
                <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6, margin: "0 0 10px", lineHeight: 1.1 }}>{cocktail.name}</h1>
                {cocktail.description && (
                  <div style={{ fontSize: 13, color: W.textMuted, letterSpacing: -0.1, marginBottom: 6, lineHeight: 1.5 }}>{cocktail.description}</div>
                )}
                <div style={{ fontSize: 14, color: W.textMuted, fontFamily: W.mono }}>ABV {Math.round(cocktail.abv)}%</div>
              </div>

              {/* Ingredients */}
              {ingredients.length > 0 && (
                <div style={{ width: "100%", marginTop: 8 }}>
                  <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 12, textTransform: "uppercase" }}>Ingredients</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ingredients.map((ing, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `0.5px solid ${W.border}` }}>
                        <span style={{ fontSize: 13, color: W.text, fontWeight: 500 }}>{ing.name}</span>
                        <span style={{ fontFamily: W.mono, fontSize: 11, color: W.accent }}>{formatAmount(ing.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              {cocktail.aiDescription && (
                <div style={{ padding: "18px 20px", borderLeft: `2px solid ${W.accent}`, marginBottom: 32 }}>
                  <div style={{ fontFamily: W.mono, fontSize: 9, letterSpacing: 1.4, color: W.accent, marginBottom: 8, textTransform: "uppercase" }}>BARTENDER&apos;S NOTE</div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, letterSpacing: -0.2, color: W.textMuted }}>{cocktail.aiDescription}</p>
                </div>
              )}

              <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 14, textTransform: "uppercase" }}>FLAVOR PROFILE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 32px", marginBottom: 36 }}>
                {profile.map(([label, val]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ width: 52, fontFamily: W.mono, fontSize: 10, color: W.textMuted, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</span>
                    <div style={{ flex: 1, display: "flex", gap: 4 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} style={{ flex: 1, height: 6, borderRadius: 1, background: n <= val ? W.accent : W.border }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, textTransform: "uppercase" }}>
                  METHOD — {method ? method.toUpperCase() : "SHAKING"}
                </div>
                {stepsLoading && <div style={{ fontFamily: W.mono, fontSize: 9, color: W.accent, letterSpacing: 1, opacity: 0.7 }}>AI 생성 중...</div>}
                {!stepsLoading && aiSteps && <div style={{ fontFamily: W.mono, fontSize: 9, color: W.accent, letterSpacing: 1 }}>AI</div>}
              </div>
              {methodSteps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 18, padding: "12px 0", borderBottom: `0.5px solid ${W.border}` }}>
                  <span style={{ fontFamily: W.mono, fontSize: 11, color: W.accent, letterSpacing: 0.4, minWidth: 20 }}>0{i + 1}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.6, color: W.text, letterSpacing: -0.2 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE ── */}
      <div className="cordial-mob">
        <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 28px))", overflowY: "auto" }}>
          <div style={{ paddingTop: 62, paddingBottom: 16, paddingLeft: 20, paddingRight: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4 L6 10 L12 16" stroke={T.darkText} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <div style={{ padding: "8px 24px 24px", display: "flex", alignItems: "center", gap: 20 }}>
            {imageUrl ? (
              <img src={imageUrl} alt={cocktail.name} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 12, flexShrink: 0 }} />
            ) : (
              <GlassSilhouette type={glassType} size={120} stroke={T.accent} liquid={T.accent} fillLevel={0.78} garnish strokeWidth={1.2} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.accent, marginBottom: 8 }}>{catKo(cocktail.category).toUpperCase()}</div>
              <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, margin: 0, lineHeight: 1.1 }}>{cocktail.name}</h1>
              {cocktail.description && (
                <div style={{ fontSize: 12, color: T.darkTextMuted, letterSpacing: -0.1, marginTop: 4, lineHeight: 1.5 }}>{cocktail.description}</div>
              )}
              <div style={{ marginTop: 6, fontFamily: T.mono, fontSize: 11, color: T.darkTextMuted }}>ABV {Math.round(cocktail.abv)}%</div>
            </div>
          </div>

          {cocktail.aiDescription && (
            <div style={{ padding: "0 24px 24px" }}>
              <div style={{ padding: "16px 18px", borderLeft: `2px solid ${T.accent}` }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.4, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>BARTENDER&apos;S NOTE</div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, letterSpacing: -0.2, color: T.darkTextMuted }}>{cocktail.aiDescription}</p>
              </div>
            </div>
          )}

          {/* Ingredients Mobile */}
          {ingredients.length > 0 && (
            <div style={{ padding: "0 24px 24px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 14, textTransform: "uppercase" }}>Ingredients</div>
              {ingredients.map((ing, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `0.5px solid ${T.darkBorder}` }}>
                  <span style={{ fontSize: 14, color: T.darkText }}>{ing.name}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.accent }}>{formatAmount(ing.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: "0 24px 24px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 16, textTransform: "uppercase" }}>FLAVOR PROFILE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {profile.map(([label, val]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ width: 60, fontFamily: T.mono, fontSize: 10, color: T.darkTextMuted, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</span>
                  <div style={{ flex: 1, display: "flex", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <div key={n} style={{ flex: 1, height: 6, borderRadius: 1, background: n <= val ? T.accent : T.darkBorder }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: "8px 24px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, textTransform: "uppercase" }}>
                METHOD — {method ? method.toUpperCase() : "SHAKING"}
              </div>
              {stepsLoading && <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 1, opacity: 0.7 }}>AI 생성 중...</div>}
              {!stepsLoading && aiSteps && <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 1 }}>AI</div>}
            </div>
            {methodSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: `0.5px solid ${T.darkBorder}` }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, letterSpacing: 0.4, minWidth: 16 }}>0{i + 1}</span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: T.darkText, letterSpacing: -0.2 }}>{step}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: "8px 24px 12px" }}>
            <button onClick={() => router.back()} style={{ fontSize: 13, color: T.darkTextFaint, background: "none", border: "none", cursor: "pointer", fontFamily: T.sans, letterSpacing: -0.1 }}>← 뒤로</button>
          </div>
        </div>
      </div>
    </>
  );
}
