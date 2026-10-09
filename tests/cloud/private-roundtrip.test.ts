import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { exportDocumentJson } from "../../src/lib/export";
import { parseImportJson } from "../../src/lib/validation";
import { appearanceFrom } from "../../src/lib/appearance";
import { WORKSPACE_VERSION } from "../../src/lib/constants";
import { clearWorkspaceStorage, loadWorkspaceFromStorage, saveWorkspaceToStorage, workspaceStorageKey } from "../../src/lib/storage";
import { toSharedCloudDocument } from "../../src/lib/cloud/projection";
import { handleCloudDocuments, handleCloudShare, handleSharedCloudDocument } from "../../src/lib/cloud/server";
import type { CloudDocumentRecord, SharedCloudDocument } from "../../src/lib/cloud/contracts";
import type { MindMapDocument, MindMapWorkspace } from "../../src/types/mindmap";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OWNER_TOKEN = "synthetic-private-fixture-owner";
const OTHER_TOKEN = "synthetic-private-fixture-other";
const HOST = "private-fixture-test.supabase.co";
const RECORD_COLUMNS = "id,document,revision,updated_at,share_enabled";
const contentFields = ["id", "title", "nodes", "edges", "relations", "boardMode", "ink", "inkSettings",
  "appearance", "layoutMode", "viewport", "pinned", "createdAt", "snapshots"] as const;

