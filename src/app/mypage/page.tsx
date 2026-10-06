"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { logout } from "@/shared/lib/logout";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/shared/lib/api";
import { WebNav } from "@/shared/ui/WebNav";
import { MobileTabBar } from "@/shared/ui/MobileTabBar";
import type { DrinkingCapacity } from "@/shared/types";
import { W, T } from "@/shared/lib/theme";
import { getApiErrorMessage } from "@/shared/lib/apiError";

interface SavedCocktail {
  id: string;
  name: string;
  abv: number;
  method: string | null;
  description: string | null;
}

interface Profile {
  name: string | null;
  email: string | null;
  drinkingCapacity: DrinkingCapacity;
  sweetPref: number;
  sourPref: number;
  bitterPref: number;
  strongPref: number;
  freshPref: number;
}

const CAPACITY_OPTIONS: { value: DrinkingCapacity; label: string; sub: string }[] = [
  { value: "VERY_LOW", label: "거의 못 마셔요", sub: "소주 1~2잔 · 쉽게 취하는 편" },
  { value: "LOW",      label: "가볍게 한 잔",   sub: "소주 반 병 정도 · 천천히 즐겨요" },
  { value: "MEDIUM",   label: "적당히 즐겨요",  sub: "소주 1병 내외 · 보통 정도예요" },
  { value: "HIGH",     label: "꽤 마시는 편",   sub: "소주 1~2병 · 잘 마시는 편이에요" },
  { value: "VERY_HIGH",label: "주량이 강해요",  sub: "소주 2병 이상 · 웬만해선 안 취해요" },
];

const FLAVOR_KEYS: { key: keyof Omit<Profile, "name" | "email" | "drinkingCapacity">; label: string }[] = [
  { key: "sweetPref", label: "달콤함" },
  { key: "sourPref", label: "새콤함" },
  { key: "bitterPref", label: "쌉쌀함" },
  { key: "strongPref", label: "독함" },
  { key: "freshPref", label: "청량함" },
];

