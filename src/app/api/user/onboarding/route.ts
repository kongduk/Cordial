import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";
import type { DrinkingCapacity } from "@/shared/types";

export async function POST(req: NextRequest) {
  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const { drinkingCapacity } = await req.json() as { drinkingCapacity: DrinkingCapacity };
    if (!["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"].includes(drinkingCapacity)) {
      return NextResponse.json({ error: "유효하지 않은 주량 값입니다." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { drinkingCapacity, onboardedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[user/onboarding POST]", error);
    return NextResponse.json({ error: "온보딩 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
