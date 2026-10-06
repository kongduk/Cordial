import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";

interface SaveBody {
  name: string;
  description: string;
  method: string;
  ingredients: Array<{ name: string; amount: number; abv: number }>;
  taste: {
    sweetness: number;
    sourness: number;
    bitterness: number;
    strength: number;
    freshness: number;
  };
  abv: number;
}

export async function POST(req: NextRequest) {
  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await req.json() as SaveBody;

    const validMethods = ["shaking", "stirring", "build", "blending", "neat", "floating"];
    if (typeof body !== "object" || body === null || typeof body.taste !== "object" || body.taste === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) {
      return NextResponse.json({ error: "이름은 1~80자이어야 합니다." }, { status: 400 });
    }
    if (!Array.isArray(body.ingredients) || body.ingredients.length === 0 || body.ingredients.length > 30) {
      return NextResponse.json({ error: "재료는 1~30개이어야 합니다." }, { status: 400 });
    }
    if (!validMethods.includes(body.method)) {
      return NextResponse.json({ error: "올바른 제조법을 선택해 주세요." }, { status: 400 });
    }

    const safeIngredients = body.ingredients.filter(
      (ing) => typeof ing === "object" && ing !== null &&
               typeof ing.name === "string" && ing.name.trim().length > 0 && ing.name.length <= 100 &&
               isFinite(Number(ing.amount)) && Number(ing.amount) > 0 && Number(ing.amount) <= 10000
    );
    if (safeIngredients.length === 0) {
      return NextResponse.json({ error: "유효한 재료가 없습니다." }, { status: 400 });
    }

    const clamp01 = (v: number) => isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    const safeAbv = isFinite(body.abv) ? Math.min(100, Math.max(0, body.abv)) : 0;

    const ingredientRecords = await Promise.all(
      safeIngredients.map((ing) =>
        prisma.ingredient.upsert({
          where: { name: ing.name.trim() },
          create: { name: ing.name.trim(), abv: isFinite(ing.abv) ? Math.min(100, Math.max(0, ing.abv)) : 0 },
          update: {},
        })
      )
    );

    const cocktail = await prisma.cocktail.create({
      data: {
        name: body.name.trim(),
        description: typeof body.description === "string" ? body.description.slice(0, 500) : "",
        method: body.method,
        category: "커스텀",
        isCustom: true,
        createdBy: userId,
        abv: safeAbv,
        sweetness: clamp01(body.taste.sweetness),
        sourness: clamp01(body.taste.sourness),
        bitterness: clamp01(body.taste.bitterness),
        strength: clamp01(body.taste.strength),
        freshness: clamp01(body.taste.freshness),
        popularity: 0,
        ingredients: {
          create: safeIngredients.map((ing, i) => ({
            ingredientId: ingredientRecords[i].id,
            amount: `${ing.amount}ml`,
          })),
        },
      },
    });

    return NextResponse.json({ id: cocktail.id, name: cocktail.name });
  } catch (error) {
    console.error("[cocktail save]", error);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
