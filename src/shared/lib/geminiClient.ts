import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");

/** 모델 ID 단일 출처. GEMINI_MODEL 환경변수로 덮어쓸 수 있음 (backend/services/gemini.py와 동일 기본값 유지). */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 4096;

export const genAI = new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });

/** 외부(스크랩/사용자) 텍스트를 프롬프트에 넣기 전 길이 제한 + 제어문자 제거 */
export function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

/** LLM 출력 문자열 정제: HTML 태그/URL 제거 후 길이 제한 */
export function sanitizeLlmText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** 숫자를 0~1 범위로 고정 (유효하지 않으면 null) */
export function clamp01(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/** JSON 응답 모드로 Gemini를 호출하고 원문 텍스트를 반환 (파싱은 호출자가 폴백과 함께 처리) */
export async function generateJsonText(prompt: string, systemInstruction?: string): Promise<string> {
  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(systemInstruction ? { systemInstruction } : {}),
    },
  });
  return response.text ?? "";
}

export function parseGeminiJson<T>(text: string): T {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const match = stripped.match(/[\[\{][\s\S]*[\]\}]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Gemini JSON 파싱 실패");
  }
}
