"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WebNav } from "@/shared/ui/WebNav";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { MobileTabBar } from "@/shared/ui/MobileTabBar";
import type { GlassType } from "@/shared/ui/GlassSilhouette";
import { W, T } from "@/shared/lib/theme";
import { getApiErrorMessage } from "@/shared/lib/apiError";

const toTitleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

const CAT_KO: Record<string, string> = {
  "All Day Cocktail":      "올 데이",
  "Before Dinner Cocktail": "식전주",
  "After Dinner Cocktail":  "식후주",
  "Longdrink":              "롱드링크",
  "Sparkling Cocktail":     "스파클링",
  "Hot Drink":              "핫 드링크",
};
const catKo = (cat: string | null) => (cat && CAT_KO[cat]) ? CAT_KO[cat] : (cat ?? "클래식");

interface CocktailItem {
  id: string;
  name: string;
  nameEn: string | null;
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
  isCustom: boolean;
  description: string | null;
}

function pickGlass(name: string): GlassType {
  const n = name.toLowerCase();
  if (n.includes("martini") || n.includes("aviation") || n.includes("gimlet")) return "martini";
  if (n.includes("coupe") || n.includes("sidecar") || n.includes("negroni")) return "coupe";
  if (n.includes("highball") || n.includes("mojito") || n.includes("collins") || n.includes("mule")) return "highball";
  if (n.includes("flute") || n.includes("champagne")) return "flute";
  return "rocks";
}

