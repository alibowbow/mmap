import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudSaveQueue, clearPendingCloudSave, listPendingCloudSaves, listOwnerPendingCloudSaves, pendingCloudKey,
  type PendingCloudSave,
} from '../../src/lib/cloudSync';
import { CloudError, type CloudDocumentRecord } from '../../src/lib/cloudClient';
import type { MindMapDocument } from '../../src/types/mindmap';
import { portableFixture } from '../io/fixture';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  failRemove = false;
  onRead?: (key: string) => void;
  get length() {
    if (this.failRead) throw new Error('Storage is blocked');
    return this.values.size;
  }
  key(index: number) {
    if (this.failRead) throw new Error('Storage is blocked');
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    if (this.failRead) throw new Error('Storage is blocked');
    const value = this.values.get(key) ?? null;
    this.onRead?.(key);
    return value;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.failRemove) throw new Error('Storage is blocked');
    this.values.delete(key);
  }
  clear() { this.values.clear(); }
}

type QueueOptions = ConstructorParameters<typeof CloudSaveQueue>[0];
async function withBrowser(run: (context: {
  storage: MemoryStorage;
  network: { onLine: boolean };
  queue: (save: QueueOptions['save'], options?: Partial<QueueOptions>) => CloudSaveQueue;
}) => void | Promise<void>) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const storage = new MemoryStorage();
  const network = { onLine: true };
  const queues: CloudSaveQueue[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network });
  try {
    await run({ storage, network, queue: (save, options = {}) => {
      const queue = new CloudSaveQueue({
        ownerId: 'alice', save, onChange: () => {}, onSessionExpired: () => {},
        debounceMs: 60_000, ...options,
      });
      queues.push(queue);
      return queue;
    } });
  } finally {
    queues.forEach(queue => queue.dispose());
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
}

function document(title = 'saved'): MindMapDocument {
  return { ...portableFixture(), title };
}
function record(doc = document(), revision = 1, id = 'record-a'): CloudDocumentRecord {
  return { id, document: doc, revision, updatedAt: doc.updatedAt, shareEnabled: false };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const saveSuccessfully: QueueOptions['save'] = async (id, revision, doc) => record(doc, revision + 1, id);

test('each queue owns its writer draft and saving one never clears another writer or owner', async () => {
  await withBrowser(async ({ queue }) => {
    const first = queue(saveSuccessfully);
    const second = queue(saveSuccessfully);
    const otherOwner = queue(saveSuccessfully, { ownerId: 'bob' });
    for (const current of [first, second, otherOwner]) current.register(record());
    first.enqueue('record-a', document('first tab'));
    second.enqueue('record-a', document('second tab'));
    otherOwner.enqueue('record-a', document('bob private'));
    const aliceDrafts = listPendingCloudSaves('alice', 'record-a');
    assert.equal(aliceDrafts.length, 2);
    assert.equal(new Set(aliceDrafts.map(draft => draft.writerId)).size, 2);
    assert.deepEqual(new Set(aliceDrafts.map(draft => draft.document.title)), new Set(['first tab', 'second tab']));
    assert.equal(await first.flush(), true);
    assert.deepEqual(listPendingCloudSaves('alice', 'record-a').map(draft => draft.document.title), ['second tab']);
    assert.deepEqual(listPendingCloudSaves('bob', 'record-a').map(draft => draft.document.title), ['bob private']);
    assert.equal(first.getPendingSnapshots().length, 0);
  });
});

test('recovered draft cleanup compares the exact write and preserves newer source edits', async () => {
  await withBrowser(async ({ queue }) => {
    const writer = queue(saveSuccessfully);
    writer.register(record());
    writer.enqueue('record-a', document('source read for recovery'));
    const source = listPendingCloudSaves('alice', 'record-a')[0];
    const cleared: PendingCloudSave[] = [];
    const recovery = queue(saveSuccessfully, { onDraftCleared: draft => cleared.push(draft) });
    recovery.register(record(), source);
    writer.enqueue('record-a', document('newer source edit'));
    clearPendingCloudSave(source);
    assert.equal(await recovery.flush(), true);
    const remaining = listPendingCloudSaves('alice', 'record-a');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].document.title, 'newer source edit');
    assert.equal(remaining[0].writerId, source.writerId);
    assert.notEqual(remaining[0].writeId, source.writeId);
    assert.ok(cleared.some(draft => draft.writeId === source.writeId));
    assert.equal(new Set(cleared.map(draft => `${draft.writerId}:${draft.writeId}`)).size, cleared.length);
  });
});

