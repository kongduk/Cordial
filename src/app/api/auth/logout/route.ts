import { NextRequest, NextResponse } from "next/server";
import { deleteRefreshToken } from "@/server/auth/tokens";
import { checkSameOrigin } from "@/shared/lib/internalAuth";

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const token = req.cookies.get("cordial_refresh")?.value;
  if (token) {
    try {
      await deleteRefreshToken(token);
    } catch (e) {
      console.error("[auth/logout] 토큰 삭제 실패:", e);
    }
  }

  const res = NextResponse.json({ ok: true });
  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 0,
  };
  // 현재 path 와 과거(path "/") 로 발급된 쿠키 모두 제거
  res.cookies.set("cordial_refresh", "", { ...base, path: "/api/auth" });
  // (ResponseCookies 는 이름 키 맵이라 같은 이름을 두 번 set 하면 덮어쓰므로 헤더로 직접 추가)
  res.headers.append(
    "Set-Cookie",
    `cordial_refresh=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${base.secure ? "; Secure" : ""}`
  );
  return res;
}
