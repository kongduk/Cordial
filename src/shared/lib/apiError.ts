import axios from "axios";

/** API 응답의 한국어 `error` 메시지를 우선 사용하고, 없으면 상태별 기본 문구 → fallback 순으로 반환 */
export function getApiErrorMessage(e: unknown, fallback = "잠시 후 다시 시도해 주세요."): string {
  if (axios.isAxiosError(e)) {
    const data: unknown = e.response?.data;
    if (data && typeof data === "object" && "error" in data) {
      const msg = (data as { error?: unknown }).error;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    const status = e.response?.status;
    if (status === 429) return "요청이 많아 잠시 이용이 제한됐어요. 잠시 후 다시 시도해 주세요.";
    if (status === 401) return "로그인이 필요해요.";
    if (status && status >= 500) return "서버에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
    if (!e.response) return "네트워크 연결을 확인해 주세요.";
  }
  return fallback;
}

/** fetch Response 에서 한국어 `error` 메시지를 꺼낸다 (실패 시 fallback) */
export async function getFetchErrorMessage(res: Response, fallback = "잠시 후 다시 시도해 주세요."): Promise<string> {
  try {
    const data: unknown = await res.clone().json();
    if (data && typeof data === "object" && "error" in data) {
      const msg = (data as { error?: unknown }).error;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
  } catch {
    /* JSON 아님 */
  }
  if (res.status === 429) return "요청이 많아 잠시 이용이 제한됐어요. 잠시 후 다시 시도해 주세요.";
  return fallback;
}

/** 재시도해도 소용없는(한도 초과) 오류인지 */
export function isRateLimited(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 429;
}
