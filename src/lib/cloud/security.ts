import { createHash, randomBytes } from "node:crypto";
import { validateImportedDocument } from "@/lib/validation";
import type { MindMapDocument } from "@/types/mindmap";
import { CLOUD_DOCUMENT_MAX_BYTES, SHARE_TOKEN_PATTERN, type CloudErrorCode } from "./contracts";

export class CloudRequestError extends Error {
  constructor(public readonly status: number, public readonly code: CloudErrorCode, message: string, public readonly currentRevision?: number) {
    super(message);
    this.name = "CloudRequestError";
  }
}
export function invalidRequest(message = "요청 형식이 올바르지 않습니다."): never {
  throw new CloudRequestError(400, "INVALID_REQUEST", message);
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function requireCloudId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalidRequest("문서 ID가 올바르지 않습니다.");
  return value;
}
export function requireRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) invalidRequest("저장된 문서 버전이 필요합니다.");
  return value;
}
export function requireBearer(request: Request): string {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer ([^\s]+)$/i);
  if (!match || match[1].length > 16_384) throw new CloudRequestError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  return match[1];
}
export function createShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN_PATTERN.test(value);
}
export function validateCloudDocument(value: unknown): MindMapDocument {
  let size: number;
  try { size = Buffer.byteLength(JSON.stringify(value) ?? "", "utf8"); }
  catch { throw new CloudRequestError(400, "DOCUMENT_INVALID", "문서 JSON을 읽을 수 없습니다."); }
  if (size > CLOUD_DOCUMENT_MAX_BYTES) throw new CloudRequestError(413, "DOCUMENT_TOO_LARGE", "클라우드 문서는 4MB 이하여야 합니다. JSON으로 내보내거나 로컬 문서로 보관해 주세요.");
  const result = validateImportedDocument(value);
  if (!result.ok) throw new CloudRequestError(400, "DOCUMENT_INVALID", result.error);
  // Defaults added during validation must also fit the hosted response limit.
  if (Buffer.byteLength(JSON.stringify(result.document), "utf8") > CLOUD_DOCUMENT_MAX_BYTES)
    throw new CloudRequestError(413, "DOCUMENT_TOO_LARGE", "클라우드 문서는 4MB 이하여야 합니다. JSON으로 내보내거나 로컬 문서로 보관해 주세요.");
  return result.document;
}

/** Configuration sanity only. Owner JWT authorization always uses auth.getUser. */
export function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    return isObject(payload) && payload.role === "anon";
  } catch { return false; }
}
