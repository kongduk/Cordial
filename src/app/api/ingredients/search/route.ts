import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";
import { SYNONYMS } from "@/shared/lib/ingredientSynonyms";

// 커스텀 칵테일에서만 쓰이는 재료(사용자 입력으로 생성됨)는 공개 검색에서 제외
const NOT_CUSTOM_ONLY = {
  NOT: {
    AND: [
      { cocktails: { some: {} } },
      { cocktails: { none: { cocktail: { isCustom: false } } } },
    ],
  },
};

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q")?.trim() ?? "").slice(0, 50);

  const userId = (await getUserId(req)) ?? undefined;

  try {
    let globalResults: { id: string; name: string; nameEn: string | null; abv: number; category: string | null }[];

    if (q.length < 1) {
      globalResults = await prisma.ingredient.findMany({
        where: NOT_CUSTOM_ONLY,
        select: { id: true, name: true, nameEn: true, abv: true, category: true },
        orderBy: { name: "asc" },
        take: 30,
      });
    } else {
      const terms = new Set<string>([q]);
      for (const [key, vals] of Object.entries(SYNONYMS)) {
        if (q.includes(key) || key.includes(q)) vals.forEach(v => terms.add(v));
      }

      globalResults = await prisma.ingredient.findMany({
        where: {
          ...NOT_CUSTOM_ONLY,
          OR: [...terms].flatMap(term => [
            { name: { contains: term, mode: "insensitive" as const } },
            { nameEn: { contains: term, mode: "insensitive" as const } },
          ]),
        },
        select: { id: true, name: true, nameEn: true, abv: true, category: true },
        orderBy: { name: "asc" },
        take: 20,
      });
    }

    if (!userId) return NextResponse.json(globalResults);

    // Fetch user's stored ingredients (filtered by query if present)
    const userIngredients = await prisma.userIngredient.findMany({
      where: userId
        ? {
            userId,
            ...(q.length >= 1 ? { name: { contains: q, mode: "insensitive" as const } } : {}),
          }
        : { userId: "" },
      orderBy: { usedAt: "desc" },
      take: 10,
      select: { name: true, abv: true },
    });

    // Merge: user ingredients override global ABV, placed first
    const userNames = new Set(userIngredients.map(u => u.name.toLowerCase()));
    const filtered = globalResults.filter(g => !userNames.has(g.name.toLowerCase()));

    const merged = [
      ...userIngredients.map(u => ({ id: `user:${u.name}`, name: u.name, nameEn: null, abv: u.abv, category: "내 재료" })),
      ...filtered,
    ];

    return NextResponse.json(merged);
  } catch (error) {
    console.error("[ingredients search]", error);
    return NextResponse.json({ error: "재료 검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