test('an update between storage read and remove cannot be deleted by recovered write cleanup', async () => {
  await withBrowser(({ queue, storage }) => {
    const writer = queue(saveSuccessfully);
    writer.register(record());
    writer.enqueue('record-a', document('selected for recovery'));
    const selected = listPendingCloudSaves('alice', 'record-a')[0];
    const selectedKey = pendingCloudKey('alice', 'record-a', selected.writerId, selected.writeId);
    storage.onRead = key => {
      if (key !== selectedKey) return;
      storage.onRead = undefined;
      writer.enqueue('record-a', document('written between read and remove'));
    };
    clearPendingCloudSave(selected);
    const remaining = listPendingCloudSaves('alice', 'record-a');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].document.title, 'written between read and remove');
    assert.notEqual(remaining[0].writeId, selected.writeId);
  });
});

test('legacy mutable writer drafts stay readable and clearing them cannot remove concurrent legacy updates', async () => {
  await withBrowser(({ queue, storage }) => {
    const current = queue(saveSuccessfully);
    current.register(record());
    current.enqueue('record-a', document('legacy selected draft'));
    const selected = current.getPendingSnapshots()[0];
    const legacyKey = pendingCloudKey(selected.ownerId, selected.recordId, selected.writerId);
    storage.clear();
    storage.setItem(legacyKey, JSON.stringify(selected));
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].writeId, selected.writeId);
    clearPendingCloudSave(selected);
    assert.equal(storage.getItem(legacyKey), JSON.stringify(selected));
    const updated = { ...selected, writeId: 'later-legacy-write', document: document('new legacy edit') };
    storage.setItem(legacyKey, JSON.stringify(updated));
    clearPendingCloudSave(selected);
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'new legacy edit');
  });
});

test('only the newest immutable draft per writer is listed when cleanup cannot remove older keys', async () => {
  await withBrowser(async ({ queue, storage }) => {
    const current = queue(saveSuccessfully);
    current.register(record());
    current.enqueue('record-a', document('older immutable draft'));
    storage.failRemove = true;
    current.enqueue('record-a', document('newest immutable draft'));
    assert.equal(storage.values.size, 2);
    assert.equal(listPendingCloudSaves('alice', 'record-a').length, 1);
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'newest immutable draft');
    storage.failRemove = false;
    assert.equal(await current.flush(), true);
    assert.equal(storage.values.size, 0);
  });
});

test('opening and editing the server copy preserves the prior draft after the new copy saves', async () => {
  for (const durable of [true, false]) {
    await withBrowser(async ({ queue, storage }) => {
      const current = queue(saveSuccessfully);
      current.register(record());
      storage.failWrite = !durable;
      current.enqueue('record-a', document('earlier independent draft'));
      const earlier = current.getPendingSnapshots()[0];
      current.register(record(document('latest server copy'), 3));
      assert.equal(current.getPendingSnapshots()[0].writeId, earlier.writeId);
      storage.failWrite = false;
      current.enqueue('record-a', document('new server copy edit'));
      assert.equal(current.getPendingSnapshots().length, 2);
      assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'new server copy edit');
      assert.equal(await current.flush(), true);
      assert.equal(current.getPendingSnapshots().length, 1);
      assert.equal(current.getPendingSnapshots()[0].document.title, 'earlier independent draft');
      if (durable) {
        const pending = listPendingCloudSaves('alice', 'record-a');
        assert.equal(pending.length, 1);
        assert.equal(pending[0].writeId, earlier.writeId);
        assert.equal(pending[0].document.title, 'earlier independent draft');
      } else {
        assert.equal(listPendingCloudSaves('alice', 'record-a').length, 0);
      }
    });
  }
});

