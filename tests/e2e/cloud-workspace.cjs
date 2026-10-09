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
const report = { scope: 'Local HTTP mock only; no live Google OAuth, Supabase, RLS, deployment, or real browser-profile verification.', browser: '', checks: [], failures: [], pageErrors: [] };
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
async function newContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
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
      try {
        const page = await appPage(context), dialog = await panel(page);
        mock.state.delays.set(`/api/cloud/documents:get:${record.id}`, 900);
        await dialog.getByRole('button', { name: `클라우드 문서 열기 · ${record.document.title}`, exact: true }).click();
        await poll(() => mock.state.requests.some(request => request.body.action === 'get' && request.body.id === record.id), 'Delayed open request missing');
        await closePanel(page); await page.getByRole('button', { name: '메인으로', exact: true }).click();
        await page.getByRole('button', { name: '선택한 로컬 문서 열기', exact: true }).first().waitFor();
        await delay(1100);
        assert.equal(new URL(page.url()).searchParams.has('doc'), false);
        assert.equal(await page.locator('[data-mindmap-canvas]').count(), 0, 'Late cloud response must not leave home');
        await status(page, 'local');
      } finally { await context.close(); }
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
