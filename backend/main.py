from dotenv import load_dotenv
load_dotenv()

import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import bars
from security import allow_insecure_dev, docs_enabled

logger = logging.getLogger("uvicorn.error")
if allow_insecure_dev():
    logger.warning("ALLOW_INSECURE_DEV=1: 인증 없이 동작할 수 있는 INSECURE 모드입니다. 로컬 개발에서만 사용하세요.")
if not os.getenv("INTERNAL_API_SECRET") and not allow_insecure_dev():
    logger.warning("INTERNAL_API_SECRET 미설정: 보호된 엔드포인트는 503 을 반환합니다.")

# ENVIRONMENT=development 또는 ALLOW_INSECURE_DEV=1 이 아니면 Swagger/ReDoc/OpenAPI 스키마 비노출
_docs = {} if docs_enabled() else {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(title="Cordial Bar Pipeline", version="1.0.0", **_docs)

# 이 서비스는 Next.js 서버(Vercel)에서 서버-to-서버로만 호출되며 CORS 는 서버 간 호출에 적용되지 않는다.
# 기본은 브라우저 origin 을 허용하지 않고(빈 목록), 필요할 때만 CORS_ORIGINS 로 명시한다. 자격증명은 허용하지 않는다.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Internal-Secret"],
)

_MAX_BODY_BYTES = 16 * 1024  # 이 서비스의 요청 body 는 작은 JSON 뿐


class BodySizeLimitMiddleware:
    """pure ASGI body 상한 — Content-Length 와 chunked 스트림 누적 바이트 모두 검사"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        for name, value in scope["headers"]:
            if name == b"content-length":
                try:
                    too_big = int(value) > _MAX_BODY_BYTES
                except ValueError:
                    too_big = True
                if too_big:
                    return await self._reject(send)

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > _MAX_BODY_BYTES:
                    raise _BodyTooLarge()
            return message

        started = False

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLarge:
            if not started:
                await self._reject(send)

    @staticmethod
    async def _reject(send):
        body = b'{"detail":"Payload too large"}'
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})


class _BodyTooLarge(Exception):
    pass


app.add_middleware(BodySizeLimitMiddleware)

app.include_router(bars.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
