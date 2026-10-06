import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/server/auth/getUser";
import { checkRateLimit, consumeAiBudget } from "@/shared/lib/rateLimit";
import { prisma } from "@/shared/lib/prisma";
import { generateRecipeSteps } from "@/server/ai/generateRecipeSteps";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser(req);
  const rateLimitError = await checkRateLimit(req, "recipe-steps", authUser?.email, authUser?.id);
  if (rateLimitError) return rateLimitError;

  try {
    const { id } = await context.params;
    if (id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cocktail = await prisma.cocktail.findUnique({
      where: { id },
      include: {
        ingredients: { include: { ingredient: true } },
      },
    });

    if (!cocktail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (cocktail.isCustom && (!authUser?.id || cocktail.createdBy !== authUser.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (Array.isArray(cocktail.recipeSteps) && (cocktail.recipeSteps as unknown[]).length > 0) {
      return NextResponse.json({ steps: cocktail.recipeSteps });
    }

    const budgetError = await consumeAiBudget(req, !authUser);
    if (budgetError) return budgetError;

    const steps = await generateRecipeSteps({
      name: cocktail.name,
      method: cocktail.method,
      glassType: cocktail.glassType,
      ingredients: cocktail.ingredients.map(ci => ({
        name: ci.ingredient.name,
        amount: ci.amount,
      })),
    });

    await prisma.cocktail.update({
      where: { id },
      data: { recipeSteps: steps },
    });

    return NextResponse.json({ steps });
  } catch (error) {
    console.error("[recipe-steps GET]", error);
    return NextResponse.json({ error: "레시피 단계 조회 실패" }, { status: 500 });
  }
}
