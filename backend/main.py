from dotenv import load_dotenv
load_dotenv()

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import bars
from security import is_production

# 프로덕션에서는 Swagger/ReDoc/OpenAPI 스키마 비노출
_docs = {} if not is_production() else {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(title="Cordial Bar Pipeline", version="1.0.0", **_docs)

# 이 서비스는 Next.js 서버에서 서버-to-서버로만 호출된다. 브라우저 직접 호출은 불필요하므로
# 기본은 로컬 개발 origin만 허용하고, 쿠키/자격증명은 허용하지 않는다.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Internal-Secret"],
)

app.include_router(bars.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
