import { NextRequest, NextResponse } from "next/server";
import { pantryRecommend } from "@/server/ai/pantryRecommend";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { getAuthUser } from "@/server/auth/getUser";
import { checkRateLimit, consumeAnonAiBudget } from "@/shared/lib/rateLimit";
import { readJsonBody } from "@/shared/lib/readJson";

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const authUser = await getAuthUser(req);
  const rateLimitError = await checkRateLimit(req, "pantry-recommend", authUser?.email, authUser?.id);
  if (rateLimitError) return rateLimitError;

  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const { ingredients } = parsed.data as { ingredients: string[] };

    if (!Array.isArray(ingredients)) {
      return NextResponse.json({ error: "ingredients 배열이 필요합니다." }, { status: 400 });
    }

    const validIngredients = ingredients
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().slice(0, 50))
      .slice(0, 100);

    const budgetError = await consumeAnonAiBudget(!authUser);
    if (budgetError) return budgetError;

    const userId = authUser?.id;

    const result = await pantryRecommend(validIngredients, userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[pantry-recommend]", error);
    return NextResponse.json({ error: "재료 매칭 중 오류가 발생했습니다." }, { status: 500 });
  }
}
