import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/server/auth/getUser";
import { checkRateLimit } from "@/shared/lib/rateLimit";
import { prisma } from "@/shared/lib/prisma";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { readJsonBody } from "@/shared/lib/readJson";
import { computeFlavor } from "@/shared/lib/flavorModel";
import type { MixMethod } from "@/shared/types";

const MAX_CUSTOM_COCKTAILS_PER_USER = 200;

interface SaveBody {
  name: string;
  description: string;
  method: string;
  ingredients: Array<{ name: string; amount: number; abv: number }>;
  /** 하위 호환용 — 서버는 무시하고 flavorModel 로 직접 계산한다 */
  taste?: unknown;
  abv?: unknown;
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
    if (typeof body !== "object" || body === null) {
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

    // 맛/도수는 클라이언트 값을 신뢰하지 않고 서버에서 재료·용량·제조법으로 직접 계산 (모의 제조 분석과 동일 모델)
    const flavor = computeFlavor(
      safeIngredients.map((ing) => ({
        name: ing.name.trim(),
        ml: Number(ing.amount),
        abv: isFinite(Number(ing.abv)) ? Math.min(100, Math.max(0, Number(ing.abv))) : undefined,
      })),
      body.method as MixMethod,
    );

    // 유저별 advisory lock 으로 count-then-insert 를 직렬화 (동시 요청으로 상한 우회 방지)
    const cocktail = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cocktail-save:" + userId}))`;

      const savedCount = await tx.cocktail.count({ where: { createdBy: userId, isCustom: true } });
      if (savedCount >= MAX_CUSTOM_COCKTAILS_PER_USER) return null;

      // 전역 Ingredient 는 이름(대소문자 무시)으로 매칭만 하고 abv 등은 절대 수정하지 않는다.
      // 없는 이름만 새로 만들며, 커스텀 칵테일에서만 쓰이는 재료는 /api/ingredients/search 에서 제외된다.
      const names = safeIngredients.map((ing) => ing.name.trim());
      const found = await tx.ingredient.findMany({
        where: { OR: names.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) },
        select: { id: true, name: true },
      });
      const byLower = new Map<string, { id: string }>();
      for (const f of found) if (!byLower.has(f.name.toLowerCase())) byLower.set(f.name.toLowerCase(), f);

      const ingredientRecords: { id: string }[] = [];
      for (const ing of safeIngredients) {
        const name = ing.name.trim();
        let rec = byLower.get(name.toLowerCase());
        if (!rec) {
          rec = await tx.ingredient.upsert({
            where: { name },
            create: { name, abv: isFinite(Number(ing.abv)) ? Math.min(100, Math.max(0, Number(ing.abv))) : 0 },
            update: {},
            select: { id: true },
          });
          byLower.set(name.toLowerCase(), rec);
        }
        ingredientRecords.push(rec);
      }

      return tx.cocktail.create({
        data: {
          name: body.name.trim(),
          description: typeof body.description === "string" ? body.description.slice(0, 500) : "",
          method: body.method,
          category: "커스텀",
          isCustom: true,
          createdBy: userId,
          abv: flavor.abv,
          sweetness: flavor.sweetness,
          sourness: flavor.sourness,
          bitterness: flavor.bitterness,
          strength: flavor.strength,
          freshness: flavor.freshness,
          popularity: 0,
          ingredients: {
            create: safeIngredients.map((ing, i) => ({
              ingredientId: ingredientRecords[i].id,
              amount: `${ing.amount}ml`,
            })),
          },
        },
      });
    }, { maxWait: 5000, timeout: 15000 });
    if (!cocktail) {
      return NextResponse.json({ error: "저장 가능한 레시피 수를 초과했습니다." }, { status: 400 });
    }

    return NextResponse.json({ id: cocktail.id, name: cocktail.name });
  } catch (error) {
    console.error("[cocktail save]", error);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