test('in-flight edits rebase onto the saved revision and all concurrent flushes wait for the latest save', async () => {
  await withBrowser(async ({ queue }) => {
    const firstRequest = deferred<CloudDocumentRecord>();
    const secondRequest = deferred<CloudDocumentRecord>();
    const requests: { revision: number; doc: MindMapDocument }[] = [];
    const current = queue(async (_id, revision, doc) => {
      requests.push({ revision, doc });
      return requests.length === 1 ? firstRequest.promise : secondRequest.promise;
    });
    current.register(record());
    current.enqueue('record-a', document('first edit'));
    const firstFlush = current.flush();
    const joiningFlush = current.flush();
    await Promise.resolve();
    assert.equal(requests.length, 1);
    current.enqueue('record-a', document('edited while saving'));
    firstRequest.resolve(record(document('first edit'), 2));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(requests.map(request => request.revision), [1, 2]);
    assert.equal(requests[1].doc.title, 'edited while saving');
    const draft = listPendingCloudSaves('alice', 'record-a')[0];
    assert.equal(draft.expectedRevision, 2);
    assert.equal(draft.document.title, 'edited while saving');
    secondRequest.resolve(record(document('edited while saving'), 3));
    assert.deepEqual(await Promise.all([firstFlush, joiningFlush]), [true, true]);
    assert.equal(current.entries.get('record-a')?.record.revision, 3);
    assert.equal(current.entries.get('record-a')?.status, 'saved');
    assert.equal(listPendingCloudSaves('alice', 'record-a').length, 0);
  });
});

test('a reentrant flush during saving joins the same revision request', async () => {
  await withBrowser(async ({ queue }) => {
    let requests = 0;
    let joined: Promise<boolean> | undefined;
    const current = queue(async (id, revision, doc) => {
      requests++;
      return record(doc, revision + 1, id);
    }, { onChange: () => {
      if (current.entries.get('record-a')?.status === 'saving' && !joined) joined = current.flush();
    } });
    current.register(record());
    current.enqueue('record-a', document('one edit'));
    assert.equal(await current.flush(), true);
    assert.equal(await joined, true);
    assert.equal(requests, 1);
  });
});

test('dispose aborts requests, preserves the durable draft, and ignores late success and failure', async () => {
  for (const outcome of ['success', 'failure'] as const) {
    await withBrowser(async ({ queue }) => {
      const request = deferred<CloudDocumentRecord>();
      let signal: AbortSignal | undefined;
      let changes = 0;
      let expired = 0;
      const current = queue(async (_id, _revision, _doc, nextSignal) => {
        signal = nextSignal;
        return request.promise;
      }, { onChange: () => changes++, onSessionExpired: () => expired++ });
      current.register(record());
      current.enqueue('record-a', document('retained draft'));
      const flush = current.flush();
      await Promise.resolve();
      current.dispose();
      const changesAtDispose = changes;
      assert.equal(signal?.aborted, true);
      if (outcome === 'success') request.resolve(record(document('retained draft'), 2));
      else request.reject(new CloudError('UNAUTHENTICATED', 'expired', 401));
      assert.equal(await flush, false);
      assert.equal(changes, changesAtDispose);
      assert.equal(expired, 0);
      assert.equal(current.entries.size, 0);
      assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'retained draft');
      current.register(record(), listPendingCloudSaves('alice', 'record-a')[0]);
      assert.equal(current.entries.size, 0);
      assert.equal(await current.flush(), false);
    });
  }
});

test('replacing an entry ignores its late save result and preserves the abandoned draft', async () => {
  await withBrowser(async ({ queue }) => {
    const request = deferred<CloudDocumentRecord>();
    const current = queue(async () => request.promise);
    current.register(record());
    current.enqueue('record-a', document('prior in-flight edit'));
    const flush = current.flush();
    await Promise.resolve();
    current.register(record(document('selected server copy'), 2));
    request.resolve(record(document('prior in-flight edit'), 2));
    assert.equal(await flush, false);
    assert.equal(current.entries.get('record-a')?.document.title, 'selected server copy');
    assert.equal(current.entries.get('record-a')?.status, 'saved');
    assert.equal(current.getPendingSnapshots()[0].document.title, 'prior in-flight edit');
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'prior in-flight edit');
  });
});

test('offline and transient errors retain edits and explicit retries save them', async () => {
  await withBrowser(async ({ queue, network }) => {
    let attempts = 0;
    const current = queue(async (id, revision, doc) => {
      attempts++;
      if (attempts === 1) throw new Error('Temporary service failure');
      return record(doc, revision + 1, id);
    });
    current.register(record());
    current.enqueue('record-a', document('offline edit'));
    network.onLine = false;
    assert.equal(await current.flush(), false);
    assert.equal(attempts, 0);
    assert.equal(current.entries.get('record-a')?.status, 'offline');
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'offline edit');
    network.onLine = true;
    assert.equal(await current.flush(), false);
    assert.equal(current.entries.get('record-a')?.status, 'error');
    assert.equal(current.entries.get('record-a')?.error, 'Temporary service failure');
    assert.equal(await current.flush(), true);
    assert.equal(attempts, 2);
    assert.equal(listPendingCloudSaves('alice', 'record-a').length, 0);
  });
});

