"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { WebNav } from "@/shared/ui/WebNav";
import { IngredientSearch } from "@/shared/ui/IngredientSearch";
import { MobileTabBar } from "@/shared/ui/MobileTabBar";
import type { GlassType } from "@/shared/ui/GlassSilhouette";
import type { IngredientOption } from "@/shared/ui/IngredientSearch";
import type { RecommendedCocktail } from "@/shared/types";
import { W, T } from "@/shared/lib/theme";
import { getApiErrorMessage } from "@/shared/lib/apiError";


interface PantryResult {
  exact: Array<{ cocktail: RecommendedCocktail & { abv: number }; missingIngredients: string[]; matchRatio: number }>;
  almost: Array<{ cocktail: RecommendedCocktail & { abv: number }; missingIngredients: string[]; matchRatio: number }>;
  creative: RecommendedCocktail | null;
}

function pickGlass(name: string): GlassType {
  const n = name.toLowerCase();
  if (n.includes("martini") || n.includes("gimlet")) return "martini";
  if (n.includes("coupe") || n.includes("negroni") || n.includes("sidecar")) return "coupe";
  if (n.includes("highball") || n.includes("collins") || n.includes("mule")) return "highball";
  return "rocks";
}

const DEFAULT_PANTRY = ["버번 위스키", "진", "캄파리", "드라이 베르무트", "레몬 주스", "심플 시럽"];
const STORAGE_KEY = "cordial_pantry";

