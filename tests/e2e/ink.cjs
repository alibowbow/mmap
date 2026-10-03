/* Real Chromium DOM/render/file checks. Input from CDP emulates pen/touch;
   it does not validate physical S Pen or palm rejection. Build then run. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { inkBounds } = require("../../src/lib/ink.ts");
const { portableFixture } = require("../io/fixture.ts");
const key = "mindforge-workspace-v1",
  base = process.env.INK_BASE || "http://localhost:3002";
const output = "verification/ink";
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], errors: [], performance: {}, screenshots: [] };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function command(page, title) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  const d = page.getByRole("dialog", { name: "명령 팔레트" });
  await d.getByPlaceholder("명령 검색…").fill(title);
  await d
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
}
async function ready(page) {
  await page.locator("[data-mindmap-canvas]").waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-mindmap-canvas]")
        .getAttribute("aria-busy") === "false",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}
async function stored(page) {
  await page.waitForTimeout(850);
  return page.evaluate((key) => {
    const ws = JSON.parse(localStorage.getItem(key));
    return ws.documents.find((d) => d.id === ws.activeDocumentId);
  }, key);
}
async function download(page, trigger, file) {
  const wait = page.waitForEvent("download", { timeout: 60000 });
  await trigger();
  const d = await wait;
  assert.equal(await d.failure(), null);
  await d.saveAs(path.join(output, file));
  return fs.readFileSync(path.join(output, file));
}
async function exportJson(page, file) {
  await command(page, "내보내기");
  const d = page.getByRole("dialog", { name: "내보내기", exact: true });
  await d.getByRole("button", { name: "JSON", exact: true }).click();
  const raw = await download(
    page,
    () => d.getByRole("button", { name: "다운로드", exact: true }).click(),
    file,
  );
  await d.getByRole("button", { name: "닫기", exact: true }).click();
  return JSON.parse(raw);
}
async function importJson(page, raw) {
  await command(page, "JSON 가져오기");
  const d = page.getByRole("dialog", { name: "가져오기", exact: true });
  await d
    .getByRole("textbox", { name: "JSON 내용", exact: true })
    .fill(JSON.stringify(raw));
  await d.getByRole("button", { name: "가져오기", exact: true }).click();
  await ready(page);
}
async function pointerStroke(page, a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 18 });
  await page.mouse.up();
}
async function viewport(page) {
  return page.locator(".react-flow__viewport").evaluate((el) => {
    const m = new DOMMatrix(el.style.transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}
async function screenshot(page, name) {
  const file = path.join(output, name + ".png");
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
async function imageCheck(page, doc, format) {
  await command(page, "내보내기");
  const d = page.getByRole("dialog", { name: "내보내기", exact: true });
  await d
    .getByRole("button", { name: format.toUpperCase(), exact: true })
    .click();
  await d.getByRole("button", { name: "다운로드", exact: true }).waitFor();
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent.trim() === "다운로드",
      );
      return b && !b.disabled;
    },
    { timeout: 60000 },
  );
  const bytes = await download(
    page,
    () => d.getByRole("button", { name: "다운로드", exact: true }).click(),
    doc.boardMode + "-" + format + "." + format,
  );
  if (format === "png") {
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const colors = await page.evaluate(
      async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 256;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 256, 256);
        const rgba = ctx.getImageData(0, 0, 256, 256).data;
        let blue = 0,
          red = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i + 2] > rgba[i] + 40) blue++;
          if (rgba[i] > rgba[i + 2] + 40) red++;
        }
        return { blue, red };
      },
      "data:image/png;base64," + bytes.toString("base64"),
    );
    assert.ok(colors.blue > 10, "PNG ink blue pixels");
    report.checks.push({
      png: colors,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    });
  } else {
    const data = await page.evaluate((text) => {
      const xml = new DOMParser().parseFromString(text, "image/svg+xml"),
        v = xml.querySelector(".react-flow__viewport"),
        m = new DOMMatrix(v.style.transform);
      return {
        ids: [...xml.querySelectorAll("[data-ink-stroke]")].map((p) =>
          p.getAttribute("data-ink-stroke"),
        ),
        width: Number(xml.documentElement.getAttribute("width")),
        height: Number(xml.documentElement.getAttribute("height")),
        x: m.e,
        y: m.f,
        zoom: m.a,
      };
    }, bytes.toString());
    assert.deepEqual(data.ids.sort(), doc.ink.strokes.map((s) => s.id).sort());
    const b = inkBounds(doc.ink);
    assert.ok(
      data.x + b.x * data.zoom >= 0 &&
        data.y + b.y * data.zoom >= 0 &&
        data.x + (b.x + b.width) * data.zoom <= data.width &&
        data.y + (b.y + b.height) * data.zoom <= data.height,
      "ink fits export bounds",
    );
    report.checks.push({ svg: data });
  }
  await d.getByRole("button", { name: "닫기", exact: true }).click();
}
async function main() {
  let server, browser;
  try {
    if (!process.env.INK_BASE) {
      server = spawn(
        "npm",
        [
          "run",
          process.env.INK_DEV === "1" ? "dev" : "start",
          "--",
          "--port",
          "3002",
        ],
        { detached: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let serverLogs = "";
      server.stdout.on("data", (b) => (serverLogs += b));
      server.stderr.on("data", (b) => (serverLogs += b));
      let started = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(base)).ok) {
            started = true;
            break;
          }
        } catch {}
        await delay(300);
      }
      assert.ok(started, serverLogs);
    }
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    report.browser = browser.version();
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      acceptDownloads: true,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem("mindforge-onboarded-v1", "1"),
    );
    await page.goto(base);
    await page
      .getByRole("button", { name: "빈 손그림 보드", exact: true })
      .click();
    await ready(page);
    await page
      .getByRole("button", { name: "문서 패널 닫기", exact: true })
      .click()
      .catch(() => {});
    const area = await page.locator("[data-ink-input]").boundingBox();
    const a = { x: area.x + area.width * 0.3, y: area.y + area.height * 0.4 },
      b = { x: a.x + 130, y: a.y + 80 };
    const v = await viewport(page);
    await pointerStroke(page, a, b);
    let doc = await stored(page);
    assert.equal(doc.boardMode, "blank");
    assert.equal(doc.nodes.length, 0);
    assert.equal(doc.ink.strokes.length, 1);
    assert.ok(doc.ink.strokes[0].points.every((p) => p.pressure === 1));
    assert.ok(
      Math.abs(doc.ink.strokes[0].points[0].x - (a.x - area.x - v.x) / v.zoom) <
        1,
    );
    report.checks.push(
      "Mouse drawing stores world coordinates and constant fallback pressure",
    );
    await page
      .getByRole("button", { name: "펜 색과 굵기", exact: true })
      .click();
    const options = page.getByRole("dialog", {
      name: "펜 색과 굵기",
      exact: true,
    });
    await options
      .getByRole("button", { name: "펜 색 #dc2626", exact: true })
      .click();
    await options
      .getByRole("slider", { name: "펜 굵기", exact: true })
      .fill("8");
    await options.getByRole("button", { name: "완료", exact: true }).click();
    await options.waitFor({ state: "hidden" });
    assert.deepEqual((await stored(page)).inkSettings, {
      color: "#dc2626",
      width: 8,
    });
    // Keep the image color assertions blue while verifying settings are saved.
    await page
      .getByRole("button", { name: "펜 색과 굵기", exact: true })
      .click();
    await options
      .getByRole("button", { name: "펜 색 #2563eb", exact: true })
      .click();
    await options.getByRole("button", { name: "완료", exact: true }).click();
    await options.waitFor({ state: "hidden" });
    // A cancelled pointer must not leave a partial stroke behind.
    await page.mouse.move(a.x + 200, a.y + 100);
    await page.mouse.down();
    await page.mouse.move(a.x + 220, a.y + 130);
    await page
      .locator("[data-ink-input]")
      .dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse" });
    await page.mouse.up();
    assert.equal((await stored(page)).ink.strokes.length, 1);
    report.checks.push(
      "Pen color/width controls persist; cancelled pointer discards unfinished ink",
    );
    await page.getByRole("button", { name: "이동 모드", exact: true }).click();
    const beforePan = await viewport(page);
    await pointerStroke(
      page,
      { x: a.x, y: a.y + 120 },
      { x: a.x + 90, y: a.y + 175 },
    );
    await page.waitForTimeout(200);
    const afterPan = await viewport(page);
    assert.ok(Math.abs(afterPan.x - beforePan.x) > 50);
    assert.equal((await stored(page)).ink.strokes.length, 1);
    await page.getByRole("button", { name: "확대", exact: true }).click();
    await page.waitForTimeout(400);
    await page
      .getByRole("button", { name: "그리기 모드", exact: true })
      .click();
    const moved = await viewport(page);
    const c = { x: a.x + 260, y: a.y + 50 };
    await pointerStroke(page, c, { x: c.x + 60, y: c.y + 80 });
    doc = await stored(page);
    assert.equal(doc.ink.strokes.length, 2);
    assert.ok(
      Math.abs(
        doc.ink.strokes[1].points[0].x - (c.x - area.x - moved.x) / moved.zoom,
      ) < 1,
    );
    report.checks.push(
      "Pan/zoom changes camera only; subsequent ink stays in world space",
    );
    const cdp = await ctx.newCDPSession(page);
    const pen = { x: a.x + 400, y: a.y + 40 };
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...pen,
      button: "left",
      buttons: 1,
      clickCount: 1,
      pointerType: "pen",
      force: 0.2,
    });
    for (let i = 1; i <= 15; i++)
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: pen.x + i * 3,
        y: pen.y + i * 4,
        button: "left",
        buttons: 1,
        pointerType: "pen",
        force: 0.2 + i * 0.045,
      });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: pen.x + 45,
      y: pen.y + 60,
      button: "left",
      buttons: 0,
      pointerType: "pen",
    });
    doc = await stored(page);
    assert.equal(doc.ink.strokes.length, 3);
    const pressures = doc.ink.strokes[2].points.map((p) => p.pressure);
    assert.ok(Math.max(...pressures) - Math.min(...pressures) > 0.4);
    report.checks.push(
      "Chromium CDP pen pressure 0.2–0.875 flows through Pointer Events (hardware unverified)",
    );
    const touch = [{ x: a.x + 180, y: a.y + 210, id: 7, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: touch,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...touch[0], x: touch[0].x + 80, y: touch[0].y + 30 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    doc = await stored(page);
    assert.equal(doc.ink.strokes.length, 4);
    // Two fingers turn the in-flight draw into camera navigation without new ink.
    const t1 = { x: a.x, y: a.y + 260, id: 11 },
      t2 = { x: a.x + 160, y: a.y + 260, id: 12 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [t1],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [t1, t2],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...t1, x: t1.x - 20 },
        { ...t2, x: t2.x + 50 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal((await stored(page)).ink.strokes.length, 4);
    report.checks.push(
      "Emulated single touch draws; two fingers navigate and discard preview",
    );
    // Fit then erase through first stroke's center; assert whole-stroke undo.
    await page
      .getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true })
      .click();
    await page.waitForTimeout(500);
    const fit = await viewport(page),
      s = doc.ink.strokes[0],
      first = s.points[0],
      last = s.points.at(-1),
      center = {
        x: area.x + fit.x + ((first.x + last.x) / 2) * fit.zoom,
        y: area.y + fit.y + ((first.y + last.y) / 2) * fit.zoom,
      };
    await page
      .getByRole("button", { name: "지우개 모드", exact: true })
      .click();
    await pointerStroke(
      page,
      { x: center.x - 35, y: center.y },
      { x: center.x + 35, y: center.y },
    );
    const erased = await stored(page);
    assert.ok(erased.ink.strokes.length < 4);
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    assert.deepEqual((await stored(page)).ink, doc.ink);
    await page.getByRole("button", { name: "다시 실행", exact: true }).click();
    assert.deepEqual((await stored(page)).ink, erased.ink);
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    await page
      .getByRole("button", { name: "잉크 전체 지우기", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "잉크를 모두 지울까요?" })
      .getByRole("button", { name: "취소", exact: true })
      .click();
    assert.equal((await stored(page)).ink.strokes.length, 4);
    await page
      .getByRole("button", { name: "잉크 전체 지우기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "잉크만 지우기", exact: true })
      .click();
    assert.equal((await stored(page)).ink.strokes.length, 0);
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    doc = await stored(page);
    assert.equal(doc.ink.strokes.length, 4);
    report.checks.push(
      "Swept eraser, undo/redo, clear cancel/confirm/undo preserve committed drawings",
    );
    await page.reload();
    await ready(page);
    assert.deepEqual((await stored(page)).ink, doc.ink);
    assert.deepEqual((await stored(page)).inkSettings, {
      color: "#2563eb",
      width: 8,
    });
    const exported = await exportJson(page, "blank.json");
    assert.deepEqual(exported.document.ink, doc.ink);
    assert.equal(exported.version, 3);
    assert.deepEqual(exported.document.inkSettings, {
      color: "#2563eb",
      width: 8,
    });
    const fresh = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const p2 = await fresh.newPage();
    p2.on("pageerror", (e) => report.errors.push(e.message));
    await p2.addInitScript(() =>
      localStorage.setItem("mindforge-onboarded-v1", "1"),
    );
    await p2.goto(base);
    await p2
      .getByRole("button", { name: "새 마인드맵 시작", exact: true })
      .click();
    await ready(p2);
    await importJson(p2, exported);
    assert.deepEqual(
      (await exportJson(p2, "blank-reexport.json")).document.ink,
      doc.ink,
    );
    report.checks.push(
      "Autosave, reload, real JSON download → fresh browser import/reexport retain empty-board flag, ink and settings",
    );
    await imageCheck(page, doc, "png");
    await imageCheck(page, doc, "svg");
    const fixture = portableFixture();
    // Strokes on opposite sides of the node map exercise export/fit bounds.
    fixture.ink = {
      version: 1,
      strokes: [
        ...doc.ink.strokes,
        {
          id: "outside-left",
          color: "#2563eb",
          width: 16,
          points: [
            { x: -1800, y: -800, pressure: 1 },
            { x: -1600, y: -600, pressure: 1 },
          ],
        },
        {
          id: "outside-right",
          color: "#2563eb",
          width: 16,
          points: [
            { x: 2400, y: 1800, pressure: 1 },
            { x: 2600, y: 2000, pressure: 1 },
          ],
        },
      ],
    };
    fixture.boardMode = "map";
    await importJson(page, {
      version: 3,
      format: "mindforge-document",
      document: fixture,
    });
    let overlay = await stored(page);
    const nodes = overlay.nodes;
    await page
      .getByRole("button", { name: "지우개 모드", exact: true })
      .click();
    await page
      .getByRole("button", { name: "잉크 전체 지우기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "잉크만 지우기", exact: true })
      .click();
    assert.deepEqual(
      (await stored(page)).nodes.map(({ measured, ...n }) => n),
      nodes.map(({ measured, ...n }) => n),
    );
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    overlay = await stored(page);
    await imageCheck(page, overlay, "png");
    await imageCheck(page, overlay, "svg");
    await page.getByRole("button", { name: "노드 모드", exact: true }).click();
    const node = page.locator(".react-flow__node").first();
    await node.dblclick();
    await node.locator("textarea").fill("손그림과 함께 노드 편집");
    await node.locator("textarea").press("Enter");
    await ready(page);
    assert.ok(
      (await stored(page)).nodes.some(
        (n) => n.data.label === "손그림과 함께 노드 편집",
      ),
    );
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    await ready(page);
    const beforeDrag = await stored(page);
    const box = await node.boundingBox();
    await pointerStroke(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { x: box.x + box.width / 2 + 70, y: box.y + box.height / 2 + 40 },
    );
    await ready(page);
    assert.notDeepEqual(
      (await stored(page)).nodes[0].position,
      beforeDrag.nodes[0].position,
    );
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    await ready(page);
    assert.deepEqual(
      (await stored(page)).nodes[0].position,
      beforeDrag.nodes[0].position,
    );
    assert.deepEqual((await stored(page)).ink, overlay.ink);
    report.checks.push(
      "Overlay erase does not touch nodes; switching back supports node edit/drag/undo while preserving ink",
    );
    for (const width of [320, 360, 390, 768, 884, 1440]) {
      await page.setViewportSize({ width, height: width === 884 ? 1104 : 900 });
      await page
        .getByRole("button", { name: "그리기 모드", exact: true })
        .click();
      await page
        .getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true })
        .click();
      await page.waitForTimeout(600);
      assert.equal(
        await page.locator(".react-flow__node-toolbar").count(),
        0,
        "node quick actions hidden while drawing",
      );
      const sizes = await page
        .locator("[data-ink-modebar] button, [data-ink-toolbar] button")
        .evaluateAll((es) =>
          es.map((e) => ({
            w: e.getBoundingClientRect().width,
            h: e.getBoundingClientRect().height,
          })),
        );
      assert.ok(sizes.every((s) => s.w >= 44 && s.h >= 44));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await screenshot(page, "width-" + width);
    }
    report.checks.push(
      "320/360/390/768/884/1440px viewport: no overflow, ≥44px controls; screenshots inspected separately",
    );
    // A separate synthetic document/context keeps the normal regression small.
    const largeStrokes = Array.from({ length: 1000 }, (_, j) => ({
      id: "perf" + j,
      color: "#2563eb",
      width: 4,
      points: Array.from({ length: 100 }, (_, i) => ({
        x: (j % 40) * 30 + i * 0.2,
        y: Math.floor(j / 40) * 30 + Math.sin(i * 0.1) * 8,
        pressure: 1,
      })),
    }));
    const largeDoc = {
      id: "large-ink",
      title: "Large ink QA",
      boardMode: "blank",
      nodes: [],
      edges: [],
      ink: { version: 1, strokes: largeStrokes },
      createdAt: "2026-10-03",
      updatedAt: "2026-10-03",
    };
    const largeContext = await browser.newContext({
      viewport: { width: 884, height: 1104 },
      hasTouch: true,
    });
    const largePage = await largeContext.newPage();
    largePage.on("pageerror", (e) => report.errors.push(e.message));
    await largePage.addInitScript(
      ({ key, doc }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 2,
            documents: [doc],
            activeDocumentId: doc.id,
            sidebarCollapsed: true,
            inspectorOpen: false,
          }),
        );
        localStorage.setItem("mindforge-onboarded-v1", "1");
      },
      { key, doc: largeDoc },
    );
    const loadStart = Date.now();
    await largePage.goto(base + "/?doc=" + largeDoc.id);
    await ready(largePage);
    assert.equal(await largePage.locator("[data-ink-stroke]").count(), 1000);
    const loadMs = Date.now() - loadStart;
    const timings = await largePage.evaluate(async () => {
      const times = [];
      await new Promise((resolve) => {
        let last = performance.now();
        const step = (t) => {
          times.push(t - last);
          last = t;
          if (times.length >= 60) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      return times;
    });
    await largePage
      .getByRole("button", { name: "이동 모드", exact: true })
      .click();
    const inkArea = await largePage.locator("[data-ink-input]").boundingBox();
    const largeBefore = await stored(largePage);
    const panStart = Date.now();
    await pointerStroke(
      largePage,
      { x: inkArea.x + 350, y: inkArea.y + 400 },
      { x: inkArea.x + 450, y: inkArea.y + 450 },
    );
    const panMs = Date.now() - panStart;
    assert.deepEqual((await stored(largePage)).ink, largeBefore.ink);
    await largePage
      .getByRole("button", { name: "그리기 모드", exact: true })
      .click();
    const longStart = Date.now();
    await pointerStroke(
      largePage,
      { x: inkArea.x + 250, y: inkArea.y + 450 },
      { x: inkArea.x + 550, y: inkArea.y + 550 },
    );
    const longAfter = await stored(largePage);
    assert.equal(longAfter.ink.strokes.length, 1001);
    report.performance = {
      samples: 100000,
      strokes: 1000,
      loadAndSettleMs: loadMs,
      panGestureMs: panMs,
      drawAndSaveMs: Date.now() - longStart,
      frameMedianMs: timings.sort((a, b) => a - b)[30],
      frameP95Ms: timings[57],
      serializedBytes: Buffer.byteLength(JSON.stringify(longAfter)),
    };
    await screenshot(largePage, "large-fold");
    report.checks.push(
      "1000 strokes / 100,000 samples render, camera navigation and new stroke save in a separate Chromium context",
    );
    await largeContext.close();
    assert.deepEqual(report.errors, []);
  } finally {
    if (browser) await browser.close();
    if (server)
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
