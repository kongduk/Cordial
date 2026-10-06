import Link from "next/link";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { CordialLogo } from "@/shared/ui/CordialLogo";
import { WebNav } from "@/shared/ui/WebNav";
import { LandingMobileHeader } from "@/shared/ui/LandingMobileHeader";
import { FooterLoginLink } from "@/shared/ui/FooterLoginLink";
import { W, T } from "@/shared/lib/theme";


const FEATURES = [
  { num: "01", glass: "martini" as const, name: "칵테일 추천", desc: "4가지 질문에 답하면 감정에 맞는 칵테일과 추천 이유를 받을 수 있어요.", fill: 0.65, href: "/emotion" },
  { num: "02", glass: "rocks" as const, name: "내 술로 추천", desc: "술장에 있는 재료를 등록하세요. 지금 만들 수 있는 칵테일을 찾아드려요.", fill: 0.78, href: "/pantry" },
  { num: "03", glass: "highball" as const, name: "모의 제조", desc: "재료를 자유롭게 조합하면 예상되는 맛과 도수, 향까지 분석해 드려요.", fill: 0.55, href: "/mix" },
  { num: "04", glass: "coupe" as const, name: "바 매칭", desc: "원하는 분위기와 칵테일을 알려주세요. 주변의 어울리는 바를 매칭해요.", fill: 0.5, href: "/bars" },
] as const;

