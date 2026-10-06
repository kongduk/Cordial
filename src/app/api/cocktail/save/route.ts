import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/server/auth/getUser";
import { checkRateLimit } from "@/shared/lib/rateLimit";
import { prisma } from "@/shared/lib/prisma";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { readJsonBody } from "@/shared/lib/readJson";

const MAX_CUSTOM_COCKTAILS_PER_USER = 200;

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
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const authUser = await getAuthUser(req);
  const userId = authUser?.id;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const rateLimitError = await checkRateLimit(req, "cocktail-save", authUser.email, userId);
  if (rateLimitError) return rateLimitError;

  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as unknown as SaveBody;

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

    const seenNames = new Set<string>();
    const safeIngredients = body.ingredients.filter(
      (ing) => typeof ing === "object" && ing !== null &&
               typeof ing.name === "string" && ing.name.trim().length > 0 && ing.name.length <= 100 &&
               isFinite(Number(ing.amount)) && Number(ing.amount) > 0 && Number(ing.amount) <= 10000 &&
               (seenNames.has(ing.name.trim()) ? false : (seenNames.add(ing.name.trim()), true))
    );
    if (safeIngredients.length === 0) {
      return NextResponse.json({ error: "유효한 재료가 없습니다." }, { status: 400 });
    }

    const clamp01 = (v: number) => isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0;
    const safeAbv = isFinite(Number(body.abv)) ? Math.min(100, Math.max(0, Number(body.abv))) : 0;

    // 유저별 advisory lock 으로 count-then-insert 를 직렬화 (동시 요청으로 상한 우회 방지)
    const cocktail = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cocktail-save:" + userId}))`;

      const savedCount = await tx.cocktail.count({ where: { createdBy: userId, isCustom: true } });
      if (savedCount >= MAX_CUSTOM_COCKTAILS_PER_USER) return null;

      // 전역 Ingredient 는 이름(대소문자 무시)으로 매칭만 하고 abv 등은 절대 수정하지 않는다.
      // 없는 이름만 새로 만들며, 커스텀 칵테일에서만 쓰이는 재료는 /api/ingredients/search 에서 제외된다.
      const ingredientRecords: { id: string }[] = [];
      for (const ing of safeIngredients) {
        const name = ing.name.trim();
        const existing = await tx.ingredient.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
        ingredientRecords.push(
          existing ??
            (await tx.ingredient.upsert({
              where: { name },
              create: { name, abv: isFinite(Number(ing.abv)) ? Math.min(100, Math.max(0, Number(ing.abv))) : 0 },
              update: {},
            }))
        );
      }

      return tx.cocktail.create({
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
    });
    if (!cocktail) {
      return NextResponse.json({ error: "저장 가능한 레시피 수를 초과했습니다." }, { status: 400 });
    }

    return NextResponse.json({ id: cocktail.id, name: cocktail.name });
  } catch (error) {
    console.error("[cocktail save]", error);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
