import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * 진짜 서버 간 호출 전용 (예: FastAPI → Next). 서버 전용 env INTERNAL_API_SECRET 사용.
 * NEXT_PUBLIC_* 값은 클라이언트 번들에 노출되므로 비밀로 쓰면 안 된다.
 * 시크릿이 없으면 fail-closed.
 */
export function checkInternalSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_API_SECRET;
  const given = req.headers.get("x-internal-secret") ?? "";
  if (
    !secret ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * 브라우저에서 호출되는 route 용 same-origin 체크.
 * Origin(없으면 Referer)이 있으면 요청 호스트와 일치해야 한다. Sec-Fetch-Site: cross-site 도 거부.
 * (헤더가 없는 비브라우저 클라이언트는 막을 수 없으므로 rate limit 이 별도로 필요하다.)
 */
export function checkSameOrigin(req: NextRequest): NextResponse | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return null;

  const allowed = new Set<string>();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) allowed.add(host);
  if (process.env.NEXTAUTH_URL) {
    try {
      allowed.add(new URL(process.env.NEXTAUTH_URL).host);
    } catch {
      // 잘못된 NEXTAUTH_URL 은 무시
    }
  }

  try {
    if (!allowed.has(new URL(source).host)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