export default function PantryPage() {
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";
  const router = useRouter();

  function openCocktail(c: RecommendedCocktail & { abv: number }) {
    sessionStorage.setItem("selectedCocktail", JSON.stringify({ ...c, aiDescription: c.aiDescription ?? "", score: 0 }));
    router.push(`/cocktail/${c.id}`);
  }

  const [owned, setOwned] = useState<string[]>([]);
  const [loadingPantry, setLoadingPantry] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<PantryResult | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [debouncing, setDebouncing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showSearchWeb, setShowSearchWeb] = useState(false);
  const [showSearchMob, setShowSearchMob] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMatchRef = useRef<string[] | null>(null);
  const ownedRef = useRef<string[]>([]);
  ownedRef.current = owned;

  const matchMutation = useMutation({
    mutationFn: (ingredients: string[]) =>
      api.post<PantryResult>("/ai/pantry-recommend", { ingredients }).then(r => r.data),
    onMutate: () => setMatchError(null),
    onSuccess: (data, ingredients) => {
      if (latestMatchRef.current !== ingredients) return; // 오래된 응답 무시
      setResult(data);
    },
    onError: (e: unknown, ingredients) => {
      if (latestMatchRef.current !== ingredients) return;
      setResult(null);
      setMatchError(getApiErrorMessage(e, "추천을 불러오지 못했어요. 다시 시도해 주세요."));
    },
  });

  const matchLoading = matchMutation.isPending || debouncing;

  // 매칭 요청 (delay > 0 이면 디바운스)
  const fetchMatches = useCallback((ingredients: string[], delay = 0) => {
    if (matchTimerRef.current) { clearTimeout(matchTimerRef.current); matchTimerRef.current = null; }
    latestMatchRef.current = ingredients;
    if (ingredients.length === 0) { setResult(null); setMatchError(null); setDebouncing(false); return; }
    if (delay <= 0) { setDebouncing(false); matchMutation.mutate(ingredients); return; }
    setDebouncing(true);
    matchTimerRef.current = setTimeout(() => {
      matchTimerRef.current = null;
      setDebouncing(false);
      matchMutation.mutate(ingredients);
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
  }, []);

  // DB 저장 (로그인 시)
  const putPantry = useCallback((items: string[]) => {
    api.put("/user/pantry", { pantry: items })
      .then(() => { if (ownedRef.current === items) setSaveFailed(false); })
      .catch(() => setSaveFailed(true));
  }, []);

  // DB 저장 (로그인 시, 디바운스)
  const saveToDB = useCallback((items: string[]) => {
    if (!isLoggedIn) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => putPantry(items), 800);
  }, [isLoggedIn, putPantry]);

  // 초기 로드
  useEffect(() => {
    if (status === "loading") return;

    async function loadPantry() {
      setLoadError(null);
      if (isLoggedIn) {
        try {
          const res = await api.get<{ pantry: string[] }>("/user/pantry");
          const data = res.data;
          const items = data.pantry.length > 0 ? data.pantry : DEFAULT_PANTRY;
          setOwned(items);
          fetchMatches(items);
        } catch (e: unknown) {
          // 불러오기 실패 시 기본 재료로 덮어쓰지 않도록 편집을 막고 오류만 보여준다
          setLoadError(getApiErrorMessage(e, "내 술장을 불러오지 못했어요."));
        }
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        let items: string[] = DEFAULT_PANTRY;
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as unknown;
            if (Array.isArray(parsed) && parsed.every(x => typeof x === "string")) {
              items = parsed;
            } else {
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch { localStorage.removeItem(STORAGE_KEY); }
        }
        setOwned(items);
        fetchMatches(items);
      }
      setLoadingPantry(false);
    }

    loadPantry();
  }, [status, isLoggedIn, fetchMatches, reloadKey]);

  function retryLoad() {
    setLoadingPantry(true);
    setReloadKey(k => k + 1);
  }

  function applyItems(next: string[]) {
    setOwned(next);
    ownedRef.current = next;
    fetchMatches(next, 600);
    if (isLoggedIn) {
      saveToDB(next);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }

  function addItem(item: IngredientOption | { name: string; abv: number; isCustom: true }) {
    if (owned.includes(item.name)) return;
    applyItems([...owned, item.name]);
  }

  function removeItem(name: string) {
    applyItems(owned.filter(i => i !== name));
  }

  const exactCount = result?.exact.length ?? 0;

  if (loadingPantry) {
    return (
      <>
        <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: W.textMuted, fontFamily: W.sans }}>로딩 중...</div>
        </div>
        <div className="cordial-mob">
          <div style={{ background: T.darkBg, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: T.darkTextMuted, fontFamily: T.sans }}>로딩 중...</div>
          </div>
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", fontFamily: W.sans, display: "flex", flexDirection: "column" }}>
          <WebNav active="/pantry" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 24px" }}>
            <p style={{ fontSize: 16, color: W.textMuted, textAlign: "center", margin: 0 }}>{loadError}</p>
            <p style={{ fontSize: 13, color: W.textFaint, textAlign: "center", margin: 0 }}>저장된 재료를 지키기 위해 불러오기 전에는 수정할 수 없어요.</p>
            <button onClick={retryLoad} style={{ padding: "12px 24px", borderRadius: 12, background: W.accent, color: W.bg, border: "none", fontSize: 14, fontWeight: 600, fontFamily: W.sans, cursor: "pointer" }}>다시 시도하기</button>
          </div>
        </div>
        <div className="cordial-mob">
          <div style={{ background: T.darkBg, minHeight: "100dvh", color: T.darkText, fontFamily: T.sans, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 24px" }}>
            <p style={{ fontSize: 16, color: T.darkTextMuted, textAlign: "center", margin: 0 }}>{loadError}</p>
            <p style={{ fontSize: 13, color: T.darkTextFaint, textAlign: "center", margin: 0 }}>저장된 재료를 지키기 위해 불러오기 전에는 수정할 수 없어요.</p>
            <button onClick={retryLoad} style={{ padding: "12px 24px", borderRadius: 14, background: T.accent, color: T.darkBg, border: "none", fontSize: 14, fontWeight: 600, fontFamily: T.sans, cursor: "pointer" }}>다시 시도하기</button>
          </div>
          <MobileTabBar active="pantry" />
        </div>
      </>
    );
  }

  const saveRetry = (color: string) => saveFailed && (
    <button onClick={() => putPantry(ownedRef.current)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color, fontFamily: "inherit", textDecoration: "underline" }}>저장 실패 — 다시 시도</button>
  );

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans }}>
        <WebNav active="/pantry" />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 40px" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.8, color: W.accent, marginBottom: 14, textTransform: "uppercase" }}>My Pantry</div>
            <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1, lineHeight: 1.1, margin: "0 0 14px" }}>가진 재료로<br />만들 수 있는 한 잔.</h1>
            <p style={{ fontSize: 15, color: W.textMuted, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {owned.length}가지 재료로 {matchLoading ? "확인 중..." : matchError ? "추천을 불러오지 못했어요." : `${exactCount}잔이 가능해요.`}
              {isLoggedIn && (saveFailed ? saveRetry(W.accent) : <span style={{ fontSize: 12, color: W.accent, fontFamily: W.mono }}>· 자동 저장됨</span>)}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 48 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, textTransform: "uppercase" }}>YOUR INVENTORY · {owned.length}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {owned.map((item) => (
                  <div key={item} style={{ padding: "8px 10px 8px 14px", borderRadius: 100, background: W.surface, border: `0.5px solid ${W.borderStrong}`, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    {item}
                    <button onClick={() => removeItem(item)} aria-label={`${item} 삭제`} style={{ background: "none", border: "none", cursor: "pointer", color: W.textFaint, fontSize: 16, lineHeight: 1, padding: "8px 10px", margin: "-8px -10px -8px -2px", minWidth: 32, minHeight: 32 }}>×</button>
                  </div>
                ))}
              </div>
              {showSearchWeb ? (
                <div style={{ marginTop: 4 }}>
                  <IngredientSearch
                    onSelect={(item) => { addItem(item); setShowSearchWeb(false); }}
                    placeholder="재료 검색 또는 직접 추가..."
                  />
                </div>
              ) : (
                <button onClick={() => setShowSearchWeb(true)} style={{ padding: "10px 14px", borderRadius: 100, border: `0.5px dashed ${W.borderStrong}`, fontSize: 13, color: W.textFaint, cursor: "pointer", background: "none" }}>+ 재료 추가</button>
              )}
            </div>

            <div>
              {matchLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: W.textFaint, fontFamily: W.mono, fontSize: 12, letterSpacing: 0.5 }}>MATCHING...</div>
              ) : (
                matchError ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: "24px 0" }}>
                    <p style={{ margin: 0, fontSize: 14, color: W.textMuted }}>{matchError}</p>
                    <button onClick={() => fetchMatches(owned)} style={{ padding: "10px 18px", borderRadius: 10, border: `0.5px solid ${W.borderStrong}`, background: "transparent", fontSize: 13, color: W.text, fontFamily: W.sans, cursor: "pointer" }}>다시 시도</button>
                  </div>
                ) : (
                <>
                  <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 16, textTransform: "uppercase" }}>MATCHES · {exactCount}</div>
                  {result?.exact.length === 0 && (
                    <p style={{ fontSize: 14, color: W.textMuted }}>재료로 만들 수 있는 칵테일이 없어요.</p>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                    {result?.exact.map(({ cocktail: c }) => (
                      <div key={c.id} onClick={() => openCocktail(c)} style={{ background: W.surface, border: `0.5px solid ${W.border}`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", transition: "box-shadow 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(184,135,82,0.12)")}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                      >
                        <GlassSilhouette type={pickGlass(c.name)} size={52} stroke={W.accent} liquid={W.accent} fillLevel={0.7} strokeWidth={1.3} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3 }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: W.accent, marginTop: 4, fontFamily: W.mono }}>바로 만들 수 있어요 · ABV {c.abv}%</div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke={W.textFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    ))}
                  </div>

                  {(result?.almost.length ?? 0) > 0 && (
                    <>
                      <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, marginBottom: 14, textTransform: "uppercase" }}>ALMOST · 한 가지만 더</div>
                      {result?.almost.map(({ cocktail: c, missingIngredients }) => (
                        <div key={c.id} onClick={() => openCocktail(c)} style={{ padding: "14px 0", display: "flex", alignItems: "baseline", borderBottom: `0.5px solid ${W.border}`, gap: 12, cursor: "pointer" }}>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                          <span style={{ flex: 1, fontSize: 11, color: W.textFaint }}>{missingIngredients[0]} 필요</span>
                          <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke={W.textFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      ))}
                    </>
                  )}

                  {result?.creative && (
                    <div style={{ marginTop: 28, padding: "16px 20px", background: W.surface, borderRadius: 14, border: `0.5px solid ${W.borderStrong}` }}>
                      <div style={{ fontFamily: W.mono, fontSize: 9, letterSpacing: 1.4, color: W.accent, marginBottom: 8, textTransform: "uppercase" }}>AI CREATIVE</div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{result.creative.name}</div>
                      <p style={{ margin: "0 0 12px", fontSize: 13, color: W.textMuted, lineHeight: 1.6 }}>{result.creative.description}</p>
                      <p style={{ margin: "0 0 12px", fontSize: 13, color: W.text, lineHeight: 1.65, background: `${W.accent}0D`, borderLeft: `2px solid ${W.accent}`, padding: "8px 12px", borderRadius: "0 6px 6px 0" }}>{result.creative.aiDescription}</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["sweetness","sourness","bitterness","strength","freshness"] as const).map(k => (
                          <div key={k} style={{ flex: 1, textAlign: "center" }}>
                            <div style={{ fontSize: 9, fontFamily: W.mono, color: W.textFaint, letterSpacing: 0.8, marginBottom: 4 }}>{k.slice(0,4).toUpperCase()}</div>
                            <div style={{ height: 3, borderRadius: 2, background: W.border }}>
                              <div style={{ height: "100%", borderRadius: 2, background: W.accent, width: `${result.creative![k] * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
                )
              )}
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
            <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: T.darkTextMuted }}>MY PANTRY</div>
            <button onClick={() => setShowSearchMob(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: T.accent, fontFamily: T.sans }}>+ 추가</button>
          </div>

          <div style={{ padding: "8px 24px 16px" }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.6, margin: 0, lineHeight: 1.2 }}>가진 재료로<br />만들 수 있는 한 잔.</h1>
            <p style={{ fontSize: 13, color: T.darkTextMuted, marginTop: 10, lineHeight: 1.6 }}>
              {owned.length}가지 재료 · {matchLoading ? "확인 중..." : matchError ? "불러오기 실패" : `${exactCount}잔 가능`}
              {isLoggedIn && (saveFailed ? <span style={{ marginLeft: 6 }}>{saveRetry(T.accent)}</span> : <span style={{ color: T.accent, marginLeft: 6 }}>· 저장됨</span>)}
            </p>
          </div>

          <div style={{ padding: "0 24px 20px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 12, textTransform: "uppercase" }}>YOUR INVENTORY · {owned.length}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {owned.map((item) => (
                <div key={item} style={{ padding: "8px 10px 8px 14px", borderRadius: 100, background: T.darkSurface, border: `0.5px solid ${T.darkBorderStrong}`, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  {item}
                  <button onClick={() => removeItem(item)} aria-label={`${item} 삭제`} style={{ background: "none", border: "none", cursor: "pointer", color: T.darkTextFaint, fontSize: 16, lineHeight: 1, padding: "8px 10px", margin: "-8px -10px -8px -2px", minWidth: 32, minHeight: 32 }}>×</button>
                </div>
              ))}
            </div>
            {showSearchMob && (
              <div style={{ marginTop: 12 }}>
                <IngredientSearch
                  dark
                  onSelect={(item) => { addItem(item); setShowSearchMob(false); }}
                  placeholder="재료 검색 또는 직접 추가..."
                />
              </div>
            )}
          </div>

          {matchLoading ? (
            <div style={{ textAlign: "center", padding: "24px", color: T.darkTextFaint, fontFamily: T.mono, fontSize: 12 }}>MATCHING...</div>
          ) : matchError ? (
            <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: T.darkTextMuted }}>{matchError}</p>
              <button onClick={() => fetchMatches(owned)} style={{ padding: "10px 18px", borderRadius: 10, border: `0.5px solid ${T.darkBorderStrong}`, background: "transparent", fontSize: 13, color: T.darkText, fontFamily: T.sans, cursor: "pointer" }}>다시 시도</button>
            </div>
          ) : (
            <div style={{ padding: "0 24px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 14, textTransform: "uppercase" }}>MATCHES · {exactCount}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {result?.exact.map(({ cocktail: c }) => (
                  <div key={c.id} onClick={() => openCocktail(c)} style={{ background: T.darkSurface, border: `0.5px solid ${T.darkBorder}`, borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}>
                    <GlassSilhouette type={pickGlass(c.name)} size={56} stroke={T.accent} liquid={T.accent} fillLevel={0.7} strokeWidth={1.3} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: T.accent, marginTop: 4, fontFamily: T.mono }}>바로 만들 수 있어요</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke={T.darkTextFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                ))}
                {result?.exact.length === 0 && <p style={{ fontSize: 13, color: T.darkTextMuted }}>만들 수 있는 칵테일이 없어요.</p>}
              </div>

              {(result?.almost.length ?? 0) > 0 && (
                <>
                  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, marginBottom: 14, textTransform: "uppercase" }}>ALMOST · 한 가지만 더</div>
                  {result?.almost.map(({ cocktail: c, missingIngredients }) => (
                    <div key={c.id} onClick={() => openCocktail(c)} style={{ padding: "14px 0", display: "flex", alignItems: "baseline", borderBottom: `0.5px solid ${T.darkBorder}`, gap: 12, cursor: "pointer" }}>
                      <span style={{ fontSize: 14, color: T.darkTextMuted }}>{c.name}</span>
                      <span style={{ flex: 1, fontSize: 11, color: T.darkTextFaint }}>{missingIngredients[0]} 필요</span>
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke={T.darkTextFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  ))}
                </>
              )}

              {result?.creative && (
                <div style={{ marginTop: 24, padding: "16px 18px", background: T.darkSurface, borderRadius: 14, border: `0.5px solid ${T.darkBorderStrong}` }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.4, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>AI CREATIVE</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{result.creative.name}</div>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: T.darkTextMuted, lineHeight: 1.6 }}>{result.creative.description}</p>
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: T.darkText, lineHeight: 1.65, borderLeft: `2px solid ${T.accent}`, paddingLeft: 10 }}>{result.creative.aiDescription}</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["sweetness","sourness","bitterness","strength","freshness"] as const).map(k => (
                      <div key={k} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 9, fontFamily: T.mono, color: T.darkTextFaint, letterSpacing: 0.8, marginBottom: 4 }}>{k.slice(0,4).toUpperCase()}</div>
                        <div style={{ height: 3, borderRadius: 2, background: T.darkBorder }}>
                          <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${result.creative![k] * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <MobileTabBar active="pantry" />
        </div>
      </div>
    </>
  );
}
