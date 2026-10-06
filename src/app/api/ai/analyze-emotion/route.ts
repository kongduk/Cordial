import { NextRequest, NextResponse } from "next/server";
import { analyzeEmotion } from "@/server/ai/analyzeEmotion";
import { prisma } from "@/shared/lib/prisma";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { getAuthUser } from "@/server/auth/getUser";
import { checkRateLimit } from "@/shared/lib/rateLimit";
import { readJsonBody } from "@/shared/lib/readJson";

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const authUser = await getAuthUser(req);
  const rateLimitError = await checkRateLimit(req, "analyze-emotion", authUser?.email, authUser?.id);
  if (rateLimitError) return rateLimitError;

  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const { text } = parsed.data as { text: string };

    if (typeof text !== "string" || text.trim().length < 5) {
      return NextResponse.json({ error: "최소 5자 이상 입력해 주세요." }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "텍스트가 너무 깁니다." }, { status: 400 });
    }

    const emotion = await analyzeEmotion(text);

    const userId = authUser?.id;

    try {
      await prisma.emotionLog.create({
        data: {
          userId: userId ?? null,
          joy: emotion.joy,
          sadness: emotion.sadness,
          stress: emotion.stress,
          fatigue: emotion.fatigue,
          excitement: emotion.excitement,
          rawText: text,
        },
      });
    } catch (e) {
      console.error("[analyze-emotion] emotionLog 저장 실패:", e);
    }

    return NextResponse.json(emotion);
  } catch (error) {
    console.error("[analyze-emotion]", error);
    return NextResponse.json({ error: "감정 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
