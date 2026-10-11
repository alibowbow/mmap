/* Browser integration with a local HTTP PKCE/auth/CAS simulator only.
   Build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:43121 and
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_browser_test_only, then
   node --import tsx tests/e2e/cloud-workspace.cjs. No live services or profiles. */
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { encodeSharedDocument } = require('../../src/lib/share.ts');
const { toSharedCloudDocument } = require('../../src/lib/cloud/projection.ts');
const { pendingCloudKey } = require('../../src/lib/cloudSync.ts');
const { LOCAL_KEY, AUTH_KEY, USERS, clone, documentFixture, workspaceFixture, startMock } = require('../cloud/browser-fixtures.cjs');
const appPort = Number(process.env.CLOUD_BROWSER_PORT || 43122);
const authPort = Number(process.env.CLOUD_AUTH_PORT || 43121);
const base = `http://127.0.0.1:${appPort}`;
const mockBase = `http://127.0.0.1:${authPort}`;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'mindbranch-cloud-browser-'));
const report = { scope: 'Local HTTP mock only; no live Google OAuth, Supabase, RLS, deployment, or real browser-profile verification.', browser: '', checks: [], failures: [], observations: [], pageErrors: [] };
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let browser, mock, server, logs = '';

async function poll(work, message, timeout = 15000) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) { if (await work()) return; await delay(100); }
  assert.fail(message);
}
function saveRequests() { return mock.state.requests.filter(request => request.path === '/api/cloud/documents' && request.body.action === 'save'); }
async function ready(page) {
  await page.waitForSelector('[data-mindmap-canvas][aria-busy="false"]');
  await page.waitForSelector('.react-flow__node');
  await page.evaluate(() => document.fonts.ready);
}
async function panel(page) {
  let dialog = page.getByRole('dialog', { name: '계정 및 클라우드', exact: true });
  if (!(await dialog.isVisible())) await page.getByRole('button', { name: /^계정 및 클라우드 문서 열기/ }).click();
  await dialog.waitFor();
  return dialog;
}
async function closePanel(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '계정 및 클라우드', exact: true }).waitFor({ state: 'hidden' });
}
async function title(page, next) {
  await page.locator('button[title="제목을 클릭해 수정"]').click();
  const input = page.locator('input:focus');
  await input.fill(next); await input.press('Enter');
  await page.locator('button[title="제목을 클릭해 수정"]').getByText(next, { exact: true }).waitFor();
}
async function openLocal(page, label = '선택한 로컬 문서') {
  await page.getByRole('button', { name: label + ' 열기', exact: true }).first().click();
  await ready(page);
}
async function currentTitle(page) { return page.locator('button[title="제목을 클릭해 수정"]').innerText(); }
async function status(page, expected) { await page.waitForSelector(`[data-cloud-status="${expected}"]`); }
async function drafts(page) {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('mindbranch-cloud-pending-v2:')).map(key => ({ key, value: JSON.parse(localStorage.getItem(key)) })));
}
async function localWorkspace(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), LOCAL_KEY); }
async function ownerWorkspace(page, name = 'alice') { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), `${LOCAL_KEY}:cloud:${encodeURIComponent(USERS[name].id)}`); }
async function editRoot(page, label) {
  const node = page.locator('.react-flow__node[data-id="root"]');
  await node.dblclick(); await node.locator('textarea').fill(label); await node.locator('textarea').press('Enter');
  await node.getByText(label, { exact: true }).waitFor();
}
async function cachedHomeOpen(page, documentId) {
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.locator(`#documents-list li[data-document-id="${documentId}"] .mf-doc-open`).click();
  await ready(page);
}
async function switchSession(page, name) {
  const session = mock.registerSession(name);
  await page.evaluate(({ session, authKey }) => {
    localStorage.setItem(authKey, JSON.stringify(session));
    const channel = new BroadcastChannel(authKey); channel.postMessage({ event: 'SIGNED_IN', session }); channel.close();
  }, { session, authKey: AUTH_KEY });
  const dialog = await panel(page);
  await dialog.getByText(USERS[name].email, { exact: true }).waitFor();
  return dialog;
}
async function newContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...(options.storageState ? { storageState: options.storageState } : {}) });
  context.setDefaultTimeout(12000);
  const workspace = options.workspace || workspaceFixture();
  const session = options.signedIn ? mock.registerSession(options.user || 'alice') : null;
  await context.addInitScript(({ base, key, authKey, workspace, session }) => {
    if (location.origin !== base || localStorage.getItem('cloud-browser-fixture-seeded')) return;
    localStorage.setItem(key, JSON.stringify(workspace));
    localStorage.setItem('mindforge-onboarded-v1', '1');
    if (session) localStorage.setItem(authKey, JSON.stringify(session));
    localStorage.setItem('cloud-browser-fixture-seeded', '1');
  }, { base, key: LOCAL_KEY, authKey: AUTH_KEY, workspace, session });
  await context.route('**/api/cloud/**', async route => {
    const request = route.request();
    const headers = request.headers();
    try {
      const response = await fetch(mockBase + new URL(request.url()).pathname, {
        method: request.method(), headers: {
          'Content-Type': 'application/json',
          ...(headers.authorization ? { Authorization: headers.authorization } : {}),
          ...(headers.cookie ? { Cookie: headers.cookie } : {}),
          ...(headers.referer ? { Referer: headers.referer } : {}),
        }, body: request.postData(),
      });
      await route.fulfill({ status: response.status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: await response.text() });
    } catch (error) { if (!pageClosedError(error)) throw error; }
  });
  context.on('page', page => {
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept().catch(() => {}));
  });
  return context;
}
function pageClosedError(error) { return /Target.*closed|already handled|interception|canceled|cancelled/i.test(error.message); }
async function appPage(context) { const page = await context.newPage(); await page.goto(base + '/?doc=local-a'); await ready(page); return page; }
async function login(page, name = 'alice') {
  mock.state.nextUser = name;
  const dialog = await panel(page);
  const callback = page.waitForURL(url => url.origin === base && url.searchParams.has('code'), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await dialog.getByRole('button', { name: 'Google로 계속하기', exact: true }).click();
  await callback;
  await page.waitForURL(url => url.origin === base && !url.searchParams.has('code'), { timeout: 20000 });
  await page.waitForSelector('[data-cloud-status]');
  const signed = await panel(page);
  await signed.getByText(USERS[name].email, { exact: true }).waitFor();
  return signed;
}
async function openCloud(page, record) {
  const dialog = await panel(page);
  await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${record.document.title}`, exact: true }).click();
  await page.waitForFunction(id => location.search.includes(id), record.document.id);
  await ready(page);
  return dialog;
}
async function openServerVersion(page, recordId, label) {
  const dialog = await panel(page);
  const response = page.waitForResponse(response => response.url().endsWith('/api/cloud/documents') && response.request().postDataJSON()?.action === 'get' && response.request().postDataJSON()?.id === recordId);
  await dialog.getByRole('button', { name: label }).click(); await response; await delay(100);
  const latest = dialog.getByRole('button', { name: '서버 최신본 열기', exact: true });
  if (await latest.isVisible()) await latest.click();
  await ready(page); await closePanel(page); await delay(1100); await status(page, 'saved');
}
async function runCase(name, work) {
  if (process.env.CLOUD_BROWSER_CASE && !new RegExp(process.env.CLOUD_BROWSER_CASE).test(name)) return;
  mock.state.records.clear(); mock.state.shares.clear(); mock.state.requests.length = 0; mock.state.delays.clear(); mock.state.responseHolds.clear();
  mock.state.failLogout = false; mock.state.failSaves = false; mock.state.rejectOwner = null;
  const start = Date.now();
  try { await work(); report.checks.push({ name, ms: Date.now() - start }); console.log('PASS ' + name); }
  catch (error) { report.failures.push({ name, message: error.message, stack: error.stack, auth: clone(mock.state.authRequests), cloud: mock.state.requests.map(request => ({ action: request.body.action, id: request.body.id, expectedRevision: request.body.expectedRevision, title: request.body.document?.document?.title, ownerId: request.ownerId })) }); console.error('FAIL ' + name + ': ' + error.message); }
}

async function main() {
  mock = await startMock(authPort);
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), process.env.CLOUD_BROWSER_DEV === '1' ? 'dev' : 'start', '--hostname', '127.0.0.1', '--port', String(appPort)], { cwd: process.cwd(), env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: mockBase, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test_only' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', chunk => logs += chunk); server.stderr.on('data', chunk => logs += chunk);
  try {
    await poll(async () => { try { return (await fetch(base)).ok; } catch { return false; } }, 'Next server failed to start: ' + logs, 60000);
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
    report.browser = browser.version();

    await runCase('Logged-out persistence, mock Google PKCE, explicit selected copy, owner-only autosave and return-local isolation', async () => {
      const context = await newContext();
      try {
        const page = await appPage(context);
        await title(page, '로컬 편집 지속');
        await poll(async () => (await localWorkspace(page)).documents[0].title === '로컬 편집 지속', 'Local edit did not persist');
        await page.reload(); await ready(page);
        assert.equal(await currentTitle(page), '로컬 편집 지속');
        assert.equal(saveRequests().length, 0);
        const before = await localWorkspace(page);
        let dialog = await login(page);
        const authorizeCount = mock.state.authorize.length;
        await page.reload();
        dialog = await panel(page);
        await dialog.getByText(USERS.alice.email, { exact: true }).waitFor();
        assert.equal(mock.state.authorize.length, authorizeCount, 'Refresh must resume the persistent mock session');
        assert.equal(mock.state.exchanges.at(-1).verified, true);
        assert.equal(saveRequests().length, 0, 'Login must not upload the local workspace');
        await dialog.getByRole('button', { name: '선택한 문서를 클라우드로 복사', exact: true }).click();
        assert.equal(saveRequests().length, 0, 'Copy must await explicit selection confirmation');
        await dialog.getByRole('button', { name: '확인', exact: true }).click();
        await status(page, 'saved');
        assert.equal(saveRequests().length, 1);
        assert.equal(mock.state.records.size, 1, 'Only selected document copied');
        await page.screenshot({ path: path.join(output, 'cloud-account-panel-desktop.png') });
        const value = [...mock.state.records.values()][0];
        assert.notEqual(value.record.document.id, before.activeDocumentId, 'Cloud copy gets independent document identity');
        const localAfterCopy = (await localWorkspace(page)).documents;
        const content = documents => documents.map(({ viewport, ...document }) => document);
        assert.deepEqual(content(localAfterCopy), content(before.documents));
        await closePanel(page); await title(page, '클라우드 수정'); await status(page, 'saved');
        await poll(() => value.record.revision === 2, 'Owned cloud autosave did not use CAS revision');
        assert.equal(value.record.document.title, '클라우드 수정');
        assert.deepEqual((await localWorkspace(page)).documents, localAfterCopy);
        dialog = await panel(page);
        await dialog.getByRole('button', { name: '이 브라우저의 로컬 문서로 돌아가기', exact: true }).click();
        await closePanel(page); await openLocal(page, '로컬 편집 지속'); await title(page, '인증 중 로컬 수정');
        await poll(async () => (await localWorkspace(page)).documents[0].title === '인증 중 로컬 수정', 'Returned local map did not persist');
        await delay(1100);
        assert.equal(saveRequests().length, 2, 'Authenticated local maps must never autosave to cloud');
      } finally { await context.close(); }
      const mobileContext = await newContext({ signedIn: true });
      try {
        const mobile = await appPage(mobileContext);
        await openCloud(mobile, [...mock.state.records.values()][0].record); await closePanel(mobile);
        for (const width of [320, 375]) {
          await mobile.setViewportSize({ width, height: 900 });
          const widget = mobile.locator('[data-cloud-status]');
          const geometry = await widget.boundingBox();
          assert.ok(geometry.x >= 0 && geometry.x + geometry.width <= width && geometry.y >= 64 && geometry.y + geometry.height < 180, 'Compact account widget stays within the mobile top area');
          const trigger = mobile.getByRole('button', { name: /^계정 및 클라우드 문서 열기/ });
          assert.ok(await trigger.isVisible(), 'Icon-only account control retains an accessible name');
          assert.equal(await mobile.getByRole('button', { name: '로컬로', exact: true }).isVisible(), false, 'Mobile shortcut is hidden while dialog retains return-local action');
          const mobileDialog = await panel(mobile);
          const dimensions = await mobileDialog.boundingBox();
          assert.ok(dimensions.width <= width + 1 && dimensions.height <= 901);
          assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Account panel must not overflow at ' + width);
          await mobileDialog.getByRole('button', { name: '이 브라우저의 로컬 문서로 돌아가기', exact: true }).waitFor();
          await mobile.screenshot({ path: path.join(output, 'cloud-account-panel-' + width + '.png') });
          await closePanel(mobile);
        }
      } finally { await mobileContext.close(); }
    });

    await runCase('Failed save persists recovery and explicit retry saves current revision', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-error', '저장 실패 검증'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        mock.state.failSaves = true; await title(page, '보관할 실패 수정'); await status(page, 'error');
        assert.equal((await drafts(page)).length, 1); assert.equal(record.revision, 1);
        mock.state.failSaves = false;
        await (await panel(page)).getByRole('button', { name: '저장 다시 시도', exact: true }).click();
        await status(page, 'saved');
        assert.equal(mock.state.records.get(record.id).record.document.title, '보관할 실패 수정');
        assert.equal((await drafts(page)).length, 0);
      } finally { await context.close(); }
    });

    await runCase('Offline edit remains durable and reconnect retries without losing local workspace', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-offline', '오프라인 검증'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        const localBefore = (await localWorkspace(page)).documents;
        await context.setOffline(true); await title(page, '오프라인 변경'); await status(page, 'offline');
        assert.equal((await drafts(page)).length, 1); assert.equal(saveRequests().length, 0);
        await context.setOffline(false); await status(page, 'saved');
        assert.equal(mock.state.records.get(record.id).record.document.title, '오프라인 변경');
        assert.deepEqual((await localWorkspace(page)).documents, localBefore);
      } finally { await context.close(); }
    });

    await runCase('Expired API session returns local and retains the account draft', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-expiry', '로그인 만료 검증'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        mock.state.rejectOwner = USERS.alice.id; await title(page, '만료 직전 변경'); await status(page, 'local');
        assert.equal((await drafts(page)).length, 1);
        await (await panel(page)).getByRole('alert').filter({ hasText: '로그인이 만료' }).waitFor();
        await closePanel(page); await openLocal(page);
        assert.equal(await currentTitle(page), '선택한 로컬 문서');
        assert.equal(mock.state.records.get(record.id).record.revision, 1);
      } finally { await context.close(); }
    });

    await runCase('Unavailable browser storage warns and preserves cloud/local edits in memory', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-quota', '복구 저장 공간 검증'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        const durableBeforeFailure = await drafts(page);
        mock.state.failSaves = true;
        await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('mindbranch-cloud-pending-v2:')) throw new DOMException('Test quota exceeded', 'QuotaExceededError'); return original.call(this, key, value); }; });
        await title(page, '복구 공간 부족 수정'); await status(page, 'error');
        await (await panel(page)).getByRole('alert').filter({ hasText: '브라우저 복구 저장 공간' }).waitFor();
        assert.equal(await currentTitle(page), '복구 공간 부족 수정');
        assert.deepEqual(await drafts(page), durableBeforeFailure, 'Failed new draft write must retain prior durable recovery');
        await page.evaluate(() => {
          const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
          Storage.prototype.getItem = function(key) { if (key.startsWith('mindforge-workspace-v1')) throw new DOMException('Test storage denied', 'SecurityError'); return originalGet.call(this, key); };
          Storage.prototype.setItem = function(key, value) { if (key.startsWith('mindforge-workspace-v1')) throw new DOMException('Test storage denied', 'SecurityError'); return originalSet.call(this, key, value); };
        });
        await (await panel(page)).getByRole('button', { name: '이 브라우저의 로컬 문서로 돌아가기', exact: true }).click();
        await closePanel(page); await openLocal(page);
        assert.equal(await currentTitle(page), '선택한 로컬 문서', 'Switching local must use retained memory when browser storage is denied');
        await title(page, '저장 접근 거부 후 편집');
        assert.equal(await currentTitle(page), '저장 접근 거부 후 편집'); await status(page, 'local');
      } finally { await context.close(); }
    });

    await runCase('Two tabs use separate drafts; CAS prevents overwrite and recovery is explicit', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-tabs', '다중 탭 검증'));
      const context = await newContext({ signedIn: true });
      try {
        const first = await appPage(context), second = await appPage(context);
        await first.bringToFront(); await openCloud(first, record); await closePanel(first); await delay(1100); await status(first, 'saved');
        await second.bringToFront(); await openCloud(second, mock.state.records.get(record.id).record); await closePanel(second); await delay(1100); await status(second, 'saved');
        const baselineRevision = mock.state.records.get(record.id).record.revision;
        await first.route('**/api/cloud/documents', async route => { const request = route.request(); if (request.postDataJSON().action === 'save') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CLOUD_REQUEST_FAILED', message: 'Tab one mock failure' } }) }); return route.fallback(); });
        await first.bringToFront(); await title(first, '첫 탭 미저장 변경'); await status(first, 'error');
        const firstDraft = (await drafts(first))[0];
        await second.bringToFront(); await title(second, '두 번째 탭 저장 변경');
        await poll(async () => (await drafts(second)).length === 2, 'Both writers must have their own pending recovery draft');
        assert.equal(new Set((await drafts(second)).map(draft => draft.value.writerId)).size, 2);
        await status(second, 'saved');
        await poll(() => mock.state.records.get(record.id).record.revision === baselineRevision + 1, 'Second tab did not save');
        const remaining = await drafts(second);
        assert.equal(remaining.length, 1); assert.equal(remaining[0].value.writerId, firstDraft.value.writerId, 'Other tab successful save must not clear first draft');
        await first.unroute('**/api/cloud/documents');
        await first.bringToFront(); await (await panel(first)).getByRole('button', { name: '저장 다시 시도', exact: true }).click(); await status(first, 'conflict');
        assert.equal(mock.state.records.get(record.id).record.document.title, '두 번째 탭 저장 변경');
        const third = await appPage(context), countBeforeOpen = saveRequests().length;
        const recovery = await panel(third);
        await recovery.getByRole('button', { name: `클라우드 문서 열기 · ${mock.state.records.get(record.id).record.document.title}`, exact: true }).click();
        await recovery.getByRole('button', { name: /^저장 대기 내용 복구 ·/ }).waitFor();
        await delay(1000);
        assert.equal(saveRequests().length, countBeforeOpen, 'Draft recovery must not implicitly upload on open');
        await recovery.getByRole('button', { name: /^저장 대기 내용 복구 ·/ }).click(); await status(third, 'conflict');
        assert.equal(await currentTitle(third), '첫 탭 미저장 변경');
        await third.bringToFront(); await ready(third); await delay(1100); await status(third, 'conflict');
        await recovery.getByRole('button', { name: '내 변경을 새 사본으로 저장', exact: true }).click(); await status(third, 'saved');
        assert.equal(mock.state.records.size, 2);
        assert.equal(mock.state.records.get(record.id).record.document.title, '두 번째 탭 저장 변경');
        assert.equal((await drafts(third)).length, 0);
      } finally { await context.close(); }
    });

    await runCase('Deleted server record leaves an offline browser draft recoverable without implicit upload', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-orphan', '삭제 전 원본'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        await delay(1100); await status(page, 'saved');
        await context.setOffline(true); await title(page, '서버에서 삭제된 오프라인 변경'); await status(page, 'offline');
        mock.state.records.delete(record.id);
        await context.setOffline(false); await status(page, 'conflict');
        const other = { ownerId: USERS.alice.id, recordId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', writerId: 'other-browser-writer', writeId: 'other-browser-write', expectedRevision: 1, savedAt: new Date().toISOString(), document: documentFixture('other-orphan', '다른 복구 문서') };
        await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: pendingCloudKey(other.ownerId, other.recordId, other.writerId, other.writeId), value: other });
        await page.reload();
        const dialog = await panel(page), countBefore = saveRequests().length;
        const recovery = dialog.locator('section[aria-label="브라우저 복구 문서"]');
        await recovery.getByRole('button', { name: /^브라우저 복구 문서 열기 · 서버에서 삭제된 오프라인 변경 ·/ }).click();
        await ready(page);
        assert.equal(await currentTitle(page), '서버에서 삭제된 오프라인 변경 (브라우저 복구)');
        assert.notEqual(new URL(page.url()).searchParams.get('doc'), record.document.id);
        await delay(1100);
        assert.equal(saveRequests().length, countBefore, 'Opening orphan recovery must not implicitly create/upload a cloud record');
        assert.equal(mock.state.records.size, 0);
        await dialog.getByRole('button', { name: '선택한 문서를 클라우드로 복사', exact: true }).click();
        await dialog.getByRole('button', { name: '확인', exact: true }).click(); await status(page, 'saved');
        assert.equal(mock.state.records.size, 1);
        assert.equal([...mock.state.records.values()][0].ownerId, USERS.alice.id);
        assert.equal([...mock.state.records.values()][0].record.document.title, '서버에서 삭제된 오프라인 변경 (브라우저 복구)');
        const remaining = await drafts(page);
        assert.equal(remaining.length, 1); assert.equal(remaining[0].value.writerId, other.writerId, 'Explicit recovery copy must retain the unselected browser draft');
      } finally { await context.close(); }
    });

    for (const variant of ['refresh', 'restart', 'account switch', 'offline', 'legacy baseline']) await runCase(`P1 cached cloud A survives main-list editing after ${variant}`, async () => {
      const a = mock.addRecord('alice', documentFixture(`cached-a-${variant.replace(/ /g, '-')}`, `캐시 A ${variant}`));
      const b = mock.addRecord('alice', documentFixture(`cached-b-${variant.replace(/ /g, '-')}`, `캐시 B ${variant}`));
      const editedTitle = `편집된 캐시 A ${variant}`, editedRoot = `유실되면 안 되는 A 본문 ${variant}`;
      let context = await newContext({ signedIn: true });
      try {
        let page = await appPage(context);
        await openCloud(page, a); await closePanel(page); await delay(1100); await status(page, 'saved');
        if (variant === 'legacy baseline') await page.evaluate(ownerId => {
          for (const key of Object.keys(localStorage)) if (key.startsWith(`mindbranch-cloud-baseline-v1:${encodeURIComponent(ownerId)}:`)) localStorage.removeItem(key);
        }, USERS.alice.id);
        await page.reload();
        await openCloud(page, b); await closePanel(page); await delay(1100); await status(page, 'saved');
        await cachedHomeOpen(page, a.document.id);
        if (variant === 'offline') await context.setOffline(true);
        await title(page, editedTitle); await editRoot(page, editedRoot);
        await poll(async () => (await ownerWorkspace(page)).documents.some(document => document.id === a.document.id && document.title === editedTitle && document.nodes[0].data.label === editedRoot), 'Edited cached A was not persisted in its owner workspace');
        await delay(1100);
        const before = { displayedTitle: await currentTitle(page), cache: (await ownerWorkspace(page)).documents.find(document => document.id === a.document.id), drafts: await drafts(page), saves: saveRequests().filter(request => request.body.id === a.id).length };
        if (variant === 'offline') await context.setOffline(false);
        if (variant === 'restart') {
          const storageState = await context.storageState(); await context.close();
          context = await newContext({ signedIn: true, storageState });
          page = await appPage(context); await openCloud(page, mock.state.records.get(b.id).record); await closePanel(page);
          await cachedHomeOpen(page, a.document.id);
        }
        if (variant === 'account switch') {
          const requestBoundary = mock.state.requests.length;
          await switchSession(page, 'bob'); await closePanel(page);
          await openLocal(page); await title(page, 'Bob 인증 중 별도 로컬 편집'); await delay(1100);
          assert.equal(mock.state.requests.slice(requestBoundary).some(request => request.ownerId === USERS.bob.id && request.body.id === a.id), false, 'Alice cached edits must not be sent with Bob credentials');
          await switchSession(page, 'alice'); await closePanel(page);
          await openCloud(page, mock.state.records.get(b.id).record); await closePanel(page); await cachedHomeOpen(page, a.document.id);
        }
        const dialog = await panel(page);
        const response = page.waitForResponse(response => response.url().endsWith('/api/cloud/documents') && response.request().postDataJSON()?.action === 'get' && response.request().postDataJSON()?.id === a.id);
        await dialog.getByRole('button', { name: new RegExp('^클라우드 문서 열기 · .*캐시 A ' + variant + '$') }).click();
        await response;
        const recovery = dialog.getByRole('button', { name: new RegExp('^저장 대기 내용 복구 · ' + editedTitle + ' ·') });
        await recovery.waitFor();
        const writerPrefix = (await recovery.getAttribute('aria-label')).split(' · ').at(-1);
        const selectedDraft = (await drafts(page)).find(draft => draft.value.document.title === editedTitle && draft.value.writerId.startsWith(writerPrefix));
        assert.ok(selectedDraft, 'The recovery choice must refer to independently durable edited content');
        assert.equal(selectedDraft.value.document.nodes[0].data.label, editedRoot);
        assert.equal(saveRequests().filter(request => request.body.id === a.id).length, before.saves, 'Opening a cached edit must await explicit recovery before any owner write');
        if (variant === 'refresh') await page.screenshot({ path: path.join(output, 'cached-a-explicit-recovery.png') });
        await recovery.click();
        await ready(page);
        report.observations.push({ name: `cached A ${variant}`, before, after: { displayedTitle: await currentTitle(page), root: await page.locator('.react-flow__node[data-id="root"]').innerText(), drafts: await drafts(page), remoteTitle: mock.state.records.get(a.id).record.document.title, remoteRoot: mock.state.records.get(a.id).record.document.nodes[0].data.label, aSaves: saveRequests().filter(request => request.body.id === a.id).length } });
        const restoredTitle = await currentTitle(page), browserCopy = restoredTitle === editedTitle + ' (브라우저 복구)';
        assert.ok(restoredTitle === editedTitle || browserCopy, 'Account-panel open must retain the exact edited title, optionally with the browser recovery suffix');
        await page.locator('.react-flow__node[data-id="root"]').getByText(editedRoot, { exact: true }).waitFor();
        if (variant === 'refresh') await page.screenshot({ path: path.join(output, 'cached-a-restored-content.png') });
        if (variant === 'legacy baseline') assert.equal(browserCopy, true, 'Unknown legacy provenance must recover a browser copy');
        if (browserCopy) {
          assert.notEqual(new URL(page.url()).searchParams.get('doc'), a.document.id);
          assert.equal(saveRequests().filter(request => request.body.id === a.id).length, before.saves, 'Unknown legacy binding must recover a browser copy without implicit upload');
          assert.equal(mock.state.records.get(a.id).record.document.title, a.document.title);
        } else assert.equal(new URL(page.url()).searchParams.get('doc'), a.document.id, 'Registered recovery must retain the owner document identity');
        assert.equal(mock.state.records.get(b.id).record.document.title, b.document.title);
      } finally { await context.close(); }
    });

    await runCase('P1 delayed server GET preserves unbound cache edits made before replacement', async () => {
      const a = mock.addRecord('alice', documentFixture('delayed-cache-a', '지연 캐시 A'));
      const b = mock.addRecord('alice', documentFixture('delayed-cache-b', '지연 캐시 B'));
      const context = await newContext({ signedIn: true });
      let releaseGet = () => {};
      try {
        const page = await appPage(context); await openCloud(page, a); await closePanel(page); await delay(1100); await status(page, 'saved');
        await page.reload(); await openCloud(page, b); await closePanel(page); await delay(1100); await status(page, 'saved');
        await cachedHomeOpen(page, a.document.id);
        await page.route('**/api/cloud/documents', async route => {
          const body = route.request().postDataJSON();
          if (body.action === 'get' && body.id === a.id) await new Promise(resolve => releaseGet = resolve);
          await route.fallback();
        });
        const dialog = await panel(page), countBefore = saveRequests().length;
        const delayed = page.waitForRequest(request => request.url().endsWith('/api/cloud/documents') && request.postDataJSON()?.action === 'get' && request.postDataJSON()?.id === a.id);
        await dialog.getByRole('button', { name: '클라우드 문서 열기 · 지연 캐시 A', exact: true }).click(); await delayed;
        await closePanel(page); await title(page, 'GET 중 편집한 캐시 A'); await editRoot(page, 'GET 응답보다 늦게 만든 본문');
        assert.equal((await drafts(page)).some(draft => draft.value.document.title === 'GET 중 편집한 캐시 A'), true, 'Unbound edit must become independently durable before GET completes');
        const response = page.waitForResponse(response => response.url().endsWith('/api/cloud/documents') && response.request().postDataJSON()?.action === 'get' && response.request().postDataJSON()?.id === a.id);
        releaseGet(); await response;
        const choice = await panel(page);
        await choice.getByRole('button', { name: /^저장 대기 내용 복구 · GET 중 편집한 캐시 A ·/ }).waitFor();
        assert.equal(await currentTitle(page), 'GET 중 편집한 캐시 A');
        assert.equal(saveRequests().length, countBefore, 'GET and recovery prompt must not implicitly upload the unbound edits');
        await choice.getByRole('button', { name: /^저장 대기 내용 복구 · GET 중 편집한 캐시 A ·/ }).click(); await ready(page);
        assert.ok(['GET 중 편집한 캐시 A', 'GET 중 편집한 캐시 A (브라우저 복구)'].includes(await currentTitle(page)));
        await page.locator('.react-flow__node[data-id="root"]').getByText('GET 응답보다 늦게 만든 본문', { exact: true }).waitFor();
      } finally { releaseGet(); await context.close(); }
    });

    await runCase('P1 edited browser recovery copy survives another tab cache save and restart', async () => {
      const source = mock.addRecord('alice', documentFixture('recovery-source', '복구 원본'));
      const normal = mock.addRecord('alice', documentFixture('normal-other-tab', '다른 탭 정상 원본'));
      const context = await newContext({ signedIn: true });
      try {
        const first = await appPage(context);
        await openCloud(first, source); await closePanel(first); await delay(1100); await status(first, 'saved');
        await first.route('**/api/cloud/documents', route => route.request().postDataJSON().action === 'save' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CLOUD_REQUEST_FAILED', message: 'Recovery source mock failure' } }) }) : route.fallback());
        await title(first, '먼저 남긴 원본 복구 초안'); await status(first, 'error');
        const sourceDraft = (await drafts(first)).find(draft => draft.value.document.title === '먼저 남긴 원본 복구 초안');
        assert.ok(sourceDraft);
        await (await panel(first)).getByRole('button', { name: '이 브라우저의 로컬 문서로 돌아가기', exact: true }).click(); await closePanel(first);
        const second = await appPage(context); await second.bringToFront(); await openCloud(second, normal); await closePanel(second); await delay(1100); await status(second, 'saved');
        await first.bringToFront();
        await (await panel(first)).getByRole('button', { name: /^브라우저 복구 문서 열기 · 먼저 남긴 원본 복구 초안 ·/ }).click(); await ready(first); await closePanel(first);
        await title(first, '복구 사본에 추가한 독립 편집'); await editRoot(first, '다른 탭에도 보존할 복구 본문'); await delay(1100);
        const copyId = new URL(first.url()).searchParams.get('doc');
        assert.notEqual(copyId, source.document.id);
        await (await panel(first)).getByRole('button', { name: '이 브라우저의 로컬 문서로 돌아가기', exact: true }).click(); await closePanel(first);
        const requestBoundary = saveRequests().length;
        await second.bringToFront(); await title(second, '다른 탭 정상 저장 완료'); await status(second, 'saved');
        await poll(() => mock.state.records.get(normal.id).record.document.title === '다른 탭 정상 저장 완료', 'Second tab cloud save missing');
        assert.equal(saveRequests().slice(requestBoundary).every(request => request.body.id === normal.id), true, 'Unregistered recovery copy must not upload implicitly');
        await first.bringToFront(); await first.reload();
        const dialog = await panel(first);
        const after = await drafts(first);
        report.observations.push({ name: 'edited recovery copy after other-tab save', copyId, ownerCache: await ownerWorkspace(first), drafts: after, sourceRemoteTitle: mock.state.records.get(source.id).record.document.title });
        assert.equal(after.some(draft => draft.value.document.title === '복구 사본에 추가한 독립 편집' && draft.value.document.nodes[0].data.label === '다른 탭에도 보존할 복구 본문'), true, 'Edited recovery copy needs an independent writer draft even when another tab overwrites the account workspace cache');
        assert.equal(after.some(draft => draft.key === sourceDraft.key), true, 'Editing a recovery copy must retain its original unconsumed draft');
        await dialog.getByRole('button', { name: /^브라우저 복구 문서 열기 · 복구 사본에 추가한 독립 편집 ·/ }).click(); await ready(first);
        assert.match(await currentTitle(first), /^복구 사본에 추가한 독립 편집/);
        await first.locator('.react-flow__node[data-id="root"]').getByText('다른 탭에도 보존할 복구 본문', { exact: true }).waitFor();
        assert.equal(mock.state.records.get(source.id).record.document.title, source.document.title);
      } finally { await context.close(); }
    });

    await runCase('P1 return-local invalidates cloud bindings before another tab stale cache hydration', async () => {
      const x = mock.addRecord('alice', documentFixture('context-x', '이전 캐시 X'));
      const y = mock.addRecord('alice', documentFixture('context-y', '정상 문서 Y'));
      const context = await newContext({ signedIn: true });
      try {
        const first = await appPage(context), second = await appPage(context);
        await first.bringToFront(); await openCloud(first, x); await closePanel(first); await delay(1100); await status(first, 'saved');
        await second.bringToFront(); await openCloud(second, mock.state.records.get(x.id).record); await closePanel(second); await delay(1100); await status(second, 'saved');
        await openCloud(second, y); await closePanel(second); await delay(1100); await status(second, 'saved');
        await first.bringToFront(); await openServerVersion(first, x.id, /^클라우드 문서 열기 · .*X$/);
        await title(first, '첫 탭 최신 저장 X'); await editRoot(first, '서버에 보존할 최신 X 본문'); await delay(1100); await status(first, 'saved');
        const latestX = clone(mock.state.records.get(x.id).record), sourceSaveCount = saveRequests().filter(request => request.body.id === x.id).length;
        assert.equal(latestX.document.title, '첫 탭 최신 저장 X');
        await (await panel(first)).getByRole('button', { name: '이 브라우저의 로컬 문서로 돌아가기', exact: true }).click(); await closePanel(first);
        await second.bringToFront(); await title(second, '두 번째 탭 저장 Y'); await delay(1100); await status(second, 'saved');
        await poll(async () => (await ownerWorkspace(second)).documents.find(document => document.id === x.document.id)?.title === '이전 캐시 X', 'Second tab did not write its older X cache with unrelated Y save');
        await first.bringToFront();
        await (await panel(first)).getByRole('button', { name: /^클라우드 문서 열기 · .*Y$/ }).click(); await ready(first); await closePanel(first);
        await title(first, '첫 탭 새 컨텍스트 Y'); await delay(1100); await status(first, 'saved');
        report.observations.push({ name: 'return-local queue binding hydration', acknowledgedX: latestX, afterYEditX: clone(mock.state.records.get(x.id).record), sourceSaves: saveRequests().filter(request => request.body.id === x.id).map(request => ({ expectedRevision: request.body.expectedRevision, title: request.body.document.document.title })) });
        assert.deepEqual(mock.state.records.get(x.id).record, latestX, 'Editing newly hydrated Y must not enqueue stale cached X with a surviving latest-revision binding');
        assert.equal(saveRequests().filter(request => request.body.id === x.id).length, sourceSaveCount, 'Only Y may save after returning from the local workspace');
        const dialog = await panel(first);
        const response = first.waitForResponse(response => response.url().endsWith('/api/cloud/documents') && response.request().postDataJSON()?.action === 'get' && response.request().postDataJSON()?.id === x.id);
        await dialog.getByRole('button', { name: /^클라우드 문서 열기 · .*X$/ }).click();
        await response; await delay(100);
        const latest = dialog.getByRole('button', { name: '서버 최신본 열기', exact: true });
        const needsRecovery = await latest.isVisible();
        if (needsRecovery) {
          assert.equal((await drafts(first)).some(draft => draft.value.document.title === '이전 캐시 X'), true, 'An offered divergent-cache recovery must remain independently durable');
          await latest.click();
        }
        await ready(first);
        assert.equal(await currentTitle(first), latestX.document.title);
        await first.locator('.react-flow__node[data-id="root"]').getByText('서버에 보존할 최신 X 본문', { exact: true }).waitFor();
        if (needsRecovery) assert.equal((await drafts(first)).some(draft => draft.value.document.title === '이전 캐시 X'), true, 'Choosing server latest must retain the old-cache recovery draft');
        assert.equal(mock.state.records.get(x.id).record.document.title, latestX.document.title);
        assert.equal(mock.state.records.get(x.id).record.document.nodes[0].data.label, '서버에 보존할 최신 X 본문');
      } finally { await context.close(); }
    });

    await runCase('P1 same-ID legacy draft forks survive context changes and browser restart', async () => {
      const x = mock.addRecord('alice', documentFixture('legacy-fork-x', '이전 캐시 분기 X'));
      const y = mock.addRecord('alice', documentFixture('legacy-fork-y', '분기 검증 Y'));
      const context = await newContext({ signedIn: true });
      try {
        const first = await appPage(context), second = await appPage(context);
        await first.bringToFront(); await openCloud(first, x); await closePanel(first); await delay(1100); await status(first, 'saved');
        await second.bringToFront(); await openCloud(second, mock.state.records.get(x.id).record); await closePanel(second); await delay(1100); await status(second, 'saved');
        await openCloud(second, y); await closePanel(second); await delay(1100); await status(second, 'saved');
        await first.bringToFront(); await openServerVersion(first, x.id, /^클라우드 문서 열기 · .*X$/);
        await title(first, '서버 최신 분기 X'); await editRoot(first, '서버 최신 분기 본문'); await delay(1100); await status(first, 'saved');
        const latestX = clone(mock.state.records.get(x.id).record), savesBeforeLegacyEdit = saveRequests().filter(request => request.body.id === x.id).length;
        await first.evaluate(documentId => {
          for (const key of Object.keys(localStorage)) if (key.startsWith('mindbranch-cloud-baseline-v1:')) {
            const metadata = JSON.parse(localStorage.getItem(key));
            if (metadata.documentId === documentId) localStorage.removeItem(key);
          }
        }, x.document.id);
        await first.reload(); await openCloud(first, mock.state.records.get(y.id).record); await closePanel(first);
        await cachedHomeOpen(first, x.document.id);
        await title(first, '더 새로운 미등록 분기 X'); await editRoot(first, '새 분기에서 보존할 독립 본문'); await delay(1100);
        const newerDraft = (await drafts(first)).find(draft => draft.value.document.title === '더 새로운 미등록 분기 X');
        assert.ok(newerDraft?.value.browserOnly, 'Unknown cache binding must create a browser-only writer draft');
        await (await panel(first)).getByRole('button', { name: '이 브라우저의 로컬 문서로 돌아가기', exact: true }).click(); await closePanel(first);
        await second.bringToFront(); await openServerVersion(second, y.id, /^클라우드 문서 열기 · .*Y$/);
        assert.equal((await ownerWorkspace(second)).documents.find(document => document.id === x.document.id)?.title, '이전 캐시 분기 X', 'Refreshing Y must retain the second tab older X cache used by this regression');
        assert.equal(saveRequests().filter(request => request.body.id === x.id).length, savesBeforeLegacyEdit);
        await title(second, '다른 탭에서 저장한 분기 Y'); await delay(1100); await status(second, 'saved');
        await poll(async () => (await ownerWorkspace(second)).documents.find(document => document.id === x.document.id)?.title === '이전 캐시 분기 X', 'Second tab did not replace account cache with old X branch');
        await first.bringToFront();
        await (await panel(first)).getByRole('button', { name: /^클라우드 문서 열기 · .*Y$/ }).click(); await ready(first);
        const dialog = await panel(first);
        await dialog.getByRole('button', { name: /^클라우드 문서 열기 · .*X$/ }).click();
        await dialog.getByRole('button', { name: /^저장 대기 내용 복구 · 이전 캐시 분기 X ·/ }).waitFor();
        const beforeRestart = (await drafts(first)).filter(draft => draft.value.document.id === x.document.id);
        report.observations.push({ name: 'same-ID legacy context fork', newerDraft, beforeRestart, sourceRemote: clone(mock.state.records.get(x.id).record) });
        assert.equal(beforeRestart.some(draft => draft.value.document.title === '더 새로운 미등록 분기 X' && draft.value.document.nodes[0].data.label === '새 분기에서 보존할 독립 본문'), true, 'Preserving older same-ID cache must not supersede newer independent branch');
        assert.equal(beforeRestart.some(draft => draft.value.document.title === '이전 캐시 분기 X'), true);
        assert.ok(new Set(beforeRestart.map(draft => draft.value.writerId)).size >= 2, 'A new cache context needs a distinct writer identity');
        assert.equal(saveRequests().filter(request => request.body.id === x.id).length, savesBeforeLegacyEdit);
        assert.deepEqual(mock.state.records.get(x.id).record, latestX, 'Neither same-ID browser branch may implicitly overwrite the server');
        await first.reload();
        const reloaded = (await panel(first)).locator('section[aria-label="브라우저 복구 문서"]');
        await reloaded.getByRole('button', { name: /^브라우저 복구 문서 열기 · 더 새로운 미등록 분기 X ·/ }).waitFor();
        await reloaded.getByRole('button', { name: /^브라우저 복구 문서 열기 · 이전 캐시 분기 X ·/ }).waitFor();
        await reloaded.getByRole('button', { name: /^브라우저 복구 문서 열기 · 더 새로운 미등록 분기 X ·/ }).click(); await ready(first);
        assert.equal(await currentTitle(first), '더 새로운 미등록 분기 X (브라우저 복구)');
        await first.locator('.react-flow__node[data-id="root"]').getByText('새 분기에서 보존할 독립 본문', { exact: true }).waitFor();
        assert.equal(saveRequests().filter(request => request.body.id === x.id).length, savesBeforeLegacyEdit);
      } finally { await context.close(); }
    });

    await runCase('P2 document panel deletion explicitly removes a browser copy while cloud and share remain active', async () => {
      const record = mock.addRecord('alice', documentFixture('scoped-delete', '브라우저 삭제 범위 검증'));
      record.shareEnabled = true; const token = 'D'.repeat(43); mock.state.shares.set(token, record.id);
      const context = await newContext({ signedIn: true }), recipient = await newContext();
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page); await delay(1100); await status(page, 'saved');
        await page.getByRole('button', { name: '문서 패널 열기', exact: true }).click();
        await page.getByRole('button', { name: '문서 메뉴', exact: true }).first().click();
        const scoped = page.getByRole('menuitem', { name: '브라우저 사본 삭제', exact: true });
        const correctlyLabeled = await scoped.count() > 0;
        if (correctlyLabeled) {
          await scoped.click();
          const confirmation = page.getByRole('dialog', { name: '브라우저 사본 삭제', exact: true });
          await confirmation.waitFor(); await confirmation.getByText('클라우드에 저장된 문서와 공유 링크는 유지됩니다.', { exact: true }).waitFor();
          assert.equal((await ownerWorkspace(page)).documents.some(document => document.id === record.document.id), true, 'Opening scope confirmation must not delete the copy');
          await confirmation.getByRole('button', { name: '취소', exact: true }).click();
          await page.getByRole('button', { name: '문서 메뉴', exact: true }).first().click(); await scoped.click();
          await confirmation.getByRole('button', { name: '브라우저 사본 삭제', exact: true }).click();
        } else await page.getByRole('menuitem', { name: '삭제', exact: true }).click();
        await poll(async () => !(await ownerWorkspace(page)).documents.some(document => document.id === record.document.id), 'Browser copy did not disappear');
        const viewer = await recipient.newPage(); await viewer.goto(base + '/share#token=' + token);
        await viewer.getByRole('heading', { name: record.document.title, exact: true }).waitFor();
        report.observations.push({ name: 'document panel delete scope', correctlyLabeled, remoteExists: mock.state.records.has(record.id), shareActive: mock.state.shares.has(token), visibleText: (await page.locator('body').innerText()).slice(-1800) });
        assert.equal(mock.state.records.has(record.id), true); assert.equal(mock.state.shares.has(token), true);
        assert.equal(mock.state.requests.some(request => request.body.action === 'delete'), false);
        assert.equal(correctlyLabeled, true, 'Account cache deletion must say browser copy and explain that server/shared document remains');
        await page.getByRole('status').filter({ hasText: /브라우저 사본.*삭제/ }).waitFor();
        assert.equal(await page.getByText('문서를 삭제했습니다', { exact: true }).count(), 0, 'Completion must identify browser-only deletion');
        const mobileContext = await newContext({ signedIn: true });
        try {
          const mobile = await appPage(mobileContext); await mobile.setViewportSize({ width: 375, height: 900 });
          await openCloud(mobile, mock.state.records.get(record.id).record); await closePanel(mobile); await delay(1100); await status(mobile, 'saved');
          await mobile.getByRole('button', { name: '문서 목록 열기', exact: true }).click();
          const drawer = mobile.getByRole('dialog', { name: '문서 목록', exact: true });
          await drawer.getByRole('button', { name: '문서 메뉴', exact: true }).first().click();
          await mobile.getByRole('menuitem', { name: '브라우저 사본 삭제', exact: true }).click();
          const confirmation = mobile.getByRole('dialog', { name: '브라우저 사본 삭제', exact: true });
          await confirmation.waitFor(); await drawer.waitFor({ state: 'hidden' });
          assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await mobile.screenshot({ path: path.join(output, 'browser-copy-delete-375.png') });
          await confirmation.getByRole('button', { name: '브라우저 사본 삭제', exact: true }).click();
          await poll(async () => !(await ownerWorkspace(mobile)).documents.some(document => document.id === record.document.id), 'Mobile confirmation did not remove browser copy');
          assert.equal(mock.state.records.has(record.id), true); assert.equal(mock.state.shares.has(token), true);
          assert.equal(mock.state.requests.some(request => request.body.action === 'delete'), false);
          await viewer.reload(); await viewer.getByRole('heading', { name: record.document.title, exact: true }).waitFor();
        } finally { await mobileContext.close(); }
      } finally { await context.close(); await recipient.close(); }
    });

    await runCase('Rapid A/B open honors latest navigation and account switch rejects old responses', async () => {
      const a = mock.addRecord('alice', documentFixture('owned-a', '늦게 응답하는 A'));
      const b = mock.addRecord('alice', documentFixture('owned-b', '먼저 응답하는 B'));
      const bob = mock.addRecord('bob', documentFixture('owned-bob', 'Bob 전용 문서'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context), dialog = await panel(page);
        mock.state.delays.set(`/api/cloud/documents:get:${a.id}`, 900);
        await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${a.document.title}`, exact: true }).click();
        await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${b.document.title}`, exact: true }).click();
        await poll(async () => await currentTitle(page) === b.document.title, 'Second open did not activate B');
        await delay(1100); assert.equal(await currentTitle(page), b.document.title);
        await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${a.document.title}`, exact: true }).click();
        const bobSession = mock.registerSession('bob');
        // Supabase's public cross-tab auth event contract. This models another
        // tab finishing a login; no app store or queue internals are injected.
        await page.evaluate(({ session, authKey }) => { localStorage.setItem(authKey, JSON.stringify(session)); const channel = new BroadcastChannel(authKey); channel.postMessage({ event: 'SIGNED_IN', session }); channel.close(); }, { session: bobSession, authKey: AUTH_KEY });
        await dialog.getByText(USERS.bob.email, { exact: true }).waitFor();
        await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${bob.document.title}`, exact: true }).waitFor();
        await delay(1100);
        await page.getByRole('button', { name: '선택한 로컬 문서 열기', exact: true }).first().waitFor();
        assert.equal(await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${a.document.title}`, exact: true }).count(), 0);
        await openCloud(page, bob); await closePanel(page); await title(page, 'Bob 저장 변경'); await poll(() => mock.state.records.get(bob.id).record.revision === 2, 'Bob autosave did not complete'); await status(page, 'saved');
        assert.equal(saveRequests().at(-1).ownerId, USERS.bob.id);
        assert.equal(mock.state.records.get(a.id).record.revision, 1);
      } finally { await context.close(); }
    });

    await runCase('Delayed cloud open cannot reopen the editor after going home', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-home-race', '홈 이동 중 응답'));
      const context = await newContext({ signedIn: true });
      let releaseGet = () => {};
      try {
        const page = await appPage(context), dialog = await panel(page);
        mock.state.responseHolds.set(`/api/cloud/documents:get:${record.id}`, new Promise(resolve => releaseGet = resolve));
        await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${record.document.title}`, exact: true }).click();
        await poll(() => mock.state.requests.some(request => request.body.action === 'get' && request.body.id === record.id), 'Delayed open request missing');
        await closePanel(page); await page.getByRole('button', { name: '메인으로', exact: true }).click();
        await page.getByRole('button', { name: '선택한 로컬 문서 열기', exact: true }).first().waitFor();
        releaseGet();
        await delay(1100);
        assert.equal(new URL(page.url()).searchParams.has('doc'), false);
        assert.equal(await page.locator('[data-mindmap-canvas]').count(), 0, 'Late cloud response must not leave home');
        await status(page, 'local');
      } finally { releaseGet(); await context.close(); }
    });

    for (const choice of ['latest', 'copy']) await runCase(`Conflict ${choice} response preserves edits made while request is pending`, async () => {
      const record = mock.addRecord('alice', documentFixture(`owned-conflict-${choice}`, `충돌 ${choice} 검증`));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        mock.state.failSaves = true; await title(page, '먼저 만든 내 변경'); await status(page, 'error');
        mock.state.failSaves = false;
        mock.state.records.get(record.id).record.revision = 2;
        mock.state.records.get(record.id).record.document.title = '다른 작성자의 최신본';
        const dialog = await panel(page);
        await dialog.getByRole('button', { name: '저장 다시 시도', exact: true }).click(); await status(page, 'conflict');
        const action = choice === 'latest' ? 'get' : 'save';
        mock.state.delays.set(`/api/cloud/documents:${action}:${choice === 'latest' ? record.id : ''}`, 900);
        const requestsBefore = mock.state.requests.length;
        if (choice === 'latest') {
          await dialog.getByRole('button', { name: '서버 최신본 불러오기', exact: true }).click();
          await dialog.getByRole('button', { name: '확인', exact: true }).click();
        } else await dialog.getByRole('button', { name: '내 변경을 새 사본으로 저장', exact: true }).click();
        await poll(() => mock.state.requests.slice(requestsBefore).some(request => request.body.action === action), 'Conflict action request missing');
        await closePanel(page); await title(page, '요청 중에 추가한 변경');
        await delay(1100);
        assert.equal(await currentTitle(page), '요청 중에 추가한 변경'); await status(page, 'conflict');
        assert.equal((await drafts(page)).some(draft => draft.value.document.title === '요청 중에 추가한 변경'), true, 'Pending response must preserve newer durable draft');
        await (await panel(page)).getByRole('alert').filter({ hasText: /추가한 변경.*유지/ }).waitFor();
        assert.equal(mock.state.records.get(record.id).record.document.title, '다른 작성자의 최신본');
        assert.equal(mock.state.records.size, choice === 'copy' ? 2 : 1);
      } finally { await context.close(); }
    });

    await runCase('Delete confirmation while autosave is pending preserves edits added during flush', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-delete-flush', '삭제 전 저장 검증'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        await delay(1100); await status(page, 'saved');
        mock.state.delays.set(`/api/cloud/documents:save:${record.id}`, 900);
        await title(page, '삭제 전에 만든 변경');
        const dialog = await panel(page);
        await dialog.getByRole('button', { name: '클라우드 문서 삭제', exact: true }).click();
        await dialog.getByRole('button', { name: '확인', exact: true }).click();
        await poll(() => saveRequests().some(request => request.body.id === record.id && request.body.document.document.title === '삭제 전에 만든 변경'), 'Delete flush save did not start');
        await closePanel(page); await title(page, '삭제 확인 후 추가 변경');
        await poll(() => mock.state.records.get(record.id)?.record.document.title === '삭제 확인 후 추가 변경', 'Additional edit did not complete pending flush');
        await (await panel(page)).getByRole('alert').filter({ hasText: '저장 중 추가한 변경을 유지' }).waitFor();
        assert.equal(mock.state.requests.filter(request => request.body.action === 'delete').length, 0, 'Stale delete confirmation must not delete newer edits');
        assert.equal(await currentTitle(page), '삭제 확인 후 추가 변경');
        assert.equal(mock.state.records.size, 1);
      } finally { await context.close(); }
    });

    await runCase('Edits added during a successful delete remain recoverable as a new cloud copy', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-delete-response', '삭제 응답 검증'));
      const context = await newContext({ signedIn: true });
      let releaseDelete = () => {};
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        await delay(1100); await status(page, 'saved');
        mock.state.responseHolds.set(`/api/cloud/documents:delete:${record.id}`, new Promise(resolve => releaseDelete = resolve));
        const dialog = await panel(page);
        await dialog.getByRole('button', { name: '클라우드 문서 삭제', exact: true }).click();
        await dialog.getByRole('button', { name: '확인', exact: true }).click();
        await poll(() => mock.state.requests.some(request => request.body.action === 'delete'), 'Delete request did not start');
        await closePanel(page); await title(page, '삭제 응답 중 추가 변경'); releaseDelete(); await status(page, 'conflict');
        assert.equal(mock.state.records.has(record.id), false);
        assert.equal(await currentTitle(page), '삭제 응답 중 추가 변경');
        assert.equal((await drafts(page)).some(draft => draft.value.document.title === '삭제 응답 중 추가 변경'), true);
        const recovery = await panel(page);
        await recovery.getByText(/원본은 삭제됐지만/).waitFor();
        await recovery.getByRole('button', { name: '내 변경을 새 사본으로 저장', exact: true }).click(); await status(page, 'saved');
        assert.equal(mock.state.records.size, 1);
        assert.match([...mock.state.records.values()][0].record.document.title, /^삭제 응답 중 추가 변경/);
        assert.equal((await drafts(page)).length, 0);
      } finally { releaseDelete(); await context.close(); }
    });

    await runCase('Failed server logout still clears local SDK session, warns and retains same-account recovery', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-logout', '로그아웃 실패 검증'));
      const context = await newContext({ signedIn: true });
      try {
        const page = await appPage(context); await openCloud(page, record); await closePanel(page);
        mock.state.failSaves = true; await title(page, '로그아웃 전 남겨둔 변경'); await status(page, 'error');
        const revisionBefore = mock.state.records.get(record.id).record.revision;
        const dialog = await panel(page);
        mock.state.failLogout = true; await dialog.getByRole('button', { name: '로그아웃', exact: true }).click();
        await status(page, 'local');
        await dialog.getByRole('alert').filter({ hasText: '서버 로그아웃 확인에 실패' }).waitFor();
        await dialog.getByRole('button', { name: 'Google로 계속하기', exact: true }).waitFor();
        assert.equal((await drafts(page)).some(draft => draft.value.document.title === '로그아웃 전 남겨둔 변경'), true);
        const countAfterLogout = saveRequests().length;
        await closePanel(page); await openLocal(page); await title(page, '로그아웃 후 로컬 변경'); await delay(1100);
        assert.equal(saveRequests().length, countAfterLogout);
        mock.state.failLogout = false; mock.state.failSaves = false;
        const signed = await login(page);
        await signed.locator('section[aria-label="브라우저 복구 문서"]').getByRole('button', { name: /^브라우저 복구 문서 열기 · 로그아웃 전 남겨둔 변경 ·/ }).click();
        await ready(page);
        assert.equal(await currentTitle(page), '로그아웃 전 남겨둔 변경 (브라우저 복구)');
        await delay(1100);
        assert.equal(saveRequests().length, countAfterLogout, 'Relogin and opening recovery must not upload it implicitly');
        assert.equal(mock.state.records.get(record.id).record.revision, revisionBefore);
      } finally { await context.close(); }
    });

    await runCase('Owner enables, rotates and revokes capability links using explicit controls', async () => {
      const record = mock.addRecord('alice', documentFixture('owned-controls', '공유 제어 검증'));
      const context = await newContext({ signedIn: true });
      const recipient = await newContext();
      try {
        const page = await appPage(context), dialog = await openCloud(page, record);
        await dialog.getByRole('button', { name: '읽기 전용 링크 만들기', exact: true }).click();
        const link = dialog.getByRole('textbox', { name: '읽기 전용 공유 링크' });
        await link.waitFor();
        const firstLink = await link.inputValue();
        assert.match(firstLink, new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/share#token=[A-Za-z0-9_-]{43}$'));
        assert.equal(new URL(firstLink).search, '');
        const viewer = await recipient.newPage(); await viewer.goto(firstLink);
        await viewer.getByRole('heading', { name: '공유 제어 검증', exact: true }).waitFor();
        await dialog.getByRole('button', { name: '새 링크 발급', exact: true }).click();
        assert.equal(mock.state.shares.has(new URL(firstLink).hash.slice(7)), true, 'Rotation must await confirmation');
        await dialog.getByRole('button', { name: '확인', exact: true }).click();
        await poll(async () => await link.inputValue() !== firstLink, 'Rotation did not change capability');
        const secondLink = await link.inputValue();
        await viewer.reload(); await viewer.getByRole('alert').getByText('공유 링크를 열 수 없어요', { exact: true }).waitFor();
        await viewer.goto(secondLink); await viewer.getByRole('heading', { name: '공유 제어 검증', exact: true }).waitFor();
        await dialog.getByRole('button', { name: '공유 끄기', exact: true }).click();
        await dialog.getByRole('button', { name: '확인', exact: true }).click();
        await dialog.getByRole('button', { name: '읽기 전용 링크 만들기', exact: true }).waitFor();
        await viewer.reload(); await viewer.getByRole('alert').getByText('공유 링크를 열 수 없어요', { exact: true }).waitFor();
        assert.equal(await viewer.locator('.react-flow__node').count(), 0);
      } finally { await context.close(); await recipient.close(); }
    });

    await runCase('Public read-only viewer displays projection, search/collapse/ink/design without editor persistence; same URL latest and revoke', async () => {
      const doc = documentFixture('owned-share', '공개 읽기 전용 지도');
      const record = mock.addRecord('alice', doc);
      const token = 'a'.repeat(43); record.shareEnabled = true; mock.state.shares.set(token, record.id);
      const context = await newContext({ signedIn: true });
      await context.addCookies([{ name: 'mock-private-cookie', value: 'private-test-only', url: base }]);
      try {
        const page = await context.newPage(); await page.goto(base + '/share#token=' + token); await page.waitForSelector('[data-shared-viewer="ready"]');
        const before = await localWorkspace(page);
        const storedBefore = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])));
        await page.getByRole('heading', { name: doc.title, exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, 'shared-viewer-desktop.png') });
        assert.equal(await page.locator('[data-shared-viewer="ready"]').evaluate(el => el.classList.contains('dark') && el.dataset.accent === 'rose'), true);
        assert.match(await page.locator('.shared-canvas').evaluate(el => getComputedStyle(el).fontFamily), /Jua/);
        assert.equal(await page.locator('[data-ink-paper]').count(), 1); assert.equal(await page.getByRole('img', { name: '공유된 손그림' }).count(), 1);
        await page.getByRole('button', { name: '공개 가지 내용 보기', exact: true }).click();
        await page.getByRole('complementary', { name: '노드 상세 내용' }).getByText('공개 체크리스트', { exact: true }).waitFor();
        const detailsLink = page.getByRole('complementary', { name: '노드 상세 내용' }).getByRole('link', { name: '연결된 링크 열기 ↗' });
        assert.equal(await detailsLink.getAttribute('href'), 'https://example.test/display');
        assert.equal(await detailsLink.getAttribute('referrerpolicy'), 'no-referrer');
        await page.getByRole('button', { name: '상세 내용 닫기', exact: true }).click();
        await page.getByRole('button', { name: '공개 가지 가지 접기', exact: true }).click();
        assert.equal(await page.locator('.react-flow__node[data-id="leaf"]').count(), 0);
        await page.getByRole('textbox', { name: '공유 마인드맵 검색' }).fill('검색할 잎');
        await page.getByRole('button', { name: '다음 검색 결과', exact: true }).click();
        await page.locator('.react-flow__node[data-id="leaf"]').waitFor();
        await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
        const nodeCount = await page.locator('.react-flow__node').count();
        await page.getByRole('button', { name: '전체 보기', exact: true }).click(); await delay(350);
        const rootNode = page.locator('.react-flow__node[data-id="root"]');
        const rootPosition = await rootNode.getAttribute('style');
        const box = await rootNode.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40, { steps: 5 }); await page.mouse.up();
        assert.equal(await rootNode.getAttribute('style'), rootPosition, 'Read-only node cannot be dragged');
        await rootNode.click();
        for (const key of ['F2', 'Delete', 'Control+z']) await page.keyboard.press(key);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('textarea').count(), 0); assert.equal(await page.locator('.react-flow__node').count(), nodeCount);
        // Tab/Enter may activate legitimate display-only controls such as
        // collapse; they must never add nodes or open an editor.
        await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
        assert.equal(await page.locator('textarea').count(), 0);
        assert.ok(await page.locator('.react-flow__node').count() <= nodeCount);
        await page.getByRole('button', { name: '확대', exact: true }).click(); await page.getByRole('button', { name: '전체 보기', exact: true }).click();
        assert.deepEqual(await localWorkspace(page), before); assert.equal(saveRequests().length, 0);
        const publicRequest = mock.state.requests.find(request => request.path === '/api/cloud/shared');
        assert.equal(publicRequest.authorization, false); assert.equal(publicRequest.cookie, null); assert.equal(publicRequest.referrer, null); assert.deepEqual(publicRequest.body, { token });
        const wire = JSON.stringify(toSharedCloudDocument(doc));
        for (const privateText of ['PRIVATE_', '"snapshots"', '"createdAt"', '"pinned"']) assert.equal(wire.includes(privateText), false, 'Public payload contains ' + privateText);
        mock.state.records.get(record.id).record.document.title = '같은 링크의 최신 저장본';
        mock.state.records.get(record.id).record.document.appearance = { ...doc.appearance, theme: 'light', accent: 'indigo' };
        await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.dataset.accent = 'teal'; });
        await page.getByRole('button', { name: '최신 내용 불러오기', exact: true }).click();
        await page.getByRole('heading', { name: '같은 링크의 최신 저장본', exact: true }).waitFor();
        assert.equal(page.url(), base + '/share#token=' + token);
        const palette = await page.locator('[data-shared-viewer="ready"]').evaluate(el => ({ surface: getComputedStyle(el).getPropertyValue('--surface-base').trim(), brand: getComputedStyle(el).getPropertyValue('--brand').trim(), htmlDark: document.documentElement.classList.contains('dark'), htmlAccent: document.documentElement.dataset.accent }));
        assert.deepEqual(palette, { surface: '244 245 247', brand: '79 70 229', htmlDark: true, htmlAccent: 'teal' });
        for (const width of [390, 768]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Viewer overflows at ' + width);
          await page.getByRole('textbox', { name: '공유 마인드맵 검색' }).fill('잎');
          await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
          await page.screenshot({ path: path.join(output, 'shared-viewer-' + width + '.png') });
        }
        record.shareEnabled = false;
        await page.getByRole('button', { name: '최신 내용 불러오기', exact: true }).click();
        await page.getByRole('alert').getByText('공유 링크를 열 수 없어요', { exact: true }).waitFor();
        assert.equal(await page.locator('.react-flow__node').count(), 0); assert.equal(await page.getByText('같은 링크의 최신 저장본', { exact: true }).count(), 0);
        assert.deepEqual(await localWorkspace(page), before);
        assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))), storedBefore);
      } finally { await context.close(); }
    });

    await runCase('Delayed public token A cannot replace B after hash navigation; malformed token clears content', async () => {
      const a = mock.addRecord('alice', documentFixture('share-a', '공유 응답 A'));
      const b = mock.addRecord('alice', documentFixture('share-b', '공유 응답 B'));
      const tokenA = 'b'.repeat(43), tokenB = 'c'.repeat(43); a.shareEnabled = b.shareEnabled = true;
      mock.state.shares.set(tokenA, a.id); mock.state.shares.set(tokenB, b.id);
      mock.state.delays.set(`/api/cloud/shared:${tokenA}:`, 900);
      const context = await newContext();
      try {
        const page = await context.newPage(); await page.goto(base + '/share#token=' + tokenA);
        await poll(() => mock.state.requests.some(request => request.body.token === tokenA), 'Delayed token A request missing');
        await page.evaluate(token => { location.hash = 'token=' + token; }, tokenB);
        await page.getByRole('heading', { name: '공유 응답 B', exact: true }).waitFor(); await delay(1100);
        assert.equal(await page.getByRole('heading', { name: '공유 응답 A', exact: true }).count(), 0);
        await page.evaluate(() => { location.hash = 'token=malformed'; });
        await page.getByRole('alert').getByText('공유 링크를 열 수 없어요', { exact: true }).waitFor();
        assert.equal(await page.locator('.react-flow__node').count(), 0);
      } finally { await context.close(); }
    });

    await runCase('Existing #m fragment creates recipient local copy without touching cloud', async () => {
      const context = await newContext();
      try {
        const doc = documentFixture('legacy-source', '기존 압축 공유 지도');
        const page = await context.newPage(); await page.goto(base + '/#m=' + encodeSharedDocument(doc));
        await ready(page);
        await poll(async () => (await localWorkspace(page)).documents.some(document => document.title === doc.title), 'Legacy fragment did not create local recipient copy');
        const imported = (await localWorkspace(page)).documents.find(document => document.title === doc.title);
        assert.notEqual(imported.id, doc.id); assert.equal(imported.nodes.length, doc.nodes.length);
        assert.equal(mock.state.requests.length, 0);
        assert.equal(page.url().includes('#m='), false);
      } finally { await context.close(); }
    });

    assert.equal(report.pageErrors.length, 0, 'Uncaught browser page errors: ' + report.pageErrors.join('; '));
    assert.equal(report.failures.length, 0, 'Failed browser cases: ' + report.failures.map(failure => failure.name).join('; '));
  } finally {
    if (browser) await browser.close();
    if (server) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
    if (mock) await mock.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log('Local mock browser report: ' + path.join(output, 'report.json'));
    if (report.failures.length) console.error(logs.slice(-4000));
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
