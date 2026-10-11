import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCloudDocuments, handleCloudShare, handleSharedCloudDocument } from '../../src/lib/cloud/server';
import { portableFixture } from '../io/fixture';

const ownerId = '11111111-1111-4111-8111-111111111111';
const recordId = '22222222-2222-4222-8222-222222222222';
const request = (body: unknown, token?: string) => new Request('https://mmap.example/api/cloud/documents', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('cloud routes authenticate each owner operation, bind ownership, return conflicts, and keep public capabilities read-only', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mmap-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  let mode = 'owner';
  const calls: { url: string; method: string; authorization: string | null; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', authorization: headers.get('authorization'), body });
    if (url.includes('/auth/v1/user')) {
      return mode === 'expired' ? json({ message: 'expired', code: 'bad_jwt' }, 401)
        : json({ id: ownerId, aud: 'authenticated', role: 'authenticated', is_anonymous: mode === 'anonymous-account', email: 'synthetic@example.test', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-01-01' });
    }
    if (url.includes('/rpc/mmap_get_shared_document')) {
      if (mode !== 'shared-success') return json(null);
      const document = portableFixture();
      document.nodes[0].data.linkedDocId = 'private-related-document';
      document.nodes[0].data.checklist = [{ id: 'visible', text: 'Public checklist', checked: true, secret: 'private-checklist-data' } as never];
      document.snapshots = [{ id: 'private-history', label: 'Private history', createdAt: '2026-01-01', nodes: document.nodes, edges: document.edges }];
      return json({ ...document, owner_id: ownerId, token_hash: 'private-hash', account: 'private-account' });
    }
    if (url.includes('/rpc/mmap_set_document_share')) return json(false);
    if (mode === 'conflict') return init?.method === 'PATCH' ? json([]) : json({ revision: 8 });
    if (mode.startsWith('constraint-')) return json({ code: '23514', message: `violates check constraint cloud_document_${mode.slice(11)}; private-upstream-detail` }, 400);
    if (mode === 'upstream-error') return json({ code: 'unexpected', message: 'private-upstream-detail owner-test-token' }, 500);
    if (init?.method === 'POST') return json({ id: recordId, document: (body as {document: unknown}).document, revision: 1, updated_at: '2026-01-01', share_enabled: false });
    return json([]);
  }) as typeof fetch;
  try {
    const unauthenticated = await handleCloudDocuments(request({ action: 'list' }));
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls.length, 0, 'missing credentials must fail before contacting Supabase');
    mode = 'expired';
    const expired = await handleCloudDocuments(request({ action: 'list' }, 'expired-test-token'));
    assert.equal(expired.status, 401);
    assert.equal(calls.filter(call => call.url.includes('/rest/v1')).length, 0);
    mode = 'anonymous-account'; calls.length = 0;
    const anonymousAccount = await handleCloudDocuments(request({ action: 'list' }, 'anonymous-test-token'));
    assert.equal(anonymousAccount.status, 401);
    assert.equal(calls.filter(call => call.url.includes('/rest/v1')).length, 0);
    const anonymousShare = await handleCloudShare(request({ id: recordId, action: 'enable' }, 'anonymous-test-token'));
    assert.equal(anonymousShare.status, 401);
    assert.equal(calls.filter(call => call.url.includes('/rest/v1')).length, 0);
    mode = 'owner'; calls.length = 0;
    const created = await handleCloudDocuments(request({ action: 'save', owner_id: 'forged-owner', document: portableFixture() }, 'owner-test-token'));
    assert.equal(created.status, 201);
    const inserted = calls.find(call => call.method === 'POST' && call.url.includes('/cloud_documents'))!;
    assert.equal((inserted.body as {owner_id: string}).owner_id, ownerId);
    assert.equal(inserted.authorization, 'Bearer owner-test-token');
    assert.ok(created.headers.get('cache-control')?.includes('no-store'));
    const returned = await created.json();
    assert.ok(!('owner_id' in returned.record));
    for (const [failureMode, expectedStatus, expectedCode] of [
      ['constraint-size', 413, 'DOCUMENT_TOO_LARGE'],
      ['constraint-shape', 400, 'DOCUMENT_INVALID'],
      ['upstream-error', 503, 'CLOUD_REQUEST_FAILED'],
    ] as const) {
      mode = failureMode;
      const failedSave = await handleCloudDocuments(request({ action: 'save', document: portableFixture() }, 'owner-test-token'));
      assert.equal(failedSave.status, expectedStatus);
      const body = await failedSave.text();
      assert.equal(JSON.parse(body).error.code, expectedCode);
      assert.ok(!body.includes('private-upstream-detail') && !body.includes('owner-test-token'));
    }
    mode = 'conflict'; calls.length = 0;
    const conflict = await handleCloudDocuments(request({ action: 'save', id: recordId, expectedRevision: 1, document: portableFixture() }, 'owner-test-token'));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.currentRevision, 8);
    assert.ok(calls.some(call => call.url.includes('revision=eq.1')));
    assert.ok(calls.filter(call => call.url.includes('/cloud_documents')).every(call => call.url.includes(`owner_id=eq.${ownerId}`)));
    mode = 'owner'; calls.length = 0;
    const revoked = await handleSharedCloudDocument(request({ token: 'A'.repeat(43) }));
    assert.equal(revoked.status, 404);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('/rpc/mmap_get_shared_document'));
    assert.deepEqual(calls[0].body, { p_token: 'A'.repeat(43) });
    assert.ok(!calls[0].url.includes('A'.repeat(43)), 'token must never appear in URLs');
    mode = 'shared-success'; calls.length = 0;
    const shared = await handleSharedCloudDocument(request({ token: 'A'.repeat(43) }));
    assert.equal(shared.status, 200);
    assert.equal(calls.length, 1, 'shared lookup must never authenticate as an owner');
    assert.notEqual(calls[0].authorization, 'Bearer owner-test-token');
    const sharedText = await shared.text();
    assert.ok(sharedText.includes('Public checklist'));
    for (const secret of ['private-related-document', 'private-checklist-data', 'private-history', 'Private history', 'private-hash', 'private-account', ownerId]) assert.ok(!sharedText.includes(secret), secret);
    assert.equal(shared.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(shared.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(shared.headers.get('x-content-type-options'), 'nosniff');
    mode = 'owner';
    const unauthorizedShare = await handleCloudShare(request({ id: recordId, action: 'enable' }, 'owner-test-token'));
    assert.equal(unauthorizedShare.status, 404);
    const missing = await handleSharedCloudDocument(request({ token: 'bad' }));
    assert.equal(missing.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