test('session expiry marks errors, preserves drafts, notifies once, and stops further requests from that session', async () => {
  await withBrowser(async ({ queue }) => {
    let attempts = 0;
    let expired = 0;
    const current = queue(async () => {
      attempts++;
      throw new CloudError('UNAUTHENTICATED', 'Sign in again', 401);
    }, { onSessionExpired: () => expired++ });
    current.register(record());
    current.register(record(document(), 1, 'record-b'));
    current.enqueue('record-a', document('private edit A'));
    current.enqueue('record-b', document('private edit B'));
    assert.equal(await current.flush(), false);
    assert.equal(attempts, 2);
    assert.equal(expired, 1);
    assert.equal(current.entries.get('record-a')?.status, 'error');
    assert.equal(current.entries.get('record-b')?.status, 'error');
    assert.equal(current.getPendingSnapshots().length, 2);
    assert.equal(await current.flush(), false);
    current.enqueue('record-a', document('edit after expiry'));
    assert.equal(await current.flush(), false);
    assert.equal(attempts, 2);
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'edit after expiry');
  });
});

test('revision conflicts retain edits and never retry until explicitly resolved', async () => {
  await withBrowser(async ({ queue }) => {
    let attempts = 0;
    const current = queue(async () => {
      attempts++;
      throw new CloudError('REVISION_CONFLICT', 'stale', 409, 3);
    });
    current.register(record());
    current.enqueue('record-a', document('conflicting edit'));
    assert.equal(await current.flush(), false);
    assert.equal(current.entries.get('record-a')?.status, 'conflict');
    current.enqueue('record-a', document('more conflicting edits'));
    assert.equal(await current.flush(), false);
    assert.equal(attempts, 1);
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'more conflicting edits');
    const recovered = queue(saveSuccessfully);
    recovered.register(record(document('server'), 3), listPendingCloudSaves('alice', 'record-a')[0]);
    assert.equal(recovered.entries.get('record-a')?.status, 'conflict');
    assert.equal(await recovered.flush(), false);
  });
});

test('remote deletion retains pending edits as a conflict and never retries the deleted record', async () => {
  await withBrowser(async ({ queue }) => {
    let attempts = 0;
    const current = queue(async () => {
      attempts++;
      throw new CloudError('DOCUMENT_NOT_FOUND', 'deleted', 404);
    });
    current.register(record());
    current.enqueue('record-a', document('edit before remote deletion'));
    assert.equal(await current.flush(), false);
    assert.equal(current.entries.get('record-a')?.status, 'conflict');
    assert.equal(current.entries.get('record-a')?.error,
      '원본 문서가 삭제됐습니다. 내 변경을 새 사본으로 저장해 주세요.');
    current.enqueue('record-a', document('edit after remote deletion'));
    assert.equal(await current.flush(), false);
    assert.equal(attempts, 1);
    assert.equal(current.entries.get('record-a')?.status, 'conflict');
    assert.equal(current.getPendingSnapshots()[0].document.title, 'edit after remote deletion');
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'edit after remote deletion');
  });
});

