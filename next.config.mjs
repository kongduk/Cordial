const isDev = process.env.NODE_ENV !== "production";

// 이미지 호스트 (칵테일: TheCocktailDB/Wikimedia, 바: Google Places 사진, 아바타: Google/GitHub/Naver)
// 앱은 next/image 대신 일반 <img>를 사용하므로 CSP img-src가 실질적인 제한이고, remotePatterns는 동일 목록으로 방어적으로 유지.
const imageHosts = [
  "www.thecocktaildb.com",
  "upload.wikimedia.org",
  "maps.googleapis.com",
  "places.googleapis.com",
  "lh3.googleusercontent.com",
  "avatars.githubusercontent.com",
  "phinf.pstatic.net",
];

// CSP 메모
// - script-src 'unsafe-inline': Next.js 14 App Router는 RSC 페이로드/부트스트랩용 인라인 <script>를 출력한다.
//   nonce 방식은 모든 페이지를 동적 렌더링으로 강제하므로(정적 최적화 상실) 여기서는 사용하지 않는다.
// - 개발 모드에서만 'unsafe-eval' 허용 (React Refresh/HMR).
// - style-src 'unsafe-inline': 컴포넌트 전반의 인라인 style 속성 및 Google Maps가 주입하는 스타일.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://*.googleapis.com https://maps.gstatic.com https://*.gstatic.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://maps.googleapis.com",
  `img-src 'self' data: blob: ${imageHosts.map((h) => `https://${h}`).join(" ")} https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com https://*.google.com`,
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  `connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://vitals.vercel-insights.com https://va.vercel-scripts.com${isDev ? " ws: wss:" : ""}`,
  "frame-src 'self' https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://github.com https://nid.naver.com",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https", hostname })),
  },
};

export default nextConfig;
