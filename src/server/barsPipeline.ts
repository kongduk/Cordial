import { prisma } from "@/shared/lib/prisma";
import { analyzeBar } from "@/server/ai/barAnalyze";

export const CACHE_TTL_DAYS = 7;
export const NEARBY_RADIUS_M = 5000;
export const MIN_BARS_THRESHOLD = 5;

interface GooglePlace {
  place_id: string;
  name: string;
  vicinity: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  price_level?: number;
  user_ratings_total?: number;
}

interface GoogleNearbyResponse {
  results: GooglePlace[];
  next_page_token?: string;
  status: string;
}

async function fetchNearbyBarsPage(
  lat: number,
  lng: number,
  pageToken?: string,
): Promise<{ results: GooglePlace[]; nextToken?: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY not configured");

  const url = pageToken
    ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pageToken}&key=${key}`
    : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${NEARBY_RADIUS_M}&type=bar&language=ko&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[barsPipeline] Google Places API HTTP ${res.status}`);
    return { results: [] };
  }
  const data = (await res.json()) as GoogleNearbyResponse;
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(`[barsPipeline] Google Places status: ${data.status}`);
  }
  return { results: data.results ?? [], nextToken: data.next_page_token };
}

async function fetchAllNearbyBars(lat: number, lng: number): Promise<GooglePlace[]> {
  const all: GooglePlace[] = [];
  const { results, nextToken } = await fetchNearbyBarsPage(lat, lng);
  all.push(...results);

  if (nextToken && all.length < 40) {
    await new Promise((r) => setTimeout(r, 2500));
    const { results: results2 } = await fetchNearbyBarsPage(lat, lng, nextToken);
    all.push(...results2);
  }
  return all;
}

async function fetchPlaceReviews(placeId: string): Promise<string[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&language=ko&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[barsPipeline] Google Places Details HTTP ${res.status} for place ${placeId}`);
    return [];
  }
  const data = (await res.json()) as { result?: { reviews?: { text: string }[] } };
  return (data.result?.reviews ?? []).map((r) => r.text).filter(Boolean);
}

function isStale(analyzedAt: Date | null): boolean {
  if (!analyzedAt) return true;
  return (Date.now() - analyzedAt.getTime()) / (1000 * 60 * 60 * 24) > CACHE_TTL_DAYS;
}

export async function countFreshNearbyBarsInDB(lat: number, lng: number): Promise<number> {
  const latDelta = NEARBY_RADIUS_M / 111000;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta = cosLat > 0.001 ? NEARBY_RADIUS_M / (111000 * cosLat) : NEARBY_RADIUS_M / 111000;
  const staleDate = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  return prisma.bar.count({
    where: {
      latitude: { gte: lat - latDelta, lte: lat + latDelta },
      longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      // analyzedAt이 없는 구형 데이터는 createdAt으로 신선도 판단
      OR: [
        { analyzedAt: { gte: staleDate } },
        { analyzedAt: null, createdAt: { gte: staleDate } },
      ],
    },
  });
}

export async function runInlinePipeline(lat: number, lng: number): Promise<void> {
  const places = await fetchAllNearbyBars(lat, lng);
  console.log(`[barsPipeline] Google Places 수집: ${places.length}개`);

  const targets = places.slice(0, 20);
  // Gemini rate limit 방지: 5개씩 병렬 처리 후 2초 대기 (FastAPI와 동일 패턴)
  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5);
    await Promise.all(
      batch.map(async (place) => {
        try {
          const existing = await prisma.bar.findUnique({ where: { placeId: place.place_id } });
          if (existing && !isStale(existing.analyzedAt)) return;

          const reviews = await fetchPlaceReviews(place.place_id);
          const analysis = await analyzeBar(place.name, place.vicinity, reviews);

          const data = {
            name: place.name,
            address: place.vicinity,
            area: place.vicinity.split(" ")[0]?.trim() ?? place.vicinity,
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            placeId: place.place_id,
            rating: place.rating ?? null,
            priceLevel: place.price_level ?? null,
            reviewCount: place.user_ratings_total ?? null,
            moodTags: analysis.moodTags,
            purposeTags: analysis.purposeTags,
            cocktailStyles: analysis.cocktailStyles,
            signature: analysis.signature,
            description: analysis.description,
            analyzedAt: new Date(),
          };

          await prisma.bar.upsert({
            where: { placeId: place.place_id },
            update: data,
            create: data,
          });
        } catch (e) {
          console.error(`[barsPipeline] ${place.name} 처리 실패:`, e);
        }
      }),
    );
    if (i + 5 < targets.length) await new Promise((r) => setTimeout(r, 2000));
  }
}

/** 필요 시 파이프라인 실행 (FastAPI 우선, 실패 시 인라인) */
export async function ensureFreshBars(lat: number, lng: number): Promise<void> {
  const freshCount = await countFreshNearbyBarsInDB(lat, lng);
  if (freshCount >= MIN_BARS_THRESHOLD) return;

  const fastapiUrl = process.env.FASTAPI_URL;
  if (fastapiUrl) {
    try {
      const res = await fetch(`${fastapiUrl}/bars/pipeline/nearby`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 서버 전용 시크릿 (NEXT_PUBLIC_ 금지)
          "X-Internal-Secret": process.env.INTERNAL_API_SECRET ?? "",
        },
        body: JSON.stringify({ lat, lng, radius: NEARBY_RADIUS_M, count: 40 }),
        signal: AbortSignal.timeout(50_000),
      });
      if (res.ok) {
        // FastAPI가 200을 반환해도 실제 DB 저장 여부 검증
        const afterCount = await countFreshNearbyBarsInDB(lat, lng);
        if (afterCount >= MIN_BARS_THRESHOLD) return;
        console.warn("[barsPipeline] FastAPI 200 반환했지만 DB에 바 없음, 인라인 실행");
      }
    } catch (e) {
      console.error("[barsPipeline] FastAPI 호출 실패, 인라인 실행:", e);
    }
  }

  await runInlinePipeline(lat, lng);
}
