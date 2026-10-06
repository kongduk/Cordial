import { prisma } from "@/shared/lib/prisma";
import { analyzeBar } from "@/server/ai/barAnalyze";
import { consumeGlobalBudget, isEmptyBarCell, markEmptyBarCell } from "@/shared/lib/rateLimit";

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
): Promise<{ results: GooglePlace[]; nextToken?: string; status: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY not configured");

  const url = pageToken
    ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${encodeURIComponent(pageToken)}&key=${key}`
    : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${NEARBY_RADIUS_M}&type=bar&language=ko&key=${key}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    console.error(`[barsPipeline] Google Places API HTTP ${res.status}`);
    return { results: [], status: `HTTP_${res.status}` };
  }
  const data = (await res.json()) as GoogleNearbyResponse;
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(`[barsPipeline] Google Places status: ${data.status}`);
  }
  return { results: data.results ?? [], nextToken: data.next_page_token, status: data.status ?? "UNKNOWN_ERROR" };
}

async function fetchAllNearbyBars(
  lat: number,
  lng: number,
): Promise<{ places: GooglePlace[]; firstStatus: string }> {
  const all: GooglePlace[] = [];
  const { results, nextToken, status: firstStatus } = await fetchNearbyBarsPage(lat, lng);
  all.push(...results);

  if (nextToken && all.length < 40) {
    await new Promise((r) => setTimeout(r, 2500));
    const { results: results2 } = await fetchNearbyBarsPage(lat, lng, nextToken);
    all.push(...results2);
  }
  return { places: all, firstStatus };
}

async function fetchPlaceReviews(placeId: string): Promise<string[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=reviews&language=ko&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    console.error(`[barsPipeline] Google Places Details HTTP ${res.status} for place ${placeId}`);
    return [];
  }
  const data = (await res.json()) as { result?: { reviews?: { text: string }[] } };
  return (data.result?.reviews ?? []).map((r) => r.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .slice(0, 5)
    .map((t) => t.slice(0, 1000));
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

/** 첫 페이지의 Places status 를 반환한다 (ZERO_RESULTS 일 때만 네거티브 캐시 대상). */
export async function runInlinePipeline(lat: number, lng: number): Promise<string> {
  const { places, firstStatus } = await fetchAllNearbyBars(lat, lng);
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
  return firstStatus;
}

// 동일 지역 동시 요청 합치기 + 전체 동시 실행 수 제한 (유료 Google/Gemini 호출 증폭 방지).
// 항목은 finally 에서 반드시 제거되므로 Map 은 MAX_INFLIGHT_PIPELINES 를 넘어 커지지 않는다.
const MAX_INFLIGHT_PIPELINES = 3;
const inflightPipelines = new Map<string, Promise<void>>();

/** 필요 시 파이프라인 실행 (FastAPI 우선, 실패 시 인라인) */
export async function ensureFreshBars(lat: number, lng: number): Promise<void> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const existing = inflightPipelines.get(key);
  if (existing) return existing;
  if (inflightPipelines.size >= MAX_INFLIGHT_PIPELINES) return; // 과부하 시 기존 DB 데이터로 응답

  const p = ensureFreshBarsUncoalesced(lat, lng).finally(() => {
    inflightPipelines.delete(key);
  });
  inflightPipelines.set(key, p);
  return p;
}

async function ensureFreshBarsUncoalesced(lat: number, lng: number): Promise<void> {
  const freshCount = await countFreshNearbyBarsInDB(lat, lng);
  if (freshCount >= MIN_BARS_THRESHOLD) return;

  // 최근 24h 내 파이프라인이 바를 못 찾은 격자 셀은 전역 예산을 쓰지 않고 건너뜀 (빈 지역 반복 호출로 예산 소진 방지)
  const cell = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (await isEmptyBarCell(cell)) return;

  // 전역 일일 예산 소진 시 갱신을 건너뛰고 DB 에 캐시된 바로 응답 (에러 아님)
  if (!(await consumeGlobalBudget("bars-pipeline-global"))) {
    console.warn("[barsPipeline] 일일 파이프라인 예산 소진 — 캐시된 DB 데이터로 응답");
    return;
  }

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

  const firstStatus = await runInlinePipeline(lat, lng);
  if ((await countFreshNearbyBarsInDB(lat, lng)) === 0) {
    // 오류(HTTP 실패/OVER_QUERY_LIMIT/REQUEST_DENIED 등)는 네거티브 캐시하지 않는다 — ZERO_RESULTS 만 기록
    if (firstStatus === "ZERO_RESULTS") await markEmptyBarCell(cell);
    else console.error(`[barsPipeline] 바 0개지만 Places status=${firstStatus} → 빈 셀로 기록하지 않음 (${cell})`);
  }
}
