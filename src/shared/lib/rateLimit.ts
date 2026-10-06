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

const LIMITS = {
  "analyze-emotion": { requests: 40, window: "1 d" },
  recommend: { requests: 40, window: "1 d" },
  "pantry-recommend": { requests: 20, window: "1 d" },
  "mix-analyze": { requests: 20, window: "1 d" },
  "recipe-steps": { requests: 60, window: "1 d" },
  "bars-recommend": { requests: 30, window: "1 d" },
  "bars-nearby": { requests: 60, window: "1 d" },
  "bars-geocode": { requests: 100, window: "1 d" },
  register: { requests: 10, window: "1 h" },
  login: { requests: 10, window: "15 m" },
} as const;

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
  return (
    req.headers.get("x-real-ip")?.trim() ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
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
