import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { verifyAccessToken } from "./tokens";

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * 검증된 신원만 반환한다 (요청 body/query의 userId는 절대 신뢰하지 않는다).
 * 1) Authorization: Bearer <access token> — jwt.verify(HS256, iss/aud/typ 검증)
 * 2) NextAuth 세션 쿠키 — getToken (서명/암호화 검증)
 * 둘 다 있으면 쿠키(세션) 신원을 우선한다.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? verifyAccessToken(auth.slice(7).trim()) : null;

  const secret = process.env.NEXTAUTH_SECRET;
  let cookieId: string | null = null;
  let cookieEmail: string | null = null;
  if (secret) {
    try {
      const token = await getToken({ req, secret });
      const id = token?.id ?? token?.sub;
      if (typeof id === "string" && id) {
        cookieId = id;
        const email = (token as { email?: unknown } | null)?.email;
        cookieEmail = typeof email === "string" ? email : null;
      }
    } catch {
      // 변조/손상된 쿠키는 비로그인으로 취급
    }
  }

  // 둘 다 있고 서로 다르면 세션(쿠키) 신원을 우선한다.
  if (cookieId) return { id: cookieId, email: cookieEmail };
  if (bearer) return { id: bearer.sub, email: null };
  return null;
}

export async function getUserId(req: NextRequest): Promise<string | null> {
  return (await getAuthUser(req))?.id ?? null;
}
