import { NextRequest, NextResponse } from "next/server";
import { rotateRefreshToken } from "@/server/auth/tokens";
import { checkSameOrigin } from "@/shared/lib/internalAuth";

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const oldToken = req.cookies.get("cordial_refresh")?.value;
  if (!oldToken) return NextResponse.json({ error: "No refresh token" }, { status: 401 });

  try {
    const result = await rotateRefreshToken(oldToken);
    if (!result) return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });

    const res = NextResponse.json({ accessToken: result.accessToken });
    res.cookies.set("cordial_refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth", // refresh/logout 엔드포인트에만 전송
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (error) {
    console.error("[auth/refresh POST]", error);
    return NextResponse.json({ error: "토큰 갱신 실패" }, { status: 500 });
  }
}
