import test from 'node:test';
import assert from 'node:assert/strict';
import { useMindMapStore as store } from '../../src/store/mindMapStore';
import { portableFixture } from '../io/fixture';
import { workspaceStorageKey } from '../../src/lib/storage';

globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = id => clearTimeout(id);

test('opening cloud maps and switching accounts never writes private content to the local workspace', () => {
  const previous = globalThis.window;
  const storage = new Map<string, string>();
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    matchMedia: () => ({ matches: false }),
  } as unknown as Window & typeof globalThis;
  try {
    const local = { ...portableFixture(), id: 'local', title: 'local-only' };
    const alice = { ...portableFixture(), id: 'cloud-alice', title: 'alice-private' };
    const bob = { ...portableFixture(), id: 'cloud-bob', title: 'bob-private' };
    store.setState({ workspaceOwnerId: null, hydrated: true, documents: [local], activeDocumentId: local.id, nodes: local.nodes, edges: local.edges, flow: null, history: [], future: [] });
    store.getState().saveWorkspace();
    store.getState().openCloudDocument('alice', alice);
    assert.equal(store.getState().activeDocumentId, alice.id);
    assert.ok(!storage.get(workspaceStorageKey())!.includes('alice-private'));
    store.getState().openCloudDocument('bob', bob);
    assert.equal(store.getState().activeDocumentId, bob.id);
    assert.ok(!store.getState().documents.some(doc => doc.id === alice.id));
    assert.ok(!storage.get(workspaceStorageKey('bob'))!.includes('alice-private'));
    store.getState().switchWorkspaceOwner(null);
    assert.equal(store.getState().activeDocumentId, local.id);
    assert.deepEqual(store.getState().documents.map(doc => doc.id), [local.id]);
    assert.equal(store.getState().history.length, 0);
    assert.equal(store.getState().future.length, 0);
    assert.equal(store.getState().clipboard, null);
    assert.ok(storage.get(workspaceStorageKey('alice'))!.includes('alice-private'));
    assert.ok(!storage.get(workspaceStorageKey())!.includes('bob-private'));
  } finally { globalThis.window = previous; }
});

test('storage failure keeps local and per-account documents available through account switches in the same tab', () => {
  const previous = globalThis.window;
  const storage = new Map<string, string>();
  let blocked = false;
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => { if (blocked) throw new Error('Storage denied'); return storage.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (blocked) throw new Error('Storage denied'); storage.set(key, value); },
      removeItem: (key: string) => storage.delete(key),
    },
    matchMedia: () => ({ matches: false }),
  } as unknown as Window & typeof globalThis;
  try {
    const local = { ...portableFixture(), id: 'failure-local', title: 'original-local' };
    const alice = { ...portableFixture(), id: 'failure-alice', title: 'private-edit-alice' };
    const bob = { ...portableFixture(), id: 'failure-bob', title: 'private-edit-bob' };
    store.setState({ workspaceOwnerId: null, hydrated: true, documents: [local], activeDocumentId: local.id, nodes: local.nodes, edges: local.edges, flow: null, history: [], future: [] });
    store.getState().saveWorkspace();
    store.getState().openCloudDocument('failure-alice-owner', alice);
    blocked = true;
    store.getState().renameDocument(alice.id, 'unsaved-alice');
    store.getState().switchWorkspaceOwner(null);
    assert.equal(store.getState().activeDocumentId, local.id);
    assert.equal(store.getState().saveStatus, 'error');
    store.getState().openCloudDocument('failure-bob-owner', bob);
    assert.ok(!store.getState().documents.some(doc => doc.id === alice.id));
    store.getState().switchWorkspaceOwner('failure-alice-owner');
    assert.equal(store.getState().documents[0].title, 'unsaved-alice');
    assert.ok(!store.getState().documents.some(doc => doc.id === bob.id));
    assert.equal(store.getState().saveStatus, 'error');
    blocked = false;
    store.getState().saveWorkspace();
    assert.equal(store.getState().saveStatus, 'saved');
    assert.ok(storage.get(workspaceStorageKey('failure-alice-owner'))!.includes('unsaved-alice'));
    assert.ok(!storage.get(workspaceStorageKey())!.includes('private-edit'));
  } finally { globalThis.window = previous; }
});
