"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { WebNav } from "@/shared/ui/WebNav";
import { IngredientSearch } from "@/shared/ui/IngredientSearch";
import { MobileTabBar } from "@/shared/ui/MobileTabBar";
import type { GlassType } from "@/shared/ui/GlassSilhouette";
import type { IngredientOption } from "@/shared/ui/IngredientSearch";
import type { MixIngredient, MixMethod, MixAnalysisResult } from "@/shared/types";
import { W, T } from "@/shared/lib/theme";
import { getApiErrorMessage } from "@/shared/lib/apiError";

const DILUTION: Record<string, number> = { shaking: 0.30, stirring: 0.225, build: 0.125, blending: 0.35, neat: 0, floating: 0.05 };

const METHODS: { id: MixMethod; label: string; labelEn: string }[] = [
  { id: "shaking", label: "셰이킹", labelEn: "Shaking" },
  { id: "stirring", label: "스터링", labelEn: "Stirring" },
  { id: "build", label: "빌드", labelEn: "Build" },
  { id: "blending", label: "블렌딩", labelEn: "Blending" },
  { id: "neat", label: "니트", labelEn: "Neat" },
  { id: "floating", label: "플로팅", labelEn: "Floating" },
];


const INITIAL_INGS: (MixIngredient & { id: number })[] = [
  { id: 1, name: "진", amount: 45, abv: 40 },
  { id: 2, name: "레몬 주스", amount: 20, abv: 0 },
  { id: 3, name: "심플 시럽", amount: 15, abv: 0 },
];

