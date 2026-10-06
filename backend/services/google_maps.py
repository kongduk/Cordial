import os
import httpx
from typing import Optional

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
NEARBY_RADIUS_M = 2000


class GoogleMapsError(Exception):
    """Google Maps 호출 실패. 메시지에 요청 URL(쿼리의 API key 포함)을 담지 않는다."""


async def _get_json(url: str, params: dict) -> dict:
    # httpx 예외 메시지/트레이스백에는 key 가 포함된 전체 URL 이 찍히므로 상태 코드만 남긴 예외로 바꾼다
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url, params=params, timeout=10)
    except httpx.HTTPError as e:
        raise GoogleMapsError(f"Google Maps 요청 실패 ({type(e).__name__})") from None
    if not res.is_success:
        raise GoogleMapsError(f"Google Maps HTTP {res.status_code}")
    return res.json()


async def search_nearby_bars(lat: float, lng: float, radius: int = NEARBY_RADIUS_M) -> list[dict]:
    """Google Maps Places Nearby Search — 주변 칵테일 바 검색"""
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "type": "bar",
        "language": "ko",
        "key": GOOGLE_MAPS_API_KEY,
    }
    return (await _get_json(url, params)).get("results", [])


async def search_bars_by_text(query: str, count: int = 20) -> list[dict]:
    """Google Maps Text Search — 지역명/키워드로 바 검색"""
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": query,
        "type": "bar",
        "language": "ko",
        "key": GOOGLE_MAPS_API_KEY,
    }
    return (await _get_json(url, params)).get("results", [])[:count]


async def get_place_details(place_id: str) -> dict:
    """Google Maps Place Details — 리뷰, 사진, 전화번호 등 상세 정보"""
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "reviews,photos,formatted_phone_number,opening_hours,website",
        "language": "ko",
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        return (await _get_json(url, params)).get("result", {})
    except GoogleMapsError:
        return {}


async def get_place_reviews(place_id: str) -> list[str]:
    """Place Details에서 리뷰 텍스트만 추출"""
    detail = await get_place_details(place_id)
    reviews = detail.get("reviews", [])
    return [r["text"] for r in reviews if r.get("text")]


def get_photo_url(photo_reference: str, max_width: int = 600) -> str:
    """Google Maps 사진 URL 생성 (API key 포함 — 서버 내부 용도로만 사용, 저장/응답 금지)"""
    return (
        f"https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth={max_width}&photo_reference={photo_reference}&key={GOOGLE_MAPS_API_KEY}"
    )


def extract_bar_base(place: dict) -> dict:
    """Google Places 결과에서 기본 바 정보 추출"""
    # 주의: Google 사진 URL 에는 API key 가 쿼리로 포함되어 DB/응답에 저장되면 키가 유출된다.
    # 키 없는 URL 을 저장할 수 없으므로 imageUrl 은 저장하지 않는다 (필요 시 서버 프록시로 제공).
    image_url = None

    address = place.get("vicinity") or place.get("formatted_address", "")
    area_parts = address.split(" ")
    area = area_parts[1] if len(area_parts) > 1 else area_parts[0] if area_parts else None

    geometry = place.get("geometry", {}).get("location", {})

    return {
        "name": place.get("name", ""),
        "address": address,
        "area": area,
        "placeId": place.get("place_id"),
        "latitude": geometry.get("lat"),
        "longitude": geometry.get("lng"),
        "rating": place.get("rating"),
        "priceLevel": place.get("price_level"),
        "reviewCount": place.get("user_ratings_total"),
        "imageUrl": image_url,
    }