test('malformed metadata and document drafts cannot hide other valid writer drafts or cross scopes', async () => {
  await withBrowser(({ queue, storage }) => {
    const current = queue(saveSuccessfully);
    current.register(record());
    current.enqueue('record-a', document('valid draft'));
    const valid = listPendingCloudSaves('alice', 'record-a')[0];
    const invalidValues: unknown[] = [
      null, [], { ...valid, savedAt: undefined }, { ...valid, savedAt: 42 },
      { ...valid, savedAt: 'not a date' }, { ...valid, writerId: '' },
      { ...valid, writeId: '' }, { ...valid, expectedRevision: 0 },
      { ...valid, expectedRevision: 1.5 }, { ...valid, ownerId: 'bob' },
      { ...valid, recordId: 'record-b' }, { ...valid, document: { nodes: [] } },
      { ...valid, document: { ...valid.document, updatedAt: null } },
    ];
    invalidValues.forEach((value, index) => {
      const writerId = `invalid-${index}`;
      const bound = value && typeof value === 'object' && !Array.isArray(value)
        ? { ...value, writerId: (value as PendingCloudSave).writerId === '' ? '' : writerId }
        : value;
      storage.setItem(pendingCloudKey('alice', 'record-a', writerId), JSON.stringify(bound));
    });
    storage.setItem(pendingCloudKey('alice', 'record-a', 'invalid-json'), '{');
    assert.equal(listPendingCloudSaves('alice', 'record-a').length, 1);
    assert.equal(listPendingCloudSaves('bob', 'record-a').length, 0);
    assert.equal(listPendingCloudSaves('alice', 'record-b').length, 0);
    storage.failRead = true;
    assert.deepEqual(listPendingCloudSaves('alice', 'record-a'), []);
    assert.doesNotThrow(() => clearPendingCloudSave(valid));
  });
});

test('owner draft enumeration includes deleted records and isolates accounts without remote requests', async () => {
  await withBrowser(({ queue }) => {
    let requests = 0;
    const remoteMustNotRun: QueueOptions['save'] = async () => {
      requests++;
      throw new Error('Local recovery must not query the remote record');
    };
    const alice = queue(remoteMustNotRun);
    alice.register(record());
    alice.register(record(document(), 1, 'deleted-record'));
    alice.enqueue('record-a', document('existing alice draft'));
    alice.enqueue('deleted-record', document('orphaned alice draft'));
    const bob = queue(remoteMustNotRun, { ownerId: 'bob' });
    bob.register(record(document(), 1, 'deleted-record'));
    bob.enqueue('deleted-record', document('private bob draft'));
    const drafts = listOwnerPendingCloudSaves('alice');
    assert.equal(drafts.length, 2);
    assert.deepEqual(new Set(drafts.map(draft => draft.recordId)), new Set(['record-a', 'deleted-record']));
    assert.ok(drafts.every(draft => draft.ownerId === 'alice'));
    assert.equal(drafts.find(draft => draft.recordId === 'deleted-record')?.document.title, 'orphaned alice draft');
    assert.equal(listOwnerPendingCloudSaves('bob')[0].document.title, 'private bob draft');
    assert.deepEqual(listOwnerPendingCloudSaves('unknown-owner'), []);
    assert.equal(requests, 0);
  });
});

test('owner draft enumeration skips malformed or key-mismatched records without hiding valid orphan drafts', async () => {
  await withBrowser(({ queue, storage }) => {
    const current = queue(saveSuccessfully);
    current.register(record(document(), 1, 'deleted-record'));
    current.enqueue('deleted-record', document('valid orphan'));
    const valid = current.getPendingSnapshots()[0];
    const malformed: Partial<PendingCloudSave>[] = [
      { ...valid, writerId: 'bad-time', savedAt: 'not a date' },
      { ...valid, writerId: 'bad-document', document: { nodes: [], updatedAt: valid.document.updatedAt } as unknown as MindMapDocument },
      { ...valid, writerId: 'bad-record', recordId: '' },
      { ...valid, writerId: 'other-account', ownerId: 'bob' },
      { ...valid, writerId: 'mismatched-record', recordId: 'different-record' },
    ];
    malformed.forEach(draft => storage.setItem(
      pendingCloudKey('alice', 'deleted-record', draft.writerId!, draft.writeId), JSON.stringify(draft),
    ));
    storage.setItem(pendingCloudKey('alice', 'broken-json-record', 'broken'), '{');
    const drafts = listOwnerPendingCloudSaves('alice');
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].writeId, valid.writeId);
    assert.equal(drafts[0].document.title, 'valid orphan');
  });
});

test('recovery validates account and record binding before it can write private drafts', async () => {
  await withBrowser(({ queue, storage }) => {
    const alice = queue(saveSuccessfully);
    alice.register(record());
    alice.enqueue('record-a', document('alice private'));
    const draft = alice.getPendingSnapshots()[0];
    const bob = queue(saveSuccessfully, { ownerId: 'bob' });
    assert.throws(() => bob.register(record(), draft));
    assert.throws(() => alice.register(record(document(), 1, 'record-b'), draft));
    assert.equal(bob.entries.size, 0);
    assert.ok([...storage.values.keys()].every(key => !key.includes(':bob:')));
  });
});

