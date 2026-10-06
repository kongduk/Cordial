import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/shared/lib/prisma";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { checkRateLimit, isRateLimitExemptEmail } from "@/shared/lib/rateLimit";
import { readJsonBody } from "@/shared/lib/readJson";

/** 선형 시간 이메일 형식 검사: 공백 없음, '@' 정확히 1개, 로컬/도메인 비어있지 않음, 도메인 중간에 '.' 존재 */
function isValidEmailFormat(email: string): boolean {
  if (/\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;
  const rateLimitError = await checkRateLimit(req, "register");
  if (rateLimitError) return rateLimitError;

  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as { email?: unknown; password?: unknown; name?: unknown };
    const { password, name } = body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : body.email;

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json({ error: "이메일과 비밀번호를 입력하세요." }, { status: 400 });
    }
    // 길이 확인을 먼저, 형식 검사는 정규식 없이 선형 시간으로 (ReDoS 방지)
    if (email.length > 254 || !isValidEmailFormat(email)) {
      return NextResponse.json({ error: "올바른 이메일 형식을 입력하세요." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
    }
    // bcrypt 는 72바이트 이후를 무시하고, 긴 입력은 CPU DoS 로 이어질 수 있음
    if (Buffer.byteLength(password) > 72) {
      return NextResponse.json({ error: "비밀번호는 72바이트 이하여야 합니다." }, { status: 400 });
    }
    if (name !== undefined && (typeof name !== "string" || name.length > 50)) {
      return NextResponse.json({ error: "이름은 50자 이하이어야 합니다." }, { status: 400 });
    }

    // 이메일 미검증 가입으로 rate-limit 면제 이메일을 선점/사칭하지 못하도록 차단
    const existing = isRateLimitExemptEmail(email)
      ? true
      : await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashed, name: typeof name === "string" ? name.trim() : null },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("[register]", error);
    return NextResponse.json({ error: "회원가입 중 오류가 발생했습니다." }, { status: 500 });
  }
}