export default function LandingPage() {
  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, color: W.text, fontFamily: W.sans, minHeight: "100dvh" }}>
        <WebNav active="/" />

        <section style={{
          padding: "100px 56px 80px",
          display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 60, alignItems: "center",
          maxWidth: 1280, margin: "0 auto",
        }}>
          <div>
            <div style={{ fontFamily: W.mono, fontSize: 11, letterSpacing: 1.8, color: W.accent, marginBottom: 22, textTransform: "uppercase" }}>AI BARTENDER · BETA</div>
            <h1 style={{ fontSize: 64, fontWeight: 600, letterSpacing: -1.6, lineHeight: 1.05, margin: 0, color: W.text }}>
              오늘의 당신을<br />
              <span style={{ color: W.accent }}>한 잔</span>으로<br />
              읽어드릴게요.
            </h1>
            <p style={{ fontSize: 17, color: W.textMuted, marginTop: 28, lineHeight: 1.65, letterSpacing: -0.2, maxWidth: 460 }}>
              네 가지 짧은 질문에 답하세요. AI 바텐더가 당신의 감정을 읽고 오늘 밤 어울릴 칵테일 세 잔을 골라드려요.
            </p>
            <div style={{ marginTop: 40, display: "flex", gap: 14, alignItems: "center" }}>
              <Link href="/emotion" style={{
                padding: "14px 28px", borderRadius: 10,
                background: W.text, color: W.bg,
                fontSize: 14, fontWeight: 600, letterSpacing: -0.1, textDecoration: "none",
                fontFamily: W.sans,
              }}>오늘의 한 잔 찾기</Link>
              <Link href="/pantry" style={{
                padding: "14px 24px", borderRadius: 10,
                background: "transparent", color: W.text,
                border: `0.5px solid ${W.borderStrong}`,
                fontSize: 14, fontWeight: 500, letterSpacing: -0.1, textDecoration: "none",
                fontFamily: W.sans,
              }}>레시피 둘러보기</Link>
            </div>
            <div style={{ marginTop: 32, fontFamily: W.mono, fontSize: 11, color: W.textFaint, letterSpacing: 0.4 }}>IBA 공식 레시피 · AI 감정 분석 · 바 매칭</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 24, height: 480 }}>
            <div style={{ paddingBottom: 60 }}>
              <GlassSilhouette type="coupe" size={140} stroke={W.accent} liquid={W.accent} fillLevel={0.55} garnish strokeWidth={1.1} />
            </div>
            <div>
              <GlassSilhouette type="martini" size={170} stroke={W.accent} liquid={W.accent} fillLevel={0.65} garnish strokeWidth={1.1} />
            </div>
            <div style={{ paddingBottom: 80 }}>
              <GlassSilhouette type="rocks" size={120} stroke={W.accent} liquid={W.accent} fillLevel={0.78} strokeWidth={1.1} />
            </div>
          </div>
        </section>

        <section style={{ padding: "60px 56px 100px", maxWidth: 1280, margin: "0 auto", borderTop: `0.5px solid ${W.border}` }}>
          <div style={{ fontFamily: W.mono, fontSize: 11, letterSpacing: 1.8, color: W.accent, marginBottom: 16, textTransform: "uppercase" }}>HOW IT WORKS</div>
          <h2 style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.8, margin: 0, marginBottom: 64, lineHeight: 1.2, maxWidth: 700 }}>
            기분, 재료, 조합, 그리고 바.<br />
            <span style={{ color: W.textMuted }}>네 가지 방식으로 한 잔을 만나요.</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {FEATURES.map((f) => (
              <Link key={f.num} href={f.href} style={{ textDecoration: "none" }}>
                <div style={{
                  background: W.surface, border: `0.5px solid ${W.border}`,
                  borderRadius: 18, padding: "32px 28px 28px",
                  display: "flex", flexDirection: "column", gap: 20,
                  minHeight: 320, cursor: "pointer",
                }}>
                  <div style={{ fontFamily: W.mono, fontSize: 11, color: W.accent, letterSpacing: 1.4 }}>{f.num}</div>
                  <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
                    <GlassSilhouette type={f.glass} size={86} stroke={W.accent} liquid={W.accent} fillLevel={f.fill} strokeWidth={1.3} />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3, marginBottom: 8, color: W.text }}>{f.name}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.65, letterSpacing: -0.15, color: W.textMuted }}>{f.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section style={{ padding: "80px 56px", background: "#F4F0EA", borderTop: `0.5px solid ${W.border}`, borderBottom: `0.5px solid ${W.border}` }}>
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontFamily: W.mono, fontSize: 11, letterSpacing: 1.8, color: W.accent, marginBottom: 24, textTransform: "uppercase" }}>OUR PHILOSOPHY</div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 500, lineHeight: 1.45, letterSpacing: -0.5, color: W.text }}>
              오늘이 어떤 날이었든 — 그 하루를 담은<br />
              한 잔이 있어요. Cordial이 찾아드릴게요.
            </p>
            <div style={{ marginTop: 28, fontSize: 13, color: W.textMuted, letterSpacing: -0.1 }}>
              — Cordial
            </div>
          </div>
        </section>

        <footer style={{ padding: "40px 56px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1280, margin: "0 auto" }}>
          <CordialLogo size={13} color={W.textMuted} tracking={2} />
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <FooterLoginLink />
            <div style={{ fontFamily: W.mono, fontSize: 10, color: W.textFaint, letterSpacing: 1.4 }}>© 2026 · DRINK RESPONSIBLY</div>
          </div>
        </footer>
      </div>

      {/* ── MOBILE ── */}
      <div className="cordial-mob">
        <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto" }}>
          {/* Header */}
          <LandingMobileHeader />

          {/* Hero */}
          <div style={{ padding: "40px 24px 32px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.8, color: T.accent, marginBottom: 18, textTransform: "uppercase" }}>AI BARTENDER · BETA</div>
            <h1 style={{ fontSize: 38, fontWeight: 600, letterSpacing: -0.9, lineHeight: 1.15, margin: 0, color: T.darkText }}>
              오늘의 당신을<br />
              <span style={{ color: T.accent }}>한 잔</span>으로<br />
              읽어드릴게요.
            </h1>
            <p style={{ fontSize: 14, color: T.darkTextMuted, marginTop: 18, lineHeight: 1.65, letterSpacing: -0.2 }}>
              네 가지 짧은 질문에 답하세요. AI 바텐더가 오늘 밤 어울릴 칵테일을 골라드려요.
            </p>
            <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
              <Link href="/emotion" style={{
                flex: 1, padding: "14px 0", borderRadius: 12, textAlign: "center",
                background: T.darkText, color: T.darkBg,
                fontSize: 14, fontWeight: 600, letterSpacing: -0.2, textDecoration: "none",
              }}>오늘의 한 잔 찾기</Link>
              <Link href="/home" style={{
                padding: "14px 18px", borderRadius: 12,
                background: "transparent", color: T.darkText,
                border: `0.5px solid ${T.darkBorderStrong}`,
                fontSize: 14, fontWeight: 500, textDecoration: "none",
              }}>홈으로</Link>
            </div>
          </div>

          {/* Features */}
          <div style={{ padding: "0 24px 48px", display: "flex", flexDirection: "column", gap: 10 }}>
            {FEATURES.map(f => (
              <Link key={f.num} href={f.href} style={{ textDecoration: "none" }}>
                <div style={{
                  background: T.darkSurface, border: `0.5px solid ${T.darkBorder}`,
                  borderRadius: 14, padding: "18px 20px",
                  display: "flex", alignItems: "center", gap: 18,
                }}>
                  <GlassSilhouette type={f.glass} size={48} stroke={T.accent} liquid={T.accent} fillLevel={f.fill} strokeWidth={1.2} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 1.4, marginBottom: 4 }}>{f.num}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.3, color: T.darkText, marginBottom: 4 }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: T.darkTextMuted, lineHeight: 1.5 }}>{f.desc}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M8 4 L14 10 L8 16" stroke={T.darkTextFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: "20px 24px 48px", textAlign: "center", borderTop: `0.5px solid ${T.darkBorder}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.darkTextFaint, letterSpacing: 1.4 }}>© 2026 · DRINK RESPONSIBLY</div>
          </div>
        </div>
      </div>
    </>
  );
}