export default function MyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const { isLoading: loading, data: profileData, isError: profileError, error: profileErr, refetch: refetchProfile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<Profile>("/user/profile").then(r => r.data),
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (profileData) setProfile(prev => prev ?? profileData);
  }, [profileData]);

  const { data: savedCocktails = [], isError: savedError, refetch: refetchSaved } = useQuery<SavedCocktail[]>({
    queryKey: ["user-cocktails"],
    queryFn: () => api.get<SavedCocktail[]>("/user/cocktails").then(r => r.data),
    enabled: status === "authenticated",
  });

  const saveMutation = useMutation({
    mutationFn: (data: Omit<Profile, "name" | "email">) => api.patch("/user/profile", data),
    onMutate: () => setSaveError(null),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
    onError: (e: unknown) => setSaveError(getApiErrorMessage(e, "저장하지 못했어요. 다시 시도해 주세요.")),
  });

  const saving = saveMutation.isPending;

  function handleSave() {
    if (!profile) return;
    const { drinkingCapacity, sweetPref, sourPref, bitterPref, strongPref, freshPref } = profile;
    saveMutation.mutate({ drinkingCapacity, sweetPref, sourPref, bitterPref, strongPref, freshPref });
  }

  function setPref(key: keyof Profile, value: number) {
    setProfile(p => p ? { ...p, [key]: value } : p);
  }

  const isLoading = status === "loading" || loading;
  const profileErrMsg = profileError ? getApiErrorMessage(profileErr, "프로필을 불러오지 못했어요.") : null;

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", fontFamily: W.sans, color: W.text }}>
        <WebNav active="/mypage" />
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 60px)" }}>
            <p style={{ color: W.textMuted, fontSize: 14 }}>불러오는 중...</p>
          </div>
        ) : !profile ? (profileErrMsg && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: "calc(100vh - 60px)" }}>
            <p style={{ color: W.textMuted, fontSize: 14, margin: 0 }}>{profileErrMsg}</p>
            <button onClick={() => { void refetchProfile(); }} style={{ padding: "10px 20px", borderRadius: 10, background: W.text, color: W.bg, border: "none", fontSize: 14, fontWeight: 600, fontFamily: W.sans, cursor: "pointer" }}>다시 시도</button>
          </div>
        )) : (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px 80px" }}>
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: W.mono, fontSize: 11, letterSpacing: 1.8, color: W.accent, marginBottom: 10, textTransform: "uppercase" }}>MY PROFILE</div>
              <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.6, margin: 0 }}>
                {session?.user?.name ?? session?.user?.email ?? "내 프로필"}
              </h1>
              {session?.user?.email && session?.user?.name && (
                <p style={{ fontSize: 13, color: W.textMuted, marginTop: 6, letterSpacing: -0.1 }}>{session.user.email}</p>
              )}
            </div>

            <section style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.4, color: W.textMuted, marginBottom: 16, textTransform: "uppercase" }}>주량</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {CAPACITY_OPTIONS.map(opt => {
                  const active = profile.drinkingCapacity === opt.value;
                  return (
                    <button key={opt.value} onClick={() => { if (saving) return; setProfile(p => p ? { ...p, drinkingCapacity: opt.value } : p); }} disabled={saving} style={{
                      padding: "14px 20px", borderRadius: 12, textAlign: "left",
                      border: `1px solid ${active ? W.accent : W.borderStrong}`,
                      background: active ? `${W.accent}14` : W.surface,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: active ? W.accent : W.text, letterSpacing: -0.2, fontFamily: W.sans }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: W.textFaint, marginTop: 2, fontFamily: W.sans }}>{opt.sub}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={{ marginBottom: 48 }}>
              <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.4, color: W.textMuted, marginBottom: 16, textTransform: "uppercase" }}>맛 취향</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {FLAVOR_KEYS.map(({ key, label }) => {
                  const val = profile[key] as number;
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: 13, letterSpacing: -0.1 }}>{label}</span>
                        <span style={{ fontFamily: W.mono, fontSize: 11, color: W.textFaint }}>{Math.round(val * 10) / 10}</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.05} value={val}
                        onChange={e => { if (!saving) setPref(key, parseFloat(e.target.value)); }}
                        disabled={saving}
                        style={{ width: "100%", accentColor: W.accent }} />
                    </div>
                  );
                })}
              </div>
            </section>

            {(savedCocktails.length > 0 || savedError) && (
              <section style={{ marginBottom: 40 }}>
                <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.4, color: W.textMuted, marginBottom: 16, textTransform: "uppercase" }}>나의 레시피</div>
                {savedError && (
                  <p style={{ fontSize: 13, color: W.textMuted, margin: 0 }}>
                    레시피를 불러오지 못했어요.{" "}
                    <button onClick={() => { void refetchSaved(); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: W.accent, textDecoration: "underline", fontSize: 13, fontFamily: W.sans }}>다시 시도</button>
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {savedCocktails.map(c => (
                    <Link key={c.id} href={`/cocktail/${c.id}`} style={{ textDecoration: "none" }}>
                      <div style={{ padding: "14px 18px", borderRadius: 12, background: W.surface, border: `0.5px solid ${W.borderStrong}`, display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: W.text, letterSpacing: -0.2 }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: W.textFaint, marginTop: 2, fontFamily: W.mono }}>
                            ABV {c.abv}%{c.method ? ` · ${c.method}` : ""}
                          </div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke={W.textFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {saveError && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: W.accent, textAlign: "center" }}>{saveError}</p>}
            <button onClick={handleSave} disabled={saving} style={{
              width: "100%", height: 52, borderRadius: 12,
              background: saved ? "#4CAF50" : W.text, color: W.bg,
              border: "none", fontSize: 15, fontWeight: 600, letterSpacing: -0.2,
              fontFamily: W.sans, cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1, transition: "background 0.3s",
            }}>
              {saving ? "저장 중..." : saved ? "저장됨" : "저장하기"}
            </button>

            <button onClick={() => logout("/")} style={{
              width: "100%", marginTop: 12, background: "none", border: "none",
              fontSize: 13, color: W.textFaint, fontFamily: W.sans,
              cursor: "pointer", letterSpacing: -0.1, padding: "10px 0",
            }}>
              로그아웃
            </button>
          </div>
        )}
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
            <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: T.darkTextMuted }}>MY PROFILE</div>
            <div style={{ width: 20 }} />
          </div>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: T.darkTextMuted, fontSize: 14 }}>불러오는 중...</div>
          ) : !profile ? (profileErrMsg && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "60px 24px" }}>
              <p style={{ color: T.darkTextMuted, fontSize: 14, margin: 0, textAlign: "center" }}>{profileErrMsg}</p>
              <button onClick={() => { void refetchProfile(); }} style={{ padding: "10px 20px", borderRadius: 10, background: T.darkText, color: T.darkBg, border: "none", fontSize: 14, fontWeight: 600, fontFamily: T.sans, cursor: "pointer" }}>다시 시도</button>
            </div>
          )) : (
            <div style={{ padding: "8px 24px" }}>
              {/* Profile info */}
              <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.4, margin: 0, color: T.darkText }}>
                  {session?.user?.name ?? session?.user?.email ?? "내 프로필"}
                </h1>
                {session?.user?.email && session?.user?.name && (
                  <p style={{ fontSize: 13, color: T.darkTextMuted, marginTop: 4 }}>{session.user.email}</p>
                )}
              </div>

              {/* Drinking capacity */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.darkTextMuted, marginBottom: 14, textTransform: "uppercase" }}>주량</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {CAPACITY_OPTIONS.map(opt => {
                    const active = profile.drinkingCapacity === opt.value;
                    return (
                      <button key={opt.value} onClick={() => { if (saving) return; setProfile(p => p ? { ...p, drinkingCapacity: opt.value } : p); }} disabled={saving} style={{
                        padding: "12px 16px", borderRadius: 12, textAlign: "left",
                        border: `0.5px solid ${active ? T.accent : T.darkBorderStrong}`,
                        background: active ? `${T.accent}22` : T.darkSurface,
                        cursor: saving ? "not-allowed" : "pointer",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? T.accent : T.darkText }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: T.darkTextFaint, marginTop: 2, fontFamily: T.sans }}>{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Flavor preferences */}
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.darkTextMuted, marginBottom: 16, textTransform: "uppercase" }}>맛 취향</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {FLAVOR_KEYS.map(({ key, label }) => {
                    const val = profile[key] as number;
                    return (
                      <div key={key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: T.darkText }}>{label}</span>
                          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.darkTextFaint }}>{Math.round(val * 10) / 10}</span>
                        </div>
                        <input type="range" min={0} max={1} step={0.05} value={val}
                          onChange={e => { if (!saving) setPref(key, parseFloat(e.target.value)); }}
                          disabled={saving}
                          style={{ width: "100%", accentColor: T.accent }} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Saved recipes */}
              {(savedCocktails.length > 0 || savedError) && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.darkTextMuted, marginBottom: 14, textTransform: "uppercase" }}>나의 레시피</div>
                  {savedError && (
                    <p style={{ fontSize: 13, color: T.darkTextMuted, margin: 0 }}>
                      레시피를 불러오지 못했어요.{" "}
                      <button onClick={() => { void refetchSaved(); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: T.accent, textDecoration: "underline", fontSize: 13, fontFamily: T.sans }}>다시 시도</button>
                    </p>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {savedCocktails.map(c => (
                      <Link key={c.id} href={`/cocktail/${c.id}`} style={{ textDecoration: "none" }}>
                        <div style={{ padding: "14px 16px", borderRadius: 12, background: T.darkSurface, border: `0.5px solid ${T.darkBorderStrong}`, display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: T.darkText }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: T.darkTextFaint, marginTop: 2, fontFamily: T.mono }}>
                              ABV {c.abv}%{c.method ? ` · ${c.method}` : ""}
                            </div>
                          </div>
                          <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke={T.darkTextFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Save button */}
              {saveError && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: T.accent, textAlign: "center" }}>{saveError}</p>}
              <button onClick={handleSave} disabled={saving} style={{
                width: "100%", height: 52, borderRadius: 12,
                background: saved ? "#4CAF50" : T.darkText, color: T.darkBg,
                border: "none", fontSize: 15, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1, transition: "background 0.3s",
              }}>
                {saving ? "저장 중..." : saved ? "저장됨" : "저장하기"}
              </button>

              <button onClick={() => logout("/")} style={{
                width: "100%", marginTop: 12, background: "none", border: "none",
                fontSize: 13, color: T.darkTextFaint, fontFamily: T.sans,
                cursor: "pointer", letterSpacing: -0.1, padding: "10px 0",
              }}>
                로그아웃
              </button>
            </div>
          )}

          <MobileTabBar active="mypage" />
        </div>
      </div>
    </>
  );
}
