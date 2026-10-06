import os
import json
import asyncio
import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent"
)

PROMPT_TEMPLATE = """당신은 한국 칵테일 바(Bar) 전문 큐레이터입니다. 바의 이름, 주소, 구글 리뷰, 네이버 블로그 후기, 인스타그램 캡션을 종합 분석해서 반드시 JSON만 반환하세요.

반환 형식:
{{
  "moodTags": ["조용한"|"활기찬"|"로맨틱"|"힙한"|"클래식" 중 1~2개],
  "purposeTags": ["혼술"|"데이트"|"친구모임"|"비즈니스" 중 1~2개],
  "cocktailStyles": ["달콤한"|"신"|"쓴"|"강한"|"가벼운" 중 1~2개],
  "signature": "대표 칵테일명 또는 null",
  "description": "바 분위기 한 줄 소개 (20자 이내, 한국어)"
}}

분석 우선순위:
1. 블로그/인스타 후기에서 시그니처 칵테일 이름이 직접 언급되면 signature에 반드시 반영
2. 블로그/인스타 분위기 묘사(조용, 힙, 데이트 등)를 moodTags/purposeTags에 우선 반영
3. 구글 리뷰로 보완, 없으면 이름/주소 기반 추론

분석 기준:
- 이름/리뷰에 Jazz, Music, Vinyl, 재즈, 뮤직 → 클래식, 혼술, 쓴
- 이름/리뷰에 Party, Night, 나잇, 클럽 → 활기찬, 친구모임, 달콤한
- 이름/리뷰에 Wine, Rose, 와인, 로즈, 로맨틱 → 로맨틱, 데이트, 달콤한
- 이름/리뷰에 Craft, Hip, 크래프트, 힙 → 힙한, 친구모임, 신
- 이름/리뷰에 Speakeasy, 스피크이지, 비밀 → 클래식, 비즈니스, 쓴
- 이름/리뷰에 위스키, Whisky, Bourbon, 버번 → 클래식, 강한, 쓴
- 이름/리뷰에 루프탑, Rooftop, 뷰, View → 활기찬, 데이트
- 이름/리뷰에 Pub, 펍 → 활기찬, 친구모임
- 리뷰에 조용, 혼자, 혼술 → 조용한, 혼술
- 리뷰에 데이트, 커플, 야경 → 로맨틱, 데이트
- 리뷰에 사워, Sour, 시트러스 → 신
- 리뷰에 달콤, 달달, 과일 → 달콤한
- 리뷰에 독하, 도수, 스트레이트 → 강한
- 다양한 바에 다양한 태그를 부여하고, 한 태그만 쏠리지 않도록 하세요.

바 이름: {name}
주소: {address}

[구글 리뷰]
{google_reviews}

[네이버 블로그 후기]
{blog_snippets}

[인스타그램 캡션]
{insta_captions}"""