const PROFILE_KEYS = ["sourness", "sweetness", "bitterness", "strength", "freshness"] as const;
const PROFILE_LABELS: Record<(typeof PROFILE_KEYS)[number], string> = {
  sourness: "SOUR",
  sweetness: "SWEET",
  bitterness: "BITTER",
  strength: "STRONG",
  freshness: "FRESH",
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function MixPage() {
  const { status: authStatus } = useSession();
  const isLoggedIn = authStatus === "authenticated";
  const queryClient = useQueryClient();
  const [ings, setIngs] = useState(INITIAL_INGS);
  const [method, setMethod] = useState<MixMethod>("shaking");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<MixAnalysisResult | null>(null);
  const [showSearchWeb, setShowSearchWeb] = useState(false);
  const [showSearchMob, setShowSearchMob] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("나만의 칵테일");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [ingNotice, setIngNotice] = useState<string | null>(null);
  const nextIdRef = useRef(INITIAL_INGS.length + 1);

  const totalVolume = ings.reduce((s, i) => s + i.amount, 0);
  const fillLevel = Math.min(totalVolume / 150, 1);

  const liveAbv = useMemo(() => {
    if (totalVolume === 0) return 0;
    const base = ings.reduce((s, i) => s + i.amount * (i.abv / 100), 0) / totalVolume * 100;
    return Math.round(base * (1 - (DILUTION[method] ?? 0)) * 10) / 10;
  }, [ings, totalVolume, method]);

  async function saveIngredient(name: string, abv: number) {
    if (!isLoggedIn) return;
    try {
      await api.post("/user/mix-ingredients", { name, abv });
    } catch {
      setIngNotice("재료를 내 목록에 저장하지 못했어요. 이번 조합에는 그대로 쓸 수 있어요.");
      setTimeout(() => setIngNotice(null), 4000);
    }
  }

  function addIng(item: IngredientOption | { name: string; abv: number; isCustom: true }) {
    setIngs((prev) => [...prev, { id: nextIdRef.current++, name: item.name, amount: 30, abv: item.abv }]);
    void saveIngredient(item.name, item.abv);
  }

  function updateField(id: number, field: "amount" | "abv", value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    if (field === "abv" && num > 100) return;
    if (field === "amount" && num > 1000) return;
    setIngs((prev) => prev.map((i) => i.id === id ? { ...i, [field]: num } : i));
  }

  function removeIng(id: number) {
    setIngs((prev) => prev.filter((i) => i.id !== id));
  }

  const analyzeMutation = useMutation({
    mutationFn: () =>
      api.post<MixAnalysisResult>("/ai/mix-analyze", { ingredients: ings, method, notes }).then(r => r.data),
    onSuccess: (data) => { setResult(data); setCustomName(data.name); setSaveStatus("idle"); setSavedId(null); setAnalyzeError(null); },
    onError: (e: unknown) => setAnalyzeError(getApiErrorMessage(e, "분석 중 오류가 발생했어요. 다시 시도해 주세요.")),
  });

  const loading = analyzeMutation.isPending;

  function analyze() { analyzeMutation.mutate(); }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!result) throw new Error("no result");
      return api.post<{ id: string }>("/cocktail/save", {
        name: customName || result.name,
        description: result.description,
        method,
        ingredients: ings.map(i => ({ name: i.name, amount: i.amount, abv: i.abv })),
        taste: result.taste,
        abv: result.calculatedAbv,
      }).then(r => r.data);
    },
    onMutate: () => { setSaveStatus("saving"); setSaveErrorMsg(null); },
    onSuccess: (data) => { setSavedId(data.id); setSaveStatus("saved"); void queryClient.invalidateQueries({ queryKey: ["cocktails"] }); },
    onError: (e: unknown) => { setSaveStatus("error"); setSaveErrorMsg(getApiErrorMessage(e, "저장하지 못했어요.")); },
  });

  function saveRecipe() { saveMutation.mutate(); }

  const displayResult = result ?? {
    calculatedAbv: liveAbv,
    taste: { sweetness: 0, sourness: 0, bitterness: 0, strength: 0, freshness: 0 },
    aroma: "",
    description: "",
    name: "나만의 칵테일",
  };


  function FlavorBars({ dark }: { dark?: boolean }) {
    const txt = dark ? T.darkTextMuted : W.textMuted;
    const border1 = dark ? T.darkBorder : W.border;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PROFILE_KEYS.map((k) => {
          const v = Math.round(result ? result.taste[k] * 5 : 0);
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 60, fontFamily: T.mono, fontSize: 10, color: txt, letterSpacing: 1.2, textTransform: "uppercase" }}>{PROFILE_LABELS[k]}</span>
              <div style={{ flex: 1, display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} style={{ flex: 1, height: 6, borderRadius: 1, background: n <= v ? T.accent : border1 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (loading) {
    return (
      <>
        {/* ── WEB LOADING ── */}
        <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
            <GlassSilhouette type="coupe" size={160} stroke={W.accent} liquid={W.accent} fillLevel={fillLevel} strokeWidth={1.2} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: W.mono, fontSize: 11, letterSpacing: 2, color: W.accent, marginBottom: 16, textTransform: "uppercase" }}>ANALYZING</div>
              <h2 style={{ fontSize: 24, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.5, margin: "0 0 10px", color: W.text }}>AI가 레시피를 분석하고 있어요.</h2>
              <p style={{ fontSize: 13, color: W.textMuted, margin: 0 }}>맛 프로파일과 향을 계산 중입니다...</p>
            </div>
          </div>
        </div>
        {/* ── MOBILE LOADING ── */}
        <div className="cordial-mob">
          <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 40px" }}>
            <GlassSilhouette type="coupe" size={140} stroke={T.accent} liquid={T.accent} fillLevel={fillLevel} strokeWidth={1.2} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 2, color: T.accent, marginBottom: 16, textTransform: "uppercase" }}>ANALYZING</div>
              <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.5, margin: "0 0 10px" }}>AI가 레시피를 분석하고 있어요.</h2>
              <p style={{ fontSize: 13, color: T.darkTextMuted, margin: 0 }}>맛 프로파일과 향을 계산 중입니다...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans }}>
        <WebNav active="/mix" />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 40px" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.8, color: W.accent, marginBottom: 14, textTransform: "uppercase" }}>Mix Lab</div>
            <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1, lineHeight: 1.1, margin: "0 0 14px" }}>당신만의 레시피.</h1>
            <p style={{ fontSize: 15, color: W.textMuted, margin: 0, letterSpacing: -0.2 }}>재료를 조합하면 도수·맛·향을 분석해드려요.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <GlassSilhouette type="coupe" size={180} stroke={W.accent} liquid={W.accent} fillLevel={fillLevel} strokeWidth={1.2} />
              </div>

              <div>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 12, textTransform: "uppercase" }}>EST. RESULT</div>
                {result ? (
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    maxLength={80}
                    style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3, background: "transparent", border: "none", borderBottom: `1px solid ${W.borderStrong}`, outline: "none", color: W.text, fontFamily: W.sans, width: "100%", padding: "2px 0" }}
                  />
                ) : (
                  <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3 }}>{displayResult.name}</div>
                )}
                <div style={{ fontFamily: W.mono, fontSize: 12, color: W.textMuted, letterSpacing: 0.3, marginTop: 6 }}>
                  ABV ~{displayResult.calculatedAbv}% · {totalVolume}ml
                </div>
              </div>

              <div>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 16, textTransform: "uppercase" }}>FLAVOR PROFILE</div>
                <FlavorBars />
              </div>

              {result && (
                <>
                  <div style={{ padding: "16px 18px", borderLeft: `2px solid ${W.accent}`, background: W.surface }}>
                    <div style={{ fontFamily: W.mono, fontSize: 9, letterSpacing: 1.4, color: W.accent, marginBottom: 8, textTransform: "uppercase" }}>BARTENDER&apos;S TAKE</div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: W.text }}>{result.description}</p>
                    {result.aroma && <p style={{ margin: "8px 0 0", fontSize: 12, color: W.textMuted, lineHeight: 1.6 }}>🌿 {result.aroma}</p>}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    {isLoggedIn ? (
                      saveStatus === "saved" && savedId ? (
                        <Link href={`/cocktail/${savedId}`} style={{ textDecoration: "none" }}>
                          <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(184,135,82,0.1)", border: `0.5px solid ${W.accent}`, fontSize: 13, color: W.accent, fontFamily: W.mono, letterSpacing: 0.3, textAlign: "center" }}>
                            ✓ 저장됨 — 레시피 보기
                          </div>
                        </Link>
                      ) : (
                        <>
                          <button onClick={saveRecipe} disabled={saveStatus === "saving"} style={{ width: "100%", padding: "12px", borderRadius: 10, border: `0.5px solid ${W.accent}`, background: "transparent", fontSize: 13, color: W.accent, fontFamily: W.sans, cursor: saveStatus === "saving" ? "not-allowed" : "pointer", opacity: saveStatus === "saving" ? 0.6 : 1 }}>
                          {saveStatus === "saving" ? "저장 중..." : saveStatus === "error" ? "저장 실패 — 다시 시도" : "레시피 저장하기"}
                        </button>
                          {saveStatus === "error" && saveErrorMsg && <p role="alert" style={{ fontSize: 12, color: W.textMuted, margin: "6px 0 0", textAlign: "center", fontFamily: W.sans }}>{saveErrorMsg}</p>}
                        </>
                      )
                    ) : (
                      <Link href="/login" style={{ textDecoration: "none" }}>
                        <div style={{ padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${W.borderStrong}`, fontSize: 13, color: W.textMuted, textAlign: "center", fontFamily: W.sans }}>
                          로그인하면 레시피를 저장할 수 있어요
                        </div>
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>

            <div>
              <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 16, textTransform: "uppercase" }}>INGREDIENTS · {ings.length}</div>
              {ings.map((ing) => <IngRow key={ing.id} ing={ing} onUpdate={updateField} onRemove={removeIng} onAbvCommit={saveIngredient} />)}
              {showSearchWeb ? (
                <div style={{ padding: "12px 0", borderBottom: `0.5px solid ${W.border}` }}>
                  <IngredientSearch
                    onSelect={(item) => { addIng(item); setShowSearchWeb(false); }}
                    placeholder="재료 검색 또는 직접 추가..."
                  />
                </div>
              ) : (
                <div onClick={() => setShowSearchWeb(true)} style={{ padding: "14px 0", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: W.textMuted, cursor: "pointer", borderBottom: `0.5px solid ${W.border}` }}>
                  <span style={{ fontSize: 18, color: W.textFaint }}>+</span> 재료 더하기
                </div>
              )}

              <div style={{ marginTop: 28 }}>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 12, textTransform: "uppercase" }}>METHOD</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {METHODS.map((m) => (
                    <button key={m.id} onClick={() => setMethod(m.id)} style={{
                      padding: "8px 14px", borderRadius: 100, fontSize: 12,
                      background: method === m.id ? W.text : "transparent",
                      color: method === m.id ? W.bg : W.textMuted,
                      border: `0.5px solid ${method === m.id ? W.text : W.borderStrong}`,
                      cursor: "pointer", fontFamily: W.sans, transition: "all 0.15s",
                    }}>{m.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 28 }}>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 12, textTransform: "uppercase" }}>NOTES</div>
                <div style={{ background: W.surface, border: `0.5px solid ${W.borderStrong}`, borderRadius: 12, padding: "14px 16px" }}>
                  <textarea
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="레몬 필을 뿌린다." rows={3} maxLength={500}
                    style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 13, lineHeight: 1.7, color: W.text, fontFamily: W.sans }}
                  />
                </div>
              </div>

              <button onClick={analyze} disabled={loading || ings.length === 0} style={{
                marginTop: 24, width: "100%", height: 48, borderRadius: 12,
                background: W.accent, color: W.bg, border: "none", fontSize: 15,
                fontWeight: 600, fontFamily: W.sans, cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1, letterSpacing: -0.2,
              }}>
                {loading ? "분석 중..." : "AI 분석하기"}
              </button>
              {analyzeError && <p style={{ fontSize: 12, color: "#D32F2F", margin: "8px 0 0", textAlign: "center", fontFamily: W.sans }}>{analyzeError}</p>}
              {ingNotice && <p style={{ fontSize: 12, color: W.textMuted, margin: "8px 0 0", textAlign: "center", fontFamily: W.sans }}>{ingNotice}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE ── */}
      <div className="cordial-mob">
        <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", paddingBottom: "max(90px, calc(env(safe-area-inset-bottom) + 80px))", overflowY: "auto" }}>
          <div style={{ paddingTop: 62, paddingBottom: 16, paddingLeft: 20, paddingRight: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/home" style={{ textDecoration: "none", display: "flex" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4 L6 10 L12 16" stroke={T.darkText} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
            <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: T.darkTextMuted }}>MIX LAB</div>
            <button onClick={() => { setIngs(INITIAL_INGS); setNotes(""); setResult(null); }} disabled={loading} style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, color: T.darkTextMuted, fontFamily: T.sans, opacity: loading ? 0.4 : 1 }}>초기화</button>
          </div>

          <div style={{ padding: "8px 24px 24px" }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.6, margin: 0, lineHeight: 1.2 }}>당신만의 레시피.</h1>
          </div>

          <div style={{ padding: "0 24px 24px", display: "flex", alignItems: "flex-end", gap: 20 }}>
            <GlassSilhouette type="coupe" size={110} stroke={T.accent} liquid={T.accent} fillLevel={fillLevel} strokeWidth={1.2} />
            <div style={{ flex: 1, paddingBottom: 10 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.darkTextFaint, marginBottom: 6, textTransform: "uppercase" }}>EST. RESULT</div>
              {result ? (
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3, marginBottom: 6, background: "transparent", border: "none", borderBottom: `1px solid ${T.darkBorderStrong}`, outline: "none", color: T.darkText, fontFamily: T.sans, width: "100%", padding: "2px 0" }}
                />
              ) : (
                <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3, marginBottom: 6 }}>{displayResult.name}</div>
              )}
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.darkTextMuted }}>ABV ~{displayResult.calculatedAbv}% · {totalVolume}ml</div>
            </div>
          </div>

          <div style={{ padding: "0 24px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 12, textTransform: "uppercase" }}>INGREDIENTS · {ings.length}</div>
            {ings.map((ing) => <IngRow key={ing.id} ing={ing} dark onUpdate={updateField} onRemove={removeIng} onAbvCommit={saveIngredient} />)}
            {showSearchMob ? (
              <div style={{ padding: "12px 0", borderBottom: `0.5px solid ${T.darkBorder}` }}>
                <IngredientSearch
                  dark
                  onSelect={(item) => { addIng(item); setShowSearchMob(false); }}
                  placeholder="재료 검색 또는 직접 추가..."
                />
              </div>
            ) : (
              <div onClick={() => setShowSearchMob(true)} style={{ padding: "14px 0", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.darkTextMuted, cursor: "pointer", borderBottom: `0.5px solid ${T.darkBorder}` }}>
                <span style={{ fontSize: 18, color: T.darkTextFaint }}>+</span> 재료 더하기
              </div>
            )}
          </div>

          <div style={{ padding: "20px 24px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 12, textTransform: "uppercase" }}>METHOD</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {METHODS.map((m) => (
                <button key={m.id} onClick={() => setMethod(m.id)} style={{
                  padding: "7px 12px", borderRadius: 100, fontSize: 12,
                  background: method === m.id ? T.accent : "transparent",
                  color: method === m.id ? T.darkBg : T.darkTextMuted,
                  border: `0.5px solid ${method === m.id ? T.accent : T.darkBorderStrong}`,
                  cursor: "pointer", fontFamily: T.sans,
                }}>{m.label}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: "0 24px 20px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 12, textTransform: "uppercase" }}>FLAVOR PROFILE</div>
            <FlavorBars dark />
          </div>

          {result && (
            <div style={{ padding: "0 24px 20px" }}>
              <div style={{ padding: "16px 18px", borderLeft: `2px solid ${T.accent}` }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.4, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>BARTENDER&apos;S TAKE</div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>{result.description}</p>
                {result.aroma && <p style={{ margin: "8px 0 0", fontSize: 12, color: T.darkTextMuted, lineHeight: 1.6 }}>🌿 {result.aroma}</p>}
              </div>
              <div style={{ marginTop: 14 }}>
                {isLoggedIn ? (
                  saveStatus === "saved" && savedId ? (
                    <Link href={`/cocktail/${savedId}`} style={{ textDecoration: "none" }}>
                      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(184,135,82,0.1)", border: `0.5px solid ${T.accent}`, fontSize: 13, color: T.accent, fontFamily: T.mono, letterSpacing: 0.3, textAlign: "center" }}>
                        ✓ 저장됨 — 레시피 보기
                      </div>
                    </Link>
                  ) : (
                    <>
                      <button onClick={saveRecipe} disabled={saveStatus === "saving"} style={{ width: "100%", padding: "12px", borderRadius: 10, border: `0.5px solid ${T.accent}`, background: "transparent", fontSize: 13, color: T.accent, fontFamily: T.sans, cursor: saveStatus === "saving" ? "not-allowed" : "pointer", opacity: saveStatus === "saving" ? 0.6 : 1 }}>
                      {saveStatus === "saving" ? "저장 중..." : saveStatus === "error" ? "저장 실패 — 다시 시도" : "레시피 저장하기"}
                    </button>
                      {saveStatus === "error" && saveErrorMsg && <p role="alert" style={{ fontSize: 12, color: T.darkTextMuted, margin: "6px 0 0", textAlign: "center", fontFamily: T.sans }}>{saveErrorMsg}</p>}
                    </>
                  )
                ) : (
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <div style={{ padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${T.darkBorderStrong}`, fontSize: 13, color: T.darkTextMuted, textAlign: "center", fontFamily: T.sans }}>
                      로그인하면 레시피를 저장할 수 있어요
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}

          <div style={{ padding: "0 24px 24px" }}>
            <button onClick={analyze} disabled={loading || ings.length === 0} style={{
              width: "100%", height: 48, borderRadius: 12, background: T.accent, color: T.darkBg,
              border: "none", fontSize: 15, fontWeight: 600, fontFamily: T.sans,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            }}>
              {loading ? "분석 중..." : "AI 분석하기"}
            </button>
            {analyzeError && <p style={{ fontSize: 12, color: "#EF9A9A", margin: "8px 0 0", textAlign: "center", fontFamily: T.sans }}>{analyzeError}</p>}
            {ingNotice && <p style={{ fontSize: 12, color: T.darkTextMuted, margin: "8px 0 0", textAlign: "center", fontFamily: T.sans }}>{ingNotice}</p>}
          </div>

          <MobileTabBar active="mix" />
        </div>
      </div>
    </>
  );
}

