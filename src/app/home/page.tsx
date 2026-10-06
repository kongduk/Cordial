"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { GlassSilhouette, GlassGlyph } from "@/shared/ui/GlassSilhouette";
import type { GlassType } from "@/shared/ui/GlassSilhouette";
import { CordialLogo } from "@/shared/ui/CordialLogo";
import { WebNav } from "@/shared/ui/WebNav";
import { MobileTabBar } from "@/shared/ui/MobileTabBar";
import api from "@/shared/lib/api";
import { W, T } from "@/shared/lib/theme";

interface RecentRec { id: string; cocktailName: string; glassType: string | null; createdAt: string; }

function mapGlass(g: string | null): GlassType {
  if (!g) return "coupe";
  const s = g.toLowerCase();
  if (s.includes("martini") || s.includes("gimlet")) return "martini";
  if (s.includes("rock") || s.includes("old") || s.includes("lowball")) return "rocks";
  if (s.includes("highball") || s.includes("collins")) return "highball";
  return "coupe";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const SECONDARY_ITEMS = [
  { num: "02", name: "내 술로 만들기", glass: "rocks" as const, desc: "가진 재료로 만들 수 있는 칵테일", href: "/pantry" },
  { num: "03", name: "모의 제조", glass: "highball" as const, desc: "재료를 조합해 맛·도수·향 분석", href: "/mix" },
  { num: "04", name: "바 찾기", glass: "coupe" as const, desc: "분위기와 칵테일로 주변 바 매칭", href: "/bars" },
] as const;

export default function UserHomePage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    // 프로필 조회 실패 시 1회 재시도, 그래도 실패하면 리다이렉트 없이 계속 진행
    const check = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await api.get<{ onboardedAt: string | null }>("/user/profile");
          if (!cancelled && res.data.onboardedAt === null) router.replace("/onboarding");
          return;
        } catch (e) {
          if (attempt === 1) console.warn("[home] 프로필 확인 실패:", (e as Error).message);
          else await new Promise((r) => setTimeout(r, 800));
        }
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [status, router]);

  const { data: recentRecs = [] } = useQuery<RecentRec[]>({
    queryKey: ["recent-recs"],
    queryFn: () => api.get<RecentRec[]>("/user/recommendations").then(r => r.data),
    enabled: status === "authenticated",
  });

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans }}>
        <WebNav active="/home" />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 40px" }}>
          {/* Hero */}
          <div style={{ marginBottom: 56 }}>
            <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.8, color: W.accent, marginBottom: 18, textTransform: "uppercase" }}>
              Tonight · 오늘
            </div>
            <h1 style={{ fontSize: 52, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.1, margin: "0 0 18px" }}>
              오늘의 당신을<br />한 잔으로 읽어드릴게요.
            </h1>
            <p style={{ fontSize: 16, color: W.textMuted, lineHeight: 1.65, letterSpacing: -0.2, margin: 0 }}>
              기분, 가진 재료, 가고 싶은 분위기까지. 바텐더가 오늘의 한 잔을 골라드려요.
            </p>
          </div>

          {/* Main CTA */}
          <Link href="/emotion" style={{ textDecoration: "none", display: "block", marginBottom: 14 }}>
            <div style={{
              background: W.text, color: W.bg,
              borderRadius: 18, padding: "36px 40px",
              display: "flex", alignItems: "center", gap: 40,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: W.mono, fontSize: 9, letterSpacing: 1.6, color: W.accent, marginBottom: 12, textTransform: "uppercase" }}>
                  01 · MOOD RECOMMENDATION
                </div>
                <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.2, marginBottom: 12 }}>
                  감정으로 추천받기
                </div>
                <div style={{ fontSize: 14, color: "rgba(252,251,249,0.62)", lineHeight: 1.6, letterSpacing: -0.1 }}>
                  간단한 질문 4개로 오늘의 한 잔을 찾아요
                </div>
              </div>
              <GlassSilhouette type="martini" size={120} stroke={W.accent} liquid={W.accent} fillLevel={0.62} garnish strokeWidth={1.2} />
            </div>
          </Link>

          {/* Secondary 3-col */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 48 }}>
            {SECONDARY_ITEMS.map(item => (
              <Link key={item.num} href={item.href} style={{ textDecoration: "none" }}>
                <div style={{
                  background: W.surface, border: `0.5px solid ${W.border}`,
                  borderRadius: 14, padding: "24px 24px",
                  display: "flex", flexDirection: "column", gap: 0,
                }}>
                  <GlassGlyph type={item.glass} size={28} color={W.accent} strokeWidth={1.3} />
                  <div style={{ fontFamily: W.mono, fontSize: 9, letterSpacing: 1.4, color: W.textFaint, marginTop: 18, marginBottom: 6, textTransform: "uppercase" }}>{item.num}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3, marginBottom: 6 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: W.textMuted, lineHeight: 1.55 }}>{item.desc}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent */}
          {recentRecs.length > 0 && (
            <>
              <div style={{ fontFamily: W.mono, fontSize: 10, letterSpacing: 1.6, color: W.textFaint, textTransform: "uppercase", marginBottom: 18 }}>RECENT</div>
              <div style={{ display: "flex", gap: 12 }}>
                {recentRecs.slice(0, 3).map(r => (
                  <div key={r.id} style={{
                    background: W.surface, border: `0.5px solid ${W.border}`,
                    borderRadius: 12, padding: "16px 22px",
                    display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <GlassGlyph type={mapGlass(r.glassType)} size={22} color={W.accent} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: -0.2 }}>{r.cocktailName}</div>
                      <div style={{ fontSize: 11, color: W.textFaint, marginTop: 2 }}>{fmtDate(r.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MOBILE ── */}
      <div className="cordial-mob">
        <div style={{
          width: "100%", minHeight: "100dvh",
          background: T.darkBg, color: T.darkText, fontFamily: T.sans,
          maxWidth: 430, margin: "0 auto", position: "relative", paddingBottom: "max(90px, calc(env(safe-area-inset-bottom) + 80px))",
        }}>
          <div style={{ paddingTop: 62, paddingBottom: 16, paddingLeft: 20, paddingRight: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <CordialLogo size={14} color={T.accent} tracking={2} />
            <Link href="/mypage" style={{ textDecoration: "none", display: "flex" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill={T.darkTextMuted}>
                <circle cx="4" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="16" cy="10" r="1.4" />
              </svg>
            </Link>
          </div>

          <div style={{ padding: "28px 24px 36px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 1.6, color: T.accent, marginBottom: 16, textTransform: "uppercase" }}>Tonight · 오늘</div>
            <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.25, margin: 0, color: T.darkText }}>
              오늘의 당신을<br />한 잔으로 읽어드릴게요.
            </h1>
            <p style={{ fontSize: 14, color: T.darkTextMuted, marginTop: 14, lineHeight: 1.6, letterSpacing: -0.2 }}>
              기분, 가진 재료, 가고 싶은 분위기까지.<br />바텐더가 한 잔을 골라드려요.
            </p>
          </div>

          <div style={{ padding: "0 20px 14px" }}>
            <Link href="/emotion" style={{ textDecoration: "none" }}>
              <div style={{
                background: T.darkSurface, border: `0.5px solid ${T.darkBorder}`,
                borderRadius: 18, padding: "22px 20px",
                display: "flex", alignItems: "center", gap: 16, overflow: "hidden",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.accent, marginBottom: 6 }}>01 · MOOD</div>
                  <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, letterSpacing: -0.3, color: T.darkText }}>감정으로 추천받기</div>
                  <div style={{ fontSize: 12, color: T.darkTextMuted, lineHeight: 1.5 }}>간단한 질문 4개로<br />오늘의 한 잔을 찾아요</div>
                </div>
                <GlassSilhouette type="martini" size={84} stroke={T.accent} liquid={T.accent} fillLevel={0.62} garnish strokeWidth={1.2} />
              </div>
            </Link>
          </div>

          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {SECONDARY_ITEMS.map(item => (
              <Link key={item.num} href={item.href} style={{ textDecoration: "none" }}>
                <div style={{
                  background: T.darkSurface, border: `0.5px solid ${T.darkBorder}`,
                  borderRadius: 14, padding: "16px 18px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <GlassGlyph type={item.glass} size={28} color={T.darkTextMuted} strokeWidth={1.3} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.4, color: T.darkTextFaint }}>{item.num}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: -0.2, color: T.darkText }}>{item.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.darkTextMuted, letterSpacing: -0.1 }}>{item.desc}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ transform: "rotate(180deg)" }}>
                    <path d="M12 4 L6 10 L12 16" stroke={T.darkTextFaint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>

          {recentRecs.length > 0 && (
            <div style={{ padding: "32px 20px 20px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.darkTextFaint, textTransform: "uppercase", marginBottom: 14 }}>RECENT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recentRecs.slice(0, 3).map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "4px 0" }}>
                    <GlassGlyph type={mapGlass(r.glassType)} size={22} color={T.darkTextMuted} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: -0.2, color: T.darkText }}>{r.cocktailName}</div>
                      <div style={{ fontSize: 11, color: T.darkTextFaint, marginTop: 2 }}>{fmtDate(r.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <MobileTabBar active="home" />
        </div>
      </div>
    </>
  );
}