test('quota and storage access failures expose deep cloned volatile drafts for account-switch recovery', async () => {
  await withBrowser(async ({ queue, storage }) => {
    storage.failWrite = true;
    const current = queue(saveSuccessfully);
    current.register(record());
    current.enqueue('record-a', document('memory only edit'));
    assert.equal(current.entries.get('record-a')?.recoveryAvailable, false);
    assert.equal(storage.values.size, 0);
    const retained = current.getPendingSnapshots()[0];
    const poisonedCopy = current.getPendingSnapshots()[0];
    poisonedCopy.document.title = 'mutated copy';
    poisonedCopy.document.nodes[0].data.label = 'mutated nested value';
    assert.equal(current.getPendingSnapshots()[0].document.title, 'memory only edit');
    assert.notEqual(current.getPendingSnapshots()[0].document.nodes[0].data.label, 'mutated nested value');
    current.dispose();
    storage.failRead = true;
    assert.deepEqual(listPendingCloudSaves('alice', 'record-a'), []);
    const recovered = queue(saveSuccessfully);
    recovered.register(record(), retained);
    assert.equal(recovered.entries.get('record-a')?.document.title, 'memory only edit');
    assert.equal(recovered.entries.get('record-a')?.recoveryAvailable, false);
    assert.equal(await recovered.flush(), true);
    assert.equal(recovered.getPendingSnapshots().length, 0);
  });
});

test('a successful save clears the previous durable snapshot after a later quota failure', async () => {
  await withBrowser(async ({ queue, storage }) => {
    const cleared: PendingCloudSave[] = [];
    const current = queue(saveSuccessfully, { onDraftCleared: draft => cleared.push(draft) });
    current.register(record());
    current.enqueue('record-a', document('older durable edit'));
    const durable = listPendingCloudSaves('alice', 'record-a')[0];
    storage.failWrite = true;
    current.enqueue('record-a', document('newer volatile edit'));
    const latest = current.getPendingSnapshots()[0];
    assert.equal(await current.flush(), true);
    assert.deepEqual(listPendingCloudSaves('alice', 'record-a'), []);
    assert.deepEqual(new Set(cleared.map(draft => draft.writeId)), new Set([durable.writeId, latest.writeId]));
  });
});

test('durable replacement clears exact superseded volatile and durable cache entries before the final save', async () => {
  await withBrowser(async ({ queue, storage }) => {
    const cached = new Map<string, PendingCloudSave>();
    const cleared: string[] = [];
    const current = queue(saveSuccessfully, { onDraftCleared: draft => {
      cleared.push(draft.writeId);
      cached.delete(draft.writeId);
    } });
    const cacheCurrent = () => {
      for (const draft of current.getPendingSnapshots()) cached.set(draft.writeId, draft);
    };
    current.register(record());
    current.enqueue('record-a', document('first durable edit'));
    cacheCurrent();
    const first = current.getPendingSnapshots()[0];
    storage.failWrite = true;
    current.enqueue('record-a', document('second volatile edit'));
    cacheCurrent();
    const second = current.getPendingSnapshots()[0];
    assert.equal(cached.size, 2);
    assert.deepEqual(cleared, []);
    storage.failWrite = false;
    current.enqueue('record-a', document('third durable edit'));
    cacheCurrent();
    const third = current.getPendingSnapshots()[0];
    assert.deepEqual(new Set(cleared), new Set([first.writeId, second.writeId]));
    assert.deepEqual([...cached.keys()], [third.writeId]);
    assert.equal(await current.flush(), true);
    assert.equal(cached.size, 0);
    assert.equal(new Set(cleared).size, 3);
    assert.equal(listPendingCloudSaves('alice', 'record-a').length, 0);
  });
});

test('blocked localStorage property access keeps edits in memory and unknown discard is harmless', async () => {
  await withBrowser(async ({ queue }) => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => {
      throw new DOMException('Storage access denied', 'SecurityError');
    } });
    const current = queue(saveSuccessfully);
    assert.doesNotThrow(() => current.discardPending('missing-record'));
    current.register(record());
    current.enqueue('record-a', document('blocked-storage edit'));
    assert.equal(current.entries.get('record-a')?.recoveryAvailable, false);
    assert.equal(current.getPendingSnapshots()[0].document.title, 'blocked-storage edit');
    assert.deepEqual(listPendingCloudSaves('alice', 'record-a'), []);
    assert.equal(await current.flush(), true);
    assert.equal(current.getPendingSnapshots().length, 0);
  });
});