def infer_from_name(name: str, address: str) -> dict:
    """Gemini 실패 시 바 이름/주소 기반 규칙 추론"""
    n = (name + " " + address).lower()

    def has(*words: str) -> bool:
        return any(w in n for w in words)

    # moodTags (1~2개)
    if has("jazz", "vinyl", "재즈", "뮤직", "music", "클래식", "classic"):
        mood = ["클래식", "조용한"]
    elif has("rooftop", "루프탑", "party", "파티", "night", "나잇", "클럽"):
        mood = ["활기찬", "힙한"]
    elif has("wine", "와인", "rose", "로즈", "로맨틱", "romantic"):
        mood = ["로맨틱", "조용한"]
    elif has("craft", "크래프트", "hip", "힙", "indie", "인디"):
        mood = ["힙한", "활기찬"]
    elif has("quiet", "조용", "숨은", "hidden", "speakeasy", "스피크이지"):
        mood = ["조용한", "클래식"]
    else:
        idx = ord(name[0]) % 5 if name else 0
        pairs = [["클래식", "조용한"], ["활기찬", "힙한"], ["힙한", "활기찬"], ["로맨틱", "조용한"], ["조용한", "클래식"]]
        mood = pairs[idx]

    # purposeTags (1~2개)
    if has("데이트", "date", "couple", "커플", "romantic", "wine", "와인"):
        purpose = ["데이트", "혼술"]
    elif has("pub", "펍", "party", "파티", "friends", "친구", "group"):
        purpose = ["친구모임", "비즈니스"]
    elif has("business", "비즈니스", "lounge", "라운지", "hotel", "호텔"):
        purpose = ["비즈니스", "데이트"]
    elif has("혼술", "solo", "혼자", "one"):
        purpose = ["혼술", "친구모임"]
    else:
        idx = (ord(name[0]) + 1) % 4 if name else 0
        pairs = [["혼술", "친구모임"], ["친구모임", "비즈니스"], ["데이트", "혼술"], ["비즈니스", "친구모임"]]
        purpose = pairs[idx]

    # cocktailStyles (1~2개)
    if has("whisky", "whiskey", "위스키", "bourbon", "버번", "scotch"):
        styles = ["강한", "쓴"]
    elif has("sour", "사워", "citrus", "시트러스", "lime", "라임"):
        styles = ["신", "가벼운"]
    elif has("sweet", "달콤", "과일", "fruit", "berry", "베리"):
        styles = ["달콤한", "가벼운"]
    elif has("negroni", "네그로니", "amaro", "bitter", "비터"):
        styles = ["쓴", "강한"]
    elif has("spritz", "스프리츠", "bubbly", "샴페인", "sparkling"):
        styles = ["가벼운", "달콤한"]
    elif has("craft", "크래프트", "gin", "진"):
        styles = ["신", "강한"]
    else:
        idx = ord(name[0]) % 5 if name else 0
        pairs = [["달콤한", "가벼운"], ["신", "가벼운"], ["쓴", "강한"], ["강한", "쓴"], ["가벼운", "달콤한"]]
        styles = pairs[idx]

    return {
        "moodTags": mood,
        "purposeTags": purpose,
        "cocktailStyles": styles,
        "signature": None,
        "description": f"{name[:12]} — 칵테일 바",
    }


async def analyze_bar(
    name: str,
    address: str,
    google_reviews: list[str],
    blog_snippets: list[str] | None = None,
    insta_captions: list[str] | None = None,
) -> dict:
    """Gemini API로 바 분위기/목적/칵테일 스타일 분석. 실패 시 이름 기반 추론"""
    def _fmt(items: list[str] | None, label: str) -> str:
        if not items:
            return f"{label} 없음"
        return "\n---\n".join(items[:5])

    prompt = PROMPT_TEMPLATE.format(
        name=name,
        address=address,
        google_reviews=_fmt(google_reviews, "구글 리뷰"),
        blog_snippets=_fmt(blog_snippets, "블로그 후기"),
        insta_captions=_fmt(insta_captions, "인스타 캡션"),
    )

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                GEMINI_URL,
                params={"key": GEMINI_API_KEY},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
                timeout=15,
            )
            if res.status_code == 429:
                # Rate limit: 이름 기반 추론으로 즉시 fallback
                print(f"[Gemini] 429 rate limit — 규칙 추론 사용: {name}")
                return infer_from_name(name, address)
            res.raise_for_status()
            text = res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            cleaned = text.replace("```json", "").replace("```", "").strip()
            result = json.loads(cleaned)
            # 빈 필드 보완
            if not result.get("cocktailStyles") or not result.get("purposeTags"):
                inferred = infer_from_name(name, address)
                if not result.get("cocktailStyles"):
                    result["cocktailStyles"] = inferred["cocktailStyles"]
                if not result.get("purposeTags"):
                    result["purposeTags"] = inferred["purposeTags"]
            return result
    except Exception as e:
        print(f"[Gemini] 실패 — 규칙 추론 사용: {name} ({type(e).__name__})")  # str(e)에 API 키 포함 URL이 들어갈 수 있음
        return infer_from_name(name, address)
