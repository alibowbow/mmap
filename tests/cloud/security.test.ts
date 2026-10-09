import assert from "node:assert/strict";
import test from "node:test";
import { portableFixture } from "../io/fixture";
import { CLOUD_DOCUMENT_MAX_BYTES, SHARE_TOKEN_PATTERN } from "../../src/lib/cloud/contracts";
import { toSharedCloudDocument } from "../../src/lib/cloud/projection";
import {
  CloudRequestError, createShareToken, hashShareToken, isPublicSupabaseKey,
  requireBearer, requireCloudId, requireRevision, validateCloudDocument,
} from "../../src/lib/cloud/security";
import { readCloudBody } from "../../src/lib/cloud/server";

const jwt = (role: string) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;

test("only publishable and legacy anon config keys are accepted, never privileged keys", () => {
  assert.ok(isPublicSupabaseKey("sb_publishable_example"));
  assert.ok(isPublicSupabaseKey(jwt("anon")));
  for (const key of ["sb_secret_secret", jwt("service_role"), jwt("authenticated"), "random", "a.notjson.c", ""]) assert.equal(isPublicSupabaseKey(key), false);
});
test("share tokens contain 256 random bits and store a different SHA-256 hash", () => {
  const seen = new Set<string>();
  for (let n = 0; n < 100; n++) {
    const { token, hash } = createShareToken();
    assert.match(token, SHARE_TOKEN_PATTERN);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash, hashShareToken(token));
    assert.notEqual(token, hash);
    assert.equal(seen.has(token), false);
    seen.add(token);
  }
});
test("owner identifiers, revision and explicit Bearer header are required", () => {
  assert.equal(requireCloudId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  for (const id of ["local_123", null, "../document", "a".repeat(36)]) assert.throws(() => requireCloudId(id), CloudRequestError);
  for (const revision of [undefined, 0, -1, 1.5, Infinity, "1", Number.MAX_SAFE_INTEGER]) assert.throws(() => requireRevision(revision), CloudRequestError);
  assert.equal(requireRevision(1), 1);
  assert.equal(requireBearer(new Request("http://localhost", { headers: { authorization: "Bearer owner-jwt" } })), "owner-jwt");
  assert.throws(() => requireBearer(new Request("http://localhost", { headers: { cookie: "token=owner-jwt" } })), CloudRequestError);
});
test("cloud validation supports v6/inkv4 and rejects future envelopes or over-limit documents", () => {
  const document = portableFixture();
  document.ink = { version: 4, strokes: [{ id: "ink", color: "#000000", width: 4, points: [{ x: 0, y: 0, pressure: .5 }], materialStyle: "grain-v1", erasures: [{ radius: 2, points: [{ x: 0, y: 0 }] }] }] };
  const valid = validateCloudDocument({ format: "mindforge-document", version: 6, document });
  assert.deepEqual(valid.ink, document.ink);
  assert.throws(() => validateCloudDocument({ format: "mindforge-document", version: 7, document }), (error: unknown) => error instanceof CloudRequestError && error.code === "DOCUMENT_INVALID");
  assert.throws(() => validateCloudDocument({ ...document, title: "x".repeat(CLOUD_DOCUMENT_MAX_BYTES) }), (error: unknown) => error instanceof CloudRequestError && error.status === 413);
});
test("public payload does not copy private document metadata or nested unknown fields", () => {
  const document = portableFixture();
  document.snapshots = [{ id: "secret", label: "private", createdAt: "2020", nodes: [], edges: [] }];
  document.nodes[0].data.linkedDocId = "secret-owner-document";
  document.nodes[0].data.backDocId = "secret-owner-origin";
  document.nodes[0].data.checklist = [{ id: "check", text: "Visible checklist", checked: false, secret: "hidden-checklist-field" } as never];
  document.edges[0] = { ...document.edges[0], data: { secret: "hidden-edge-field" } };
  const shared = toSharedCloudDocument(document);
  assert.equal(shared.nodes[0].data.checklist?.[0].text, "Visible checklist");
  for (const key of ["id", "snapshots", "pinned", "createdAt", "updatedAt", "inkSettings", "owner_id", "token_hash"]) assert.equal(key in shared, false);
  const json = JSON.stringify(shared);
  for (const secret of ["secret-owner-document", "secret-owner-origin", "hidden-checklist-field", "hidden-edge-field"]) assert.equal(json.includes(secret), false);
});
test("bounded streaming JSON parser rejects chunked over-limit and invalid content-type bodies", async () => {
  await assert.rejects(readCloudBody(new Request("http://localhost", { method: "POST", body: "{}" })), (error: unknown) => error instanceof CloudRequestError && error.status === 400);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"value":"')); controller.enqueue(new Uint8Array(100).fill(97)); controller.close(); } });
  const request = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readCloudBody(request, 50), (error: unknown) => error instanceof CloudRequestError && error.status === 413);
  const parsed = await readCloudBody(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: '{"action":"list","__proto__":{"bad":true}}' }));
  assert.deepEqual(parsed, { action: "list" });
});
