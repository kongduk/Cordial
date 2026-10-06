import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";
import { checkPublicRead, PUBLIC_CACHE_CONTROL } from "@/shared/lib/rateLimit";

export async function GET(req: NextRequest) {
  try {
    const userId = (await getUserId(req)) ?? undefined;
    const limited = await checkPublicRead(req, !userId);
    if (limited) return limited;

    const cocktails = await prisma.cocktail.findMany({
      where: userId
        ? { OR: [{ isCustom: false }, { createdBy: userId }] }
        : { isCustom: false },
      orderBy: [{ isCustom: "asc" }, { popularity: "desc" }],
      take: 500,
      select: {
        id: true,
        name: true,
        nameEn: true,
        category: true,
        glassType: true,
        abv: true,
        imageUrl: true,
        sweetness: true,
        sourness: true,
        bitterness: true,
        strength: true,
        freshness: true,
        popularity: true,
        isCustom: true,
        description: true,
      },
    });

    return NextResponse.json(cocktails, {
      headers: userId
        ? { "Cache-Control": "private, no-store" }
        : { "Cache-Control": PUBLIC_CACHE_CONTROL, Vary: "Cookie, Authorization" },
    });
  } catch (error) {
    console.error("[cocktails list]", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
