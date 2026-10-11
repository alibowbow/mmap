import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { MindMapDocument } from "@/types/mindmap";
import {
  CLOUD_REQUEST_MAX_BYTES,
  type CloudDocumentRecord,
  type CloudDocumentSummary,
  type CloudErrorResponse,
} from "./contracts";
import { toSharedCloudDocument } from "./projection";
import {
  CloudRequestError, createShareToken, invalidRequest, isObject, isShareToken,
  requireBearer, requireCloudId, requireRevision, validateCloudDocument, isPublicSupabaseKey,
} from "./security";

const RECORD_COLUMNS = "id,document,revision,updated_at,share_enabled";
const SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export function cloudJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: SECURITY_HEADERS });
}
export function cloudError(error: unknown): Response {
  const known = error instanceof CloudRequestError ? error : new CloudRequestError(503, "CLOUD_REQUEST_FAILED", "클라우드에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const body: CloudErrorResponse = { error: { code: known.code, message: known.message,
    ...(known.currentRevision !== undefined ? { currentRevision: known.currentRevision } : {}) } };
  // Never log request bodies, documents, JWTs, raw tokens or upstream errors.
  return cloudJson(body, known.status);
}
export async function readCloudBody(request: Request, maxBytes = CLOUD_REQUEST_MAX_BYTES): Promise<Record<string, unknown>> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") invalidRequest("JSON 형식의 요청이 필요합니다.");
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) throw new CloudRequestError(413, "DOCUMENT_TOO_LARGE", "요청 용량이 너무 큽니다.");
  if (!request.body) invalidRequest();
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new CloudRequestError(413, "DOCUMENT_TOO_LARGE", "요청 용량이 너무 큽니다.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text, (key, value) => key === "__proto__" ? undefined : value);
    if (!isObject(body)) invalidRequest();
    return body;
  } catch (error) {
    if (error instanceof CloudRequestError) throw error;
    invalidRequest("JSON 요청을 읽을 수 없습니다.");
  } finally { reader.releaseLock(); }
}

export function makeCloudClient(token?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !isPublicSupabaseKey(key)) throw new CloudRequestError(503, "CLOUD_UNAVAILABLE", "클라우드 연결 설정이 필요합니다.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) }),
    },
  });
}
export async function requireCloudOwner(request: Request) {
  const token = requireBearer(request);
  const client = makeCloudClient(token);
  // getUser validates the token with Supabase Auth; never trust decoded JWTs or getSession.
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new CloudRequestError(401, "UNAUTHORIZED", "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  return { client, ownerId: data.user.id };
}
function databaseFailure(error: unknown): never {
  if (isObject(error) && error.code === "23514" && typeof error.message === "string") {
    if (error.message.includes("cloud_document_size"))
      throw new CloudRequestError(413, "DOCUMENT_TOO_LARGE", "클라우드 문서는 4MB 이하여야 합니다. JSON으로 내보내거나 로컬 문서로 보관해 주세요.");
    if (error.message.includes("cloud_document_shape"))
      throw new CloudRequestError(400, "DOCUMENT_INVALID", "문서 형식이 올바르지 않습니다.");
  }
  throw error;
}
function notFound(): never {
  throw new CloudRequestError(404, "DOCUMENT_NOT_FOUND", "문서를 찾을 수 없습니다.");
}
function recordFromRow(row: Record<string, unknown>): CloudDocumentRecord {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid revision");
  const document = validateCloudDocument(row.document);
  // Validation normalizes updatedAt for import; owner fetch must preserve the stored value.
  if (isObject(row.document) && typeof row.document.updatedAt === "string") document.updatedAt = row.document.updatedAt;
  return { id: String(row.id), document, revision, updatedAt: String(row.updated_at), shareEnabled: row.share_enabled === true };
}
async function revisionMiss(client: SupabaseClient, id: string, ownerId: string): Promise<never> {
  const { data, error } = await client.from("cloud_documents").select("revision").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) databaseFailure(error);
  if (!data) notFound();
  throw new CloudRequestError(409, "REVISION_CONFLICT", "다른 기기에서 수정된 문서입니다. 최신 버전을 불러오거나 사본으로 저장해 주세요.", Number(data.revision));
}

