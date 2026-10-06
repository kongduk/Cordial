import os
import re
import asyncio
import httpx
from urllib.parse import urlparse
from bs4 import BeautifulSoup

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")
NAVER_BLOG_URL = "https://openapi.naver.com/v1/search/blog.json"

_TAG_RE = re.compile(r"<[^>]+>")
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}


def _strip_html(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


def _parse_blog_content(html: str) -> str:
    """네이버 블로그 HTML에서 본문 텍스트 추출 (신/구 에디터 모두 지원)"""
    soup = BeautifulSoup(html, "html.parser")

    # 신 에디터 (Smart Editor ONE)
    container = soup.select_one("div.se-main-container")
    if container:
        texts = [p.get_text(" ", strip=True) for p in container.select(".se-text-paragraph")]
        content = " ".join(t for t in texts if t)
        if content:
            return content[:1500]

    # 구 에디터
    old = soup.select_one("div#postViewArea") or soup.select_one("div.post-view")
    if old:
        return old.get_text(" ", strip=True)[:1500]

    # iframe 내부 (구형 네이버 블로그)
    frame = soup.select_one("iframe#mainFrame")
    if frame and frame.get("src"):
        return ""  # iframe은 별도 요청 필요 — 스니펫으로 fallback

    return soup.get_text(" ", strip=True)[:1500]


_MAX_BLOG_BYTES = 500_000
_ALLOWED_BLOG_HOSTS = {"blog.naver.com", "m.blog.naver.com"}


def _is_allowed_blog_url(url: str) -> bool:
    try:
        u = urlparse(url)
    except Exception:
        return False
    return u.scheme in ("http", "https") and (u.hostname or "").lower() in _ALLOWED_BLOG_HOSTS


async def _fetch_blog_content(url: str, client: httpx.AsyncClient) -> str:
    """블로그 URL에서 본문 전체 크롤링"""
    if not _is_allowed_blog_url(url):
        return ""  # SSRF 방지: 네이버 블로그 호스트만 허용
    try:
        # 네이버 블로그 → 모바일 URL로 변환 (iframe 없이 본문 직접 접근)
        mobile_url = re.sub(
            r"https?://blog\.naver\.com/([^/]+)/(\d+)",
            r"https://m.blog.naver.com/\1/\2",
            url,
        )
        target = mobile_url if "m.blog.naver.com" in mobile_url else url
        # 리다이렉트는 수동으로 따라가며 매 hop 마다 호스트를 검증 (SSRF 방지), 본문은 상한까지만 읽음
        current = target
        for _ in range(3):
            if not _is_allowed_blog_url(current):
                return ""
            async with client.stream("GET", current, headers=_HEADERS, timeout=8, follow_redirects=False) as res:
                if res.status_code in (301, 302, 303, 307, 308):
                    location = res.headers.get("location", "")
                    current = str(httpx.URL(current).join(location)) if location else ""
                    continue
                if res.status_code != 200:
                    return ""
                raw = bytearray()
                async for chunk in res.aiter_bytes():
                    raw.extend(chunk)
                    if len(raw) >= _MAX_BLOG_BYTES:
                        break
                html = bytes(raw[:_MAX_BLOG_BYTES]).decode(res.encoding or "utf-8", errors="ignore")
                return _parse_blog_content(html)
        return ""
    except Exception:
        return ""


async def search_naver_blog_reviews(bar_name: str, area: str, count: int = 5) -> list[str]:
    """네이버 블로그 본문 전체 크롤링 (Naver Search API → URL 수집 → BeautifulSoup 파싱)"""
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        return []

    query = f"{bar_name} {area} 칵테일 후기"
    try:
        async with httpx.AsyncClient() as client:
            # 1. Search API로 블로그 URL 수집
            res = await client.get(
                NAVER_BLOG_URL,
                params={"query": query, "display": count, "sort": "sim"},
                headers={
                    "X-Naver-Client-Id": NAVER_CLIENT_ID,
                    "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
                },
                timeout=10,
            )
            res.raise_for_status()
            items = res.json().get("items", [])

            if not items:
                return []

            # 2. 각 블로그 본문 병렬 크롤링
            tasks = [_fetch_blog_content(item["link"], client) for item in items]
            contents = await asyncio.gather(*tasks, return_exceptions=True)

            results = []
            for i, content in enumerate(contents):
                if isinstance(content, Exception) or not content:
                    # 본문 크롤링 실패 시 스니펫으로 fallback
                    title = _strip_html(items[i].get("title", ""))
                    desc = _strip_html(items[i].get("description", ""))
                    fallback = f"{title}: {desc}".strip(": ")
                    if fallback:
                        results.append(fallback)
                else:
                    results.append(content)

            return results

    except Exception as e:
        print(f"[Naver Blog] 실패: {bar_name} ({type(e).__name__})")
        return []
