import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudCacheDraftGuard, cacheDocumentFingerprint, cloudCacheBaselineKey, normalizeCacheDocument,
} from '../../src/lib/cloudCache';
import {
  CloudSaveQueue, listOwnerPendingCloudSaves, listPendingCloudSaves, pendingCloudKey,
  type PendingCloudSave,
} from '../../src/lib/cloudSync';
import type { CloudDocumentRecord } from '../../src/lib/cloudClient';
import type { MindMapDocument } from '../../src/types/mindmap';
import { portableFixture } from '../io/fixture';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failWrite = false;
  failRead = false;
  get length() { if (this.failRead) throw new Error('Storage blocked'); return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { if (this.failRead) throw new Error('Storage blocked'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrite) throw new Error('Quota exceeded'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

async function withBrowser(run: (storage: MemoryStorage) => void | Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  try { await run(storage); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
}
function doc(title = 'server', id = 'portable-map'): MindMapDocument { return { ...portableFixture(), id, title }; }
function record(document = doc(), revision = 4, id = 'cloud-record'): CloudDocumentRecord {
  return { id, document, revision, updatedAt: document.updatedAt, shareEnabled: false };
}
function put(storage: MemoryStorage, draft: PendingCloudSave) {
  storage.setItem(pendingCloudKey(draft.ownerId, draft.recordId, draft.writerId, draft.writeId), JSON.stringify(draft));
}
function draft(document: MindMapDocument, recordId = 'cloud-record'): PendingCloudSave {
  return {
    ownerId: 'alice', recordId, document, expectedRevision: 4,
    writerId: 'original-writer', writeId: 'original-write', savedAt: '2026-10-09T00:00:00.000Z',
  };
}

test('refresh restores a clean acknowledged basis before later unregistered account-cache edits become durable drafts', async () => {
  await withBrowser(() => {
    const original = new CloudCacheDraftGuard({ ownerId: 'alice' });
    assert.equal(original.rememberAcknowledged(record()), true);
    original.dispose();
    const refreshed = new CloudCacheDraftGuard({ ownerId: 'alice' });
    assert.equal(refreshed.preserveDocument(doc()).draft, null);
    const preserved = refreshed.preserveDocument(doc('edited after refresh'));
    assert.equal(preserved.recoveryAvailable, true);
    assert.equal(preserved.baselineKnown, true);
    assert.equal(preserved.draft?.recordId, 'cloud-record');
    assert.equal(preserved.draft?.expectedRevision, 4);
    assert.equal(preserved.draft?.browserOnly, undefined);
    // Replacing a shared account-cache blob cannot remove the independent draft.
    window.localStorage.setItem('account-workspace', JSON.stringify({ documents: [doc()] }));
    refreshed.dispose();
    const recovered = listPendingCloudSaves('alice', 'cloud-record');
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].document.title, 'edited after refresh');
    const reopened = new CloudCacheDraftGuard({ ownerId: 'alice' });
    assert.equal(reopened.preserveDocument(recovered[0].document).draft?.writeId, recovered[0].writeId);
    assert.equal(reopened.getCurrentSnapshot(recovered[0].document.id), null);
  });
});

test('partial shared history cannot turn a divergent legacy cache into an uploadable revision-five draft', async () => {
  await withBrowser(() => {
    const otherTab = new CloudCacheDraftGuard({ ownerId: 'alice' });
    otherTab.rememberAcknowledged(record(doc('remote revision five'), 5));
    const refreshedLegacy = new CloudCacheDraftGuard({ ownerId: 'alice' });
    const preserved = refreshedLegacy.preserveDocument(doc('legacy revision one edits'), {
      serverRecord: record(doc('remote revision five'), 5),
    });
    assert.equal(preserved.draft?.browserOnly, true);
    assert.equal(preserved.draft?.recordId, 'cloud-record');
    assert.equal(listPendingCloudSaves('alice', 'cloud-record').length, 0);
    assert.equal(listOwnerPendingCloudSaves('alice')[0].document.title, 'legacy revision one edits');
  });
});

test('historical clean fingerprints prime their actual revision rather than the newest shared revision', async () => {
  await withBrowser(() => {
    const publisher = new CloudCacheDraftGuard({ ownerId: 'alice' });
    publisher.rememberAcknowledged(record(doc('revision one'), 1));
    publisher.rememberAcknowledged(record(doc('revision five'), 5));
    const refreshed = new CloudCacheDraftGuard({ ownerId: 'alice' });
    assert.equal(refreshed.preserveDocument(doc('revision one')).draft, null);
    const edit = refreshed.preserveDocument(doc('local edit based on one'));
    assert.equal(edit.draft?.expectedRevision, 1);
    assert.equal(edit.draft?.browserOnly, undefined);
  });
});

test('browser recovery copies keep independent document IDs, source identity, and edits after cache overwrite and refresh', async () => {
  await withBrowser(storage => {
    const source = draft(doc('original source'));
    put(storage, source);
    const initial = new CloudCacheDraftGuard({ ownerId: 'alice' });
    initial.preserveBrowserCopy(doc('copied source', 'browser-copy-new-id'), source);
    const edited = initial.preserveDocument(doc('copy edited before returning local', 'browser-copy-new-id')).draft!;
    assert.equal(edited.browserOnly, true);
    assert.equal(edited.recordId, 'browser:browser-copy-new-id');
    assert.deepEqual(edited.source, { recordId: source.recordId, writerId: source.writerId, writeId: source.writeId });
    storage.setItem('account-workspace', JSON.stringify({ documents: [doc('another tab old cache')] }));
    initial.dispose();
    const restored = listOwnerPendingCloudSaves('alice').find(current => current.browserOnly)!;
    assert.equal(restored.document.title, 'copy edited before returning local');
    const refreshed = new CloudCacheDraftGuard({ ownerId: 'alice' });
    const next = refreshed.preserveDocument({ ...restored.document, title: 'copy edited after refresh' }).draft!;
    assert.equal(next.recordId, edited.recordId);
    assert.equal(next.document.id, 'browser-copy-new-id');
    assert.notEqual(next.writerId, edited.writerId);
    assert.deepEqual(next.source, edited.source);
    assert.equal(listPendingCloudSaves('alice', 'cloud-record')[0].writeId, source.writeId);
    assert.equal(listOwnerPendingCloudSaves('alice').filter(current => current.browserOnly).length, 2);
  });
});

test('unknown legacy divergence and ordinary account documents remain browser-only with no queue registration', async () => {
  await withBrowser(() => {
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice' });
    const cached = guard.preserveDocument(doc('unknown private edits'), { serverRecord: record() }).draft!;
    assert.equal(cached.recordId, 'cloud-record');
    assert.equal(cached.expectedRevision, 4);
    assert.equal(cached.browserOnly, true);
    const local = guard.preserveDocument(doc('new account document', 'new-account-document')).draft!;
    assert.equal(local.recordId, 'browser:new-account-document');
    assert.equal(local.browserOnly, true);
    const queue = new CloudSaveQueue({ ownerId: 'alice', save: async () => { throw new Error('Must not upload'); }, onChange: () => {}, onSessionExpired: () => {} });
    assert.throws(() => queue.register(record(), cached));
    assert.equal(queue.entries.size, 0);
    queue.dispose();
  });
});

test('portable document IDs across records cannot infer a binding from the incoming record', async () => {
  await withBrowser(() => {
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice' });
    guard.rememberAcknowledged(record(doc('record A'), 2, 'record-a'));
    guard.rememberAcknowledged(record(doc('record B'), 7, 'record-b'));
    assert.equal(guard.getBaseline('portable-map'), null);
    const preserved = guard.preserveDocument(doc('edited B cache'), { serverRecord: record(doc('record A'), 2, 'record-a') });
    assert.equal(preserved.draft?.browserOnly, true);
    assert.equal(listPendingCloudSaves('alice', 'record-a').length, 0);
    assert.equal(listPendingCloudSaves('alice', 'record-b').length, 0);
    const sole = new CloudCacheDraftGuard({ ownerId: 'bob' });
    sole.rememberAcknowledged(record(doc('B'), 7, 'record-b'));
    const cross = sole.preserveDocument(doc('edited B'), { serverRecord: record(doc('A'), 2, 'record-a') });
    assert.equal(cross.draft?.recordId, 'record-b');
    assert.equal(cross.draft?.expectedRevision, 7);
    assert.equal(cross.draft?.browserOnly, true);
    const existingB = { ...draft(doc('existing exact B edits'), 'record-b'), ownerId: 'carol' };
    put(window.localStorage as MemoryStorage, existingB);
    const fresh = new CloudCacheDraftGuard({ ownerId: 'carol' });
    const mismatched = fresh.preserveDocument(existingB.document, { serverRecord: record(doc('A'), 2, 'record-a') });
    assert.equal(mismatched.draft?.browserOnly, true);
    assert.equal(mismatched.draft?.recordId, 'record-b');
  });
});

test('queue acknowledgement captures the sent snapshot while newer in-flight editor changes remain divergent', async () => {
  await withBrowser(async () => {
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice' });
    let resolve!: (record: CloudDocumentRecord) => void;
    const request = new Promise<CloudDocumentRecord>(done => { resolve = done; });
    const queue = new CloudSaveQueue({
      ownerId: 'alice', save: async () => request, onChange: () => {}, onSessionExpired: () => {}, debounceMs: 60_000,
      onAcknowledged: (saved, sent) => {
        guard.rememberAcknowledged(saved, sent);
        // Freeze after the first acknowledgement so this test can inspect it.
        queue.dispose();
      },
    });
    queue.register(record(doc('initial'), 1));
    queue.enqueue('cloud-record', doc('sent edit'));
    const flush = queue.flush();
    await Promise.resolve();
    queue.enqueue('cloud-record', doc('newer unsent edit'));
    resolve(record({ ...doc('sent edit'), updatedAt: '2026-10-10T00:00:00.000Z' }, 2));
    assert.equal(await flush, false);
    assert.equal(guard.getBaseline('portable-map')?.fingerprint, cacheDocumentFingerprint(doc('sent edit')));
    assert.notEqual(guard.getBaseline('portable-map')?.fingerprint, cacheDocumentFingerprint(doc('newer unsent edit')));
    const unsent = guard.preserveDocument(doc('newer unsent edit')).draft!;
    assert.equal(unsent.expectedRevision, 2);
    assert.equal(unsent.browserOnly, undefined);
  });
});

test('normalization writes round-trippable legacy cache defaults and rejects invalid backups before replacement', async () => {
  await withBrowser(storage => {
    const complete = doc('legacy');
    const legacy = { id: complete.id, nodes: complete.nodes, edges: complete.edges } as MindMapDocument;
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice' });
    const result = guard.preserveDocument(legacy);
    assert.equal(result.recoveryAvailable, true);
    const recovered = listOwnerPendingCloudSaves('alice')[0];
    assert.equal(recovered.document.updatedAt, '1970-01-01T00:00:00.000Z');
    assert.equal(cacheDocumentFingerprint(recovered.document), cacheDocumentFingerprint(legacy));
    const before = storage.values.size;
    const invalid = { id: 'invalid-cache', nodes: [], edges: [] } as unknown as MindMapDocument;
    assert.equal(normalizeCacheDocument(invalid), null);
    assert.deepEqual(guard.preserveDocument(invalid), { draft: null, recoveryAvailable: false, baselineKnown: false });
    assert.equal(storage.values.size, before);
  });
});

test('normalization compares property order consistently while retaining viewport, appearance, node and relation edits', () => {
  const original = doc();
  const reordered = Object.fromEntries(Object.entries(original).reverse()) as unknown as MindMapDocument;
  assert.equal(cacheDocumentFingerprint(original), cacheDocumentFingerprint(reordered));
  assert.notEqual(cacheDocumentFingerprint(original), cacheDocumentFingerprint({ ...original, viewport: { x: 3, y: 5, zoom: 0.75 } }));
  assert.notEqual(cacheDocumentFingerprint(original), cacheDocumentFingerprint({ ...original, updatedAt: '2026-10-10' }));
  assert.notEqual(cacheDocumentFingerprint(original), cacheDocumentFingerprint({ ...original, appearance: { ...original.appearance!, edgeWidth: 4 } }));
  assert.notEqual(cacheDocumentFingerprint(original), cacheDocumentFingerprint({ ...original, nodes: original.nodes.map((node, index) => index ? node : { ...node, data: { ...node.data, label: 'changed node' } }) }));
  assert.notEqual(cacheDocumentFingerprint(original), cacheDocumentFingerprint({ ...original, relations: original.relations?.map(relation => ({ ...relation, label: 'changed relation' })) }));
});

test('quota failures retain cloned owner-scoped snapshots and retry durability without changing identity', async () => {
  await withBrowser(storage => {
    storage.failWrite = true;
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice' });
    assert.equal(guard.rememberAcknowledged(record()), false);
    const result = guard.preserveDocument(doc('volatile private edit'));
    assert.equal(result.recoveryAvailable, false);
    assert.equal(result.draft?.browserOnly, undefined);
    const copy = guard.getPendingSnapshots()[0];
    copy.document.nodes[0].data.label = 'mutated copy';
    assert.notEqual(guard.getPendingSnapshots()[0].document.nodes[0].data.label, 'mutated copy');
    storage.failWrite = false;
    const retried = guard.preserveDocument(doc('volatile private edit'));
    assert.equal(retried.recoveryAvailable, true);
    assert.equal(retried.draft?.writeId, result.draft?.writeId);
    assert.equal(listOwnerPendingCloudSaves('alice')[0].writeId, result.draft?.writeId);
    const retained = guard.getPendingSnapshots();
    guard.dispose();
    storage.failRead = true;
    assert.deepEqual(listOwnerPendingCloudSaves('alice'), []);
    assert.equal(retained[0].document.title, 'volatile private edit');
    assert.equal(guard.getPendingSnapshots().length, 0);
  });
});

test('exact cleanup preserves independent older branches, other writers and other owners', async () => {
  await withBrowser(() => {
    const cleared: string[] = [];
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice', onDraftCleared: draft => cleared.push(draft.writeId) });
    guard.rememberAcknowledged(record(doc('base one'), 1));
    const old = guard.preserveDocument(doc('old branch edit')).draft!;
    guard.rememberAcknowledged(record(doc('base two'), 2));
    const newer = guard.preserveDocument(doc('new branch edit')).draft!;
    assert.equal(guard.getPendingSnapshots().length, 2);
    const otherWriter = new CloudCacheDraftGuard({ ownerId: 'alice' });
    const other = otherWriter.preserveBrowserCopy(doc('other writer', 'other-copy')).draft!;
    const bob = new CloudCacheDraftGuard({ ownerId: 'bob' });
    const bobDraft = bob.preserveBrowserCopy(doc('bob private', 'bob-copy')).draft!;
    assert.throws(() => guard.consumeRecoveryDraft(bobDraft));
    guard.consumeRecoveryDraft(old);
    assert.equal(guard.getCurrentSnapshot('portable-map')?.writeId, newer.writeId);
    assert.equal(guard.getCurrentSnapshot('other-copy'), null);
    assert.deepEqual(guard.getPendingSnapshots().map(draft => draft.writeId), [newer.writeId]);
    assert.ok(cleared.includes(old.writeId));
    assert.ok(listOwnerPendingCloudSaves('alice').some(draft => draft.writeId === other.writeId));
    assert.equal(listOwnerPendingCloudSaves('bob')[0].writeId, bobDraft.writeId);
  });
});

test('malformed or mismatched baseline metadata cannot create a cache-to-record binding across owners', async () => {
  await withBrowser(storage => {
    const valid = { ownerId: 'alice', recordId: 'record-a', documentId: 'portable-map', revision: 1, fingerprint: cacheDocumentFingerprint(doc())! };
    storage.setItem(cloudCacheBaselineKey(valid), '{');
    storage.setItem(cloudCacheBaselineKey({ ...valid, recordId: 'key-other' }), JSON.stringify(valid));
    storage.setItem(cloudCacheBaselineKey({ ...valid, revision: 2 }), JSON.stringify({ ...valid, revision: 2, fingerprint: 'invalid' }));
    storage.setItem(cloudCacheBaselineKey({ ...valid, ownerId: 'bob' }), JSON.stringify({ ...valid, ownerId: 'bob' }));
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice' });
    assert.equal(guard.getBaseline('portable-map'), null);
    const backup = guard.preserveDocument(doc('unknown edits')).draft!;
    assert.equal(backup.browserOnly, true);
    assert.equal(backup.recordId, 'browser:portable-map');
    assert.equal(new CloudCacheDraftGuard({ ownerId: 'bob' }).getBaseline('portable-map')?.recordId, 'record-a');
  });
});

test('resetting the cache context retains drafts, prevents stale X writes while editing Y, and requires a new proven basis', async () => {
  await withBrowser(async storage => {
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice' });
    const x = record(doc('acknowledged X revision five', 'doc-x'), 5, 'record-x');
    guard.rememberAcknowledged(x);
    const independent = guard.preserveBrowserCopy(doc('independent browser edits', 'browser-copy')).draft!;
    const requests: { id: string; revision: number; title: string }[] = [];
    const queue = new CloudSaveQueue({
      ownerId: 'alice', onChange: () => {}, onSessionExpired: () => {}, debounceMs: 60_000,
      save: async (id, revision, document) => {
        requests.push({ id, revision, title: document.title });
        return record(document, revision + 1, id);
      },
    });
    try {
      queue.register(x);
      queue.enqueue('record-x', doc('prior-context unsaved X edits', 'doc-x'));
      const retainedQueueDrafts = queue.getPendingSnapshots();
      const persistedBeforeReset = [...storage.values.entries()];
      // Retain drafts first, then invalidate queue registration and observations
      // before another tab's stale whole account cache is loaded.
      queue.entries.clear();
      guard.forgetObservedBindings();
      assert.deepEqual([...storage.values.entries()], persistedBeforeReset);
      assert.equal(guard.getPendingSnapshots()[0].writeId, independent.writeId);
      assert.equal(retainedQueueDrafts[0].document.title, 'prior-context unsaved X edits');

      const staleX = doc('legacy divergent X revision one', 'doc-x');
      const backup = guard.preserveDocument(staleX, { serverRecord: x }).draft!;
      assert.equal(backup.browserOnly, true);
      const y = record(doc('opened Y', 'doc-y'), 2, 'record-y');
      queue.register(y);
      queue.enqueue('record-x', staleX);
      queue.enqueue('record-y', doc('edited Y', 'doc-y'));
      assert.equal(await queue.flush(), true);
      assert.deepEqual(requests, [{ id: 'record-y', revision: 2, title: 'edited Y' }]);
      assert.equal(queue.entries.has('record-x'), false);
      assert.ok(listOwnerPendingCloudSaves('alice').some(draft => draft.writeId === retainedQueueDrafts[0].writeId));

      guard.consumeRecoveryDraft(backup);
      assert.equal(guard.preserveDocument(x.document).draft, null);
      const next = guard.preserveDocument(doc('edited after observing clean X', 'doc-x')).draft!;
      assert.equal(next.expectedRevision, 5);
      assert.equal(next.recordId, 'record-x');
      assert.equal(next.browserOnly, undefined);
      assert.ok(guard.getPendingSnapshots().some(draft => draft.writeId === independent.writeId));
    } finally { queue.dispose(); }
  });
});

test('a new cache context cannot supersede or hide its prior newer browser draft when the same document ID reloads stale', async () => {
  await withBrowser(storage => {
    const cleared: string[] = [];
    const guard = new CloudCacheDraftGuard({ ownerId: 'alice', onDraftCleared: draft => cleared.push(draft.writeId) });
    const newer = guard.preserveBrowserCopy(doc('newer prior-context browser edits', 'doc-x')).draft!;
    const stashed = guard.getPendingSnapshots();
    const storedBeforeReset = [...storage.values.entries()];
    guard.forgetObservedBindings();
    assert.equal(guard.getCurrentSnapshot('doc-x'), null);
    assert.deepEqual([...storage.values.entries()], storedBeforeReset);
    assert.equal(guard.getPendingSnapshots()[0].writeId, newer.writeId);
    assert.equal(stashed[0].document.title, 'newer prior-context browser edits');

    const stale = guard.preserveDocument(doc('stale shared-cache body', 'doc-x')).draft!;
    assert.notEqual(stale.writerId, newer.writerId);
    assert.equal(stale.recordId, newer.recordId);
    assert.equal(stale.browserOnly, true);
    const edited = guard.preserveDocument(doc('stale body edited in new context', 'doc-x')).draft!;
    assert.equal(edited.writerId, stale.writerId);
    assert.ok(cleared.includes(stale.writeId));
    assert.ok(!cleared.includes(newer.writeId));
    const retained = guard.getPendingSnapshots();
    assert.deepEqual(new Set(retained.map(draft => draft.writeId)), new Set([newer.writeId, edited.writeId]));
    assert.deepEqual(new Set(listOwnerPendingCloudSaves('alice').map(draft => draft.document.title)),
      new Set(['newer prior-context browser edits', 'stale body edited in new context']));
    guard.dispose();
    assert.equal(listOwnerPendingCloudSaves('alice').length, 2);
    assert.ok(listOwnerPendingCloudSaves('alice').some(draft => draft.writeId === newer.writeId));
  });
});
