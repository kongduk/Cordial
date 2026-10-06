import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json([]);

  try {
    const recs = await prisma.recommendation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        cocktail: { select: { name: true, glassType: true } },
      },
    });

    return NextResponse.json(
      recs.map(r => ({
        id: r.id,
        cocktailName: r.cocktail.name,
        glassType: r.cocktail.glassType ?? null,
        createdAt: r.createdAt,
      }))
    );
  } catch (error) {
    console.error("[user/recommendations GET]", error);
    return NextResponse.json({ error: "추천 기록 조회 실패" }, { status: 500 });
  }
}