/** Only the bearer user's RLS-scoped client reaches owner data. */
export async function handleCloudDocuments(request: Request): Promise<Response> {
  try {
    const { client, ownerId } = await requireCloudOwner(request);
    const body = await readCloudBody(request);
    if (body.action === "list") {
      // Range pagination avoids silently truncating the library at PostgREST's row cap.
      const documents: CloudDocumentSummary[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await client.from("cloud_documents")
          .select("id,title:document->>title,revision,updated_at,share_enabled")
          .eq("owner_id", ownerId).order("updated_at", { ascending: false }).order("id")
          .range(start, start + 499);
        if (error) databaseFailure(error);
        for (const row of data ?? []) documents.push({ id: row.id, title: row.title ?? "제목 없는 문서", revision: Number(row.revision), updatedAt: row.updated_at, shareEnabled: row.share_enabled === true });
        if (!data || data.length < 500) break;
      }
      return cloudJson({ documents });
    }
    if (body.action === "get") {
      const id = requireCloudId(body.id);
      const { data, error } = await client.from("cloud_documents").select(RECORD_COLUMNS).eq("id", id).eq("owner_id", ownerId).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) notFound();
      return cloudJson({ record: recordFromRow(data) });
    }
    if (body.action === "save") {
      const document: MindMapDocument = validateCloudDocument(body.document);
      if (body.id === undefined) {
        if (body.expectedRevision !== undefined) invalidRequest();
        const { data, error } = await client.from("cloud_documents")
          .insert({ id: randomUUID(), owner_id: ownerId, document }).select(RECORD_COLUMNS).single();
        if (error) databaseFailure(error);
        return cloudJson({ record: recordFromRow(data) }, 201);
      }
      const id = requireCloudId(body.id), revision = requireRevision(body.expectedRevision);
      const { data, error } = await client.from("cloud_documents").update({ document })
        .eq("id", id).eq("owner_id", ownerId).eq("revision", revision).select(RECORD_COLUMNS).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) return await revisionMiss(client, id, ownerId);
      return cloudJson({ record: recordFromRow(data) });
    }
    if (body.action === "delete") {
      const id = requireCloudId(body.id), revision = requireRevision(body.expectedRevision);
      const { data, error } = await client.from("cloud_documents").delete()
        .eq("id", id).eq("owner_id", ownerId).eq("revision", revision).select("id").maybeSingle();
      if (error) databaseFailure(error);
      if (!data) return await revisionMiss(client, id, ownerId);
      return cloudJson({ deleted: true });
    }
    invalidRequest();
  } catch (error) { return cloudError(error); }
}

export async function handleCloudShare(request: Request): Promise<Response> {
  try {
    const { client } = await requireCloudOwner(request);
    const body = await readCloudBody(request, 4096);
    const id = requireCloudId(body.id);
    if (body.action !== "enable" && body.action !== "rotate" && body.action !== "revoke") invalidRequest();
    const sharing = body.action === "revoke" ? undefined : createShareToken();
    const { data, error } = await client.rpc("mmap_set_document_share", { p_document_id: id, p_token_hash: sharing?.hash ?? null });
    if (error) databaseFailure(error);
    if (data !== true) notFound();
    return cloudJson({ enabled: !!sharing, ...(sharing ? { token: sharing.token } : {}) });
  } catch (error) { return cloudError(error); }
}
function shareNotFound(): never {
  throw new CloudRequestError(404, "SHARE_NOT_FOUND", "공유 링크를 찾을 수 없거나 만료되었습니다.");
}
export async function handleSharedCloudDocument(request: Request): Promise<Response> {
  try {
    const body = await readCloudBody(request, 4096);
    if (!isShareToken(body.token)) shareNotFound();
    // A fresh anonymous client is deliberate: no owner session/cookies/service key.
    // The raw capability travels only in POST bodies; the database hashes it.
    const client = makeCloudClient();
    const { data, error } = await client.rpc("mmap_get_shared_document", { p_token: body.token });
    if (error) databaseFailure(error);
    if (!data) shareNotFound();
    const document = validateCloudDocument(data);
    return cloudJson({ document: toSharedCloudDocument(document) });
  } catch (error) { return cloudError(error); }
}
