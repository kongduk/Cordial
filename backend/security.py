import hmac
import os

from fastapi import Header, HTTPException


def is_production() -> bool:
    env = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "").lower()
    return env in ("production", "prod") or bool(os.getenv("RAILWAY_ENVIRONMENT"))


async def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    """서버-to-서버 공유 시크릿 검증 (X-Internal-Secret == INTERNAL_API_SECRET).
    프로덕션에서 시크릿 미설정이면 fail closed (503). 로컬 개발에서만 미설정 허용."""
    expected = os.getenv("INTERNAL_API_SECRET", "")
    if not expected:
        if is_production():
            raise HTTPException(status_code=503, detail="Service not configured")
        return
    provided = x_internal_secret or ""
    if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Unauthorized")
