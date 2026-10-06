import asyncio
import re


def _fetch_instagram_sync(bar_name: str, area: str, count: int) -> list[str]:
    """instaloader로 해시태그 포스트 캡션 수집 (동기, to_thread로 호출)"""
    try:
        import instaloader  # type: ignore
    except ImportError:
        return []

    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        quiet=True,
    )

    slug = re.sub(r"[^가-힣a-zA-Z0-9]", "", bar_name)
    candidates = [slug, f"{area}칵테일", f"{area}바"]

    captions: list[str] = []
    for tag_name in candidates:
        if not tag_name:
            continue
        try:
            tag = instaloader.Hashtag.from_name(L.context, tag_name)
            for i, post in enumerate(tag.get_posts()):
                if i >= count:
                    break
                caption = (post.caption or "")[:400]
                if caption and (
                    tag_name == slug or bar_name.lower() in caption.lower()
                ):
                    captions.append(caption)
            if captions:
                break
        except Exception:
            continue

    return captions[:count]


async def search_instagram_posts(bar_name: str, area: str, count: int = 5) -> list[str]:
    """Instagram 해시태그 기반 캡션 수집 (비동기 래퍼)"""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_fetch_instagram_sync, bar_name, area, count), timeout=20
        )
    except Exception as e:
        print(f"[Instagram] 실패: {bar_name} ({type(e).__name__})")
        return []
