"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MindMapDocument } from "@/types/mindmap";
import { exportDocumentJson } from "@/lib/export";

import { CLOUD_DOCUMENT_MAX_BYTES } from "@/lib/cloud/contracts";
export type { CloudDocumentRecord, CloudDocumentSummary } from "@/lib/cloud/contracts";

let client: SupabaseClient | null = null;
export function isSafePublicCloudKey(key: string | undefined): boolean {
  if (!key || key.startsWith("sb_secret_")) return false;
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "anon";
  } catch { return false; }
}

export function cloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && isSafePublicCloudKey(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ));
}

export function getCloudClient(): SupabaseClient | null {
  if (typeof window === "undefined" || !cloudConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } },
    );
  }
  return client;
}

export class CloudError extends Error {
  constructor(public code: string, message: string, public status = 0, public currentRevision?: number) {
    super(message);
    this.name = "CloudError";
  }
}

// Authorize with the current session immediately before each request. A queued
// write from account A is never sent using account B's token after a switch.
export async function cloudRequest<T>(
  ownerId: string,
  path: "documents" | "share",
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const supabase = getCloudClient();
  if (!supabase) throw new CloudError("NOT_CONFIGURED", "클라우드 연결 설정이 아직 준비되지 않았습니다.");
  const { data, error } = await supabase.auth.getSession();
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  if (error || !data.session || data.session.user.id !== ownerId ||
    (data.session.expires_at && data.session.expires_at * 1000 <= Date.now())) {
    throw new CloudError("UNAUTHENTICATED", "로그인이 만료되었습니다. 다시 로그인해 주세요.", 401);
  }
  if (body.action === "save" && new TextEncoder().encode(JSON.stringify(body.document)).byteLength > CLOUD_DOCUMENT_MAX_BYTES) {
    throw new CloudError("DOCUMENT_TOO_LARGE", "클라우드 문서는 4MB 이하여야 합니다. JSON으로 내보내거나 로컬 문서로 보관해 주세요.", 413);
  }
  const timeout = new AbortController();
  const cancel = () => timeout.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => timeout.abort(new DOMException("Request timed out", "TimeoutError")), 25_000);
  try {
  const response = await fetch(`/api/cloud/${path}`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
    signal: timeout.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CloudError(payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "클라우드 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      response.status, payload?.error?.currentRevision);
  }
  if (!payload || typeof payload !== "object") throw new CloudError("INVALID_RESPONSE", "클라우드 응답을 확인할 수 없습니다.");
  return payload as T;
  } catch (error) {
    if (timeout.signal.aborted && !signal?.aborted) {
      throw new CloudError("REQUEST_TIMEOUT", "클라우드 응답이 늦어 저장 대기 내용을 보관했습니다. 다시 시도해 주세요.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

// Use the existing v4/v5/v6 exporter, including all ink v4 and appearance fields.
export function cloudDocumentPayload(document: MindMapDocument): unknown {
  return JSON.parse(exportDocumentJson(document));
}
