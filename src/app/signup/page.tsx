"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import Link from "next/link";
import { CordialLogo } from "@/shared/ui/CordialLogo";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { W, T } from "@/shared/lib/theme";

type OAuthProvider = "google" | "naver";

interface OAuthBtn {
  id: OAuthProvider;
  label: string;
  loadingLabel: string;
  icon: React.ReactNode;
  bg: string;
  color: string;
  border?: string;
}

function makeButtons(dark: boolean): OAuthBtn[] {
  const surface = dark ? T.darkSurface : "transparent";
  const text    = dark ? T.darkText    : W.text;
  const border  = dark ? T.darkBorderStrong : W.borderStrong;
  return [
    {
      id: "google", label: "Google로 가입하기", loadingLabel: "연결 중...",
      bg: surface, color: text, border,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C18.622 13.815 17.64 11.507 17.64 9.2z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
      ),
    },
    {
      id: "naver", label: "네이버로 가입하기", loadingLabel: "연결 중...",
      bg: "#03C75A", color: "#fff",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/>
        </svg>
      ),
    },
  ];
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

  const registerMutation = useMutation({
    mutationFn: () => api.post("/auth/register", { email, password, name }),
    onSuccess: async () => {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) { router.push("/login?registered=1"); return; }
      router.replace("/onboarding");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "회원가입에 실패했습니다.");
    },
  });

  const loading = registerMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    registerMutation.mutate();
  }

  function handleOAuth(provider: OAuthProvider) {
    if (oauthLoading) return;
    setOauthLoading(provider);
    signIn(provider, { callbackUrl: "/onboarding" });
  }

  const webBtns = makeButtons(false);
  const mobBtns = makeButtons(true);

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web">
      <div style={{ minHeight: "100dvh", display: "flex", fontFamily: W.sans }}>

        {/* Left — dark branding panel */}
        <div style={{
          width: "42%", minHeight: "100dvh", background: T.darkBg, flexShrink: 0,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "52px 56px", position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", bottom: -60, right: -40, opacity: 0.07, pointerEvents: "none" }}>
            <GlassSilhouette type="highball" size={340} stroke={T.accent} liquid={T.accent} fillLevel={0.6} strokeWidth={0.8} />
          </div>
          <div style={{ position: "absolute", top: 60, left: -40, opacity: 0.04, pointerEvents: "none" }}>
            <GlassSilhouette type="coupe" size={200} stroke={T.accent} liquid={T.accent} fillLevel={0.5} strokeWidth={0.8} />
          </div>

          <CordialLogo size={14} color={T.accent} tracking={2.5} />

          <div>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 2, color: T.accent, marginBottom: 18, textTransform: "uppercase" }}>
              Join Cordial
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.2, margin: "0 0 18px", color: T.darkText }}>
              취향에 맞는<br />칵테일을 찾아드릴게요.
            </h2>
            <p style={{ fontSize: 14, color: T.darkTextMuted, lineHeight: 1.75, margin: 0 }}>
              가입하면 감정 기반 추천,<br />
              맞춤 레시피, 내 술장 기능을 사용할 수 있어요.
            </p>
          </div>

          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.darkTextFaint, letterSpacing: 0.6 }}>
            Crafted with care · Est. 2024
          </div>
        </div>

        {/* Right — light form panel */}
        <div style={{
          flex: 1, background: W.bg, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "52px 48px",
        }}>
          <div style={{ width: "100%", maxWidth: 360 }}>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, margin: "0 0 6px", color: W.text }}>
                회원가입
              </h1>
              <p style={{ fontSize: 13, color: W.textMuted, margin: 0 }}>
                이미 계정이 있으신가요?{" "}
                <Link href="/login" style={{ color: W.accent, textDecoration: "none", fontWeight: 500 }}>
                  로그인
                </Link>
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
              {webBtns.map(btn => (
                <button key={btn.id} onClick={() => handleOAuth(btn.id)} disabled={!!oauthLoading}
                  style={{
                    height: 44, borderRadius: 10, background: btn.bg, color: btn.color,
                    border: `0.5px solid ${btn.border ?? "transparent"}`,
                    fontSize: 13, fontWeight: 500, fontFamily: W.sans,
                    cursor: oauthLoading ? "not-allowed" : "pointer",
                    opacity: oauthLoading && oauthLoading !== btn.id ? 0.4 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                    transition: "opacity 0.15s",
                  }}>
                  {btn.icon}
                  {oauthLoading === btn.id ? btn.loadingLabel : btn.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 0.5, background: W.border }} />
              <span style={{ fontSize: 10, color: W.textFaint, fontFamily: T.mono, letterSpacing: 1 }}>OR</span>
              <div style={{ flex: 1, height: 0.5, background: W.border }} />
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <input type="text" placeholder="이름 (선택)" value={name} onChange={e => setName(e.target.value)}
                style={{ height: 44, borderRadius: 10, border: `0.5px solid ${W.borderStrong}`, background: W.surface, color: W.text, fontSize: 13, fontFamily: W.sans, padding: "0 14px", outline: "none", width: "100%", boxSizing: "border-box" }} />
              <input type="email" autoComplete="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ height: 44, borderRadius: 10, border: `0.5px solid ${W.borderStrong}`, background: W.surface, color: W.text, fontSize: 13, fontFamily: W.sans, padding: "0 14px", outline: "none", width: "100%", boxSizing: "border-box" }} />
              <input type="password" autoComplete="new-password" minLength={8} placeholder="비밀번호 (8자 이상)" value={password} onChange={e => setPassword(e.target.value)} required
                style={{ height: 44, borderRadius: 10, border: `0.5px solid ${W.borderStrong}`, background: W.surface, color: W.text, fontSize: 13, fontFamily: W.sans, padding: "0 14px", outline: "none", width: "100%", boxSizing: "border-box" }} />
              {error && <p style={{ fontSize: 12, color: "#D32F2F", margin: 0 }}>{error}</p>}
              <button type="submit" disabled={loading}
                style={{ height: 44, borderRadius: 10, background: W.text, color: W.bg, border: "none", fontSize: 13, fontWeight: 600, fontFamily: W.sans, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, marginTop: 2 }}>
                {loading ? "처리 중..." : "이메일로 가입하기"}
              </button>
            </form>
          </div>
        </div>
      </div>
      </div>

      {/* ── MOBILE ── */}
      <div className="cordial-mob">
        <div style={{
          minHeight: "100dvh", background: T.darkBg, color: T.darkText,
          fontFamily: T.sans, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <CordialLogo size={16} color={T.accent} tracking={2} />
              <p style={{ fontSize: 13, color: T.darkTextMuted, marginTop: 12, letterSpacing: -0.1 }}>
                계정을 만들어 개인화 추천을 받아보세요
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {mobBtns.map(btn => (
                <button key={btn.id} onClick={() => handleOAuth(btn.id)} disabled={!!oauthLoading}
                  style={{
                    height: 48, borderRadius: 12, background: btn.bg, color: btn.color,
                    border: `0.5px solid ${btn.border ?? "transparent"}`,
                    fontSize: 14, fontWeight: 500, fontFamily: T.sans,
                    cursor: oauthLoading ? "not-allowed" : "pointer",
                    opacity: oauthLoading && oauthLoading !== btn.id ? 0.4 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    letterSpacing: -0.1,
                  }}>
                  {btn.icon}
                  {oauthLoading === btn.id ? btn.loadingLabel : btn.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1, height: 0.5, background: T.darkBorder }} />
              <span style={{ fontSize: 11, color: T.darkTextFaint, fontFamily: T.mono, letterSpacing: 1 }}>OR</span>
              <div style={{ flex: 1, height: 0.5, background: T.darkBorder }} />
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="text" placeholder="이름 (선택)" value={name} onChange={e => setName(e.target.value)}
                style={{ height: 48, borderRadius: 12, border: `0.5px solid ${T.darkBorderStrong}`, background: T.darkSurface, color: T.darkText, fontSize: 14, fontFamily: T.sans, padding: "0 16px", outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: -0.1 }} />
              <input type="email" autoComplete="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ height: 48, borderRadius: 12, border: `0.5px solid ${T.darkBorderStrong}`, background: T.darkSurface, color: T.darkText, fontSize: 14, fontFamily: T.sans, padding: "0 16px", outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: -0.1 }} />
              <input type="password" autoComplete="new-password" minLength={8} placeholder="비밀번호 (8자 이상)" value={password} onChange={e => setPassword(e.target.value)} required
                style={{ height: 48, borderRadius: 12, border: `0.5px solid ${T.darkBorderStrong}`, background: T.darkSurface, color: T.darkText, fontSize: 14, fontFamily: T.sans, padding: "0 16px", outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: -0.1 }} />
              {error && <p style={{ fontSize: 13, color: "#EF9A9A", margin: 0, letterSpacing: -0.1 }}>{error}</p>}
              <button type="submit" disabled={loading}
                style={{ height: 48, borderRadius: 12, background: T.accent, color: T.darkBg, border: "none", fontSize: 15, fontWeight: 600, fontFamily: T.sans, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, letterSpacing: -0.2, marginTop: 4 }}>
                {loading ? "처리 중..." : "회원가입"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <Link href="/login" style={{ fontSize: 13, color: T.darkTextMuted, fontFamily: T.sans, letterSpacing: -0.1, textDecoration: "none" }}>
                이미 계정이 있어요 · 로그인
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