export default function CocktailsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("전체");

  const { data: cocktails = [], isLoading: loading, isError, error, refetch } = useQuery({
    queryKey: ["cocktails"],
    queryFn: () => api.get<CocktailItem[]>("/cocktails").then(r => r.data),
  });

  const errMsg = isError ? getApiErrorMessage(error, "칵테일 목록을 불러오지 못했어요.") : null;

  const filtered = useMemo(() => {
    let items = cocktails;
    if (categoryFilter === "커스텀") items = items.filter(c => c.isCustom);
    else if (categoryFilter !== "전체") items = items.filter(c => catKo(c.category) === categoryFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(c => c.name.toLowerCase().includes(q) || (c.nameEn ?? "").toLowerCase().includes(q));
    }
    return items;
  }, [cocktails, query, categoryFilter]);

  function openDetail(c: CocktailItem) {
    sessionStorage.setItem("selectedCocktail", JSON.stringify({ ...c, aiDescription: "", score: 0 }));
    router.push(`/cocktail/${c.id}`);
  }

  const categories = useMemo(() => {
    const cats = new Set(cocktails.map(c => catKo(c.category)).filter(Boolean));
    return ["전체", ...(cocktails.some(c => c.isCustom) ? ["커스텀"] : []), ...Array.from(cats)];
  }, [cocktails]);

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans }}>
        <WebNav active="/cocktails" />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 40px" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.8, color: W.accent, marginBottom: 14, textTransform: "uppercase" }}>All Cocktails</div>
            <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1, lineHeight: 1.1, margin: "0 0 14px" }}>전체 칵테일</h1>
            <p style={{ fontSize: 15, color: W.textMuted, margin: 0 }}>
              {loading ? "로딩 중..." : isError ? "불러오기 실패" : `${cocktails.length}가지 칵테일`}
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 32, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 360 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="칵테일 검색..."
                style={{
                  width: "100%", padding: "10px 16px", borderRadius: 100,
                  border: `0.5px solid ${W.borderStrong}`, background: W.surface,
                  fontSize: 13, color: W.text, fontFamily: W.sans, outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {categories.map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)} style={{
                  padding: "8px 14px", borderRadius: 100, fontSize: 12,
                  background: categoryFilter === cat ? W.text : "transparent",
                  color: categoryFilter === cat ? W.bg : W.textMuted,
                  border: `0.5px solid ${categoryFilter === cat ? W.text : W.borderStrong}`,
                  cursor: "pointer", fontFamily: W.sans, transition: "all 0.15s",
                }}>{cat}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: W.textFaint, fontFamily: W.mono, fontSize: 12, letterSpacing: 0.5 }}>LOADING...</div>
          ) : errMsg ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "60px 0", color: W.textMuted, fontSize: 14 }}>
              <span>{errMsg}</span>
              <button onClick={() => { void refetch(); }} style={{ padding: "10px 20px", borderRadius: 10, background: W.text, color: W.bg, border: "none", fontSize: 14, fontWeight: 600, fontFamily: W.sans, cursor: "pointer" }}>다시 시도</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: W.textMuted, fontSize: 14 }}>검색 결과가 없어요.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
              {filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => openDetail(c)}
                  style={{
                    background: W.surface, border: `0.5px solid ${W.border}`,
                    borderRadius: 16, padding: "20px 20px 18px", cursor: "pointer",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                    display: "flex", flexDirection: "column", gap: 14,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(184,135,82,0.12)"; e.currentTarget.style.borderColor = "rgba(184,135,82,0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = W.border; }}
                >
                  <div style={{ display: "flex", justifyContent: "center", paddingBottom: 4 }}>
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />
                    ) : (
                      <GlassSilhouette type={pickGlass(c.name)} size={72} stroke={W.accent} liquid={W.accent} fillLevel={0.7} strokeWidth={1.2} />
                    )}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ fontFamily: W.mono, fontSize: 9, letterSpacing: 1.2, color: W.accent, textTransform: "uppercase" }}>
                        {c.isCustom ? "CUSTOM" : catKo(c.category).toUpperCase()}
                      </div>
                      {c.isCustom && <span style={{ background: W.accent, color: W.bg, fontSize: 8, padding: "1px 5px", borderRadius: 3, letterSpacing: 0.6 }}>MY</span>}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2 }}>{c.name}</div>
                    {c.nameEn && <div style={{ fontSize: 11, color: W.textFaint, marginTop: 2 }}>{toTitleCase(c.nameEn)}</div>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: W.mono, fontSize: 11, color: W.textMuted }}>ABV {Math.round(c.abv)}%</span>
                    <div style={{ display: "flex", gap: 3 }}>
                      {[c.sweetness, c.sourness, c.bitterness, c.strength, c.freshness].map((v, i) => (
                        <div key={i} style={{ width: 5, height: Math.round(v * 20) + 4, borderRadius: 2, background: W.accent, opacity: 0.3 + v * 0.7 }} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE ── */}
      <div className="cordial-mob">
        <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", paddingBottom: "max(90px, calc(env(safe-area-inset-bottom) + 80px))" }}>
          {/* Header */}
          <div style={{ paddingTop: 62, paddingBottom: 16, paddingLeft: 20, paddingRight: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/home" style={{ textDecoration: "none", display: "flex" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12 4 L6 10 L12 16" stroke={T.darkText} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: T.darkTextMuted }}>ALL COCKTAILS</div>
            <div style={{ width: 20 }} />
          </div>

          {/* Title */}
          <div style={{ padding: "8px 24px 20px" }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.6, margin: 0, lineHeight: 1.2 }}>전체 칵테일</h1>
            <p style={{ fontSize: 13, color: T.darkTextMuted, margin: "8px 0 0" }}>
              {loading ? "로딩 중..." : isError ? "불러오기 실패" : `${cocktails.length}가지`}
            </p>
          </div>

          {/* Search */}
          <div style={{ padding: "0 24px 14px" }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="칵테일 검색..."
              style={{
                width: "100%", padding: "10px 16px", borderRadius: 100,
                border: `0.5px solid ${T.darkBorderStrong}`, background: T.darkSurface,
                fontSize: 13, color: T.darkText, fontFamily: T.sans, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Category filters */}
          <div style={{ padding: "0 24px 20px", display: "flex", gap: 8, overflowX: "auto" }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)} style={{
                padding: "7px 14px", borderRadius: 100, flexShrink: 0, fontSize: 12,
                background: categoryFilter === cat ? T.accent : "transparent",
                color: categoryFilter === cat ? T.darkBg : T.darkTextMuted,
                border: `0.5px solid ${categoryFilter === cat ? T.accent : T.darkBorderStrong}`,
                cursor: "pointer", fontFamily: T.sans,
              }}>{cat}</button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: T.darkTextFaint, fontFamily: T.mono, fontSize: 12 }}>LOADING...</div>
          ) : errMsg ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 24px", color: T.darkTextMuted, fontSize: 14, textAlign: "center" }}>
              <span>{errMsg}</span>
              <button onClick={() => { void refetch(); }} style={{ padding: "10px 20px", borderRadius: 10, background: T.darkText, color: T.darkBg, border: "none", fontSize: 14, fontWeight: 600, fontFamily: T.sans, cursor: "pointer" }}>다시 시도</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: T.darkTextMuted, fontSize: 14 }}>검색 결과가 없어요.</div>
          ) : (
            <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => openDetail(c)}
                  style={{
                    background: T.darkSurface, border: `0.5px solid ${T.darkBorder}`,
                    borderRadius: 14, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, flexShrink: 0 }}>
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />
                    ) : (
                      <GlassSilhouette type={pickGlass(c.name)} size={44} stroke={T.accent} liquid={T.accent} fillLevel={0.7} strokeWidth={1.2} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 1.2, marginBottom: 3, textTransform: "uppercase" }}>
                      {c.isCustom ? "CUSTOM" : catKo(c.category).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.3, color: T.darkText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    {c.nameEn && <div style={{ fontSize: 11, color: T.darkTextFaint, marginTop: 2 }}>{toTitleCase(c.nameEn)}</div>}
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.darkTextMuted }}>{Math.round(c.abv)}%</span>
                    <div style={{ display: "flex", gap: 2 }}>
                      {[c.sweetness, c.sourness, c.bitterness, c.strength, c.freshness].map((v, i) => (
                        <div key={i} style={{ width: 4, height: Math.round(v * 16) + 3, borderRadius: 2, background: T.accent, opacity: 0.3 + v * 0.7 }} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <MobileTabBar active="cocktails" />
        </div>
      </div>
    </>
  );
}
