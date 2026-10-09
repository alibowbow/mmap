/* Production Chromium UI verification; mouse input and mobile viewport emulation. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { studioDocument } = require("../../src/lib/studioExamples.ts");
const { exportDocumentJson } = require("../../src/lib/export.ts");
const { renderPoints, itemCenter, transformPoint } = require("../../src/lib/ink.ts");

const base = process.env.ANALOG_BASE || "http://localhost:3005";
const output = path.resolve(process.env.ANALOG_ARTIFACTS || "verification/editing");
const key = "mindforge-workspace-v1";
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], errors: [], physicalDevices: "Not tested. Mouse pointer input and 375 px Chromium viewport emulation only." };
const point = (x, y) => ({ x, y, pressure: 1 });
function fixture() {
  const doc = studioDocument("swatches");
  const stroke = (id, ps, extra = {}) => ({ id, color: "#246d56", width: 28, brush: "branch", branchStyle: "hand-v1", seed: 22, taper: 0.7, texture: 0.45, curve: 0.15, points: ps, ...extra });
  const strokes = [
    stroke("parent-branch", [point(-260, -130), point(160, -130)]),
    stroke("curve-target", [point(-200, 0), point(180, 0)], { curve: 0.3, width: 20 }),
    stroke("erase-target", Array.from({ length: 41 }, (_, i) => point(-240 + i * 11.5, 100)), { brush: "brush", color: "#dc2626", width: 32, taper: 0.3 }),
    stroke("group-stroke", [point(-250, 260), point(-120, 260)], { brush: "pen", branchStyle: undefined, width: 5, color: "#2563eb" }),
  ];
  const objects = [
    { id: "group-label", kind: "label", text: "묶음", x: -210, y: 212, width: 60, height: 42, fontSize: 28, color: "#26374a", fill: false },
    { id: "group-stamp", kind: "stamp", shape: "leaf", x: -80, y: 225, width: 45, height: 50, fontSize: 28, color: "#246d56", fill: false },
  ];
  return { ...doc, id: "analog-editing-fixture", title: "손그림 편집 검증", ink: { version: 3, strokes, objects, order: [...strokes, ...objects].map((s) => s.id), paper: { kind: "white", texture: 0, seed: 1977 } }, inkSettings: { ...doc.inkSettings, brush: "branch", width: 28, branchStyle: "hand-v1", connectBranches: false, eraserMode: "stroke", labelOnBranch: false } };
}
async function ready(p) {
  await p.locator("[data-mindmap-canvas]").waitFor();
  await p.waitForFunction(() => document.querySelector("[data-mindmap-canvas]").getAttribute("aria-busy") === "false");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
}
async function stored(p) {
  await p.waitForTimeout(850);
  return p.evaluate((k) => {
    const workspace = JSON.parse(localStorage.getItem(k));
    return workspace.documents.find((doc) => doc.id === workspace.activeDocumentId);
  }, key);
}
async function closeDocuments(p) {
  const close = p.getByRole("button", { name: "문서 패널 닫기", exact: true });
  if (await close.count()) await close.click();
  const mobile = p.getByRole("dialog", { name: "문서 목록", exact: true });
  if (await mobile.count()) await mobile.getByRole("button", { name: "닫기", exact: true }).click();
}
async function command(p, name) {
  await p.keyboard.press("Escape");
  await p.keyboard.press("Control+k");
  const dialog = p.getByRole("dialog", { name: "명령 팔레트", exact: true });
  await dialog.getByPlaceholder("명령 검색…").fill(name);
  await dialog.getByRole("button").filter({ has: p.getByText(name, { exact: true }) }).click();
}
async function options(p, tab) {
  await p.getByRole("button", { name: "그리기 도구", exact: true }).click();
  const dialog = p.getByRole("dialog", { name: "그리기 도구", exact: true });
  if (tab) await dialog.getByRole("tab", { name: tab, exact: true }).click();
  return dialog;
}
async function done(dialog) {
  await dialog.getByRole("button", { name: "완료", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}
async function importFile(p, file) {
  if (p.viewportSize().width < 768) {
    await p.getByRole("button", { name: "노드 모드", exact: true }).click();
    await p.getByRole("button", { name: "더보기", exact: true }).click();
    await p.getByRole("dialog", { name: "더 많은 도구", exact: true }).getByRole("button", { name: "JSON 열기", exact: true }).click();
  } else await command(p, "JSON 가져오기");
  const dialog = p.getByRole("dialog", { name: "가져오기", exact: true });
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await dialog.getByRole("button", { name: "가져오기", exact: true }).click();
  await ready(p);
  await closeDocuments(p);
}
async function exportFile(p, format, file) {
  await command(p, "내보내기");
  const dialog = p.getByRole("dialog", { name: "내보내기", exact: true });
  await dialog.getByRole("button", { name: format.toUpperCase(), exact: true }).click();
  const button = dialog.getByRole("button", { name: "다운로드", exact: true });
  await p.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.trim() === "다운로드" && !b.disabled), null, { timeout: 60000 });
  const wait = p.waitForEvent("download", { timeout: 60000 });
  await button.click();
  const download = await wait;
  assert.equal(await download.failure(), null);
  await download.saveAs(file);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  return fs.readFileSync(file);
}
async function camera(p) {
  return p.locator(".react-flow__viewport").evaluate((el) => {
    const m = new DOMMatrix(el.style.transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}
async function screen(p, world) {
  const v = await camera(p), bounds = await p.locator("[data-ink-input]").boundingBox();
  return { x: bounds.x + v.x + world.x * v.zoom, y: bounds.y + v.y + world.y * v.zoom };
}
async function draw(p, points) {
  await p.mouse.move(points[0].x, points[0].y);
  await p.mouse.down();
  for (const point of points.slice(1)) await p.mouse.move(point.x, point.y, { steps: 4 });
  await p.mouse.up();
}
async function drawWorld(p, points) { await draw(p, await Promise.all(points.map((point) => screen(p, point)))); }
async function undo(p) { await p.getByRole("button", { name: "손그림 실행 취소", exact: true }).click(); }
async function redo(p) { await p.getByRole("button", { name: "손그림 다시 실행", exact: true }).click(); }
function inkItem(doc, id) { return [...doc.ink.strokes, ...(doc.ink.objects || [])].find((s) => s.id === id); }
function worldCenter(item) {
  const center = itemCenter(item);
  return item.transform ? transformPoint(center, item.transform, center) : center;
}
function centerPairs(doc, ids) {
  const centers = ids.map((id) => worldCenter(inkItem(doc, id)));
  return centers.flatMap((a, i) => centers.slice(i + 1).map((b) => ({
    distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x),
  })));
}
async function fit(p) {
  await p.getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true }).click();
  await p.waitForTimeout(500);
}
async function exportMap(p, svg) {
  return p.evaluate((text) => {
    const xml = new DOMParser().parseFromString(text, "image/svg+xml");
    const assertNoParse = xml.querySelector("parsererror");
    if (assertNoParse) throw Error(assertNoParse.textContent);
    const viewport = xml.querySelector(".react-flow__viewport"), m = new DOMMatrix(viewport.style.transform);
    return { x: m.e, y: m.f, zoom: m.a, width: +xml.documentElement.getAttribute("width"), height: +xml.documentElement.getAttribute("height"), masks: xml.querySelectorAll("mask").length, preview: !!xml.querySelector("[data-ink-preview],[data-studio-selection],[data-ink-lasso],[data-curve-handle]") };
  }, svg.toString());
}
async function samplePng(p, png, mapping, locations) {
  return p.evaluate(async ({ src, mapping, locations }) => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const ratio = image.width / mapping.width;
    const samples = locations.map((location) => {
      const x = Math.round((mapping.x + location.x * mapping.zoom) * ratio);
      const y = Math.round((mapping.y + location.y * mapping.zoom) * ratio);
      const pixels = ctx.getImageData(x - 2, y - 2, 5, 5).data;
      const average = [0, 0, 0, 0];
      for (let i = 0; i < pixels.length; i++) average[i % 4] += pixels[i] / 25;
      return average.map(Math.round);
    });
    return { width: image.width, height: image.height, samples };
  }, { src: "data:image/png;base64," + png.toString("base64"), mapping, locations });
}
const isRed = (rgba) => rgba[0] > rgba[1] + 60 && rgba[0] > rgba[2] + 60;
async function openBlank(p) {
  await p.goto(base);
  await p.getByRole("button", { name: "손그림", exact: true }).click();
  await ready(p); await closeDocuments(p);
}
async function context(browser, viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem("mindforge-onboarded-v1", "1"));
  const p = await ctx.newPage();
  p.on("pageerror", (error) => report.errors.push(error.message));
  await openBlank(p);
  return { ctx, p };
}
async function main() {
  let browser, server;
  try {
    if (!process.env.ANALOG_BASE) {
      server = spawn("npm", ["run", "start", "--", "--port", "3005"], {
        detached: true, stdio: ["ignore", "pipe", "pipe"],
      });
      let logs = "", started = false;
      server.stdout.on("data", (chunk) => { logs = (logs + chunk).slice(-4000); });
      server.stderr.on("data", (chunk) => { logs = (logs + chunk).slice(-4000); });
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base)).ok) { started = true; break; } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      assert.ok(started, "Production server did not start: " + logs);
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
    report.browser = browser.version();
    const { ctx, p } = await context(browser, { width: 1440, height: 1000 });
    const fixturePath = path.join(output, "fixture.json");
    fs.writeFileSync(fixturePath, exportDocumentJson(fixture()));
    await importFile(p, fixturePath);
    await p.getByRole("button", { name: "그리기 모드", exact: true }).click();
    await fit(p);

    // All setting changes use visible UI controls; imported original samples form a stable baseline.
    let dialog = await options(p, "도구");
    const joining = dialog.getByRole("checkbox", { name: "가지 연결 보조", exact: true });
    assert.ok(!(await joining.isChecked()), "junction assistance is opt-in");
    await dialog.getByRole("button", { name: "재료 필치", exact: true }).click();
    await joining.check();
    await done(dialog);
    const parent = inkItem(await stored(p), "parent-branch"), anchor = renderPoints(parent)[22];
    await drawWorld(p, [{ x: anchor.x + 7, y: anchor.y + 5 }, { x: anchor.x + 65, y: anchor.y - 90 }]);
    let doc = await stored(p), child = doc.ink.strokes.at(-1);
    assert.equal(child.materialStyle, "grain-v1");
    assert.equal(child.branchStyle, "hand-v1");
    assert.ok(Math.hypot(child.points[0].x - anchor.x, child.points[0].y - anchor.y) < 15, "child begins on nearby parent");
    assert.ok(Math.hypot(child.points[0].x - anchor.x - 7, child.points[0].y - anchor.y - 5) > 1, "assistance actually snaps the start");
    report.checks.push("Visible tool settings: opt-in junction assistance and grain-v1 material; real drawing snaps a child onto the parent.");

    // Labels can sit above the nearest branch while remaining ordinary editable objects.
    dialog = await options(p, "그림/글씨");
    await dialog.getByRole("textbox", { name: "핵심어 라벨", exact: true }).fill("연결 생각");
    await dialog.getByRole("checkbox", { name: "가까운 가지 위에 글씨 놓기", exact: true }).check();
    await dialog.getByRole("button", { name: "이 글씨를 화면에 놓기", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const labelClick = { x: anchor.x + 130, y: anchor.y + 20 };
    const labelScreen = await screen(p, labelClick); await p.mouse.click(labelScreen.x, labelScreen.y);
    doc = await stored(p); const label = doc.ink.objects.at(-1);
    assert.equal(label.text, "연결 생각");
    assert.ok(Math.abs(label.transform.rotation) <= 25);
    assert.ok(label.y < labelClick.y - 10, "label is placed above branch");
    report.checks.push("A Korean label uses branch placement with a readable capped rotation.");

    // Select a real branch, drag its middle handle, then verify atomic undo/redo.
    await p.getByRole("button", { name: "선택 모드", exact: true }).click();
    const curveBefore = inkItem(doc, "curve-target"), curveMiddle = renderPoints(curveBefore)[32];
    const curveAt = await screen(p, curveMiddle); await p.mouse.click(curveAt.x, curveAt.y);
    await p.getByRole("button", { name: "곡선 다듬기", exact: true }).click();
    const handle = p.locator('[data-curve-handle="middle"]'); await handle.waitFor();
    const handlePoint = await handle.evaluate((el) => ({ x: +el.getAttribute("cx"), y: +el.getAttribute("cy") }));
    await drawWorld(p, [handlePoint, { x: handlePoint.x, y: handlePoint.y + 30 }]);
    const curved = inkItem(await stored(p), "curve-target");
    assert.ok(Math.abs(curved.curve - curveBefore.curve) > 0.1);
    assert.deepEqual(curved.points, curveBefore.points);
    assert.equal(curved.seed, curveBefore.seed);
    await undo(p); assert.deepEqual(inkItem(await stored(p), "curve-target"), curveBefore);
    await redo(p); assert.deepEqual(inkItem(await stored(p), "curve-target"), curved);
    await p.getByRole("button", { name: "곡선 다듬기 완료", exact: true }).click();
    report.checks.push("Actual curve middle-handle drag changes bend while preserving stored endpoints and seed; one undo/redo restores both states.");

    const beforeErase = await stored(p);
    const beforeSvg = await exportFile(p, "svg", path.join(output, "before-erase.svg"));
    const beforePng = await exportFile(p, "png", path.join(output, "before-erase.png"));
    const locations = [{ x: 0, y: 100 }, { x: -150, y: 100 }];
    const originalPixels = await samplePng(p, beforePng, await exportMap(p, beforeSvg), locations);
    assert.ok(originalPixels.samples.every(isRed), JSON.stringify(originalPixels));

    // Partial erase creates an SVG mask; cancellation and undo preserve committed samples.
    await p.getByRole("button", { name: "지우개 모드", exact: true }).click();
    await p.getByRole("button", { name: "부분 지우기", exact: true }).click();
    const cancelStart = await screen(p, { x: -150, y: 100 });
    await p.mouse.move(cancelStart.x, cancelStart.y); await p.mouse.down();
    await p.mouse.move(cancelStart.x + 20, cancelStart.y);
    await p.keyboard.press("Escape"); await p.mouse.up();
    assert.deepEqual((await stored(p)).ink, beforeErase.ink, "canceling an in-progress eraser changes no committed ink");
    await drawWorld(p, [{ x: 0, y: 88 }, { x: 0, y: 112 }]);
    const erasedDoc = await stored(p), erased = inkItem(erasedDoc, "erase-target");
    assert.equal(erased.erasures.length, 1);
    assert.deepEqual(erased.points, inkItem(beforeErase, "erase-target").points);
    assert.equal(erased.seed, inkItem(beforeErase, "erase-target").seed);
    assert.equal(erasedDoc.ink.strokes.length, beforeErase.ink.strokes.length);
    assert.equal(erasedDoc.ink.objects.length, beforeErase.ink.objects.length);
    await undo(p); assert.deepEqual((await stored(p)).ink, beforeErase.ink);
    await redo(p); assert.deepEqual((await stored(p)).ink, erasedDoc.ink);
    await p.getByRole("button", { name: "선택 모드", exact: true }).click();
    const erasedAt = await screen(p, locations[0]); await p.mouse.click(erasedAt.x, erasedAt.y);
    assert.equal(await p.locator("[data-selected-ink]").count(), 0, "a click wholly in the erased gap selects no stroke");
    const visibleAt = await screen(p, locations[1]); await p.mouse.click(visibleAt.x, visibleAt.y);
    const disabledCurve = p.getByRole("button", { name: "곡선 다듬기", exact: true });
    assert.ok(await disabledCurve.isDisabled());
    assert.match(await disabledCurve.getAttribute("title"), /부분 지운 획/);
    const afterSvg = await exportFile(p, "svg", path.join(output, "after-erase.svg"));
    const mapping = await exportMap(p, afterSvg);
    assert.ok(mapping.masks >= 1 && !mapping.preview);
    const afterPng = await exportFile(p, "png", path.join(output, "after-erase.png"));
    const erasedPixels = await samplePng(p, afterPng, mapping, locations);
    assert.ok(!isRed(erasedPixels.samples[0]) && erasedPixels.samples[0].slice(0, 3).every((v) => v > 235), JSON.stringify(erasedPixels));
    assert.ok(isRed(erasedPixels.samples[1]), "surviving section remains colored in PNG");
    report.checks.push({ partialErase: "cancel + committed mask + atomic undo/redo + erased hit rejection + disabled curve explanation", before: originalPixels, after: erasedPixels, exportMaskCount: mapping.masks });

    // Lasso encloses a stroke, label and stamp, then one drag moves the group.
    await p.getByRole("button", { name: "올가미 모드", exact: true }).click();
    await drawWorld(p, [{ x: -285, y: 175 }, { x: -35, y: 175 }, { x: -35, y: 295 }, { x: -285, y: 295 }, { x: -285, y: 175 }]);
    assert.deepEqual(await p.locator("[data-selected-ink]").evaluateAll((els) => els.map((el) => el.getAttribute("data-selected-ink")).sort()), ["group-label", "group-stamp", "group-stroke"]);
    const beforeMove = await stored(p);
    await drawWorld(p, [{ x: -190, y: 260 }, { x: -160, y: 280 }]);
    const movedDoc = await stored(p);
    for (const id of ["group-label", "group-stamp", "group-stroke"]) {
      assert.ok(Math.abs(inkItem(movedDoc, id).transform.x - 30) < 0.1);
      assert.ok(Math.abs(inkItem(movedDoc, id).transform.y - 20) < 0.1);
    }
    assert.deepEqual(inkItem(movedDoc, "erase-target"), inkItem(beforeMove, "erase-target"));
    await undo(p); assert.deepEqual((await stored(p)).ink, beforeMove.ink);
    await redo(p); assert.deepEqual((await stored(p)).ink, movedDoc.ink);
    const groupIds = ["group-label", "group-stamp", "group-stroke"];
    const originalPairs = centerPairs(movedDoc, groupIds);
    await p.getByRole("button", { name: "선택 항목 크게", exact: true }).click();
    const enlarged = await stored(p), largerPairs = centerPairs(enlarged, groupIds);
    groupIds.forEach((id) => {
      assert.ok(Math.abs(inkItem(enlarged, id).transform.scale - inkItem(movedDoc, id).transform.scale * 1.15) < 1e-7);
    });
    largerPairs.forEach((pair, i) => assert.ok(Math.abs(pair.distance / originalPairs[i].distance - 1.15) < 1e-7, "all group-center distances grow by the same factor"));
    await undo(p); assert.deepEqual((await stored(p)).ink, movedDoc.ink);
    await p.getByRole("button", { name: "선택 항목 오른쪽 회전", exact: true }).click();
    const rotated = await stored(p), rotatedPairs = centerPairs(rotated, groupIds);
    groupIds.forEach((id) => {
      assert.ok(Math.abs(inkItem(rotated, id).transform.rotation - (inkItem(movedDoc, id).transform.rotation + 15)) < 1e-7);
    });
    rotatedPairs.forEach((pair, i) => {
      assert.ok(Math.abs(pair.distance - originalPairs[i].distance) < 1e-7, "group rotation keeps all center distances");
      const delta = pair.angle - originalPairs[i].angle;
      assert.ok(Math.abs(Math.sin(delta) - Math.sin(Math.PI / 12)) < 1e-7 && Math.abs(Math.cos(delta) - Math.cos(Math.PI / 12)) < 1e-7, "group center vectors turn 15 degrees");
    });
    await undo(p); assert.deepEqual((await stored(p)).ink, movedDoc.ink);
    await p.screenshot({ path: path.join(output, "editing-desktop.png") });
    report.checks.push("Real closed lasso selects a stroke, Korean label and stamp; group drag translates all three together with one undo/redo.");
    report.checks.push("Three-item group scaling grows all world-center distances by 1.15; rotation preserves distances and turns every pair by 15°; each single undo restores the group.");

    // Whole-item eraser remains available and undoable for objects.
    await p.getByRole("button", { name: "지우개 모드", exact: true }).click();
    await p.getByRole("button", { name: "획 지우기", exact: true }).click();
    await drawWorld(p, [{ x: -50, y: 245 }]);
    assert.ok(!inkItem(await stored(p), "group-stamp"));
    await undo(p); assert.deepEqual((await stored(p)).ink, movedDoc.ink);
    report.checks.push("Whole-item eraser removes a stamp and undo restores it independently of partial stroke masks.");

    // Download the real export and import it into a fresh browser context.
    const finalDoc = await stored(p);
    const jsonPath = path.join(output, "analog-editing-roundtrip.json");
    const exported = JSON.parse(await exportFile(p, "json", jsonPath));
    assert.equal(exported.version, 6);
    const finalPng = await exportFile(p, "png", path.join(output, "analog-editing-final.png"));
    await p.reload(); await ready(p);
    assert.deepEqual((await stored(p)).ink, finalDoc.ink);
    const fresh = await context(browser, { width: 1200, height: 900 });
    await importFile(fresh.p, jsonPath);
    const restored = await stored(fresh.p);
    assert.deepEqual(restored.ink, finalDoc.ink);
    assert.deepEqual(restored.inkSettings, finalDoc.inkSettings);
    const freshPng = await exportFile(fresh.p, "png", path.join(output, "analog-editing-fresh.png"));
    assert.deepEqual(freshPng, finalPng, "fresh JSON import yields byte-identical PNG with masks and transforms");
    await fresh.ctx.close();
    report.checks.push("Real v6 JSON download → autosave/reload → fresh-context import preserves masks, transforms and settings; PNG is byte-identical.");

    const mobile = await context(browser, { width: 375, height: 812 });
    await importFile(mobile.p, jsonPath);
    await mobile.p.getByRole("button", { name: "올가미 모드", exact: true }).click();
    const mobileLayout = await mobile.p.evaluate(() => {
      const rect = document.querySelector("[data-ink-toolbar]").getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, left: rect.left, right: rect.right };
    });
    assert.ok(mobileLayout.scrollWidth <= 375 && mobileLayout.left >= 0 && mobileLayout.right <= 375, JSON.stringify(mobileLayout));
    await mobile.p.screenshot({ path: path.join(output, "editing-mobile-375.png") });
    dialog = await options(mobile.p, "도구");
    await dialog.getByRole("button", { name: "브러시 도구", exact: true }).click();
    const mobileDialog = await dialog.boundingBox();
    assert.ok(mobileDialog.x >= 0 && mobileDialog.x + mobileDialog.width <= 375);
    await mobile.p.screenshot({ path: path.join(output, "editing-tools-mobile-375.png") });
    await done(dialog); await mobile.ctx.close();
    report.checks.push({ mobileViewport: "375 × 812", layout: mobileLayout, dialog: mobileDialog });
    assert.deepEqual(report.errors, []);
    await ctx.close();
    report.passed = true;
  } catch (error) {
    report.passed = false; report.failure = error.stack; process.exitCode = 1;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch((error) => console.error(error));
