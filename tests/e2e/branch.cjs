/* Chromium production build; CDP pen/touch are simulations, not physical devices. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const {
  inkBounds,
  itemCenter,
  transformPoint,
} = require("../../src/lib/ink.ts");
const { branchStudyDocument } = require("../../src/lib/branchExamples.ts");
const {
  branchGeometry,
  renderPoints,
  strokePath,
} = require("../../src/lib/ink.ts");
const { studioDocument } = require("../../src/lib/studioExamples.ts");
const { exportDocumentJson } = require("../../src/lib/export.ts");
const base = process.env.BRANCH_BASE || "http://localhost:3004",
  key = "mindforge-workspace-v1",
  output = "verification/branch";
const artifacts =
  process.env.BRANCH_ARTIFACTS || path.resolve("verification/branch");
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(artifacts, { recursive: true });
const report = {
  checks: [],
  errors: [],
  performance: {},
  physicalDevices:
    "Not tested. CDP pen/touch and Fold viewport emulation only.",
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready(p) {
  await p.locator("[data-mindmap-canvas]").waitFor();
  await p.waitForFunction(
    () =>
      document
        .querySelector("[data-mindmap-canvas]")
        .getAttribute("aria-busy") === "false",
  );
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
}
async function stored(p) {
  await p.waitForTimeout(850);
  return p.evaluate((k) => {
    const w = JSON.parse(localStorage.getItem(k));
    return w.documents.find((d) => d.id === w.activeDocumentId);
  }, key);
}
async function closeDocuments(p) {
  const button = p.getByRole("button", { name: "문서 패널 닫기", exact: true });
  if (await button.count()) await button.click();
}
async function command(p, name) {
  await p.keyboard.press("Escape");
  await p.keyboard.press("Control+k");
  const d = p.getByRole("dialog", { name: "명령 팔레트" });
  await d.getByPlaceholder("명령 검색…").fill(name);
  await d
    .getByRole("button")
    .filter({ has: p.getByText(name, { exact: true }) })
    .click();
}
async function options(p, tab) {
  await p.getByRole("button", { name: "아날로그 도구함", exact: true }).click();
  const d = p.getByRole("dialog", { name: "아날로그 도구함", exact: true });
  if (tab) await d.getByRole("tab", { name: tab, exact: true }).click();
  return d;
}
async function done(d) {
  await d.getByRole("button", { name: "완료", exact: true }).click();
  await d.waitFor({ state: "hidden" });
}
async function example(p, kind) {
  const d = await options(p, "예제");
  await d
    .getByRole("button", {
      name:
        kind === "map"
          ? "새 문서로 생각의 정원 열기"
          : "새 문서로 도구 자국 비교 열기",
      exact: true,
    })
    .click();
  await ready(p);
  await closeDocuments(p);
  await p
    .getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true })
    .click();
  await p.waitForTimeout(500);
}
async function download(p, action, file) {
  const wait = p.waitForEvent("download", { timeout: 60000 });
  await action();
  const d = await wait;
  assert.equal(await d.failure(), null);
  await d.saveAs(file);
  return fs.readFileSync(file);
}
async function exportFile(p, format, file) {
  await command(p, "내보내기");
  const d = p.getByRole("dialog", { name: "내보내기", exact: true });
  await d
    .getByRole("button", { name: format.toUpperCase(), exact: true })
    .click();
  await d.getByRole("button", { name: "다운로드", exact: true }).waitFor();
  await p.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent.trim() === "다운로드",
      );
      return b && !b.disabled;
    },
    null,
    { timeout: 60000 },
  );
  const bytes = await download(
    p,
    () => d.getByRole("button", { name: "다운로드", exact: true }).click(),
    file,
  );
  await d.getByRole("button", { name: "닫기", exact: true }).click();
  return bytes;
}
async function importFile(p, file) {
  await command(p, "JSON 가져오기");
  const d = p.getByRole("dialog", { name: "가져오기", exact: true });
  await d.locator('input[type="file"]').setInputFiles(file);
  await d.getByRole("button", { name: "가져오기", exact: true }).click();
  await ready(p);
}
async function camera(p) {
  return p.locator(".react-flow__viewport").evaluate((el) => {
    const m = new DOMMatrix(el.style.transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}
async function draw(p, ps) {
  await p.mouse.move(ps[0].x, ps[0].y);
  await p.mouse.down();
  for (const a of ps.slice(1)) await p.mouse.move(a.x, a.y);
  await p.mouse.up();
}
async function screen(p, point) {
  const v = await camera(p),
    a = await p.locator("[data-ink-input]").boundingBox();
  return { x: a.x + v.x + point.x * v.zoom, y: a.y + v.y + point.y * v.zoom };
}
async function svgCheck(p, bytes, doc) {
  return p.evaluate(
    ({ text, ids, bounds, strokes, objects }) => {
      const xml = new DOMParser().parseFromString(text, "image/svg+xml"),
        assertNoError = xml.querySelector("parsererror");
      if (assertNoError) throw Error(assertNoError.textContent);
      const elems = [
        ...xml.querySelectorAll("[data-ink-stroke],[data-ink-object]"),
      ];
      const actual = elems.map(
        (e) =>
          e.getAttribute("data-ink-stroke") ||
          e.getAttribute("data-ink-object"),
      );
      const v = xml.querySelector(".react-flow__viewport"),
        m = new DOMMatrix(v.style.transform),
        w = +xml.documentElement.getAttribute("width"),
        h = +xml.documentElement.getAttribute("height");
      return {
        actual,
        patternCount: xml.querySelectorAll("pattern").length,
        elementCount: xml.querySelectorAll("*").length,
        width: w,
        height: h,
        inside:
          m.e + bounds.x * m.a >= 0 &&
          m.f + bounds.y * m.a >= 0 &&
          m.e + (bounds.x + bounds.width) * m.a <= w &&
          m.f + (bounds.y + bounds.height) * m.a <= h,
        preview: !!xml.querySelector(
          "[data-ink-preview],[data-studio-selection]",
        ),
        paper: xml.querySelector("[data-ink-paper] rect")?.getAttribute("fill"),
        hasFont: text.includes("Jua") && text.includes("data:font"),
        highlighter: [
          ...xml.querySelectorAll('[data-brush="highlighter"]'),
        ].every((e) => Math.abs(+e.getAttribute("opacity") - 0.27) < 0.0001),
      };
    },
    {
      text: bytes.toString(),
      ids: doc.ink.order,
      bounds: inkBounds(doc.ink),
      strokes: doc.ink.strokes.length,
      objects: doc.ink.objects.length,
    },
  );
}
async function pixels(p, bytes) {
  return p.evaluate(
    async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let colorful = 0,
        grain = 0,
        dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        if (
          Math.max(r, g, b) - Math.min(r, g, b) > 50 &&
          Math.min(r, g, b) < 180
        )
          colorful++;
        if (r > 225 && g > 214 && b > 195 && r < 252) grain++;
        if (Math.max(r, g, b) < 150) dark++;
      }
      return {
        width: c.width,
        height: c.height,
        colorful,
        grain,
        dark,
        corner: [...data.slice(0, 4)],
      };
    },
    "data:image/png;base64," + bytes.toString("base64"),
  );
}
async function main() {
  let server, browser;
  try {
    if (!process.env.BRANCH_BASE) {
      server = spawn("npm", ["run", "start", "--", "--port", "3004"], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let logs = "";
      server.stdout.on("data", (b) => (logs += b));
      server.stderr.on("data", (b) => (logs += b));
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
      assert.ok(started, logs);
    }
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    report.browser = browser.version();
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      acceptDownloads: true,
    });
    await ctx.addInitScript(() =>
      localStorage.setItem("mindforge-onboarded-v1", "1"),
    );
    let p = await ctx.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    await p.goto(base);
    await p
      .getByRole("button", { name: "빈 손그림 보드", exact: true })
      .click();
    await ready(p);
    await closeDocuments(p);

    async function newBoard() {
      await p.goto(base);
      await p
        .getByRole("button", { name: "빈 손그림 보드", exact: true })
        .click();
      await ready(p);
      await closeDocuments(p);
    }
    async function importedDoc(doc, filename) {
      const file = path.resolve(output, filename + ".json");
      fs.writeFileSync(file, exportDocumentJson(doc));
      await importFile(p, file);
      await closeDocuments(p);
      await p
        .getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true })
        .click();
      await p.waitForTimeout(350);
      return file;
    }
    // A genuine editable side-by-side study, using identical source trajectories.
    let d = await options(p, "예제");
    await d
      .getByRole("button", {
        name: "새 문서로 가지 필치 비교 열기",
        exact: true,
      })
      .click();
    await ready(p);
    await closeDocuments(p);
    await p
      .getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true })
      .click();
    await p.waitForTimeout(350);
    let doc = await stored(p);
    assert.equal(doc.ink.version, 3);
    const comparePng = await exportFile(
      p,
      "png",
      path.join(artifacts, "MindBranch_Branches_Before_After.png"),
    );
    const pix = await pixels(p, comparePng);
    assert.ok(pix.colorful > 25000);
    report.checks.push({ comparisonPixels: pix });
    await p.screenshot({ path: path.join(output, "comparison-desktop.png") });
    const svg = await exportFile(p, "svg", path.join(output, "comparison.svg"));
    const check = await svgCheck(p, svg, doc);
    assert.ok(check.inside && !check.preview);
    assert.deepEqual(check.actual, doc.ink.order);
    assert.ok(check.elementCount < 6000);
    const visual = await p.evaluate((text) => {
      const xml = new DOMParser().parseFromString(text, "image/svg+xml");
      const exported = [
        ...xml.querySelectorAll('[data-branch-style="hand-v1"]'),
      ];
      return {
        styles: exported.length,
        allMatch: exported.every((el) => {
          const live = document.querySelector(
            '[data-ink-stroke="' + el.getAttribute("data-ink-stroke") + '"]',
          );
          return (
            live &&
            [...el.querySelectorAll("path")].every(
              (a, i) =>
                a.getAttribute("d") ===
                live.querySelectorAll("path")[i].getAttribute("d"),
            )
          );
        }),
        filters: exported.some((el) => !!el.querySelector("filter")),
        pathsPerStroke: Math.max(
          ...exported.map((el) => el.querySelectorAll("path").length),
        ),
      };
    }, svg.toString());
    assert.ok(
      visual.styles === 18 &&
        visual.allMatch &&
        !visual.filters &&
        visual.pathsPerStroke <= 3,
    );
    report.checks.push({
      svgAlignment: { ...check, actual: check.actual.length },
      styleGeometry: visual,
    });
    const file = path.resolve(output, "comparison-download.json");
    const raw = await exportFile(p, "json", file);
    assert.equal(JSON.parse(raw).version, 5);
    await p.reload();
    await ready(p);
    assert.deepEqual((await stored(p)).ink, doc.ink);
    const fresh = await browser.newContext({
      viewport: { width: 1250, height: 850 },
      acceptDownloads: true,
    });
    await fresh.addInitScript(() =>
      localStorage.setItem("mindforge-onboarded-v1", "1"),
    );
    const q = await fresh.newPage();
    q.on("pageerror", (e) => report.errors.push(e.message));
    await q.goto(base);
    await q
      .getByRole("button", { name: "빈 손그림 보드", exact: true })
      .click();
    await ready(q);
    await importFile(q, file);
    assert.deepEqual((await stored(q)).ink, doc.ink);
    assert.deepEqual(
      await exportFile(q, "png", path.join(output, "comparison-fresh.png")),
      comparePng,
    );
    await fresh.close();
    report.checks.push(
      "Real v5 JSON download → fresh Chromium context import → byte-identical PNG; autosave/reload keeps all seeds/styles/transforms/order.",
    );
    for (const kind of ["before", "after"]) {
      await importedDoc(branchStudyDocument(kind), kind);
      await exportFile(
        p,
        "png",
        path.join(artifacts, "MindBranch_Branches_" + kind + ".png"),
      );
    }
    // Inspect real pixels around a coloured branch root/junction at enlarged scale.
    await p.waitForTimeout(700);
    const beforeZoom = await camera(p);
    for (let i = 0; i < 4; i++) {
      await p.getByRole("button", { name: "확대", exact: true }).click();
      await p.waitForTimeout(220);
    }
    const afterZoom = await camera(p);
    assert.ok(afterZoom.zoom > beforeZoom.zoom * 1.5);
    await p.screenshot({ path: path.join(output, "branch-closeup.png") });
    if (process.env.BRANCH_PHASE === "visual") return;
    // New freehand branch profile is optional. Classic brush and existing paths remain available.
    await newBoard();
    d = await options(p, "도구");
    await d.getByRole("button", { name: "브러시 도구", exact: true }).click();
    await d.getByRole("button", { name: "손그림 가지", exact: true }).click();
    await d.getByRole("slider", { name: "펜 굵기", exact: true }).fill("32");
    await done(d);
    let area = await p.locator("[data-ink-input]").boundingBox();
    await draw(
      p,
      Array.from({ length: 51 }, (_, i) => ({
        x: area.x + 170 + i * 7,
        y: area.y + 180 + Math.sin(i / 12) * 35,
      })),
    );
    doc = await stored(p);
    let s = doc.ink.strokes[0];
    assert.equal(s.branchStyle, "hand-v1");
    assert.ok(s.points.length > 40 && s.points.every((p) => p.pressure === 1));
    assert.ok(branchGeometry(s).radii[0] > branchGeometry(s).radii.at(-1) * 8);
    assert.equal(
      await p.locator('[data-branch-style="hand-v1"] path').count(),
      3,
    );
    const saved = s.points;
    await p.getByRole("button", { name: "확대", exact: true }).click();
    await p.waitForTimeout(350);
    await p.getByRole("button", { name: "이동 모드", exact: true }).click();
    await draw(p, [
      { x: 750, y: 300 },
      { x: 800, y: 340 },
    ]);
    await p.getByRole("button", { name: "선택 모드", exact: true }).click();
    let pos = await screen(p, renderPoints(s)[30]);
    await p.mouse.click(pos.x, pos.y);
    await draw(p, [pos, { x: pos.x + 35, y: pos.y + 20 }]);
    let moved = (await stored(p)).ink.strokes[0];
    assert.deepEqual(moved.points, saved);
    assert.equal(moved.seed, s.seed);
    assert.ok(moved.transform.x > 0);
    await p
      .getByRole("button", { name: "선택 항목 오른쪽 회전", exact: true })
      .click();
    await p
      .getByRole("button", { name: "선택 항목 크게", exact: true })
      .click();
    await p
      .getByRole("button", { name: "손그림 실행 취소", exact: true })
      .click();
    await p
      .getByRole("button", { name: "손그림 실행 취소", exact: true })
      .click();
    await p
      .getByRole("button", { name: "손그림 실행 취소", exact: true })
      .click();
    assert.deepEqual((await stored(p)).ink.strokes[0], s);
    await p
      .getByRole("button", { name: "손그림 다시 실행", exact: true })
      .click();
    await p
      .getByRole("button", { name: "손그림 실행 취소", exact: true })
      .click();
    await p.getByRole("button", { name: "지우개 모드", exact: true }).click();
    pos = await screen(p, renderPoints(s)[30]);
    await p.mouse.click(pos.x, pos.y);
    assert.equal((await stored(p)).ink.strokes.length, 0);
    await p
      .getByRole("button", { name: "손그림 실행 취소", exact: true })
      .click();
    assert.deepEqual((await stored(p)).ink.strokes[0], s);
    d = await options(p, "도구");
    await d.getByRole("button", { name: "기본 붓터치", exact: true }).click();
    await done(d);
    await p.getByRole("button", { name: "그리기 모드", exact: true }).click();
    await draw(p, [
      { x: 750, y: 440 },
      { x: 800, y: 470 },
      { x: 860, y: 450 },
    ]);
    assert.equal((await stored(p)).ink.strokes.at(-1).branchStyle, "classic");
    report.checks.push(
      "Real mouse fallback, pan/zoom world coordinates, selection move/scale/rotate, ink-only eraser and undo/redo; classic brush preserved.",
    );
    // CDP pen pressure is simulated. Touch is also emulated, not a physical Fold/S Pen.
    d = await options(p, "도구");
    await d.getByRole("button", { name: "손그림 가지", exact: true }).click();
    await done(d);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 700,
      y: 200,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      force: 0.2,
    });
    for (let i = 1; i <= 30; i++)
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: 700 + i * 7,
        y: 200 + Math.sin(i / 5) * 20,
        button: "left",
        buttons: 1,
        pointerType: "pen",
        force: 0.2 + i * 0.02,
      });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 910,
      y: 200,
      button: "left",
      buttons: 0,
      pointerType: "pen",
      force: 0,
    });
    let pen = (await stored(p)).ink.strokes.at(-1);
    assert.equal(pen.branchStyle, "hand-v1");
    assert.ok(new Set(pen.points.map((p) => p.pressure)).size > 10);
    report.checks.push(
      "CDP pen pressure variation stored; centreline has no seeded offsets. Physical S Pen/palm rejection unverified.",
    );
    await p.reload();
    await ready(p);
    assert.equal((await stored(p)).ink.strokes.at(-1).seed, pen.seed);
    for (const size of [
      { width: 320, height: 720 },
      { width: 344, height: 882 },
      { width: 674, height: 842 },
      { width: 768, height: 900 },
    ]) {
      await p.setViewportSize(size);
      await ready(p);
      await closeDocuments(p);
      await p.getByRole("button", { name: "그리기 모드", exact: true }).click();
      d = await options(p, "도구");
      await d.getByRole("button", { name: "손그림 가지", exact: true }).click();
      assert.ok(
        await d
          .getByRole("slider", { name: "가지 손맛", exact: true })
          .isVisible(),
      );
      await p.screenshot({
        path: path.join(output, "options-" + size.width + ".png"),
      });
      await done(d);
      const touch = (type, x, y) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, force: 1 }],
        });
      const before = (await stored(p)).ink.strokes.length;
      await touch("touchStart", 65, 190);
      for (let i = 1; i <= 20; i++)
        await touch("touchMove", 65 + i * 7, 190 + Math.sin(i / 5) * 22);
      await touch("touchEnd");
      let touchDoc = await stored(p);
      assert.equal(touchDoc.ink.strokes.length, before + 1);
      assert.ok(
        touchDoc.ink.strokes.at(-1).points.every((p) => p.pressure === 1),
      );
      await p.getByRole("button", { name: "이동 모드", exact: true }).click();
      await touch("touchStart", 75, 280);
      await touch("touchMove", 110, 310);
      await touch("touchEnd");
      assert.equal((await stored(p)).ink.strokes.length, before + 1);
      const c0 = await camera(p);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: 90, y: 210, id: 1 },
          { x: 210, y: 210, id: 2 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 70, y: 230, id: 1 },
          { x: 240, y: 230, id: 2 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert.ok((await camera(p)).zoom > c0.zoom);
      assert.equal((await stored(p)).ink.strokes.length, before + 1);
      await p
        .getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true })
        .click();
      await p.waitForTimeout(350);
      await p.screenshot({
        path: path.join(output, "board-" + size.width + ".png"),
      });
      report.checks.push({
        touchEmulation: size,
        draw: true,
        panWithoutInk: true,
        pinch: true,
      });
    }
    await p.setViewportSize({ width: 1440, height: 1000 });
    await newBoard();
    const large = branchStudyDocument("after"),
      template = large.ink.strokes.find((s) => s.branchStyle === "hand-v1");
    large.ink.strokes = Array.from({ length: 500 }, (_, i) => ({
      ...template,
      id: "large-branch-" + i,
      seed: i,
      points: Array.from({ length: 200 }, (_, j) => ({
        x: (i % 25) * 24 + j * 2,
        y: Math.floor(i / 25) * 24 + Math.sin(j / 25) * 16,
        pressure: 1,
      })),
    }));
    large.ink.objects = [];
    large.ink.order = large.ink.strokes.map((s) => s.id);
    const lf = path.resolve(output, "large.json");
    fs.writeFileSync(lf, exportDocumentJson(large));
    const start = Date.now();
    await importFile(p, lf);
    // Accumulated test documents exceed Chromium's local quota. The live
    // imported artwork remains available and the existing rescue warning appears.
    await p
      .getByText(
        "저장 공간이 가득 찼습니다. 내보내기로 백업하고 오래된 스냅샷/문서를 정리하세요.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await p.locator("[data-ink-stroke]").count(), 500);
    const rescue = await exportFile(
      p,
      "json",
      path.join(output, "quota-rescue.json"),
    );
    assert.equal(JSON.parse(rescue).document.ink.strokes.length, 500);
    report.checks.push(
      "Accumulated test documents hit local quota: rescue warning is visible and all 500 live strokes remain exportable.",
    );
    const perfContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    await perfContext.addInitScript(() =>
      localStorage.setItem("mindforge-onboarded-v1", "1"),
    );
    p = await perfContext.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    await newBoard();
    const freshStart = Date.now();
    await importFile(p, lf);
    const loaded = await stored(p);
    assert.equal(loaded.ink.strokes.length, 500);
    const importMs = Date.now() - freshStart,
      elements = await p.locator("[data-ink-stroke] *").count();
    assert.ok(elements <= 4000);
    const panStart = Date.now();
    await p.getByRole("button", { name: "이동 모드", exact: true }).click();
    await draw(p, [
      { x: 650, y: 600 },
      { x: 750, y: 550 },
    ]);
    const panMs = Date.now() - panStart;
    await p.reload();
    await ready(p);
    assert.equal((await stored(p)).ink.strokes.length, 500);
    report.performance = {
      samples: 100000,
      strokes: 500,
      svgElements: elements,
      jsonBytes: fs.statSync(lf).size,
      importAndSaveMs: importMs,
      twoEventPanMs: panMs,
    };
    assert.deepEqual(report.errors, []);
  } finally {
    fs.writeFileSync(
      process.env.BRANCH_PHASE === "visual"
        ? "verification/branch/visual.json"
        : "verification/branch-browser.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    await browser?.close();
    if (server) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill();
      }
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
