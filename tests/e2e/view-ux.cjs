/* Local production view UX regression. Set VIEW_UX_BASE_URL after npm run build/start.
   Optional MMAP_PRIVATE_FIXTURE is read only; neither content nor copies are emitted. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { exportDocumentJson } = require("../../src/lib/export.ts");
const { portableFixture } = require("../io/fixture.ts");
const { buildEdgesFromNodes } = require("../../src/lib/tree.ts");
const base = process.env.VIEW_UX_BASE_URL || "http://127.0.0.1:3010";
const output = process.env.VIEW_UX_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), "mmap-view-ux-"));
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], errors: [], actualFixture: "not supplied" };
const key = "mindforge-workspace-v1";
const synthetic = () => {
  const d = portableFixture();
  const node = (id, parentId, x, y) => ({
    id, type: "mindmap", position: { x, y },
    data: { label: "View " + id, type: parentId ? "idea" : "root", parentId, collapsed: true }
  });
  d.id = "view-source"; d.title = "View regression";
  d.nodes = [node("r", null, 0, 0), node("b", "r", 300, 300)];
  for (let i = 1; i <= 6; i++) d.nodes.push(node("a" + i, i === 1 ? "r" : "a" + (i - 1), i * 300, 0));
  d.edges = buildEdgesFromNodes(d.nodes);
  d.relations = [{ id: "view-rel", source: "b", target: "a6", label: "Cross link" }];
  d.layoutMode = "right-tree";
  d.appearance.rainbowBranches = false;
  return d;
};
async function ready(p) {
  await p.waitForFunction(() => document.querySelector("[data-mindmap-canvas]")?.getAttribute("aria-busy") === "false", null, { timeout: 60000 });
  await p.waitForTimeout(220);
}
async function stored(p) {
  return p.evaluate(key => {
    const w = JSON.parse(localStorage.getItem(key));
    return w.documents.find(d => d.id === w.activeDocumentId);
  }, key);
}
async function view(p) {
  // Initial hydration/panel fitting is an existing animated camera action.
  // Compare presets after that action settles, rather than mid-animation.
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "보기 제어", exact: true }).click();
  const d = p.getByRole("dialog", { name: "보기", exact: true });
  await d.waitFor();
  return d;
}
async function perform(p, name, expected) {
  const d = p.getByRole("dialog", { name: "보기", exact: true });
  const before = await p.locator(".react-flow__viewport").getAttribute("style");
  await d.getByRole("button", { name, exact: true }).click();
  await ready(p);
  await p.waitForFunction(n => document.querySelectorAll(".react-flow__node").length === n, expected);
  assert.equal(await p.locator(".react-flow__viewport").getAttribute("style"), before, "view action preserves camera");
  await p.waitForTimeout(800);
  const doc = await stored(p);
  const visible = new Set(await p.locator(".react-flow__node").evaluateAll(ns => ns.map(n => n.dataset.id)));
  const expectedEdges = [...doc.edges, ...(doc.relations || [])].filter(e => visible.has(e.source) && visible.has(e.target));
  assert.equal(await p.locator(".react-flow__edge").count(), expectedEdges.length, "edges only connect visible nodes");
  assert.ok(await d.getByRole("status").isVisible());
  assert.ok(await d.getByRole("button", { name, exact: true }).evaluate(el => el === document.activeElement), "action retains keyboard focus");
  return doc;
}
async function importHome(p, bytes) {
  const nav = p.getByRole("button", { name: "가져오기", exact: true });
  if (await nav.isVisible()) await nav.click();
  else await p.getByRole("button", { name: "파일 가져오기", exact: true }).click();
  const d = p.getByRole("dialog", { name: "가져오기", exact: true });
  await d.locator('input[type="file"]').setInputFiles({ name: "input.json", mimeType: "application/json", buffer: bytes });
  await d.getByRole("button", { name: "가져오기", exact: true }).click();
  await ready(p);
}
async function importEditor(p, bytes) {
  if (p.viewportSize().width < 768) {
    await p.getByRole("button", { name: "문서 목록 열기", exact: true }).click();
    await p.getByRole("dialog", { name: "문서 목록", exact: true }).getByRole("button", { name: "JSON 가져오기", exact: true }).click();
  } else {
    await p.getByRole("button", { name: "더 많은 도구", exact: true }).click();
    await p.getByRole("menuitem", { name: "JSON 가져오기", exact: true }).click();
  }
  const d = p.getByRole("dialog", { name: "가져오기", exact: true });
  await d.locator('input[type="file"]').setInputFiles({ name: "input.json", mimeType: "application/json", buffer: bytes });
  await d.getByRole("button", { name: "가져오기", exact: true }).click();
  await ready(p);
}
async function open(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("mindforge-onboarded-v1", "1"));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  p.on("pageerror", e => report.errors.push(e.message));
  await p.goto(base);
  return { ctx, p };
}
async function geometry(p) {
  return p.evaluate(() => {
    const trigger = document.querySelector("[data-view-trigger]").getBoundingClientRect();
    const ink = document.querySelector("[data-ink-toolbar]")?.getBoundingClientRect();
    const overlap = (a, b) => b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, trigger: { x: trigger.x, y: trigger.y, w: trigger.width, h: trigger.height, right: trigger.right }, overlapsInk: !!overlap(trigger, ink) };
  });
}
async function main() {
  let server;
  if (!process.env.VIEW_UX_BASE_URL) {
    server = spawn("npm", ["run", "start", "--", "--port", "3010"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let logs = "", started = false;
    server.stdout.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
    server.stderr.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base)).ok) { started = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!started) {
      if (server.pid) try { process.kill(-server.pid, "SIGTERM"); } catch {}
      throw new Error("Local production server did not start: " + logs);
    }
  }
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  report.browser = browser.version();
  try {
    const bytes = Buffer.from(exportDocumentJson(synthetic()));
    for (const width of [1440, 900, 375, 320]) {
      const { ctx, p } = await open(browser, width);
      await importHome(p, bytes);
      if (width >= 768 && await p.getByRole("button", { name: "문서 패널 닫기", exact: true }).count()) {
        await p.getByRole("button", { name: "문서 패널 닫기", exact: true }).click();
        await p.waitForTimeout(500);
      }
      const trigger = p.getByRole("button", { name: "보기 제어", exact: true });
      await trigger.focus();
      await p.keyboard.press("Enter");
      let d = p.getByRole("dialog", { name: "보기", exact: true });
      assert.ok(await d.getByText(/루트는 0단계/).isVisible());
      await p.keyboard.press("Escape");
      await d.waitFor({ state: "hidden" });
      assert.ok(await trigger.evaluate(el => el === document.activeElement), "Escape restores trigger focus");
      d = await view(p);
      await p.keyboard.press("Shift+Tab");
      assert.ok(await d.evaluate(el => el.contains(document.activeElement)), "focus trapped in view dialog");
      await p.screenshot({ path: path.join(output, "view-dialog-" + width + ".png") });
      const initial = await stored(p);
      const positions = JSON.stringify(initial.nodes.map(n => [n.id, n.position]));
      await perform(p, "1단계까지 펼치기", 3);
      await perform(p, "2단계까지 펼치기", 4);
      await perform(p, "3단계까지 펼치기", 5);
      await d.getByRole("combobox", { name: "추가 펼치기 단계", exact: true }).selectOption("6");
      const all = await perform(p, "단계 적용", 8);
      assert.equal(JSON.stringify(all.nodes.map(n => [n.id, n.position])), positions, "depth presets preserve manual geometry");
      await d.getByRole("button", { name: "완료", exact: true }).click();
      // A real inline draft commits before its node is hidden by a view action.
      const leaf = p.locator('.react-flow__node[data-id="a6"]');
      await leaf.focus();
      await p.keyboard.press("F2");
      await leaf.locator("textarea").fill("Draft safely preserved");
      d = await view(p);
      await perform(p, "모두 접기", 1);
      await perform(p, "모두 접기", 1); // repeated action must not add undo history
      await d.getByRole("button", { name: "완료", exact: true }).click();
      assert.equal(await p.locator(".react-flow__node.selected").count(), 0, "hidden selection cleared");
      assert.equal(await p.locator(".react-flow__node textarea").count(), 0, "hidden editor cleared");
      await p.getByRole("button", { name: "실행 취소", exact: true }).click();
      await ready(p);
      assert.equal(await p.locator(".react-flow__node").count(), 8, "single undo reverses repeated collapse");
      await p.getByRole("button", { name: "다시 실행", exact: true }).click();
      await ready(p);
      assert.equal(await p.locator(".react-flow__node").count(), 1);
      // Redo from a descendant must preserve a usable node keyboard target
      // when the restored collapse unmounts that focused descendant.
      await p.getByRole("button", { name: "실행 취소", exact: true }).click();
      await ready(p);
      await p.locator('.react-flow__node[data-id="a6"]').focus();
      await p.keyboard.press("Control+Shift+z");
      await ready(p);
      assert.equal(await p.locator(".react-flow__node").count(), 1);
      assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("data-id")), "r", "hidden node keyboard focus returns to its visible ancestor");
      await p.keyboard.press("F2");
      await p.locator('.react-flow__node[data-id="r"] textarea').waitFor();
      await p.keyboard.press("Escape");
      await p.keyboard.press("Control+s");
      const saved = await stored(p);
      assert.equal(saved.nodes.find(n => n.id === "a6").data.label, "Draft safely preserved");
      await p.reload(); await ready(p);
      assert.equal(await p.locator(".react-flow__node").count(), 1, "collapse persists through reload");
      d = await view(p);
      await perform(p, "모두 펼치기", 8);
      await d.getByRole("button", { name: "닫기", exact: true }).click();
      await p.getByRole("button", { name: "그리기 모드", exact: true }).click();
      const g = await geometry(p);
      assert.ok(g.scrollWidth <= width && g.trigger.x >= 0 && g.trigger.right <= width && !g.overlapsInk, "view control remains separate from drawing tools");
      await p.screenshot({ path: path.join(output, "synthetic-" + width + ".png") });
      d = await view(p);
      assert.ok(await d.getByRole("button", { name: "모두 접기", exact: true }).isVisible());
      if (width < 768) {
        await d.getByRole("button", { name: "검색", exact: true }).click();
        const search = p.getByRole("dialog", { name: "노드 검색", exact: true });
        await search.waitFor();
        await p.keyboard.press("Escape");
        await search.waitFor({ state: "hidden" });
        assert.ok(await trigger.evaluate(el => el === document.activeElement), "search opened through view returns to its stable trigger");
      } else await d.getByRole("button", { name: "완료", exact: true }).click();
      report.checks.push({ viewport: width, syntheticView: "passed", geometry: g });
      await ctx.close();
    }
    // Multiple roots + a legacy workspace cycle are independently foldable.
    const graph = synthetic();
    graph.nodes = graph.nodes.filter(n => ["r", "b"].includes(n.id));
    graph.nodes.push({ id: "f", type: "mindmap", position: { x: 0, y: 600 }, data: { label: "Forest root", type: "root", parentId: null } },
      { id: "fc", type: "mindmap", position: { x: 300, y: 600 }, data: { label: "Forest child", type: "idea", parentId: "f" } });
    graph.nodes.push({ id: "c1", type: "mindmap", position: { x: 0, y: 1000 }, data: { label: "Cycle 1", type: "idea", parentId: "c2" } },
      { id: "c2", type: "mindmap", position: { x: 300, y: 1000 }, data: { label: "Cycle 2", type: "idea", parentId: "c1" } });
    graph.edges = buildEdgesFromNodes(graph.nodes); graph.relations = [];
    const forest = await open(browser, 1440);
    // Existing importer accepts connected trees only; legacy/local workspace
    // rendering supports these safe view shapes without changing import policy.
    // Seed on the destination page after the existing home pagehide save.
    await forest.ctx.addInitScript(({ key, graph }) => localStorage.setItem(key, JSON.stringify({ version: 1, documents: [graph], activeDocumentId: graph.id, sidebarCollapsed: true, inspectorOpen: false })), { key, graph });
    await forest.p.goto(base + "?doc=" + graph.id); await ready(forest.p);
    let d = await view(forest.p);
    await perform(forest.p, "모두 접기", 3);
    await perform(forest.p, "1단계까지 펼치기", 6);
    await perform(forest.p, "모두 펼치기", 6);
    await d.getByRole("button", { name: "완료", exact: true }).click();
    await forest.ctx.close(); report.checks.push({ forestCycle: "passed" });
    if (process.env.MMAP_PRIVATE_FIXTURE) {
      const raw = fs.readFileSync(process.env.MMAP_PRIVATE_FIXTURE);
      const input = JSON.parse(raw);
      assert.equal(input.document.nodes.length, 846, "actual fixture node count");
      for (const width of [1440, 320]) {
        const { ctx, p } = await open(browser, width);
        await importHome(p, raw);
        const id = (await stored(p)).id;
        d = await view(p);
        await perform(p, "모두 접기", 1);
        const counts = [1, 8, 47, 145, 336, 618, 846];
        for (let depth = 1; depth <= 6; depth++) {
          if (depth <= 3) await perform(p, depth + "단계까지 펼치기", counts[depth]);
          else {
            await d.getByRole("combobox", { name: "추가 펼치기 단계", exact: true }).selectOption(String(depth));
            await perform(p, "단계 적용", counts[depth]);
          }
        }
        await perform(p, "모두 펼치기", 846);
        await perform(p, "모두 접기", 1);
        await d.getByRole("button", { name: "완료", exact: true }).click();
        await p.keyboard.press("Control+s");
        await p.reload(); await ready(p);
        assert.equal(await p.locator(".react-flow__node").count(), 1);
        const previous = await stored(p);
        await importEditor(p, raw);
        const current = await stored(p);
        assert.notEqual(current.id, id, "reimport creates a new document");
        const preserved = await p.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)).documents.find(d => d.id === id), { key, id });
        assert.ok(JSON.stringify(preserved.nodes) === JSON.stringify(previous.nodes), "previous collapse/edit state preserved on reimport");
        assert.equal(current.nodes.length, 846);
        report.checks.push({ actual846: "passed", viewport: width, depthVisibleCounts: counts, reloadReimport: "passed" });
        await ctx.close();
      }
      report.actualFixture = "846 nodes; original bytes read without mutation";
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
    if (server?.pid) try { process.kill(-server.pid, "SIGTERM"); } catch {}
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
