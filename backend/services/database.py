import os
import re
import secrets
import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation",
}


def _gen_id() -> str:
    return "c" + secrets.token_urlsafe(20).replace("-", "").replace("_", "")[:24]


async def upsert_bar(bar_data: dict) -> dict:
    """Supabase REST API로 Bar upsert (placeId 기준)"""
    data = {**bar_data}
    if not data.get("id"):
        data["id"] = _gen_id()

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/Bar",
            headers=HEADERS,
            json=data,
            params={"on_conflict": "placeId"},
            timeout=10,
        )
        if not res.is_success:
            print(f"[DB ERROR] status={res.status_code} body={res.text[:300]}")
            res.raise_for_status()
        result = res.json()
        return result[0] if isinstance(result, list) and result else {}


_VALID_MOODS = {"조용한", "활기찬", "로맨틱", "힙한", "클래식"}


async def get_bars(area: str | None = None, mood: str | None = None) -> list[dict]:
    """Supabase REST API로 바 목록 조회"""
    params = {"order": "createdAt.desc", "limit": "50"}
    if area:
        # PostgREST 필터 구문 문자(와일드카드/구분자/괄호) 제거
        area = re.sub(r"[^0-9A-Za-z가-힣 _-]", "", area)[:50].strip()
    if area:
        params["area"] = f"ilike.*{area}*"
    if mood and mood in _VALID_MOODS:
        params["moodTags"] = f"cs.{{{mood}}}"

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/Bar",
            headers=HEADERS,
            params=params,
            timeout=10,
        )
        res.raise_for_status()
        return res.json() or []
