import { NextRequest, NextResponse } from "next/server";
import { sanitizeImageUrl } from "@/shared/lib/safeUrl";
import { prisma } from "@/shared/lib/prisma";
import { getAuthUser } from "@/server/auth/getUser";
import { checkSameOrigin } from "@/shared/lib/internalAuth";
import { checkRateLimit } from "@/shared/lib/rateLimit";
import {
  NEARBY_RADIUS_M,
  countFreshNearbyBarsInDB,
  ensureFreshBars,
} from "@/server/barsPipeline";
import { readJsonBody } from "@/shared/lib/readJson";

export async function POST(req: NextRequest) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const authUser = await getAuthUser(req);
  const rateLimitError = await checkRateLimit(req, "bars-nearby", authUser?.email, authUser?.id);
  if (rateLimitError) return rateLimitError;

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Google Maps API 키가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as { lat: unknown; lng: unknown };
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: "유효한 위치 정보가 필요합니다." }, { status: 400 });
    }

    const nearbyCount = await countFreshNearbyBarsInDB(lat, lng);
    console.log(`[bars/nearby] 신선한 DB 캐시: ${nearbyCount}개`);

    await Promise.race([
      ensureFreshBars(lat, lng),
      new Promise<void>((resolve) => setTimeout(resolve, 45_000)),
    ]).catch((e: unknown) => {
      console.error("[bars/nearby] ensureFreshBars 실패:", e);
    });

    const latDelta = NEARBY_RADIUS_M / 111000;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const lngDelta = cosLat > 0.001 ? NEARBY_RADIUS_M / (111000 * cosLat) : NEARBY_RADIUS_M / 111000;
    let bars = await prisma.bar.findMany({
      where: {
        latitude: { gte: lat - latDelta, lte: lat + latDelta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      orderBy: { rating: "desc" },
      take: 30,
    });
    // 5개 미만이면 10km로 확장
    if (bars.length < 5) {
      const fd = 10 / 111;
      const fld = 10 / (111 * (cosLat > 0.001 ? cosLat : 1));
      bars = await prisma.bar.findMany({
        where: {
          latitude: { gte: lat - fd, lte: lat + fd },
          longitude: { gte: lng - fld, lte: lng + fld },
        },
        orderBy: { rating: "desc" },
        take: 30,
      });
    }

    return NextResponse.json(bars.map((b) => ({ ...b, imageUrl: sanitizeImageUrl(b.imageUrl) })));
  } catch (error) {
    console.error("[bars/nearby POST]", error);
    return NextResponse.json({ error: "주변 바를 불러올 수 없습니다." }, { status: 500 });
  }
}
