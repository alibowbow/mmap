import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portableFixture } from '../io/fixture';
import { exportDocumentJson } from '../../src/lib/export';
import { parseImportJson } from '../../src/lib/validation';
import { toSharedCloudDocument } from '../../src/lib/cloud/projection';

test('cloud public projection preserves portable appearance and collapse without history or other document navigation', () => {
  const document = portableFixture();
  const augmented = { ...document, snapshots: [{ id: 'private-history', label: 'private', nodes: [], edges: [], createdAt: '2026-01-01' }], owner_id: 'private-owner', share_token_hash: 'private-hash' };
  const shared = toSharedCloudDocument(augmented);
  assert.deepEqual(shared.appearance, document.appearance);
  assert.equal(shared.nodes.length, document.nodes.length);
  assert.deepEqual(shared.nodes.map(n => n.data.collapsed), document.nodes.map(n => n.data.collapsed));
  assert.ok(!('snapshots' in shared));
  assert.ok(!('owner_id' in shared));
  assert.ok(!('share_token_hash' in shared));
  assert.ok(!('id' in shared));
});

test('optional real 749-node document remains compatible through import, export and public projection', { skip: !process.env.MMAP_PRIVATE_FIXTURE }, () => {
  const input = parseImportJson(readFileSync(process.env.MMAP_PRIVATE_FIXTURE!, 'utf8'));
  if (!input.ok) throw new Error(input.error);
  assert.equal(input.document.nodes.length, 749);
  const roundTrip = parseImportJson(exportDocumentJson(input.document));
  if (!roundTrip.ok) throw new Error(roundTrip.error);
  assert.equal(roundTrip.document.edges.length, 748);
  assert.deepEqual(roundTrip.document.appearance, input.document.appearance);
  assert.deepEqual(roundTrip.document.ink, input.document.ink);
  const shared = toSharedCloudDocument(roundTrip.document);
  assert.equal(shared.nodes.length, 749);
  assert.equal(shared.edges.length, 748);
  assert.deepEqual(shared.appearance, input.document.appearance);
});
