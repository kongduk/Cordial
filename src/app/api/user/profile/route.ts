import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";
import type { DrinkingCapacity } from "@/shared/types";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        drinkingCapacity: true,
        sweetPref: true,
        sourPref: true,
        bitterPref: true,
        strongPref: true,
        freshPref: true,
        onboardedAt: true,
      },
    });

    if (!user) return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(user);
  } catch (error) {
    console.error("[user profile GET]", error);
    return NextResponse.json({ error: "프로필 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await req.json() as {
      drinkingCapacity?: DrinkingCapacity;
      sweetPref?: number;
      sourPref?: number;
      bitterPref?: number;
      strongPref?: number;
      freshPref?: number;
      name?: string;
    };

    const validCapacities: DrinkingCapacity[] = ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
    if (body.drinkingCapacity !== undefined && !validCapacities.includes(body.drinkingCapacity)) {
      return NextResponse.json({ error: "유효하지 않은 주량 값입니다." }, { status: 400 });
    }
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 50)) {
      return NextResponse.json({ error: "이름은 50자 이하이어야 합니다." }, { status: 400 });
    }

    const clamp01 = (v: number | undefined) =>
      v !== undefined && typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        drinkingCapacity: body.drinkingCapacity,
        sweetPref: clamp01(body.sweetPref),
        sourPref: clamp01(body.sourPref),
        bitterPref: clamp01(body.bitterPref),
        strongPref: clamp01(body.strongPref),
        freshPref: clamp01(body.freshPref),
        name: body.name,
      },
      select: {
        id: true,
        name: true,
        drinkingCapacity: true,
        sweetPref: true,
        sourPref: true,
        bitterPref: true,
        strongPref: true,
        freshPref: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[user profile PATCH]", error);
    return NextResponse.json({ error: "프로필 업데이트 중 오류가 발생했습니다." }, { status: 500 });
  }
}
