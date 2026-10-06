import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/server/auth/getUser";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { checkRateLimit } from "@/shared/lib/rateLimit";
import { prisma } from "@/shared/lib/prisma";
import { NEARBY_RADIUS_M, ensureFreshBars } from "@/server/barsPipeline";
import type { BarSurvey, RecommendedBar, BarMood, BarPurpose, CocktailStyle, BarBudget } from "@/shared/types";

const BUDGET_TO_PRICE: Record<string, number[]> = {
  "3만원 이하": [1, 2],
  "3~5만원": [2, 3],
  "5만원 이상": [3, 4],
};

// 감정 벡터 → 선호 분위기 점수
function emotionToMoodScores(avg: { joy: number; sadness: number; stress: number; fatigue: number; excitement: number }): Record<string, number> {
  return {
    활기찬: avg.joy * 0.4 + avg.excitement * 0.6,
    힙한: avg.excitement * 0.5 + avg.joy * 0.3 + (1 - avg.fatigue) * 0.2,
    로맨틱: avg.joy * 0.4 + (1 - avg.sadness) * 0.3 + (1 - avg.stress) * 0.3,
    클래식: avg.sadness * 0.3 + (1 - avg.excitement) * 0.4 + avg.fatigue * 0.3,
    조용한: avg.fatigue * 0.4 + avg.stress * 0.3 + avg.sadness * 0.3,
  };
}

// 시그니처 칵테일 이름 → 스타일 힌트 (Gemini cocktailStyles 보완용)
const SIGNATURE_STYLE_HINTS: Record<string, string> = {
  네그로니: "쓴", negroni: "쓴",
  마티니: "강한", martini: "강한",
  올드패션드: "강한", "old fashioned": "강한",
  맨해튼: "강한", manhattan: "강한",
  위스키사워: "신", "whiskey sour": "신",
  다이키리: "신", daiquiri: "신",
  마가리타: "신", margarita: "신",
  사이드카: "신", sidecar: "신",
  모히토: "가벼운", mojito: "가벼운",
  진토닉: "가벼운", "gin tonic": "가벼운", "gin & tonic": "가벼운",
  아페롤스프리츠: "달콤한", "aperol spritz": "달콤한", 스프리츠: "달콤한",
  코스모폴리탄: "달콤한", cosmopolitan: "달콤한",
  피나콜라다: "달콤한", "pina colada": "달콤한",
  에스프레소마티니: "쓴", "espresso martini": "쓴",
  블러디메리: "강한", "bloody mary": "강한",
};

function inferSignatureStyle(signature: string | null | undefined): string | null {
  if (!signature) return null;
  const lower = signature.toLowerCase();
  for (const [key, style] of Object.entries(SIGNATURE_STYLE_HINTS)) {
    if (lower.includes(key)) return style;
  }
  return null;
}

// 분위기 유사도 — 완전 다른 분위기라도 약간의 점수 부여
const MOOD_SIMILARITY: Record<string, Record<string, number>> = {
  조용한: { 클래식: 0.5, 로맨틱: 0.4, 힙한: 0.1, 활기찬: 0 },
  활기찬: { 힙한: 0.6, 로맨틱: 0.2, 클래식: 0.1, 조용한: 0 },
  로맨틱: { 조용한: 0.4, 클래식: 0.3, 힙한: 0.2, 활기찬: 0.1 },
  힙한: { 활기찬: 0.6, 로맨틱: 0.2, 조용한: 0.1, 클래식: 0.1 },
  클래식: { 조용한: 0.5, 로맨틱: 0.3, 힙한: 0.1, 활기찬: 0.1 },
};

