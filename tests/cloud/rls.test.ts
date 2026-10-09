import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { portableFixture } from "../io/fixture";
import { hashShareToken } from "../../src/lib/cloud/security";
import { projectJson, SHARED_DOCUMENT_PROJECTION } from "../../src/lib/cloud/projection";
import { CLOUD_DOCUMENT_MAX_BYTES } from "../../src/lib/cloud/contracts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_DOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "A".repeat(43), ROTATED = "B".repeat(43);

test("staged migration enforces actual PostgreSQL RLS, grants, revisions and revocable capabilities", async (t) => {
  const db = new PGlite();
  await db.exec(`
    create role anon noinherit;
    create role authenticated noinherit;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on function auth.jwt() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  const migration = readdirSync("supabase/migrations").find((name) => name.endsWith("_cloud_documents_and_revocable_shares.sql"))!;
  const sql = readFileSync(path.join("supabase/migrations", migration), "utf8");
  assert.ok(sql.includes(JSON.stringify(SHARED_DOCUMENT_PROJECTION)), "SQL and TypeScript allowlists must stay identical");
  await db.exec(sql);
  const asRole = async (role: "anon" | "authenticated", uid = "", isAnonymous: boolean | null = false) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, ...(isAnonymous === null ? {} : { is_anonymous: isAnonymous }) })]);
    await db.exec(`set role ${role}`);
  };
  const doc = portableFixture() as unknown as Record<string, unknown>;
  doc.snapshots = [{ id: "secret-snapshot", label: "private history", nodes: [] }];
  doc.owner_id = A;
  doc.shareToken = TOKEN;
  const root = (doc.nodes as { data: Record<string, unknown> }[])[0];
  root.data.linkedDocId = "private-related-document";
  root.data.backDocId = "private-origin-document";
  root.data.owner_id = A;
  (doc.edges as Record<string, unknown>[])[0].secret = "edge-secret";
  doc.ink = {
    version: 4,
    strokes: [{ id: "ink", color: "#2563eb", width: 3, points: [{ x: 0, y: 0, pressure: .5, secret: "point-secret" }],
      materialStyle: "grain-v1", erasures: [{ radius: 2, points: [{ x: 1, y: 1, secret: "mask-secret" }] }] }],
    objects: [{ id: "label", kind: "label", text: "공개 메모", x: 1, y: 1, width: 100, height: 40, color: "#000000", fill: false, fontSize: 20, secret: "object-secret" }],
    paper: { kind: "cream", texture: .2, seed: 1, secret: "paper-secret" },
  };
  try {
    await t.test("only owners can insert/read/update/delete their rows", async () => {
      await asRole("authenticated", A);
      await db.query("insert into public.cloud_documents(id,owner_id,document) values ($1,$2,$3)", [DOC, A, doc]);
      const mine = await db.query<{ id: string; revision: number }>("select id,revision from public.cloud_documents");
      assert.equal(mine.rows.length, 1);
      assert.equal(Number(mine.rows[0].revision), 1);
      await assert.rejects(db.query("insert into public.cloud_documents(id,owner_id,document) values ($1,$2,$3)", [OTHER_DOC, B, doc]), /row-level security/);
      await asRole("authenticated", B);
      assert.equal((await db.query("select * from public.cloud_documents")).rows.length, 0);
      assert.equal((await db.query("update public.cloud_documents set document = '{}' where id = $1 returning id", [DOC])).rows.length, 0);
      assert.equal((await db.query("delete from public.cloud_documents where id = $1 returning id", [DOC])).rows.length, 0);
      const denied = await db.query<{ result: boolean }>("select public.mmap_set_document_share($1,$2) as result", [DOC, hashShareToken(TOKEN)]);
      assert.equal(denied.rows[0].result, false);
      await asRole("anon");
      await assert.rejects(db.query("select * from public.cloud_documents"), /permission denied/);
      await assert.rejects(db.query("select public.mmap_set_document_share($1,$2)", [DOC, hashShareToken(TOKEN)]), /permission denied/);
    });
    await t.test("optimistic revision compare-and-swap never overwrites newer content", async () => {
      await asRole("authenticated", A);
      const updated = await db.query<{ revision: number }>("update public.cloud_documents set document = document || '{\"title\":\"새 버전\"}' where id = $1 and revision = 1 returning revision", [DOC]);
      assert.equal(Number(updated.rows[0].revision), 2);
      const stale = await db.query("update public.cloud_documents set document = document || '{\"title\":\"stale\"}' where id = $1 and revision = 1 returning revision", [DOC]);
      assert.equal(stale.rows.length, 0);
      await assert.rejects(db.query("update public.cloud_documents set owner_id = $1 where id = $2", [B, DOC]), /permission denied/);
      await assert.rejects(db.query("update public.cloud_documents set revision = 1 where id = $1", [DOC]), /permission denied/);
      await assert.rejects(db.query("update public.cloud_documents set share_enabled = true where id = $1", [DOC]), /permission denied/);
      doc.title = "새 버전";
    });
    await t.test("anonymous authenticated accounts and absent permanent claims cannot manage owner rows", async () => {
      for (const isAnonymous of [true, null]) {
        await asRole("authenticated", A, isAnonymous);
        assert.equal((await db.query("select * from public.cloud_documents")).rows.length, 0);
        await assert.rejects(db.query("insert into public.cloud_documents(id,owner_id,document) values ($1,$2,$3)", [OTHER_DOC, A, doc]), /row-level security/);
        assert.equal((await db.query("update public.cloud_documents set document = document || '{\"title\":\"anonymous edit\"}' where id = $1 returning id", [DOC])).rows.length, 0);
        assert.equal((await db.query("delete from public.cloud_documents where id = $1 returning id", [DOC])).rows.length, 0);
        assert.equal((await db.query<{ result: boolean }>("select public.mmap_set_document_share($1,$2) as result", [DOC, hashShareToken(TOKEN)])).rows[0].result, false);
        assert.equal((await db.query<{ result: boolean }>("select mmap_private.set_document_share($1,$2) as result", [DOC, hashShareToken(TOKEN)])).rows[0].result, false);
      }
    });
    await t.test("direct Data API writes reject malformed structures and over-limit documents", async () => {
      await asRole("authenticated", A);
      const badPoint = { version: 4, strokes: [{ id: "ink", color: "#000000", width: 4, points: [{ x: 0, y: 0, pressure: 2 }] }] };
      for (const malformed of [{}, { ...doc, title: null }, { ...doc, nodes: null },
        { ...doc, nodes: Array(20001).fill(root) }, { ...doc, nodes: [root, root] },
        { ...doc, ink: null }, { ...doc, ink: badPoint }, { ...doc, edges: [null] }]) {
        await assert.rejects(db.query("update public.cloud_documents set document = $1 where id = $2", [malformed, DOC]), /cloud_document_shape/);
      }
      const boundary = { ...doc, title: "" };
      const padding = CLOUD_DOCUMENT_MAX_BYTES - Buffer.byteLength(JSON.stringify(boundary));
      boundary.title = "a: b, c ".repeat(Math.floor(padding / 8)) + "x".repeat(padding % 8);
      assert.equal(Buffer.byteLength(JSON.stringify(boundary)), CLOUD_DOCUMENT_MAX_BYTES);
      const counted = await db.query<{ bytes: string }>("select mmap_private.compact_json_bytes($1) as bytes", [boundary]);
      assert.equal(Number(counted.rows[0].bytes), CLOUD_DOCUMENT_MAX_BYTES, "spaces inside strings must not be removed");
      await db.query("insert into public.cloud_documents(id,owner_id,document) values ($1,$2,$3)", [OTHER_DOC, A, boundary]);
      assert.ok(Number((await db.query<{ bytes: number }>("select octet_length(document::text) as bytes from public.cloud_documents where id=$1", [OTHER_DOC])).rows[0].bytes) > CLOUD_DOCUMENT_MAX_BYTES, "canonical JSONB whitespace must not reject a compact boundary document");
      const tooLarge = { ...boundary, title: boundary.title + "x" };
      await assert.rejects(db.query("update public.cloud_documents set document=$1 where id=$2", [tooLarge, DOC]), /cloud_document_size/);
      await assert.rejects(db.query("insert into public.cloud_documents(id,owner_id,document) values ($1,$2,$3)", ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", A, { ...doc, title: "x".repeat(5 * 1024 * 1024) }]), /cloud_document_size/);
      const unchanged = (await db.query<{ title: string }>("select document->>'title' as title from public.cloud_documents where id=$1", [DOC])).rows[0];
      assert.equal(unchanged.title, doc.title, "failed direct writes must leave shareable content intact");
      await db.query("delete from public.cloud_documents where id=$1", [OTHER_DOC]);
    });
    await t.test("anonymous capability returns deep display allowlist only; hash is not capability", async () => {
      await asRole("authenticated", A);
      assert.equal((await db.query<{ result: boolean }>("select public.mmap_set_document_share($1,$2) as result", [DOC, hashShareToken(TOKEN)])).rows[0].result, true);
      assert.equal(Number((await db.query<{ revision: number }>("select revision from public.cloud_documents where id = $1", [DOC])).rows[0].revision), 2, "sharing must not cause save conflicts");
      await assert.rejects(db.query("select * from mmap_private.document_shares"), /permission denied/);
      await asRole("anon");
      await assert.rejects(db.query("select * from mmap_private.document_shares"), /permission denied/);
      const shared = (await db.query<{ document: unknown }>("select public.mmap_get_shared_document($1) as document", [TOKEN])).rows[0].document;
      assert.deepEqual(shared, projectJson(doc, SHARED_DOCUMENT_PROJECTION));
      const text = JSON.stringify(shared);
      for (const forbidden of ["secret-snapshot", "private history", "private-related-document", "private-origin-document", "edge-secret", "point-secret", "mask-secret", "object-secret", "paper-secret", A, TOKEN]) assert.ok(!text.includes(forbidden), forbidden);
      for (const invalid of [hashShareToken(TOKEN), "wrong", "C".repeat(43), ""]) {
        assert.equal((await db.query<{ document: unknown }>("select public.mmap_get_shared_document($1) as document", [invalid])).rows[0].document, null);
      }
      await assert.rejects(db.query("select mmap_private.public_document('{}')"), /permission denied/);
      await assert.rejects(db.query("select mmap_private.project_json('{}','{}')"), /permission denied/);
    });
    await t.test("rotation and revocation invalidate old links without deleting owner data", async () => {
      await asRole("authenticated", A);
      await db.query("select public.mmap_set_document_share($1,$2)", [DOC, hashShareToken(ROTATED)]);
      await asRole("anon");
      assert.equal((await db.query<{ result: unknown }>("select public.mmap_get_shared_document($1) as result", [TOKEN])).rows[0].result, null);
      assert.ok((await db.query<{ result: unknown }>("select public.mmap_get_shared_document($1) as result", [ROTATED])).rows[0].result);
      await asRole("authenticated", A);
      await db.query("select public.mmap_set_document_share($1,null)", [DOC]);
      const row = (await db.query<{ share_enabled: boolean; revision: number }>("select share_enabled,revision from public.cloud_documents where id = $1", [DOC])).rows[0];
      assert.equal(row.share_enabled, false);
      assert.equal(Number(row.revision), 2);
      await asRole("anon");
      assert.equal((await db.query<{ result: unknown }>("select public.mmap_get_shared_document($1) as result", [ROTATED])).rows[0].result, null);
    });
    await t.test("deleting the owner document cascades its capability and hash", async () => {
      await asRole("authenticated", A);
      await db.query("select public.mmap_set_document_share($1,$2)", [DOC, hashShareToken(TOKEN)]);
      assert.equal((await db.query("delete from public.cloud_documents where id = $1 and revision = 1 returning id", [DOC])).rows.length, 0);
      assert.equal((await db.query("delete from public.cloud_documents where id = $1 and revision = 2 returning id", [DOC])).rows.length, 1);
      await asRole("anon");
      assert.equal((await db.query<{ result: unknown }>("select public.mmap_get_shared_document($1) as result", [TOKEN])).rows[0].result, null);
      await db.exec("reset role");
      assert.equal((await db.query("select * from mmap_private.document_shares")).rows.length, 0);
    });
  } finally { await db.close(); }
});
