import axios from "axios";
import { signOut } from "next-auth/react";

export const ACCESS_TOKEN_KEY = "cordial_access_token";
export const ACCESS_TOKEN_USER_KEY = "cordial_access_token_uid";

export function clearStoredAccessToken() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_USER_KEY);
  } catch { /* ignore */ }
}

/** 로그아웃: refresh 쿠키/DB 토큰 폐기 → 클라이언트 access token 제거 → NextAuth 세션 종료 */
export async function logout(callbackUrl = "/") {
  try {
    await axios.post("/api/auth/logout", {}, { withCredentials: true });
  } catch { /* 서버 폐기 실패해도 로컬 로그아웃은 진행 */ }
  clearStoredAccessToken();
  await signOut({ callbackUrl });
}
