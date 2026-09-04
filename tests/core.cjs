const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const { queryDocuments, taskProgress } = require('../src/lib/documentLibrary.ts');
const { parseOutlineToTree } = require('../src/lib/outlineImport.ts');
const tree = parseOutlineToTree('# Research\n## Plan\n- [ ] Read paper\n  - [x] Download dataset\n- [X] Write notes\n## Findings\n- Key result');
const byLabel = Object.fromEntries(tree.nodes.map((n) => [n.data.label, n]));
assert.equal(byLabel['Read paper'].data.type, 'task');
assert.equal(byLabel['Read paper'].data.status, 'todo');
assert.equal(byLabel['Download dataset'].data.status, 'done');
assert.equal(byLabel['Download dataset'].data.parentId, byLabel['Read paper'].id);
assert.equal(byLabel['Write notes'].data.status, 'done');
assert.equal(byLabel['Key result'].data.type, 'plain');
assert.equal(byLabel['Key result'].data.parentId, byLabel.Findings.id);
assert.equal(tree.nodes.filter((n) => n.data.isRoot).length, 1);
assert.equal(parseOutlineToTree(' \n'), null);
const doc = { id: 'research', title: 'Research', ...tree, createdAt: '2026-01-01', updatedAt: '2026-09-01' };
byLabel['Key result'].data.description = '임플란트 장기 예후';
byLabel['Key result'].data.tags = ['AI', '검증'];
byLabel['Key result'].data.checklist = [{ id: 'c1', text: '추적 관찰', checked: false }];
const other = { id: 'pinned', title: 'Map 2', nodes: [], pinned: true, createdAt: '2025-01-01', updatedAt: '2025-01-01' };
const docs = [doc, other];
const original = JSON.stringify(docs);
assert.deepEqual(taskProgress(doc), { total: 3, done: 2, remaining: 1 });
assert.equal(queryDocuments(docs, '임플란트 ai', 'all', 'recent')[0].document.id, 'research');
assert.match(queryDocuments(docs, '추적', 'all', 'recent')[0].snippet, /추적 관찰/);
assert.equal(queryDocuments(docs, 'missing', 'all', 'recent').length, 0);
assert.equal(queryDocuments(docs, '', 'pinned', 'recent')[0].document.id, 'pinned');
assert.equal(queryDocuments(docs, '', 'unfinished', 'name')[0].document.id, 'research');
assert.equal(queryDocuments(docs, '', 'all', 'recent')[0].document.id, 'pinned');
assert.equal(queryDocuments(docs, 'Research', 'pinned', 'name').length, 0);
assert.equal(JSON.stringify(docs), original, 'queries do not mutate persisted documents');
console.log('PASS: task import hierarchy, completion, full-text search, filters, sorting, immutability');
