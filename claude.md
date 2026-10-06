# Cordial — AI 칵테일 추천 시스템

## 프로젝트 개요

B2C AI 칵테일 추천 앱. 감정 기반 추천, 보유 재료 매칭, 모의 제조 분석, 바 매칭 기능 제공.
비로그인/로그인 유저 모두 사용 가능하며, 로그인 유저는 취향 프로필 기반 개인화 추천을 받는다.

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (인라인 style 병용)
- **DB**: PostgreSQL (Supabase) + Prisma 7 ORM
- **Auth**: NextAuth v4 (Google, GitHub, credentials + PrismaAdapter)
- **AI**: Google Gemini API (`gemini-3.8-flash`)
- **FastAPI**: 바 데이터 수집 파이프라인 (`backend/`)

## 디렉토리 구조 (FSD)

```
src/
├── app/                      # Next.js App Router
│   ├── emotion/              # 감정 입력 (4단계 질문)
│   ├── recommend/            # 추천 결과 (Top 3)
│   ├── cocktail/[id]/        # 칵테일 상세
│   ├── pantry/               # 내 술장 (보유 재료 기반 추천)
│   ├── mix/                  # 모의 제조 (ABV 계산 + AI 맛 분석)
│   ├── bars/                 # 바 매칭 (기분/지역 필터)
│   ├── login/                # 로그인 (OAuth + credentials + 비로그인)
│   ├── home/                 # 홈 (모바일)
│   └── api/
│       ├── auth/[...nextauth]/  # NextAuth 핸들러
│       ├── auth/register/       # 회원가입
│       ├── ai/analyze-emotion/  # 감정 텍스트 → EmotionVector
│       ├── ai/recommend/        # EmotionVector → 칵테일 추천 3개
│       ├── ai/pantry-recommend/ # 보유 재료 → exact/almost/creative 섹션
│       ├── ai/mix-analyze/      # 재료+제조법 → ABV + Gemini 맛분석
│       ├── bars/                # 바 목록 (area/mood 필터)
│       └── user/profile/        # GET/PATCH 유저 취향 프로필
├── server/
│   └── ai/                   # Gemini API 호출 (server-only)
│       ├── analyzeEmotion.ts
│       ├── recommendCocktails.ts
│       ├── pantryRecommend.ts
│       └── mixAnalyze.ts
└── shared/
    ├── ui/                   # 공통 컴포넌트 (WebNav, GlassSilhouette, ...)
    ├── lib/                  # prisma.ts, supabase.ts
    └── types/                # 공통 타입 (index.ts)
```

## DB 스키마 핵심

```prisma
datasource db {
  provider = "postgresql"
  // Prisma 7: url은 schema에 없음. prisma.ts의 PrismaPg adapter로 전달
}

model User {
  drinkingCapacity DrinkingCapacity @default(MEDIUM)  // LOW/MEDIUM/HIGH
  sweetPref  Float @default(0.5)  // 0~1
  sourPref   Float @default(0.5)
  bitterPref Float @default(0.5)
  strongPref Float @default(0.5)
  freshPref  Float @default(0.5)
}

model Cocktail {
  abv        Float            // 알코올 도수 (%)
  popularity Float @default(0.5)  // 0~1
  // 맛 벡터: sweetness, sourness, bitterness, strength, freshness (0~1)
}

model EmotionLog {
  joy       Float
  sadness   Float
  stress    Float
  fatigue   Float
  excitement Float
  userId    String?  // nullable — 비로그인도 저장
}
```

## 감정 벡터

현재 차원: `{ joy, sadness, stress, fatigue, excitement }` (0~1)
(구버전 `happy/calm/excited/tired/stressed`는 완전 제거됨)

## 추천 점수 공식

- **비로그인**: `(0.4 × 감정유사도 + 0.1 × 인기도) / 0.5`
- **로그인**: `0.4×감정 + 0.2×취향 + 0.15×주량적합도 + 0.15×과거선호 + 0.1×인기도`

## ABV 계산 (mix-analyze)

```
기본도수 = Σ(용량 × 도수) / 전체용량
최종도수 = 기본도수 × (1 - 희석률)
희석률: shaking=0.30, stirring=0.225, build=0.125, blending=0.35, neat=0
```

## 주요 API Routes

```
POST /api/auth/register          # 회원가입
POST /api/ai/analyze-emotion     # 감정 분석 → EmotionVector
POST /api/ai/recommend           # EmotionVector → 칵테일 추천
POST /api/ai/pantry-recommend    # 보유 재료 → 칵테일 매칭
POST /api/ai/mix-analyze         # 재료+제조법 → ABV + 맛/향 분석
GET  /api/bars                   # 바 목록 (area, mood 쿼리 파라미터)
POST /api/bars/nearby            # 위치(lat,lng) → Google Maps 주변 바 조회 + DB 캐시
POST /api/bars/recommend         # 위치 + 설문(BarSurvey) → TOP 5 추천
GET  /api/bars/geocode           # 지역명 → 좌표 변환 (Google Geocoding)
GET  /api/user/profile           # 유저 취향 프로필 조회
PATCH /api/user/profile          # 유저 취향 프로필 수정
```

## 환경변수

```env
DATABASE_URL=           # Supabase pooled (pgbouncer)
DIRECT_URL=             # Supabase direct (migrations)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GEMINI_API_KEY=
GOOGLE_MAPS_API_KEY=    # 바 추천 기능
NAVER_CLIENT_ID=        # FastAPI 전용
NAVER_CLIENT_SECRET=    # FastAPI 전용
```

## 개발 컨벤션

- Gemini API 호출은 반드시 `src/server/ai/` 하위에서만
- `any` 금지, `unknown` + 타입가드 사용
- 타입은 `interface` 우선, 유니온/조건부는 `type`
- 컴포넌트: PascalCase `.tsx` / 훅: `use`로 시작 `.ts`
- AI 응답은 항상 JSON 파싱 실패에 대한 fallback 처리 필수
- import 순서: 외부 라이브러리 → `@/` 절대경로 → 상대경로

## 주요 명령어

```bash
npm run dev             # 개발 서버
npx prisma generate     # Prisma 클라이언트 재생성
npx prisma migrate dev  # DB 마이그레이션
npm run db:seed         # IBA 칵테일 20개 + 재료 30개 시드
npm run db:seed-bars    # 벡스코 주변 바 8개 시드 (시연용)

# FastAPI 바 파이프라인
cd backend && uvicorn main:app --reload
pip install -r backend/requirements.txt
```
