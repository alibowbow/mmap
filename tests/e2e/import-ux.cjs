/* Local import UX regression. Build first; default starts its own local server.
   IMPORT_UX_BASE_URL can target a server in the same execution environment.
   IMPORT_UX_START_SERVER=1 explicitly starts one at that configured address.
   IMPORT_UX_FIXTURE may point to a private 846-node JSON outside the repo.
   Reports contain counts/check names only; private document contents stay local. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { portableFixture } = require("../io/fixture.ts");

const base = process.env.IMPORT_UX_BASE_URL || "http://127.0.0.1:3012";
const output = process.env.IMPORT_UX_OUTPUT || path.join(require("node:os").tmpdir(), "mmap-import-ux");
const key = "mindforge-workspace-v1";
const fixturePath = process.env.IMPORT_UX_FIXTURE;
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const nodeContentHash = (nodes) => hash(JSON.stringify(nodes.map(({ id, data }) => ({ id, data }))));
const json = (title) => JSON.stringify({ version: 4, document: { ...portableFixture(), title } });
const report = { checks: [], errors: [], actualFixture: null };

function check(view, name) {
  report.checks.push({ view, name });
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}
async function workspace(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"documents":[]}'), key);
}
async function ready(page) {
  await page.waitForSelector("[data-mindmap-canvas]");
  await page.waitForFunction(() => document.querySelector("[data-mindmap-canvas]")?.getAttribute("aria-busy") === "false");
  await page.waitForTimeout(250);
}
function dialog(page) { return page.getByRole("dialog", { name: "가져오기", exact: true }); }
async function openHome(page) {
  const navImport = page.getByRole("button", { name: "가져오기", exact: true });
  if (await navImport.isVisible()) await navImport.click();
  else await page.getByRole("button", { name: "파일 가져오기", exact: true }).click();
  await dialog(page).waitFor();
}
async function openEditor(page, mobile, drawer = false, keyboard = false) {
  if (mobile && drawer) {
    await page.getByRole("button", { name: "문서 목록 열기", exact: true }).click();
    await page.getByRole("dialog", { name: "문서 목록", exact: true })
      .getByRole("button", { name: "JSON 가져오기", exact: true }).click();
  } else if (mobile) {
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("dialog", { name: "더 많은 도구", exact: true })
      .getByRole("button", { name: "JSON 가져오기", exact: true }).click();
  } else {
    const trigger = page.getByRole("button", { name: "더 많은 도구", exact: true });
    if (keyboard) { await trigger.focus(); await page.keyboard.press("Enter"); }
    else await trigger.click();
    const item = page.getByRole("menuitem", { name: "JSON 가져오기", exact: true });
    if (keyboard) { await item.focus(); await page.keyboard.press("Enter"); }
    else await item.click();
  }
  await dialog(page).waitFor();
  await page.waitForTimeout(250);
}
async function file(page, text, name = "document.json") {
  await dialog(page).locator('input[type="file"]').setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}
async function submit(page) {
  await dialog(page).getByRole("button", { name: "가져오기", exact: true }).click();
  await dialog(page).waitFor({ state: "detached" });
  await ready(page);
}
async function cancel(page, escape = false) {
  if (escape) await page.keyboard.press("Escape");
  else await dialog(page).getByRole("button", { name: "취소", exact: true }).click();
  await dialog(page).waitFor({ state: "detached" });
}
async function blank(page) {
  assert.equal((await dialog(page).getByRole("textbox", { name: "JSON 내용", exact: true }).inputValue()).length, 0);
  assert.equal(await dialog(page).getByRole("button", { name: "가져오기", exact: true }).isDisabled(), true);
}
async function deliverRead(page, index = 0) {
  await page.waitForFunction((index) => window.__pendingImportReads.length > index, index);
  await page.evaluate((index) => window.__pendingImportReads.splice(index, 1)[0](), index);
  await page.waitForTimeout(80);
}

// Deliberately deliver delayed callbacks even after abort, emulating queued
// browser events. This checks the session/token guard as well as abort().
async function installDelayedReads(page) {
  await page.addInitScript(() => {
    const Native = window.FileReader;
    window.__importAborts = 0;
    window.__pendingImportReads = [];
    window.FileReader = class extends Native {
      readAsText(file, encoding) {
        if (!file.name.startsWith("delayed-")) return super.readAsText(file, encoding);
        this.delayed = true;
        file.text().then((text) => window.__pendingImportReads.push(() => {
          if (file.name.includes("error")) this.onerror?.(new ProgressEvent("error"));
          else {
            Object.defineProperty(this, "result", { configurable: true, value: text });
            this.onload?.(new ProgressEvent("load"));
          }
        }));
      }
      abort() {
        if (this.delayed) window.__importAborts += 1;
        else super.abort();
      }
    };
    localStorage.setItem("mindforge-onboarded-v1", "1");
  });
}

async function run(browser, view) {
  const mobile = view.width < 768;
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const page = await context.newPage();
  page.on("pageerror", () => report.errors.push({ view: view.name, kind: "pageerror" }));
  await installDelayedReads(page);
  await page.goto(base);
  await openHome(page);
  const before = await workspace(page);
  await dialog(page).locator('input[type="file"]').setInputFiles([]);
  await blank(page);
  assert.equal((await workspace(page)).documents.length, before.documents.length);
  check(view.name, "cancelled file selection keeps current document");
  for (const [text, name] of [
    ["{", "malformed JSON"],
    [JSON.stringify({ version: 99, document: portableFixture() }), "unsupported version"],
    [JSON.stringify({ unrelated: true }), "unsupported format"],
  ]) {
    if (name === "malformed JSON") {
      await file(page, text);
      await dialog(page).getByRole("alert").waitFor();
    } else await dialog(page).getByRole("textbox", { name: "JSON 내용", exact: true }).fill(text);
    assert.equal(await dialog(page).getByRole("button", { name: "가져오기", exact: true }).isDisabled(), true);
    assert.equal(await dialog(page).getByRole("alert").count(), 1);
    check(view.name, name + " rejected without switching documents");
  }
  await cancel(page);
  assert.equal((await workspace(page)).documents.length, before.documents.length);
  await openHome(page);
  await dialog(page).getByRole("button", { name: "닫기", exact: true }).click();
  await dialog(page).waitFor({ state: "detached" });
  check(view.name, "close button cancels without importing");
  await openHome(page); await blank(page);
  await file(page, json("late closed session"), "delayed-slow.json");
  assert.equal(await dialog(page).getByRole("button", { name: "가져오기", exact: true }).isDisabled(), true);
  await cancel(page); await openHome(page); await deliverRead(page); await blank(page);
  check(view.name, "cancel/reopen ignores queued file callback");

  const latest = json("latest read");
  await file(page, json("outdated read"), "delayed-slow.json");
  await file(page, latest, "delayed-fast.json");
  await deliverRead(page, 1); await deliverRead(page);
  assert.equal(hash(await dialog(page).getByRole("textbox", { name: "JSON 내용", exact: true }).inputValue()), hash(latest));
  check(view.name, "second file wins over earlier slower read");
  const manual = json("manual paste");
  await file(page, json("outdated read"), "delayed-slow.json");
  await dialog(page).getByRole("textbox", { name: "JSON 내용", exact: true }).fill(manual);
  await deliverRead(page);
  assert.equal(hash(await dialog(page).getByRole("textbox", { name: "JSON 내용", exact: true }).inputValue()), hash(manual));
  check(view.name, "manual paste wins over pending file read");
  await file(page, json("outdated read"), "delayed-slow.json");
  await dialog(page).getByRole("button", { name: "텍스트 / 아웃라인", exact: true }).click();
  await deliverRead(page);
  assert.equal(await dialog(page).getByRole("textbox", { name: "아웃라인 내용", exact: true }).inputValue(), "");
  await dialog(page).getByRole("button", { name: "JSON", exact: true }).click(); await blank(page);
  check(view.name, "switching import tabs cancels pending read");
  await file(page, "", "delayed-error.json"); await deliverRead(page);
  assert.equal(await dialog(page).getByRole("alert").count(), 1);
  assert.equal(await dialog(page).getByRole("button", { name: "가져오기", exact: true }).isDisabled(), true);
  check(view.name, "file read error disables import");

  const synthetic = json("import UX fixture");
  await file(page, JSON.stringify({ version: 1, document: portableFixture() })); await submit(page);
  let state = await workspace(page);
  const originalId = state.activeDocumentId;
  assert.equal(state.documents.length, before.documents.length + 1);
  assert.equal(state.documents.find((d) => d.id === originalId).nodes.length, 22);
  check(view.name, "supported version 1 home import creates a new persisted document");
  await openEditor(page, mobile, false, !mobile);
  await blank(page);
  assert.match(await dialog(page).innerText(), /기존 문서를 덮어쓰지 않고 새 문서로/);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await dialog(page).evaluate((el) => el.contains(document.activeElement)), true);
  }
  await cancel(page, true);
  assert.equal(await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.isConnected), true);
  assert.equal(await page.getByRole("button", { name: mobile ? "더보기" : "더 많은 도구", exact: true }).evaluate((el) => document.activeElement === el), true);
  check(view.name, "editor import keyboard focus, Tab containment, Escape close");

  // An unsubmitted label draft must follow the existing blur commit and be
  // preserved when the imported copy replaces the active editor.
  await page.locator('.react-flow__node[data-id="root"]').dblclick();
  const editor = page.locator('.react-flow__node[data-id="root"] textarea');
  await editor.fill("unsaved label protected");
  await openEditor(page, mobile);
  await file(page, "{");
  await dialog(page).getByRole("alert").waitFor();
  assert.equal(await dialog(page).getByRole("button", { name: "가져오기", exact: true }).isDisabled(), true);
  await cancel(page);
  assert.equal(await page.locator('.react-flow__node[data-id="root"]').getByText("unsaved label protected", { exact: true }).count(), 1);
  assert.equal((await workspace(page)).activeDocumentId, originalId);
  check(view.name, "malformed editor import and cancel preserve current edit and document");
  await page.locator('.react-flow__node[data-id="root"]').dblclick();
  await editor.fill("second unsaved label protected");
  await openEditor(page, mobile);
  await file(page, synthetic); await submit(page);
  state = await workspace(page);
  assert.equal(state.documents.length, before.documents.length + 2);
  assert.notEqual(state.activeDocumentId, originalId);
  assert.equal(state.documents.find((d) => d.id === originalId).nodes.find((n) => n.id === "root").data.label, "second unsaved label protected");
  check(view.name, "editor import preserves current unsaved inline edit in old document");
  const secondId = state.activeDocumentId;
  await openEditor(page, mobile); await file(page, synthetic); await submit(page);
  state = await workspace(page);
  assert.equal(state.documents.length, before.documents.length + 3);
  assert.notEqual(state.activeDocumentId, secondId);
  assert.equal(new Set(state.documents.map((d) => d.id)).size, state.documents.length);
  assert.ok(await page.evaluate(() => window.__importAborts >= 4));
  await page.reload(); await ready(page);
  assert.equal((await workspace(page)).documents.length, state.documents.length);
  check(view.name, "repeated same-file import creates distinct copies and survives reload");

  if (mobile) {
    await page.getByRole("button", { name: "그리기 모드", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "더보기", exact: true }).count(), 0);
    await openEditor(page, true, true); await blank(page);
    const button = dialog(page).getByRole("button", { name: "가져오기", exact: true });
    const bounds = await button.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= view.width && bounds.y >= 0 && bounds.y + bounds.height <= view.height);
    await cancel(page, true);
    assert.equal(await page.getByRole("button", { name: "문서 목록 열기", exact: true }).evaluate((el) => document.activeElement === el), true);
    check(view.name, "drawing mode imports via document drawer; controls fit narrow viewport");
    const drawingId = (await workspace(page)).activeDocumentId;
    const area = await page.locator("[data-ink-input]").boundingBox();
    assert.ok(area);
    await page.mouse.move(area.x + 30, area.y + area.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(area.x + 90, area.y + area.height * 0.33, { steps: 12 });
    await page.mouse.up();
    await openEditor(page, true, true);
    await file(page, synthetic); await submit(page);
    const drawn = (await workspace(page)).documents.find((d) => d.id === drawingId);
    assert.equal(drawn.ink.strokes.length, 1);
    check(view.name, "successful drawing-mode import preserves recent ink in previous document");
    await page.getByRole("button", { name: "노드 모드", exact: true }).click();
  }

  if (fixturePath) {
    const docsBefore = (await workspace(page)).documents.length;
    await openEditor(page, mobile, mobile);
    await dialog(page).locator('input[type="file"]').setInputFiles(fixturePath);
    await submit(page);
    let loaded = await workspace(page);
    let imported = loaded.documents.find((d) => d.id === loaded.activeDocumentId);
    assert.equal(imported.nodes.length, 846);
    assert.equal(loaded.documents.length, docsBefore + 1);
    const editorCopyHash = nodeContentHash(imported.nodes);
    await page.reload(); await ready(page);
    loaded = await workspace(page);
    imported = loaded.documents.find((d) => d.id === loaded.activeDocumentId);
    assert.equal(nodeContentHash(imported.nodes), editorCopyHash);
    check(view.name, "actual 846-node editor import preserves source collapse state and reloads");
    await page.getByRole("button", { name: "메인으로", exact: true }).click();
    await openHome(page);
    await dialog(page).locator('input[type="file"]').setInputFiles(fixturePath);
    await submit(page);
    loaded = await workspace(page);
    imported = loaded.documents.find((d) => d.id === loaded.activeDocumentId);
    assert.equal(imported.nodes.length, 846);
    assert.equal(nodeContentHash(imported.nodes), editorCopyHash);
    assert.equal(loaded.documents.length, docsBefore + 2);
    check(view.name, "actual same 846-node file reimports from home into separate document");
  }
  await context.close();
}

// Branch focus is temporary document context. Imported IDs can overlap, so
// verify both ID shapes through the same home/editor UI used in normal work.
function focusedJson(prefix = "") {
  const doc = portableFixture();
  doc.title = "focus boundary fixture";
  if (prefix) {
    doc.nodes = doc.nodes.map((node) => ({ ...node, id: prefix + node.id,
      data: { ...node.data, parentId: node.data.parentId ? prefix + node.data.parentId : null } }));
    doc.edges = doc.edges.map((edge) => ({ ...edge, id: prefix + edge.id, source: prefix + edge.source, target: prefix + edge.target }));
    doc.relations = doc.relations.map((relation) => ({ ...relation, id: prefix + relation.id, source: prefix + relation.source, target: prefix + relation.target }));
  }
  return JSON.stringify({ version: 4, document: doc });
}
async function activeDocument(page) {
  const state = await workspace(page);
  return state.documents.find((doc) => doc.id === state.activeDocumentId);
}
async function enterBranchFocus(page, view) {
  // The desktop context menu supplies branch focus. Resize afterward to test
  // preservation through mobile controls without injecting store state.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(250);
  const closePanel = page.getByRole("button", { name: "문서 패널 닫기", exact: true });
  if (await closePanel.count()) await closePanel.click();
  const current = await activeDocument(page);
  const branch = current.nodes.find((node) => node.id.endsWith("branch-0"));
  assert.ok(branch);
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator(`.react-flow__node[data-id="${branch.id}"]`).click({ button: "right" });
  await page.getByRole("button", { name: "가지 집중", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length === 4);
  await page.setViewportSize({ width: view.width, height: view.height });
  await page.waitForTimeout(250);
  assert.equal(await page.getByRole("button", { name: "전체 보기", exact: true }).count(), 1);
  return { id: current.id, hash: nodeContentHash(current.nodes) };
}
async function stillFocused(page, before) {
  const current = await activeDocument(page);
  assert.equal(current.id, before.id, "cancellation retains active document");
  assert.equal(nodeContentHash(current.nodes), before.hash, "cancellation retains map contents");
  assert.equal(await page.getByRole("button", { name: "전체 보기", exact: true }).count(), 1, "cancellation retains branch focus");
  assert.equal(await page.locator(".react-flow__node").count(), 4, "cancellation retains focused subtree");
}
async function importedUnfocused(page, before, prefix) {
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length === 19);
  const current = await activeDocument(page);
  assert.notEqual(current.id, before.id);
  assert.equal(await page.getByRole("button", { name: "전체 보기", exact: true }).count(), 0, "successful import clears old focus banner");
  assert.equal(await page.locator(`.react-flow__node[data-id="${prefix}root"]`).count(), 1, "new map shows root outside old focused branch");
  // There is no old-document undo history after the import boundary.
  await page.locator("[data-mindmap-canvas]").focus();
  await page.keyboard.press("Control+z");
  assert.equal((await activeDocument(page)).id, current.id);
  assert.equal(await page.locator(".react-flow__node").count(), 19);
  assert.equal(await page.getByRole("button", { name: "전체 보기", exact: true }).count(), 0);
  await page.keyboard.press("Control+s");
  await page.reload(); await ready(page);
  assert.equal((await activeDocument(page)).id, current.id);
  assert.equal(await page.locator(".react-flow__node").count(), 19);
  assert.equal(await page.getByRole("button", { name: "전체 보기", exact: true }).count(), 0, "reload retains unfocused imported document");
  return current;
}
async function runFocusedImports(browser, view) {
  const mobile = view.width < 768;
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const page = await context.newPage();
  page.on("pageerror", () => report.errors.push({ view: view.name, kind: "pageerror" }));
  await installDelayedReads(page);
  await page.goto(base); await openHome(page); await file(page, focusedJson()); await submit(page);
  let before = await enterBranchFocus(page, view);
  await openEditor(page, mobile); await cancel(page, true); await stillFocused(page, before);
  check(view.name, "focused editor Escape cancellation retains active branch and document");
  await openEditor(page, mobile); await cancel(page); await stillFocused(page, before);
  check(view.name, "focused editor cancel button retains active branch and document");
  await openEditor(page, mobile); await file(page, "{");
  await dialog(page).getByRole("alert").waitFor();
  assert.equal(await dialog(page).getByRole("button", { name: "가져오기", exact: true }).isDisabled(), true);
  await cancel(page, true); await stillFocused(page, before);
  check(view.name, "malformed import and Escape retain old document focus");
  await openEditor(page, mobile); await file(page, "", "delayed-error.json"); await deliverRead(page);
  await dialog(page).getByRole("alert").waitFor();
  await cancel(page, true); await stillFocused(page, before);
  check(view.name, "late file read failure and Escape retain old document focus");
  await openEditor(page, mobile); await file(page, focusedJson("cancelled-"), "delayed-cancelled.json");
  await cancel(page, true); await deliverRead(page); await stillFocused(page, before);
  await openEditor(page, mobile); await blank(page); await cancel(page); await stillFocused(page, before);
  check(view.name, "late success from cancelled import preserves focused document and fresh dialog");
  for (const prefix of ["", "different-"]) {
    if (prefix) before = await enterBranchFocus(page, view);
    const count = (await workspace(page)).documents.length;
    await openEditor(page, mobile); await file(page, focusedJson(prefix)); await submit(page);
    const state = await workspace(page);
    assert.equal(state.documents.length, count + 1);
    assert.equal(nodeContentHash(state.documents.find((doc) => doc.id === before.id).nodes), before.hash);
    await importedUnfocused(page, before, prefix);
    check(view.name, `focused editor ${prefix ? "different" : "same"}-ID import resets view context through undo and reload`);
  }
  for (const prefix of ["different-", "home-different-"]) {
    before = await enterBranchFocus(page, view);
    const count = (await workspace(page)).documents.length;
    await page.getByRole("button", { name: "메인으로", exact: true }).click();
    await openHome(page); await file(page, focusedJson(prefix)); await submit(page);
    const state = await workspace(page);
    assert.equal(state.documents.length, count + 1);
    assert.equal(nodeContentHash(state.documents.find((doc) => doc.id === before.id).nodes), before.hash);
    await importedUnfocused(page, before, prefix);
    check(view.name, `home ${prefix === "different-" ? "same" : "different"}-ID import shows whole new map through undo and reload`);
  }
  await context.close();
}

(async () => {
  let browser;
  let server;
  let originalHash;
  try {
    fs.mkdirSync(output, { recursive: true });
    if (!process.env.IMPORT_UX_BASE_URL || process.env.IMPORT_UX_START_SERVER === "1") {
      const url = new URL(base);
      assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "suite server must be local");
      server = spawn("npm", ["run", "start", "--", "--port", url.port || "3012"], {
        cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], detached: true,
      });
      let logs = "";
      server.stdout.on("data", (chunk) => { logs = (logs + chunk).slice(-6000); });
      server.stderr.on("data", (chunk) => { logs = (logs + chunk).slice(-6000); });
      let started = false;
      for (let i = 0; i < 120; i++) {
        try { if ((await fetch(base)).ok) { started = true; break; } } catch {}
        if (server.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert.ok(started, "local server failed to start: " + logs);
    }
    if (fixturePath) {
      const bytes = fs.readFileSync(fixturePath);
      const raw = JSON.parse(bytes.toString());
      assert.ok(Number.isInteger(raw.version) && raw.version >= 1 && raw.version <= 4);
      assert.equal(bytes.length, 595295);
      assert.equal(raw.document.nodes.length, 846);
      originalHash = hash(bytes);
      report.actualFixture = { libraryReferenceVersion: 1, payloadVersion: raw.version, bytes: bytes.length, nodes: raw.document.nodes.length };
    }
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}) });
    for (const view of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile-320", width: 320, height: 780 }, { name: "mobile-375", width: 375, height: 812 }]) {
      if (process.env.IMPORT_UX_FOCUS_ONLY !== "1") await run(browser, view);
      await runFocusedImports(browser, view);
    }
    assert.equal(report.errors.length, 0, "no browser page errors");
    if (fixturePath) assert.equal(hash(fs.readFileSync(fixturePath)), originalHash, "private source file unchanged");
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.checks.length, actualFixture: report.actualFixture, report: path.join(output, "report.json") }));
  } catch (error) {
    report.failure = { name: error.name, message: error.message };
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.error(report.failure.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
  }
})();
