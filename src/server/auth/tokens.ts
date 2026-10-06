import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "@/shared/lib/prisma";

const ISSUER = "cordial";
const AUDIENCE = "cordial-api";
const ACCESS_ALG = "HS256" as const;
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// 모듈 로드 시점이 아니라 사용 시점에 검증 (빌드 단계 크래시 방지, 미설정 시 fail-closed)
function getAccessSecret(): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ACCESS_TOKEN_SECRET 환경변수가 설정되지 않았거나 32자 미만입니다.");
  }
  return secret;
}

export function generateAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: "access" }, getAccessSecret(), {
    algorithm: ACCESS_ALG,
    expiresIn: "15m",
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, getAccessSecret(), {
      algorithms: [ACCESS_ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload === "string") return null;
    if (payload.typ !== "access" || typeof payload.sub !== "string" || !payload.sub) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

// DB에는 SHA-256 해시(hex)만 저장하고, 원본 토큰은 쿠키로만 전달한다.
// (`RefreshToken.token` 컬럼에 해시가 들어간다. 컬럼명은 마이그레이션 없이 유지)
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const MAX_TOKENS_PER_USER = 10;

async function pruneUserTokens(userId: string): Promise<void> {
  // 만료 토큰 정리 + 사용자당 최신 MAX_TOKENS_PER_USER개만 유지
  await prisma.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  const stale = await prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: MAX_TOKENS_PER_USER,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
  }
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.refreshToken.create({ data: { token: hashToken(token), userId, expiresAt } });
  await pruneUserTokens(userId);
  return token;
}

export async function rotateRefreshToken(oldToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const oldHash = hashToken(oldToken);
  const record = await prisma.refreshToken.findUnique({ where: { token: oldHash } });
  if (!record) return null;
  if (record.expiresAt < new Date()) {
    await prisma.refreshToken.deleteMany({ where: { token: oldHash } });
    return null;
  }

  // 사용자가 삭제된 경우 토큰 재발급 금지
  const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { id: true } });
  if (!user) {
    await prisma.refreshToken.deleteMany({ where: { token: oldHash } });
    return null;
  }

  // 동시 요청으로 같은 refresh token이 두 번 쓰이지 않도록 삭제 성공(count=1)한 요청만 통과
  const newToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const rotated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.deleteMany({ where: { token: oldHash } });
    if (count !== 1) return false;
    await tx.refreshToken.create({ data: { token: hashToken(newToken), userId: record.userId, expiresAt } });
    return true;
  });
  if (!rotated) return null;
  await pruneUserTokens(record.userId);

  return { accessToken: generateAccessToken(record.userId), refreshToken: newToken };
}

export async function deleteRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token: hashToken(token) } });
}
