/**
 * DB/외부(Google Places 등)에서 온 이미지 URL 을 클라이언트로 내보내기 전에 정제한다.
 * - https 만 허용 (javascript:, data: 등 차단)
 * - 쿼리에 API key 가 들어있는 URL(과거 파이프라인이 저장한 Google 사진 URL)은 키 유출 방지를 위해 null
 */
export function sanitizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    if (u.searchParams.has("key") || u.searchParams.has("api_key") || u.searchParams.has("apikey")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
