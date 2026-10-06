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
  "login-email-global": { requests: 100, window: "15 m" },
  "public-read": { requests: 600, window: "10 m" },
  // 전역(서비스 전체) 일일 예산 — 유료 API(Google Places/Gemini) 비용 증폭 방지
  "bars-pipeline-global": { requests: envInt("BARS_PIPELINE_DAILY_BUDGET", 200), window: "1 d" },
  "ai-anon-global": { requests: envInt("AI_ANON_DAILY_BUDGET", 2000), window: "1 d" },
  "ai-auth-global": { requests: envInt("AI_AUTH_DAILY_BUDGET", 5000), window: "1 d" },
  "ai-per-ip": { requests: envInt("AI_PER_IP_DAILY", 300), window: "1 d" },
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

/**
 * IP 를 한도 키로 정규화한다. IPv4 는 그대로, IPv4-mapped IPv6(::ffff:a.b.c.d)는 IPv4 로,
 * 그 외 IPv6 는 '::' 를 올바르게 확장한 뒤 앞 4개 hextet(/64)만 사용한다 (주소 회전 우회 방지).
 * 해석할 수 없는 값은 소문자 원본을 그대로 반환한다.
 */
export function normalizeIpForRateLimit(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (!ip.includes(":")) return ip; // IPv4 / unknown

  const parseV4 = (s: string): number[] | null => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    if (!m) return null;
    const o = m.slice(1).map(Number);
    return o.every((n) => n <= 255) ? o : null;
  };
  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const items = part.split(":");
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (i === items.length - 1 && it.includes(".")) {
        const v4 = parseV4(it);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(it)) {
        out.push(parseInt(it, 16));
      } else {
        return null;
      }
    }
    return out;
  };

  const halves = ip.split("::");
  if (halves.length > 2) return ip;
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return ip;
  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return ip;
    groups = [...head, ...Array<number>(missing).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return ip;

  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  }
  return groups.slice(0, 4).map((g) => g.toString(16)).join(":") + "::/64";
}

/** 한도 식별자로 쓰는 클라이언트 IP 키 (IPv6 는 /64 로 정규화) */
export function getClientIpKey(req: { headers: { get(name: string): string | null } }): string {
  return normalizeIpForRateLimit(getClientIp(req));
}

/** 단순 키 기반 한도 체크 (로그인 등 비유료 경로). true = 허용. */
export async function allowByKey(endpoint: Endpoint, identifier: string): Promise<boolean> {
  try {
    const { success } = await getLimiter(endpoint).limit(identifier);
    return success;
  } catch (e) {
    console.error(`[rateLimit:${endpoint}]`, e);
    // 로그인/공개 읽기 같은 비유료 경로는 Redis 장애 시 서비스 전체가 막히지 않도록 모든 환경에서 fail-open.
    // (유료 API 경로는 checkRateLimit 이 프로덕션 미설정 시 503, 전역 예산은 consumeGlobalBudget 이 프로덕션 장애 시 fail-closed)
    return true;
  }
}

/** 일일 예산 1회 소비 (기본 key "global"). true = 허용. 프로덕션에서는 Redis 미설정/런타임 오류 모두 fail-closed (비용 보호). */
export async function consumeGlobalBudget(
  endpoint: "bars-pipeline-global" | "ai-anon-global" | "ai-auth-global" | "ai-per-ip",
  key = "global"
): Promise<boolean> {
  try {
    const { success } = await getLimiter(endpoint).limit(key);
    return success;
  } catch (e) {
    console.error(`[rateLimit:${endpoint}]`, e);
    return process.env.NODE_ENV !== "production";
  }
}

/**
 * 실제 Gemini 호출 직전에만 호출한다. 모든 호출자에게 IP 별 일일 한도(ai-per-ip)를,
 * 비로그인은 ai-anon-global / 로그인은 ai-auth-global 전역 일일 예산을 1회 소비한다.
 * 소진되었거나(프로덕션 장애 포함) 허용되지 않으면 429 응답, 아니면 null.
 */
export async function consumeAiBudget(req: NextRequest, isAnonymous: boolean): Promise<NextResponse | null> {
  if (!(await consumeGlobalBudget("ai-per-ip", `ip:${getClientIpKey(req)}`))) {
    return NextResponse.json(
      { error: "이 네트워크의 오늘 AI 이용 한도에 도달했습니다. 내일 다시 시도해 주세요." },
      { status: 429 }
    );
  }
  if (await consumeGlobalBudget(isAnonymous ? "ai-anon-global" : "ai-auth-global")) return null;
  return NextResponse.json(
    {
      error: isAnonymous
        ? "오늘 비로그인 AI 이용 한도에 도달했습니다. 로그인하시거나 내일 다시 시도해 주세요."
        : "오늘 AI 이용 한도에 도달했습니다. 내일 다시 시도해 주세요.",
    },
    { status: 429 }
  );
}

const EMPTY_BAR_CELL_TTL_SECONDS = 24 * 60 * 60;

/** 파이프라인이 바를 하나도 찾지 못한 격자 셀인지 (24h 네거티브 캐시). Redis 오류 시 false. */
export async function isEmptyBarCell(cell: string): Promise<boolean> {
  try {
    return (await getRedis().get(`bars:empty:${cell}`)) !== null;
  } catch (e) {
    console.error("[rateLimit:bars-empty-cell]", e);
    return false;
  }
}

/** 바가 없는 격자 셀을 24h 동안 기억 */
export async function markEmptyBarCell(cell: string): Promise<void> {
  try {
    await getRedis().set(`bars:empty:${cell}`, "1", { ex: EMPTY_BAR_CELL_TTL_SECONDS });
  } catch (e) {
    console.error("[rateLimit:bars-empty-cell]", e);
  }
}

/** 공개 읽기 API 용 느슨한 IP 한도 (비로그인 전용). 한도 초과 시 429 응답, 아니면 null. 장애 시 fail-open. */
export async function checkPublicRead(req: NextRequest, isAnonymous: boolean): Promise<NextResponse | null> {
  if (!isAnonymous) return null;
  if (await allowByKey("public-read", `ip:${getClientIpKey(req)}`)) return null;
  return NextResponse.json({ error: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
}

/** 사용자와 무관한 공개 응답에만 사용 (비로그인일 때 CDN 캐시 허용) */
export const PUBLIC_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

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
  const identifier = email ?? (userId ? `uid:${userId}` : getClientIpKey(req));

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
