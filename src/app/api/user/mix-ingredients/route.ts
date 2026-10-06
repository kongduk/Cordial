import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getUserId } from "@/server/auth/getUser";
import { checkRateLimit } from "@/shared/lib/rateLimit";
import { prisma } from "@/shared/lib/prisma";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { readJsonBody } from "@/shared/lib/readJson";

const MAX_USER_INGREDIENTS = 200;

export async function GET(req: NextRequest) {
  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json([]);

  try {
    const ingredients = await prisma.userIngredient.findMany({
      where: { userId },
      orderBy: { usedAt: "desc" },
      take: MAX_USER_INGREDIENTS,
      select: { name: true, abv: true },
    });
    return NextResponse.json(ingredients);
  } catch (error) {
    console.error("[mix-ingredients GET]", error);
    return NextResponse.json({ error: "재료 목록 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const authUser = await getAuthUser(req);
  const userId = authUser?.id;
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });
  const rateLimitError = await checkRateLimit(req, "mix-ingredients", authUser.email, userId);
  if (rateLimitError) return rateLimitError;

  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as { name: string; abv: number };
    const { abv } = body;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return NextResponse.json({ error: "name required" }, { status: 400 });
    const safeAbv = typeof abv === "number" && isFinite(abv) ? Math.min(100, Math.max(0, abv)) : 0;

    // 유저별 advisory lock 으로 count-then-upsert 를 직렬화 (동시 요청으로 상한 우회 방지)
    const ok = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"mix-ingredients:" + userId}))`;
      const total = await tx.userIngredient.count({ where: { userId } });
      if (total >= MAX_USER_INGREDIENTS) {
        const exists = await tx.userIngredient.findUnique({ where: { userId_name: { userId, name } }, select: { userId: true } });
        if (!exists) return false;
      }
      await tx.userIngredient.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name, abv: safeAbv },
        update: { abv: safeAbv },
      });
      return true;
    });
    if (!ok) return NextResponse.json({ error: "저장 가능한 재료 수를 초과했습니다." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mix-ingredients POST]", error);
    return NextResponse.json({ error: "재료 저장 실패" }, { status: 500 });
  }
}