// Boolean comparisons deliberately keep private labels, node IDs and document
// bodies out of assertion diagnostics, including on a failing regression.
function sameJson(actual: unknown, expected: unknown, label: string) {
  const json = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  assert.ok(isDeepStrictEqual(json(actual), json(expected)), `${label} JSON parity failed`);
}
function sameDocument(actual: MindMapDocument, expected: MindMapDocument, label: string) {
  for (const field of contentFields) sameJson(actual[field], expected[field], `${label}: ${field}`);
}
function importDocument(text: string): MindMapDocument {
  const imported = parseImportJson(text);
  assert.ok(imported.ok, "private fixture import failed");
  return imported.document;
}
function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}
function routeRequest(body: unknown, bearer?: string) {
  return new Request("https://mmap.example/api/cloud/private-regression", {
    method: "POST", headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
}

// The existing persistence implementation executes against an in-memory
// localStorage implementation; no browser profile or user storage is touched.
function localStorageRoundTrip(document: MindMapDocument): MindMapDocument {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  let reads = 0;
  globalThis.window = { localStorage: {
    getItem: (key: string) => { reads++; return storage.get(key) ?? null; },
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } } as unknown as Window & typeof globalThis;
  try {
    const workspace: MindMapWorkspace = { version: WORKSPACE_VERSION, documents: [document], activeDocumentId: document.id,
      ...appearanceFrom(document.appearance), sidebarCollapsed: false, inspectorOpen: true };
    assert.ok(saveWorkspaceToStorage(workspace).ok, "private fixture local save failed");
    assert.equal(storage.size, 1, "existing local save must write its workspace key");
    assert.ok(storage.has(workspaceStorageKey()), "existing local save must write the local workspace");
    const loaded = loadWorkspaceFromStorage();
    assert.ok(loaded.ok, "private fixture local reload failed");
    assert.equal(loaded.droppedDocs, 0, "private fixture must not be dropped on local reload");
    assert.equal(loaded.workspace.documents.length, 1);
    assert.equal(reads, 1, "local reload must read the stubbed persistent storage");
    sameJson(loaded.workspace.activeDocumentId, document.id, "local active document");
    const restored = loaded.workspace.documents[0];
    sameDocument(restored, document, "existing local save/reload");
    sameJson(restored.updatedAt, document.updatedAt, "local save/reload updatedAt");
    return restored;
  } finally {
    clearWorkspaceStorage();
    globalThis.window = previousWindow;
  }
}

test("optional private 749-node fixture survives real migration/RLS and server-handler round trips", {
  skip: !process.env.MMAP_PRIVATE_FIXTURE,
}, async (t) => {
  const fixturePath = process.env.MMAP_PRIVATE_FIXTURE!;
  const sourceBytes = readFileSync(fixturePath);
  const originalDigest = createHash("sha256").update(sourceBytes).digest("hex");
  assert.equal((JSON.parse(sourceBytes.toString("utf8")) as { version: number }).version, 4, "private source envelope version");
  const source = importDocument(sourceBytes.toString("utf8"));
  assert.equal(source.nodes.length, 749);
  assert.equal(source.edges.length, 748);

  const db = new PGlite();
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const transportCounts = { auth: 0, insert: 0, get: 0, update: 0, delete: 0, share: 0, publicRead: 0 };
  const asRole = async (ownerId?: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)",
      [ownerId ?? "", JSON.stringify({ sub: ownerId ?? "", is_anonymous: false })]);
    await db.exec(ownerId ? "set role authenticated" : "set role anon");
  };

  try {
    await db.exec(`
      create role anon noinherit;
      create role authenticated noinherit;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
      $$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
      insert into auth.users values ('${OWNER}'),('${OTHER}');
    `);
    const migration = readdirSync("supabase/migrations").find((name) => name.endsWith("_cloud_documents_and_revocable_shares.sql"));
    assert.ok(migration, "staged cloud migration missing");
    await db.exec(readFileSync(path.join("supabase/migrations", migration), "utf8"));
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${HOST}`;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_private_fixture_test";

    // This adapter replaces only Supabase HTTP transport. The production
    // handlers, SDK, validators, SQL, grants, RLS, triggers and RPC functions
    // all execute. It does not emulate live Auth JWT verification or PostgREST.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(url.host, HOST, "private regression must not make network requests");
      const headers = new Headers(init?.headers);
      const ownerId = headers.get("authorization") === `Bearer ${OWNER_TOKEN}` ? OWNER
        : headers.get("authorization") === `Bearer ${OTHER_TOKEN}` ? OTHER : undefined;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
      if (url.pathname === "/auth/v1/user") {
        transportCounts.auth++;
        return ownerId ? jsonResponse({ id: ownerId, aud: "authenticated", role: "authenticated", is_anonymous: false,
          app_metadata: { provider: "google" }, user_metadata: {}, created_at: "2026-01-01" })
          : jsonResponse({ message: "synthetic invalid token" }, 401);
      }
      await asRole(ownerId);
      if (url.pathname === "/rest/v1/rpc/mmap_set_document_share") {
        transportCounts.share++;
        const result = await db.query<{ result: boolean }>("select public.mmap_set_document_share($1,$2) as result", [body.p_document_id, body.p_token_hash]);
        return jsonResponse(result.rows[0].result);
      }
      if (url.pathname === "/rest/v1/rpc/mmap_get_shared_document") {
        transportCounts.publicRead++;
        assert.equal(ownerId, undefined, "public lookup must use a fresh anonymous client");
        const result = await db.query<{ document: unknown }>("select public.mmap_get_shared_document($1) as document", [body.p_token]);
        return jsonResponse(result.rows[0].document);
      }
      assert.equal(url.pathname, "/rest/v1/cloud_documents", "unexpected local transport path");
      const select = url.searchParams.get("select");
      assert.ok([RECORD_COLUMNS, "revision", "id"].includes(select ?? ""), "unexpected local transport columns");
      const eq = (key: string) => {
        const value = url.searchParams.get(key);
        assert.ok(value && value.startsWith("eq."), "expected route ownership/revision predicate");
        return value.slice(3);
      };
      let rows: Record<string, unknown>[];
      const method = init?.method ?? "GET";
      if (method === "POST") {
        transportCounts.insert++;
        rows = (await db.query<Record<string, unknown>>(`insert into public.cloud_documents(id,owner_id,document) values ($1,$2,$3) returning ${RECORD_COLUMNS}`,
          [body.id, body.owner_id, body.document])).rows;
      } else if (method === "PATCH") {
        transportCounts.update++;
        rows = (await db.query<Record<string, unknown>>(`update public.cloud_documents set document=$1 where id=$2 and owner_id=$3 and revision=$4 returning ${RECORD_COLUMNS}`,
          [body.document, eq("id"), eq("owner_id"), eq("revision")])).rows;
      } else if (method === "DELETE") {
        transportCounts.delete++;
        rows = (await db.query<Record<string, unknown>>("delete from public.cloud_documents where id=$1 and owner_id=$2 and revision=$3 returning id",
          [eq("id"), eq("owner_id"), eq("revision")])).rows;
      } else {
        assert.equal(method, "GET", "unexpected local transport method");
        transportCounts.get++;
        rows = (await db.query<Record<string, unknown>>(`select ${select} from public.cloud_documents where id=$1 and owner_id=$2`,
          [eq("id"), eq("owner_id")])).rows;
      }
      return jsonResponse(headers.get("accept")?.includes("application/vnd.pgrst.object+json") ? rows[0] ?? null : rows,
        method === "POST" ? 201 : 200);
    }) as typeof fetch;

    async function ownerRecord(body: unknown, status = 200): Promise<CloudDocumentRecord> {
      const response = await handleCloudDocuments(routeRequest(body, OWNER_TOKEN));
      assert.equal(response.status, status, "private fixture owner route status");
      assert.ok(response.headers.get("cache-control")?.includes("no-store"));
      return (await response.json() as { record: CloudDocumentRecord }).record;
    }
    async function roundTrip(document: MindMapDocument, label: string, version: number) {
      const exported = exportDocumentJson(document);
      assert.equal((JSON.parse(exported) as { version: number }).version, version, `${label}: exported envelope version`);
      const exportedImport = importDocument(exported);
      sameDocument(exportedImport, document, `${label}: export/import`);
      const created = await ownerRecord({ action: "save", document: JSON.parse(exported) }, 201);
      assert.equal(created.revision, 1);
      sameDocument(created.document, exportedImport, `${label}: create response`);
      const fetched = await ownerRecord({ action: "get", id: created.id });
      sameDocument(fetched.document, exportedImport, `${label}: owner fetch`);
      sameJson(fetched.document.updatedAt, created.document.updatedAt, `${label}: persisted updatedAt`);

      const edited = structuredClone(fetched.document);
      edited.nodes[0].data.collapsed = !edited.nodes[0].data.collapsed;
      const saved = await ownerRecord({ action: "save", id: created.id, expectedRevision: fetched.revision,
        document: JSON.parse(exportDocumentJson(edited)) });
      assert.equal(saved.revision, 2);
      sameDocument(saved.document, edited, `${label}: update response`);
      const savedFetch = await ownerRecord({ action: "get", id: created.id });
      sameDocument(savedFetch.document, edited, `${label}: updated owner fetch`);
      sameJson(savedFetch.document.updatedAt, saved.document.updatedAt, `${label}: updated timestamp`);
      await asRole(OWNER);
      const stored = (await db.query<{ document: MindMapDocument }>("select document from public.cloud_documents where id=$1", [created.id])).rows[0].document;
      sameDocument(stored, saved.document, `${label}: actual persisted JSONB`);

      const otherResponse = await handleCloudDocuments(routeRequest({ action: "get", id: created.id }, OTHER_TOKEN));
      assert.equal(otherResponse.status, 404, `${label}: other owner cannot fetch`);
      const shareResponse = await handleCloudShare(routeRequest({ id: created.id, action: "enable" }, OWNER_TOKEN));
      assert.equal(shareResponse.status, 200, `${label}: share route status`);
      const share = await shareResponse.json() as { enabled: boolean; token: string };
      assert.equal(share.enabled, true);
      assert.equal(typeof share.token, "string");
      const publicResponse = await handleSharedCloudDocument(routeRequest({ token: share.token }));
      assert.equal(publicResponse.status, 200, `${label}: public route status`);
      const publicDocument = (await publicResponse.json() as { document: SharedCloudDocument }).document;
      sameJson(publicDocument, toSharedCloudDocument(saved.document), `${label}: public display projection`);
      assert.equal(publicDocument.nodes.length, 749);
      assert.equal(publicDocument.edges.length, 748);
      for (const key of ["id", "createdAt", "updatedAt", "snapshots", "owner_id", "token_hash", "inkSettings"])
        assert.equal(key in publicDocument, false, `${label}: private field excluded`);
      for (const node of publicDocument.nodes)
        for (const key of ["linkedDocId", "backDocId", "backNodeId"])
          assert.equal(key in node.data, false, `${label}: private navigation excluded`);
      await asRole();
      const sqlPublic = (await db.query<{ document: SharedCloudDocument }>("select public.mmap_get_shared_document($1) as document", [share.token])).rows[0].document;
      sameJson(sqlPublic, toSharedCloudDocument(saved.document), `${label}: actual anonymous SQL projection`);
      await assert.rejects(db.query("select document from public.cloud_documents where id=$1", [created.id]), /permission denied/);
      const finalOwner = await ownerRecord({ action: "get", id: created.id });
      assert.equal(finalOwner.shareEnabled, true);
      assert.equal(finalOwner.revision, 2, `${label}: sharing must not change content revision`);
      sameDocument(finalOwner.document, saved.document, `${label}: sharing preserves private owner content`);
      const revoked = await handleCloudShare(routeRequest({ id: created.id, action: "revoke" }, OWNER_TOKEN));
      assert.equal(revoked.status, 200);
      assert.equal((await handleSharedCloudDocument(routeRequest({ token: share.token }))).status, 404);
      const deleted = await handleCloudDocuments(routeRequest({ action: "delete", id: created.id, expectedRevision: 2 }, OWNER_TOKEN));
      assert.equal(deleted.status, 200);
    }

    await t.test("original v4 import/local save and server cloud/share round trip preserve content", async () => {
      const restored = localStorageRoundTrip(source);
      await roundTrip(restored, "original fixture", 4);
    });
    await t.test("in-memory v6 derivative preserves original content with ink v4 and a private snapshot", async () => {
      const derivative = structuredClone(source);
      derivative.ink = { version: 4, strokes: [{ id: "synthetic-regression-ink", color: "#2563eb", width: 4,
        points: [{ x: 0, y: 0, pressure: .5 }, { x: 10, y: 10, pressure: 1 }], materialStyle: "grain-v1",
        erasures: [{ radius: 2, points: [{ x: 5, y: 5 }] }] }] };
      derivative.snapshots = [{ id: "synthetic-regression-snapshot", label: "Synthetic regression snapshot", createdAt: "2026-01-01",
        nodes: structuredClone(source.nodes), edges: structuredClone(source.edges), relations: structuredClone(source.relations),
        layoutMode: source.layoutMode, boardMode: source.boardMode, ink: structuredClone(derivative.ink) }];
      sameJson(derivative.nodes, source.nodes, "v6 derivative retains original nodes");
      sameJson(derivative.edges, source.edges, "v6 derivative retains original edges");
      sameJson(derivative.appearance, source.appearance, "v6 derivative retains original appearance");
      await roundTrip(derivative, "v6 derivative", 6);
    });
    assert.ok(transportCounts.auth >= 10 && transportCounts.insert === 2 && transportCounts.update === 2
      && transportCounts.delete === 2 && transportCounts.share === 4 && transportCounts.publicRead === 4,
    "expected production handlers must reach real local SQL through the transport adapter");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
    await db.close();
    const finalDigest = createHash("sha256").update(readFileSync(fixturePath)).digest("hex");
    assert.equal(finalDigest, originalDigest, "private source file must remain unchanged");
  }
});
