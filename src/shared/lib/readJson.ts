import { NextRequest, NextResponse } from "next/server";

export const MAX_JSON_BODY_BYTES = 64 * 1024;

export type JsonBodyResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; response: NextResponse };

function fail(status: number, error: string): JsonBodyResult {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * 요청 body 를 바이트 상한(기본 64KB)까지만 스트리밍으로 읽어 JSON 객체로 파싱한다.
 * App Router route handler 는 기본 body 제한이 없어서 req.json() 은 메모리 고갈 DoS 에 노출된다.
 * - Content-Length 가 상한을 넘으면 읽지 않고 413
 * - chunked 등 Content-Length 가 없거나 거짓이어도 누적 바이트가 상한을 넘으면 즉시 중단 후 413
 * - 최상위가 JSON 객체가 아니면(배열/null/원시값) 400
 */
export async function readJsonBody(
  req: NextRequest,
  maxBytes: number = MAX_JSON_BODY_BYTES
): Promise<JsonBodyResult> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return fail(413, "요청 본문이 너무 큽니다.");
  }

  const reader = req.body?.getReader();
  if (!reader) return fail(400, "잘못된 요청입니다.");

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return fail(413, "요청 본문이 너무 큽니다.");
      }
      chunks.push(value);
    }
  } catch {
    return fail(400, "잘못된 요청입니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return fail(400, "잘못된 JSON 입니다.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail(400, "잘못된 요청입니다.");
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}