interface IngRowProps {
  ing: { id: number; name: string; amount: number; abv: number };
  dark?: boolean;
  onUpdate: (id: number, field: "amount" | "abv", value: string) => void;
  onRemove: (id: number) => void;
  onAbvCommit: (name: string, abv: number) => void;
}

function IngRow({ ing, dark, onUpdate, onRemove, onAbvCommit }: IngRowProps) {
  const [amountStr, setAmountStr] = useState(String(ing.amount));
  const [abvStr, setAbvStr] = useState(String(ing.abv));

  useEffect(() => { setAmountStr(String(ing.amount)); setAbvStr(String(ing.abv)); }, [ing.id]);

  const txt = dark ? T.darkText : W.text;
  const border1 = dark ? T.darkBorder : W.border;
  const accent = T.accent;
  const mono = T.mono;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: `0.5px solid ${border1}` }}>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: txt }}>{ing.name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number" min="0" step="5"
          value={amountStr}
          onChange={(e) => { setAmountStr(e.target.value); onUpdate(ing.id, "amount", e.target.value); }}
          onBlur={() => { if (amountStr === "" || isNaN(parseFloat(amountStr))) setAmountStr(String(ing.amount)); }}
          style={{ width: 56, background: "transparent", border: "none", borderBottom: `0.5px solid ${accent}`, outline: "none", fontSize: 13, color: accent, fontFamily: mono, textAlign: "right", padding: "2px 0" }}
        />
        <span style={{ fontSize: 11, color: dark ? T.darkTextFaint : W.textFaint, fontFamily: mono }}>ml</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number" min="0" max="100" step="1"
          value={abvStr}
          onChange={(e) => { setAbvStr(e.target.value); onUpdate(ing.id, "abv", e.target.value); }}
          onBlur={() => {
            if (abvStr === "" || isNaN(parseFloat(abvStr))) { setAbvStr(String(ing.abv)); return; }
            onAbvCommit(ing.name, parseFloat(abvStr));
          }}
          style={{ width: 42, background: "transparent", border: "none", borderBottom: `0.5px solid ${dark ? T.darkBorderStrong : W.borderStrong}`, outline: "none", fontSize: 12, color: dark ? T.darkTextMuted : W.textMuted, fontFamily: mono, textAlign: "right", padding: "2px 0" }}
        />
        <span style={{ fontSize: 11, color: dark ? T.darkTextFaint : W.textFaint, fontFamily: mono }}>%</span>
      </div>
      <button onClick={() => onRemove(ing.id)} style={{ background: "none", border: "none", cursor: "pointer", color: dark ? T.darkTextFaint : W.textFaint, fontSize: 18, lineHeight: 1, padding: "0 0 0 4px" }} aria-label="삭제">×</button>
    </div>
  );
}

