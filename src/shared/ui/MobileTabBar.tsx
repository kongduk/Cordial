"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { GlassGlyph } from "./GlassSilhouette";

// 탭은 프로필 포함 6개로 제한 — "제조"(/mix)는 홈 화면의 보조 메뉴에서 접근
const TABS = [
  { id: "home",      label: "홈",       glass: "martini"  as const, href: "/home" },
  { id: "emotion",   label: "추천",     glass: "coupe"    as const, href: "/emotion" },
  { id: "cocktails", label: "칵테일",   glass: "highball" as const, href: "/cocktails" },
  { id: "pantry",    label: "내 술장",  glass: "rocks"    as const, href: "/pantry" },
  { id: "bars",      label: "바",       glass: "martini"  as const, href: "/bars" },
] as const;

const sans = '"Pretendard Variable","Pretendard",-apple-system,BlinkMacSystemFont,sans-serif';

export function MobileTabBar({ active }: { active?: string }) {
  const { data: session } = useSession();

  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 14px))", paddingTop: 8,
      background: "linear-gradient(180deg,rgba(21,17,13,0) 0%,rgba(21,17,13,0.92) 30%,rgba(21,17,13,1) 60%)",
      display: "flex", justifyContent: "space-around", alignItems: "flex-end",
      borderTop: "0.5px solid rgba(255,246,232,0.08)",
      zIndex: 50,
    }}>
      {TABS.map(t => {
        const isActive = t.id === active;
        const c = isActive ? "#B88752" : "rgba(245,239,230,0.38)";
        return (
          <Link key={t.id} href={t.href} style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 8px", minHeight: 44, minWidth: 44, justifyContent: "center", boxSizing: "border-box" }}>
              <GlassGlyph type={t.glass} size={20} color={c} strokeWidth={1.4} />
              <span style={{ fontSize: 11, color: c, fontWeight: isActive ? 600 : 500, fontFamily: sans }}>{t.label}</span>
            </div>
          </Link>
        );
      })}

      {/* 프로필 탭 */}
      <Link href={session ? "/mypage" : "/login"} style={{ textDecoration: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 8px", minHeight: 44, minWidth: 44, justifyContent: "center", boxSizing: "border-box" }}>
          <ProfileIcon active={active === "mypage"} session={!!session} />
          <span style={{
            fontSize: 11, fontWeight: active === "mypage" ? 600 : 500, fontFamily: sans,
            color: active === "mypage" ? "#B88752" : "rgba(245,239,230,0.38)",
          }}>
            {session ? "프로필" : "로그인"}
          </span>
        </div>
      </Link>
    </div>
  );
}

function ProfileIcon({ active, session: loggedIn }: { active: boolean; session: boolean }) {
  const c = active ? "#B88752" : "rgba(245,239,230,0.38)";
  if (loggedIn) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="3.2" stroke={c} strokeWidth="1.4" />
        <path d="M3.5 17c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="14" rx="3" stroke={c} strokeWidth="1.4" />
      <path d="M7 10h6M10 7v6" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
