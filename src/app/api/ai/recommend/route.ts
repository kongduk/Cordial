import { NextRequest, NextResponse } from "next/server";
import { recommendCocktails } from "@/server/ai/recommendCocktails";
import { prisma } from "@/shared/lib/prisma";
import { emotionToTarget } from "@/shared/lib/emotionTaste";
import type { EmotionVector } from "@/shared/types";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { getAuthUser } from "@/server/auth/getUser";
import { checkRateLimit, consumeAiBudget } from "@/shared/lib/rateLimit";
import { readJsonBody } from "@/shared/lib/readJson";

function isValidEmotionVector(v: unknown): v is EmotionVector {
  if (typeof v !== "object" || v === null) return false;
  const keys: (keyof EmotionVector)[] = ["joy", "sadness", "stress", "fatigue", "excitement"];
  return keys.every(k =>
    k in v &&
    typeof (v as Record<string, unknown>)[k] === "number" &&
    (v as Record<string, number>)[k] >= 0 &&
    (v as Record<string, number>)[k] <= 1
  );
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const authUser = await getAuthUser(req);
  const rateLimitError = await checkRateLimit(req, "recommend", authUser?.email, authUser?.id);
  if (rateLimitError) return rateLimitError;

  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as { emotionVector: unknown; drinkingCapacity?: string };
    const { emotionVector, drinkingCapacity: capacityFromBody } = body;

    if (!isValidEmotionVector(emotionVector)) {
      return NextResponse.json({ error: "유효하지 않은 emotionVector입니다." }, { status: 400 });
    }

    const userId = authUser?.id;

    // 로그인 유저: drinkingCapacity를 DB에서 가져옴 (온보딩에서 이미 설정됨)
    // 비로그인 유저: 감정 플로우 step 5에서 받은 값 사용 (허용 값만)
    const validCapacities = ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
    const drinkingCapacity =
      userId || typeof capacityFromBody !== "string" || !validCapacities.includes(capacityFromBody)
        ? undefined
        : capacityFromBody;

    const budgetError = await consumeAiBudget(req, !authUser);
    if (budgetError) return budgetError;

    const recommendations = await recommendCocktails({ emotionVector, userId, drinkingCapacity });

    if (userId && recommendations.length > 0) {
      await prisma.recommendation.createMany({
        data: recommendations.map((r) => ({
          userId,
          cocktailId: r.id,
          score: r.score,
        })),
        skipDuplicates: true,
      });

      // 감정 기반 추론 flavor 벡터로 user prefs 점진적 업데이트 (α=0.1 이동평균)
      const e = emotionVector;
      // 취향(User.*Pref)은 실제 칵테일 맛 스케일 — 분포 보정된 목표를 사용
      const inferredFlavor = emotionToTarget(e);
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { sweetPref: true, sourPref: true, bitterPref: true, strongPref: true, freshPref: true } });
      if (user) {
        const α = 0.12;
        await prisma.user.update({
          where: { id: userId },
          data: {
            sweetPref:  Math.min(1, Math.max(0, user.sweetPref  * (1 - α) + inferredFlavor.sweetness  * α)),
            sourPref:   Math.min(1, Math.max(0, user.sourPref   * (1 - α) + inferredFlavor.sourness   * α)),
            bitterPref: Math.min(1, Math.max(0, user.bitterPref * (1 - α) + inferredFlavor.bitterness * α)),
            strongPref: Math.min(1, Math.max(0, user.strongPref * (1 - α) + inferredFlavor.strength   * α)),
            freshPref:  Math.min(1, Math.max(0, user.freshPref  * (1 - α) + inferredFlavor.freshness  * α)),
          },
        });
      }
    }

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("[recommend]", error);
    return NextResponse.json({ error: "칵테일 추천 중 오류가 발생했습니다." }, { status: 500 });
  }
}
