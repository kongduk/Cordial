"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import { CordialLogo } from "@/shared/ui/CordialLogo";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { W, T } from "@/shared/lib/theme";
import { ACCESS_TOKEN_KEY, ACCESS_TOKEN_USER_KEY } from "@/shared/lib/logout";

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
      id: "google", label: "Google로 계속하기", loadingLabel: "연결 중...",
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
      id: "naver", label: "네이버로 계속하기", loadingLabel: "연결 중...",
      bg: "#03C75A", color: "#fff",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/>
        </svg>
      ),
    },
  ];
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked: "이미 다른 로그인 방식으로 가입된 이메일입니다. 처음 가입한 방식으로 로그인해 주세요.",
};
const OAUTH_ERROR_GENERIC = "소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

/** callbackUrl 은 같은 사이트 내부 경로("/"로 시작, "//" 아님)만 허용 */
function safeCallbackUrl(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return value;
  return "/home";
}

interface PasswordFieldProps {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  inputStyle: React.CSSProperties;
  toggleColor: string;
}

function PasswordField({ value, onChange, show, onToggle, inputStyle, toggleColor }: PasswordFieldProps) {
  return (
    <div style={{ position: "relative" }}>
      <input type={show ? "text" : "password"} autoComplete="current-password" placeholder="비밀번호" value={value}
        onChange={e => onChange(e.target.value)} required style={{ ...inputStyle, paddingRight: 56 }} />
      <button type="button" onClick={onToggle} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
        style={{ position: "absolute", right: 4, top: 0, bottom: 0, minWidth: 44, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: toggleColor, fontFamily: "inherit" }}>
        {show ? "숨기기" : "보기"}
      </button>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const registered = searchParams.get("registered") === "1";
  // credentials 실패는 NextAuth 에러 페이지로 오지 않으므로(redirect:false) 여기 오는 error 는 OAuth 계열
  const oauthError = errorParam ? (OAUTH_ERROR_MESSAGES[errorParam] ?? OAUTH_ERROR_GENERIC) : null;
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl);
  }, [status, router, callbackUrl]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setError] = useState<string | null>(null);
  const error = formError ?? oauthError;
  const [credentialsFailed, setCredentialsFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCredentialsFailed(false);
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false, callbackUrl });
      if (result?.error) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        setCredentialsFailed(true);
      } else {
        try {
          const { data } = await axios.post<{ accessToken: string }>("/api/auth/token");
          localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
          // providers.tsx 가 재발급하지 않도록 토큰 소유 유저 id 도 함께 저장
          const uid = ((await getSession())?.user as { id?: string } | undefined)?.id;
          if (uid) localStorage.setItem(ACCESS_TOKEN_USER_KEY, uid);
        } catch { /* non-fatal */ }
        window.location.href = callbackUrl;
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleOAuth(provider: OAuthProvider) {
    if (oauthLoading) return;
    setOauthLoading(provider);
    signIn(provider, { callbackUrl });
  }

  /* ─────────────────────── WEB ─────────────────────── */
  const webBtns = makeButtons(false);

  /* ─────────────────────── MOBILE ─────────────────────── */
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
            <GlassSilhouette type="coupe" size={340} stroke={T.accent} liquid={T.accent} fillLevel={0.65} strokeWidth={0.8} />
          </div>
          <div style={{ position: "absolute", top: 80, left: -50, opacity: 0.04, pointerEvents: "none" }}>
            <GlassSilhouette type="martini" size={200} stroke={T.accent} liquid={T.accent} fillLevel={0.5} strokeWidth={0.8} />
          </div>

          <CordialLogo size={14} color={T.accent} tracking={2.5} />

          <div>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 2, color: T.accent, marginBottom: 18, textTransform: "uppercase" }}>
              AI Cocktail Sommelier
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.2, margin: "0 0 18px", color: T.darkText }}>
              오늘 기분에 맞는<br />한 잔을 찾아드려요.
            </h2>
            <p style={{ fontSize: 14, color: T.darkTextMuted, lineHeight: 1.75, margin: 0 }}>
              감정을 분석하고, 재료를 매칭하며,<br />
              당신만의 레시피를 만들어드립니다.
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
                로그인
              </h1>
              <p style={{ fontSize: 13, color: W.textMuted, margin: 0 }}>
                계정이 없으신가요?{" "}
                <Link href="/signup" style={{ color: W.accent, textDecoration: "none", fontWeight: 500 }}>
                  회원가입
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

            {registered && (
              <p role="status" style={{ fontSize: 12, color: "#2E7D32", background: "rgba(46,125,50,0.08)", borderRadius: 8, padding: "10px 12px", margin: "0 0 12px" }}>
                가입이 완료됐어요. 로그인해 주세요.
              </p>
            )}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <input type="email" autoComplete="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ height: 44, borderRadius: 10, border: `0.5px solid ${W.borderStrong}`, background: W.surface, color: W.text, fontSize: 13, fontFamily: W.sans, padding: "0 14px", outline: "none", width: "100%", boxSizing: "border-box" }} />
              <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(v => !v)} toggleColor={W.textMuted}
                inputStyle={{ height: 44, borderRadius: 10, border: `0.5px solid ${W.borderStrong}`, background: W.surface, color: W.text, fontSize: 13, fontFamily: W.sans, padding: "0 14px", outline: "none", width: "100%", boxSizing: "border-box" }} />
              {error && <p role="alert" style={{ fontSize: 12, color: "#D32F2F", margin: 0 }}>{error}</p>}
              {credentialsFailed && <p style={{ fontSize: 12, color: W.textMuted, margin: 0 }}>여러 번 실패하면 잠시 로그인이 제한될 수 있어요.</p>}
              <button type="submit" disabled={loading}
                style={{ height: 44, borderRadius: 10, background: W.text, color: W.bg, border: "none", fontSize: 13, fontWeight: 600, fontFamily: W.sans, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, marginTop: 2 }}>
                {loading ? "로그인 중..." : "이메일로 로그인"}
              </button>
            </form>

            <button onClick={() => router.push("/home")}
              style={{ display: "block", width: "100%", marginTop: 18, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: W.textFaint, fontFamily: W.sans, textAlign: "center" }}>
              로그인 없이 계속하기
            </button>
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
                오늘의 한 잔을 찾아드릴게요
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

            {registered && (
              <p role="status" style={{ fontSize: 13, color: "#A5D6A7", background: "rgba(165,214,167,0.1)", borderRadius: 10, padding: "10px 14px", margin: "0 0 12px" }}>
                가입이 완료됐어요. 로그인해 주세요.
              </p>
            )}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="email" autoComplete="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ height: 48, borderRadius: 12, border: `0.5px solid ${T.darkBorderStrong}`, background: T.darkSurface, color: T.darkText, fontSize: 14, fontFamily: T.sans, padding: "0 16px", outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: -0.1 }} />
              <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(v => !v)} toggleColor={T.darkTextMuted}
                inputStyle={{ height: 48, borderRadius: 12, border: `0.5px solid ${T.darkBorderStrong}`, background: T.darkSurface, color: T.darkText, fontSize: 14, fontFamily: T.sans, padding: "0 16px", outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: -0.1 }} />
              {error && <p role="alert" style={{ fontSize: 13, color: "#EF9A9A", margin: 0, letterSpacing: -0.1 }}>{error}</p>}
              {credentialsFailed && <p style={{ fontSize: 12, color: T.darkTextMuted, margin: 0, letterSpacing: -0.1 }}>여러 번 실패하면 잠시 로그인이 제한될 수 있어요.</p>}
              <button type="submit" disabled={loading}
                style={{ height: 48, borderRadius: 12, background: T.accent, color: T.darkBg, border: "none", fontSize: 15, fontWeight: 600, fontFamily: T.sans, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, letterSpacing: -0.2, marginTop: 4 }}>
                {loading ? "로그인 중..." : "로그인"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <Link href="/signup" style={{ fontSize: 13, color: T.darkTextMuted, fontFamily: T.sans, letterSpacing: -0.1, textDecoration: "none" }}>
                처음이신가요? 회원가입
              </Link>
            </div>
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button onClick={() => router.push("/home")}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.darkTextFaint, fontFamily: T.sans }}>
                로그인 없이 계속하기
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