test('consuming the current draft ignores its late save and preserves distinct recovery sources and newer writer drafts', async () => {
  await withBrowser(async ({ queue }) => {
    const writer = queue(saveSuccessfully);
    writer.register(record());
    writer.enqueue('record-a', document('original recovery source'));
    const original = writer.getPendingSnapshots()[0];
    const request = deferred<CloudDocumentRecord>();
    let changes = 0;
    const cleared: PendingCloudSave[] = [];
    const recovery = queue(async () => request.promise, {
      onChange: () => changes++, onDraftCleared: draft => cleared.push(draft),
    });
    recovery.register(record(), original);
    recovery.enqueue('record-a', document('selected copied draft'));
    const selected = recovery.getPendingSnapshots()[0];
    const flush = recovery.flush();
    await Promise.resolve();
    writer.enqueue('record-a', document('newer original writer edit'));
    const newer = writer.getPendingSnapshots()[0];
    recovery.consumeRecoveryDraft(selected);
    assert.equal(recovery.entries.size, 0);
    assert.equal(recovery.getPendingSnapshots().length, 1);
    assert.equal(recovery.getPendingSnapshots()[0].writeId, original.writeId);
    assert.equal(cleared.at(-1)?.writeId, selected.writeId);
    const changesAfterConsumption = changes;
    request.resolve(record(document('selected copied draft'), 2));
    assert.equal(await flush, false);
    assert.equal(changes, changesAfterConsumption);
    assert.equal(recovery.entries.size, 0);
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].writeId, newer.writeId);
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'newer original writer edit');
    recovery.consumeRecoveryDraft(original);
    assert.equal(recovery.getPendingSnapshots().length, 0);
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].writeId, newer.writeId);

    // A selected source on a still-active recovered entry is consumed without
    // unregistering its newer pending snapshot.
    recovery.register(record(), newer);
    recovery.enqueue('record-a', document('newer active recovery edit'));
    const active = recovery.getPendingSnapshots()[0];
    recovery.consumeRecoveryDraft(newer);
    assert.equal(recovery.entries.get('record-a')?.pendingSnapshot?.writeId, active.writeId);
    assert.equal(recovery.entries.get('record-a')?.recoverySource, undefined);
    assert.equal(recovery.getPendingSnapshots()[0].writeId, active.writeId);
  });
});

test('consuming an archived draft removes only its exact identity and rejects a different owner', async () => {
  await withBrowser(({ queue, storage }) => {
    const cleared: PendingCloudSave[] = [];
    const current = queue(saveSuccessfully, { onDraftCleared: draft => cleared.push(draft) });
    current.register(record());
    current.enqueue('record-a', document('archived selected draft'));
    const selected = current.getPendingSnapshots()[0];
    current.register(record(document('server copy'), 3));
    current.enqueue('record-a', document('independent newer draft'));
    current.register(record(document(), 1, 'record-b'));
    current.enqueue('record-b', document('another record draft'));
    const others = current.getPendingSnapshots().filter(draft => draft.writeId !== selected.writeId);
    assert.equal(others.length, 2);
    const bob = queue(saveSuccessfully, { ownerId: 'bob' });
    bob.register(record());
    bob.enqueue('record-a', document('bob private draft'));
    const bobDraft = bob.getPendingSnapshots()[0];
    assert.throws(() => current.consumeRecoveryDraft(bobDraft));
    assert.equal(listOwnerPendingCloudSaves('bob')[0].writeId, bobDraft.writeId);
    current.consumeRecoveryDraft(selected);
    assert.deepEqual(new Set(current.getPendingSnapshots().map(draft => draft.writeId)), new Set(others.map(draft => draft.writeId)));
    assert.equal(current.entries.size, 2);
    assert.equal(storage.getItem(pendingCloudKey('alice', 'record-a', selected.writerId, selected.writeId)), null);
    assert.ok(cleared.some(draft => draft.writeId === selected.writeId));
    assert.equal(listPendingCloudSaves('alice', 'record-a')[0].document.title, 'independent newer draft');
    assert.equal(listOwnerPendingCloudSaves('bob')[0].document.title, 'bob private draft');
  });
});
