import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const EXEMPT_EMAILS = (process.env.RATE_LIMIT_EXEMPT_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 환경변수가 설정되지 않았습니다.");
    redis = new Redis({ url, token });
  }
  return redis;
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const LIMITS = {
  "analyze-emotion": { requests: 40, window: "1 d" },
  recommend: { requests: 40, window: "1 d" },
  "pantry-recommend": { requests: 20, window: "1 d" },
  "mix-analyze": { requests: 20, window: "1 d" },
  "recipe-steps": { requests: 60, window: "1 d" },
  "bars-recommend": { requests: 30, window: "1 d" },
  "bars-nearby": { requests: 60, window: "1 d" },
  "bars-geocode": { requests: 100, window: "1 d" },
  "cocktail-save": { requests: 20, window: "1 h" },
  "mix-ingredients": { requests: 60, window: "1 h" },
  register: { requests: 10, window: "1 h" },
  login: { requests: 10, window: "15 m" },
  "login-ip": { requests: 30, window: "15 m" },
  "public-read": { requests: 600, window: "10 m" },
  // 전역(서비스 전체) 일일 예산 — 유료 API(Google Places/Gemini) 비용 증폭 방지
  "bars-pipeline-global": { requests: envInt("BARS_PIPELINE_DAILY_BUDGET", 200), window: "1 d" },
  "ai-anon-global": { requests: envInt("AI_ANON_DAILY_BUDGET", 2000), window: "1 d" },
} as const;

/** 비로그인 요청에만 전역 일일 예산을 추가 적용하는 Gemini 엔드포인트 */
const AI_ANON_ENDPOINTS: ReadonlySet<string> = new Set([
  "analyze-emotion",
  "recommend",
  "pantry-recommend",
  "mix-analyze",
  "recipe-steps",
]);

type Endpoint = keyof typeof LIMITS;

const limiterCache = new Map<Endpoint, Ratelimit>();

function getLimiter(endpoint: Endpoint): Ratelimit {
  if (!limiterCache.has(endpoint)) {
    const { requests, window } = LIMITS[endpoint];
    limiterCache.set(
      endpoint,
      new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(requests, window),
        prefix: `rl:${endpoint}`,
      })
    );
  }
  return limiterCache.get(endpoint)!;
}

export function isRateLimitExemptEmail(email: string | null | undefined): boolean {
  return !!email && EXEMPT_EMAILS.includes(email.trim().toLowerCase());
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || undefined;
  // TRUSTED_PROXY_HOPS: 앱 앞단의 신뢰 프록시 수 (기본 1). x-forwarded-for 의 뒤에서 hops 번째 항목을 사용한다.
  const hops = envInt("TRUSTED_PROXY_HOPS", 1);
  const fromRight = (v: string | null) => {
    const parts = v?.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts?.length) return undefined;
    return parts[Math.max(0, parts.length - hops)];
  };
  // Vercel 은 x-vercel-forwarded-for / x-real-ip / x-forwarded-for 를 실제 클라이언트 IP 로 덮어쓰므로
  // process.env.VERCEL 이 설정된 환경에서만 이 헤더들을 신뢰한다.
  if (process.env.VERCEL) {
    return (
      first(req.headers.get("x-vercel-forwarded-for")) ??
      first(req.headers.get("x-real-ip")) ??
      first(req.headers.get("x-forwarded-for")) ??
      "unknown"
    );
  }
  // 자체 호스팅/로컬: 클라이언트가 보낸 헤더는 위조 가능하다. x-forwarded-for 의 첫 항목은 클라이언트가
  // 임의로 넣을 수 있으므로, 신뢰 프록시 수(TRUSTED_PROXY_HOPS)만큼 뒤에서 센 항목(또는 x-real-ip)을 사용한다.
  return fromRight(req.headers.get("x-forwarded-for")) ?? req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

/** 단순 키 기반 한도 체크 (로그인 등 비유료 경로). true = 허용. */
export async function allowByKey(endpoint: Endpoint, identifier: string): Promise<boolean> {
  try {
    const { success } = await getLimiter(endpoint).limit(identifier);
    return success;
  } catch (e) {
    console.error(`[rateLimit:${endpoint}]`, e);
    // Redis 미설정/장애 시 전체 로그인이 막히지 않도록 fail-open (유료 API 경로는 checkRateLimit 에서 fail-closed)
    return true;
  }
}

/** 전역 일일 예산 1회 소비. true = 허용. 미설정(프로덕션)만 fail-closed, 일시 장애는 checkRateLimit 과 동일하게 허용. */
export async function consumeGlobalBudget(endpoint: "bars-pipeline-global" | "ai-anon-global"): Promise<boolean> {
  try {
    const { success } = await getLimiter(endpoint).limit("global");
    return success;
  } catch (e) {
    console.error(`[rateLimit:${endpoint}]`, e);
    return !(isMisconfigured() && process.env.NODE_ENV === "production");
  }
}

/** 공개 읽기 API 용 느슨한 IP 한도 (비로그인 전용). 한도 초과 시 429 응답, 아니면 null. 장애 시 fail-open. */
export async function checkPublicRead(req: NextRequest, isAnonymous: boolean): Promise<NextResponse | null> {
  if (!isAnonymous) return null;
  if (await allowByKey("public-read", `ip:${getClientIp(req)}`)) return null;
  return NextResponse.json({ error: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
}

/** 사용자와 무관한 공개 응답에만 사용 (비로그인일 때 CDN 캐시 허용) */
export const PUBLIC_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

function isMisconfigured(): boolean {
  return !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN;
}

export async function checkRateLimit(
  req: NextRequest,
  endpoint: Endpoint,
  email?: string | null,
  userId?: string | null
): Promise<NextResponse | null> {
  if (isRateLimitExemptEmail(email)) return null;

  // 로그인 유저는 id/이메일 기준, 비로그인은 IP 기준
  const identifier = email ?? (userId ? `uid:${userId}` : getClientIp(req));

  let result: { success: boolean; limit: number; remaining: number; reset: number };
  try {
    result = await getLimiter(endpoint).limit(identifier);
  } catch (e) {
    console.error(`[rateLimit:${endpoint}]`, e);
    if (isMisconfigured() && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "서비스를 일시적으로 사용할 수 없습니다." }, { status: 503 });
    }
    return null;
  }

  const { success, limit, remaining, reset } = result;
  if (success && !email && !userId && AI_ANON_ENDPOINTS.has(endpoint)) {
    if (!(await consumeGlobalBudget("ai-anon-global"))) {
      return NextResponse.json(
        { error: "오늘 비로그인 AI 이용 한도에 도달했습니다. 로그인하시거나 내일 다시 시도해 주세요." },
        { status: 429 }
      );
    }
  }
  if (!success) {
    return NextResponse.json(
      { error: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
  }

  return null;
}
