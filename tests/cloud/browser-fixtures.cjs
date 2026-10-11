/* Local-only browser fixtures. This is an intentionally limited HTTP simulator,
   not evidence of live Google, Supabase, RLS, or deployment verification. */
const http = require('node:http');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { appearanceFrom } = require('../../src/lib/appearance.ts');
const { buildEdgesFromNodes } = require('../../src/lib/tree.ts');
const { toSharedCloudDocument } = require('../../src/lib/cloud/projection.ts');
const { validateCloudDocument } = require('../../src/lib/cloud/security.ts');

const LOCAL_KEY = 'mindforge-workspace-v1';
const AUTH_KEY = 'sb-127-auth-token';
const USERS = {
  alice: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'alice@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { full_name: 'Alice Mock' }, created_at: '2026-01-01T00:00:00Z' },
  bob: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'bob@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { full_name: 'Bob Mock' }, created_at: '2026-01-01T00:00:00Z' },
};
const clone = value => JSON.parse(JSON.stringify(value));
function documentFixture(id = 'local-a', title = '선택한 로컬 문서') {
  const nodes = [
    { id: 'root', type: 'mindmap', position: { x: 0, y: 0 }, data: { label: title, type: 'root', isRoot: true, parentId: null } },
    { id: 'branch', type: 'mindmap', position: { x: 360, y: 0 }, data: { label: '공개 가지', type: 'idea', parentId: 'root', description: '표시되는 설명', tags: ['공개'], checklist: [{ id: 'check', text: '공개 체크리스트', checked: false }], link: 'https://example.test/display', linkedDocId: 'PRIVATE_PORTAL', backDocId: 'PRIVATE_BACK', backNodeId: 'PRIVATE_BACK_NODE' } },
    { id: 'leaf', type: 'mindmap', position: { x: 720, y: 0 }, data: { label: '검색할 잎', type: 'task', parentId: 'branch', status: 'todo' } },
  ];
  return {
    id, title, nodes, edges: buildEdgesFromNodes(nodes), relations: [], layoutMode: 'right-tree',
    appearance: appearanceFrom({ font: 'jua', theme: 'dark', accent: 'rose', canvasBg: 'cross', nodeStyle: 'soft', edgeLine: 'dashed', edgeWidth: 3, nodeTint: true }),
    viewport: { x: 240, y: 320, zoom: .65 }, createdAt: '2026-10-01', updatedAt: '2026-10-01', pinned: true,
    snapshots: [{ id: 'PRIVATE_SNAPSHOT', label: 'PRIVATE_HISTORY', createdAt: '2026-10-01', nodes: clone(nodes), edges: buildEdgesFromNodes(nodes) }],
    ink: { version: 4, strokes: [{ id: 'display-ink', color: '#f97316', width: 5, points: [{ x: 20, y: 180, pressure: .4 }, { x: 170, y: 190, pressure: .8 }, { x: 290, y: 180, pressure: .5 }], materialStyle: 'grain-v1', seed: 42, erasures: [{ radius: 5, points: [{ x: 140, y: 185 }] }] }], objects: [{ id: 'display-label', kind: 'label', text: '공개 잉크', x: 10, y: 240, width: 180, height: 40, color: '#111111', fill: false, fontSize: 20 }], order: ['display-ink', 'display-label'], paper: { kind: 'cream', texture: .3, seed: 4 } },
  };
}
function workspaceFixture(documents = [documentFixture(), documentFixture('local-b', '선택하지 않은 로컬 문서')]) {
  return { version: 1, ...appearanceFrom({ theme: 'light' }), documents: clone(documents), activeDocumentId: documents[0].id, sidebarCollapsed: true, inspectorOpen: false };
}
function sessionFixture(name = 'alice', expiresIn = 3600) {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const token = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: USERS[name].id, role: 'authenticated', exp })).toString('base64url') + '.mock-signature';
  return { access_token: token, refresh_token: `mock-refresh-${name}`, token_type: 'bearer', expires_in: expiresIn, expires_at: exp, user: clone(USERS[name]) };
}
async function startMock(port) {
  const state = {
    records: new Map(), shares: new Map(), codes: new Map(), sessions: new Map(), requests: [], authRequests: [], authorize: [], exchanges: [], delays: new Map(), responseHolds: new Map(),
    nextUser: 'alice', failLogout: false, failSaves: false, rejectOwner: null,
  };
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const error = (res, status, code, message, revision) => json(res, status, { error: { code, message, ...(revision ? { currentRevision: revision } : {}) } });
  const registerSession = name => {
    const session = sessionFixture(name);
    state.sessions.set(session.access_token, name);
    return session;
  };
  const addRecord = (name, document, id = randomUUID()) => {
    const normalized = validateCloudDocument(document);
    if (typeof document.updatedAt === 'string') normalized.updatedAt = document.updatedAt;
    const record = { id, document: clone(normalized), revision: 1, updatedAt: new Date().toISOString(), shareEnabled: false };
    state.records.set(id, { ownerId: USERS[name].id, record });
    return record;
  };
  const summary = record => ({ id: record.id, title: record.document.title, revision: record.revision, updatedAt: record.updatedAt, shareEnabled: record.shareEnabled });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'content-type,authorization,apikey,x-client-info,x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    let body = {};
    try {
      if (req.method === 'POST') { const chunks = []; for await (const chunk of req) chunks.push(chunk); body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
      if (url.pathname.startsWith('/auth/v1/')) state.authRequests.push({ path: url.pathname, method: req.method, grantType: url.searchParams.get('grant_type') });
      if (url.pathname === '/auth/v1/authorize') {
        const redirect = new URL(url.searchParams.get('redirect_to'));
        assert.equal(redirect.hostname, '127.0.0.1');
        assert.equal(url.searchParams.get('provider'), 'google');
        assert.equal(url.searchParams.get('code_challenge_method'), 's256');
        assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]+$/);
        const code = randomUUID();
        state.authorize.push(Object.fromEntries(url.searchParams));
        state.codes.set(code, { name: state.nextUser, challenge: url.searchParams.get('code_challenge') });
        redirect.searchParams.set('code', code);
        res.writeHead(302, { Location: redirect.toString() }); res.end(); return;
      }
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'pkce') {
          const code = state.codes.get(body.auth_code);
          if (!code || createHash('sha256').update(body.code_verifier || '').digest('base64url') !== code.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verifier mismatch' });
          state.codes.delete(body.auth_code);
          state.exchanges.push({ name: code.name, verified: true });
          return json(res, 200, registerSession(code.name));
        }
        const name = Object.keys(USERS).find(name => body.refresh_token === `mock-refresh-${name}`);
        if (!name) return json(res, 400, { error: 'invalid_grant', error_description: 'Expired mock session' });
        return json(res, 200, registerSession(name));
      }
      if (url.pathname === '/auth/v1/logout') {
        if (state.failLogout) return json(res, 400, { code: 'unexpected_failure', msg: 'Mock logout unavailable' });
        return json(res, 200, {});
      }
      if (url.pathname === '/auth/v1/user') {
        const name = state.sessions.get((req.headers.authorization || '').replace(/^Bearer /, ''));
        return name ? json(res, 200, USERS[name]) : json(res, 401, { msg: 'Invalid mock JWT' });
      }
      if (!url.pathname.startsWith('/api/cloud/')) return json(res, 404, { error: 'Unknown local mock route' });
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const name = state.sessions.get(token), ownerId = name && USERS[name].id;
      state.requests.push({ path: url.pathname, body: clone(body), ownerId, authorization: Boolean(req.headers.authorization), cookie: req.headers.cookie || null, referrer: req.headers.referer || null });
      const wait = state.delays.get(`${url.pathname}:${body.action || body.token}:${body.id || ''}`);
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      if (url.pathname === '/api/cloud/shared') {
        const id = state.shares.get(body.token), value = id && state.records.get(id);
        if (!value?.record.shareEnabled) return error(res, 404, 'SHARE_NOT_FOUND', '공유 중지');
        return json(res, 200, { document: toSharedCloudDocument(value.record.document) });
      }
      if (!ownerId || state.rejectOwner === ownerId) return error(res, 401, 'UNAUTHORIZED', 'Mock session expired');
      if (url.pathname === '/api/cloud/documents') {
        if (body.action === 'list') return json(res, 200, { documents: [...state.records.values()].filter(value => value.ownerId === ownerId).map(value => summary(value.record)) });
        const value = body.id && state.records.get(body.id);
        if (body.id && value?.ownerId !== ownerId) return error(res, 404, 'DOCUMENT_NOT_FOUND', '문서를 찾을 수 없습니다.');
        if (body.action === 'get') {
          const record = clone(value.record), hold = state.responseHolds.get(`/api/cloud/documents:get:${body.id}`);
          if (hold) await hold;
          return json(res, 200, { record });
        }
        if (body.action === 'delete') {
          if (body.expectedRevision !== value.record.revision) return error(res, 409, 'REVISION_CONFLICT', '삭제 전 버전이 변경됐습니다.', value.record.revision);
          state.records.delete(body.id);
          for (const [token, id] of state.shares) if (id === body.id) state.shares.delete(token);
          const hold = state.responseHolds.get(`/api/cloud/documents:delete:${body.id}`);
          if (hold) await hold;
          return json(res, 200, { deleted: true });
        }
        if (body.action === 'save') {
          if (state.failSaves) return error(res, 503, 'CLOUD_REQUEST_FAILED', 'Mock 저장 서비스 오류');
          const document = validateCloudDocument(body.document);
          const raw = body.document?.document || body.document;
          if (typeof raw.updatedAt === 'string') document.updatedAt = raw.updatedAt;
          if (!body.id) return json(res, 200, { record: addRecord(name, document) });
          if (body.expectedRevision !== value.record.revision) return error(res, 409, 'REVISION_CONFLICT', '다른 탭이 먼저 저장했습니다.', value.record.revision);
          value.record = { ...value.record, document: clone(document), revision: value.record.revision + 1, updatedAt: new Date().toISOString() };
          return json(res, 200, { record: value.record });
        }
      }
      if (url.pathname === '/api/cloud/share') {
        const value = state.records.get(body.id);
        if (value?.ownerId !== ownerId) return error(res, 404, 'DOCUMENT_NOT_FOUND', '문서를 찾을 수 없습니다.');
        for (const [token, id] of state.shares) if (id === body.id) state.shares.delete(token);
        if (body.action === 'revoke') { value.record.shareEnabled = false; return json(res, 200, { enabled: false }); }
        const token = randomBytes(32).toString('base64url');
        value.record.shareEnabled = true;
        state.shares.set(token, body.id);
        return json(res, 200, { enabled: true, token });
      }
      return error(res, 400, 'INVALID_REQUEST', 'Unknown test operation');
    } catch (cause) { json(res, 500, { error: { code: 'MOCK_FAILURE', message: cause.message } }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { state, registerSession, addRecord, close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { LOCAL_KEY, AUTH_KEY, USERS, clone, documentFixture, workspaceFixture, sessionFixture, startMock };
