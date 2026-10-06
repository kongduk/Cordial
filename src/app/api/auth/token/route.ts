import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { generateAccessToken, generateRefreshToken } from "@/server/auth/tokens";
import { prisma } from "@/shared/lib/prisma";
import { checkSameOrigin } from "@/shared/lib/internalAuth";

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  try {
    // 반드시 NextAuth 세션(쿠키)에서만 발급 — Bearer 로 새 토큰을 찍어내지 않는다
    const secret = process.env.NEXTAUTH_SECRET;
    const token = secret ? await getToken({ req, secret }) : null;
    const userId = token?.id ?? token?.sub;
    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessToken = generateAccessToken(userId);
    const refreshToken = await generateRefreshToken(userId);

    const res = NextResponse.json({ accessToken });
    res.cookies.set("cordial_refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (error) {
    console.error("[auth/token POST]", error);
    return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
  }
}