function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreBar(
  bar: {
    moodTags: string[];
    purposeTags: string[];
    cocktailStyles: string[];
    signature: string | null;
    priceLevel: number | null;
    rating: number | null;
    reviewCount: number | null;
    latitude: number | null;
    longitude: number | null;
  },
  survey: BarSurvey,
  userLat: number,
  userLng: number,
  emotionMoodScores: Record<string, number> | null
): { score: number; matchReasons: string[] } {
  const matchReasons: string[] = [];

  // 예산 필터 (통과 못 하면 0점)
  const budgetLevels = BUDGET_TO_PRICE[survey.budget] ?? [1, 2, 3, 4];
  const budgetOk = bar.priceLevel == null || budgetLevels.includes(bar.priceLevel);
  if (!budgetOk) return { score: 0, matchReasons: [] };

  // 분위기 매칭 30% — 완전 일치 1.0, 유사 분위기 부분 점수
  const exactMoodMatch = bar.moodTags.includes(survey.mood);
  const similarMoodScore = exactMoodMatch
    ? 1
    : Math.max(0, ...bar.moodTags.map(t => MOOD_SIMILARITY[survey.mood]?.[t] ?? 0));
  const moodMatch = exactMoodMatch ? 1 : similarMoodScore * 0.5;
  if (exactMoodMatch) matchReasons.push(`${survey.mood} 분위기`);
  else if (similarMoodScore > 0.3) matchReasons.push(`${survey.mood}와 유사한 분위기`);

  // 칵테일 스타일 매칭 25% — cocktailStyles + 시그니처 칵테일 맛 힌트 중 높은 값
  const directStyleMatch = bar.cocktailStyles.includes(survey.cocktailStyle) ? 1 : 0;
  const sigStyle = inferSignatureStyle(bar.signature);
  const sigStyleMatch = sigStyle === survey.cocktailStyle ? 0.8 : 0;
  const styleMatch = Math.max(directStyleMatch, sigStyleMatch);
  if (directStyleMatch) matchReasons.push(`${survey.cocktailStyle} 칵테일`);
  else if (sigStyleMatch && bar.signature) matchReasons.push(`시그니처 '${bar.signature}' — ${survey.cocktailStyle} 스타일`);

  // 방문 목적 20%
  const purposeMatch = bar.purposeTags.includes(survey.purpose) ? 1 : 0;
  if (purposeMatch) matchReasons.push(`${survey.purpose}에 적합`);

  // 거리 10%
  const distanceKm =
    bar.latitude != null && bar.longitude != null
      ? calcDistance(userLat, userLng, bar.latitude, bar.longitude)
      : 999;
  const distanceScore = Math.max(0, 1 - distanceKm / 5);

  // 평점 + 리뷰수 10%
  const ratingScore = bar.rating ? (bar.rating - 1) / 4 : 0.5;
  const reviewBonus = bar.reviewCount ? Math.min(bar.reviewCount / 100, 1) : 0;
  const popularityScore = ratingScore * 0.7 + reviewBonus * 0.3;
  if (bar.rating && bar.rating >= 4.5) matchReasons.push(`★ ${bar.rating} 고평점`);

  // 감정 기반 분위기 보너스 5%
  let emotionScore = 0;
  if (emotionMoodScores) {
    const emotionFit = bar.moodTags.reduce((acc, tag) => acc + (emotionMoodScores[tag] ?? 0), 0) / Math.max(bar.moodTags.length, 1);
    emotionScore = emotionFit;
    if (emotionFit > 0.6 && !matchReasons.some(r => r.includes("분위기"))) {
      matchReasons.push("현재 기분에 어울리는 분위기");
    }
  }

  const score =
    moodMatch * 0.30 +
    styleMatch * 0.25 +
    purposeMatch * 0.20 +
    distanceScore * 0.10 +
    popularityScore * 0.10 +
    emotionScore * 0.05;

  return { score, matchReasons };
}

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const authUser = await getAuthUser(req);
  const rateLimitError = await checkRateLimit(req, "bars-recommend", authUser?.email, authUser?.id);
  if (rateLimitError) return rateLimitError;

  try {
    const body = await req.json() as { lat: unknown; lng: unknown; survey: unknown };
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const survey = body.survey as BarSurvey;

    const validMoods: BarMood[] = ["조용한", "활기찬", "로맨틱", "힙한", "클래식"];
    const validStyles: CocktailStyle[] = ["달콤한", "신", "쓴", "강한", "가벼운"];
    const validPurposes: BarPurpose[] = ["혼술", "데이트", "친구모임", "비즈니스"];
    const validBudgets: BarBudget[] = ["3만원 이하", "3~5만원", "5만원 이상"];

    if (
      !isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
      !survey || typeof survey !== "object" ||
      !validMoods.includes(survey.mood) ||
      !validStyles.includes(survey.cocktailStyle) ||
      !validPurposes.includes(survey.purpose) ||
      !validBudgets.includes(survey.budget)
    ) {
      return NextResponse.json({ error: "위치와 설문 응답이 필요합니다." }, { status: 400 });
    }

    // 로그인 유저의 최근 EmotionLog 조회
    let emotionMoodScores: Record<string, number> | null = null;
    if (authUser?.id) {
      const userId = authUser.id;
      const recentLogs = await prisma.emotionLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      if (recentLogs.length > 0) {
        const avg = {
          joy: recentLogs.reduce((s, l) => s + l.joy, 0) / recentLogs.length,
          sadness: recentLogs.reduce((s, l) => s + l.sadness, 0) / recentLogs.length,
          stress: recentLogs.reduce((s, l) => s + l.stress, 0) / recentLogs.length,
          fatigue: recentLogs.reduce((s, l) => s + l.fatigue, 0) / recentLogs.length,
          excitement: recentLogs.reduce((s, l) => s + l.excitement, 0) / recentLogs.length,
        };
        emotionMoodScores = emotionToMoodScores(avg);
      }
    }

    // 현재 위치 기준 파이프라인 실행 보장 (45초 소프트 타임아웃)
    await Promise.race([
      ensureFreshBars(lat, lng),
      new Promise<void>((resolve) => setTimeout(resolve, 45_000)),
    ]).catch((e: unknown) => {
      console.error("[bars/recommend] ensureFreshBars 실패:", e);
    });

    // 파이프라인 수집 반경과 동일한 바운딩박스로 쿼리
    const delta = NEARBY_RADIUS_M / 111000;
    const lngDelta = NEARBY_RADIUS_M / (111000 * Math.cos((lat * Math.PI) / 180));
    let bars = await prisma.bar.findMany({
      where: {
        latitude: { gte: lat - delta, lte: lat + delta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
    });

    // 바가 5개 미만이면 10km로 확장 (지방 도시·바 밀도 낮은 지역 대응)
    if (bars.length < 5) {
      const fallbackDelta = 10 / 111;
      const fallbackLngDelta = 10 / (111 * Math.cos((lat * Math.PI) / 180));
      bars = await prisma.bar.findMany({
        where: {
          latitude: { gte: lat - fallbackDelta, lte: lat + fallbackDelta },
          longitude: { gte: lng - fallbackLngDelta, lte: lng + fallbackLngDelta },
        },
      });
    }

    const scored = bars
      .map((bar) => {
        const { score, matchReasons } = scoreBar(bar, survey, lat, lng, emotionMoodScores);
        const distanceKm =
          bar.latitude != null && bar.longitude != null
            ? calcDistance(lat, lng, bar.latitude, bar.longitude)
            : 999;
        return {
          id: bar.id,
          name: bar.name,
          address: bar.address,
          area: bar.area,
          moodTags: bar.moodTags,
          purposeTags: bar.purposeTags,
          cocktailStyles: bar.cocktailStyles,
          signature: bar.signature,
          imageUrl: bar.imageUrl,
          description: bar.description,
          latitude: bar.latitude,
          longitude: bar.longitude,
          rating: bar.rating,
          priceLevel: bar.priceLevel,
          reviewCount: bar.reviewCount,
          placeId: bar.placeId,
          score,
          distanceKm: Math.round(distanceKm * 10) / 10,
          matchReasons,
        } satisfies RecommendedBar;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return NextResponse.json(scored);
  } catch (error) {
    console.error("[bars/recommend POST]", error);
    return NextResponse.json({ error: "추천 계산에 실패했습니다." }, { status: 500 });
  }
}
