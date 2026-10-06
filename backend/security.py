import hmac
import os

from fastapi import Header, HTTPException


def allow_insecure_dev() -> bool:
    """ALLOW_INSECURE_DEV=1 일 때만 INTERNAL_API_SECRET 없이 동작 (로컬 개발 전용)."""
    return os.getenv("ALLOW_INSECURE_DEV") == "1"


def docs_enabled() -> bool:
    """Swagger/ReDoc 은 ENVIRONMENT=development 또는 ALLOW_INSECURE_DEV=1 일 때만 노출."""
    return (os.getenv("ENVIRONMENT") or "").lower() == "development" or allow_insecure_dev()


async def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    """서버-to-서버 공유 시크릿 검증 (X-Internal-Secret == INTERNAL_API_SECRET).
    시크릿 미설정이면 fail closed (503). ALLOW_INSECURE_DEV=1 로 명시한 경우에만 허용."""
    expected = os.getenv("INTERNAL_API_SECRET", "")
    if not expected:
        if allow_insecure_dev():
            return
        raise HTTPException(status_code=503, detail="Service not configured")
    provided = x_internal_secret or ""
    if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Unauthorized")
