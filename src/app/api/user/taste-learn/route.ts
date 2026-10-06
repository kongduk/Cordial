import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { readJsonBody } from "@/shared/lib/readJson";

const RATE = 0.12;

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const userId = (await getUserId(req)) ?? undefined;
  if (!userId) return NextResponse.json({ ok: false });

  let cocktailId: string | undefined;
  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as { cocktailId?: string };
    cocktailId = body.cocktailId;
  } catch {
    return NextResponse.json({ ok: false });
  }
  if (typeof cocktailId !== "string" || !cocktailId || cocktailId.length > 64) return NextResponse.json({ ok: false });

  try {
    const [user, cocktail] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { sweetPref: true, sourPref: true, bitterPref: true, strongPref: true, freshPref: true },
      }),
      prisma.cocktail.findUnique({
        where: { id: cocktailId },
        select: { sweetness: true, sourness: true, bitterness: true, strength: true, freshness: true, isCustom: true, createdBy: true },
      }),
    ]);

    if (!user || !cocktail) return NextResponse.json({ ok: false });
    // 타인의 커스텀 칵테일로는 학습하지 않음 (IDOR)
    if (cocktail.isCustom && cocktail.createdBy !== userId) return NextResponse.json({ ok: false });

    const nudge = (cur: number, target: number) =>
      Math.min(1, Math.max(0, cur * (1 - RATE) + target * RATE));

    await prisma.user.update({
      where: { id: userId },
      data: {
        sweetPref:  nudge(user.sweetPref,  cocktail.sweetness  ?? 0.5),
        sourPref:   nudge(user.sourPref,   cocktail.sourness   ?? 0.5),
        bitterPref: nudge(user.bitterPref, cocktail.bitterness ?? 0.5),
        strongPref: nudge(user.strongPref, cocktail.strength   ?? 0.5),
        freshPref:  nudge(user.freshPref,  cocktail.freshness  ?? 0.5),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[taste-learn POST]", error);
    return NextResponse.json({ ok: false });
  }
}
