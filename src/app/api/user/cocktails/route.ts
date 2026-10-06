import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const cocktails = await prisma.cocktail.findMany({
      where: { createdBy: userId, isCustom: true },
      orderBy: { id: "desc" },
      select: {
        id: true,
        name: true,
        abv: true,
        method: true,
        description: true,
        sweetness: true,
        sourness: true,
        bitterness: true,
        strength: true,
        freshness: true,
      },
    });
    return NextResponse.json(cocktails);
  } catch (error) {
    console.error("[user/cocktails GET]", error);
    return NextResponse.json({ error: "레시피 목록 조회 실패" }, { status: 500 });
  }
}
