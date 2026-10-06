import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json([]);

  try {
    const ingredients = await prisma.userIngredient.findMany({
      where: { userId },
      orderBy: { usedAt: "desc" },
      select: { name: true, abv: true },
    });
    return NextResponse.json(ingredients);
  } catch (error) {
    console.error("[mix-ingredients GET]", error);
    return NextResponse.json({ error: "재료 목록 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const body = await req.json() as { name: string; abv: number };
    const { name, abv } = body;
    if (!name || typeof name !== "string" || name.length > 100) return NextResponse.json({ error: "name required" }, { status: 400 });
    const safeAbv = typeof abv === "number" && isFinite(abv) ? Math.min(100, Math.max(0, abv)) : 0;

    await prisma.userIngredient.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name, abv: safeAbv },
      update: { abv: safeAbv },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mix-ingredients POST]", error);
    return NextResponse.json({ error: "재료 저장 실패" }, { status: 500 });
  }
}
