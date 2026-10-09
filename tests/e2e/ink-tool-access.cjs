/* Production UI regression: quick tool access, translucent marker readability,
   and 320/375 px layouts. These are Chromium viewport tests, not physical pens. */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { studioDocument } = require("../../src/lib/studioExamples.ts");
const { exportDocumentJson } = require("../../src/lib/export.ts");
const base = process.env.INK_TOOL_BASE || "http://localhost:3007";
const output = path.resolve(
  process.env.INK_TOOL_ARTIFACTS || "verification/ink-tool-access",
);
const key = "mindforge-workspace-v1";
const tools = [
  "색연필 도구",
  "펜 도구",
  "마커 도구",
  "형광펜 도구",
  "브러시 도구",
  "유기적 가지 도구",
];
fs.mkdirSync(output, { recursive: true });
const report = {
  checks: [],
  errors: [],
  physicalDevices: "Not tested; mouse input and mobile viewport emulation.",
};
function fixture() {
  const doc = studioDocument("swatches");
  return {
    ...doc,
    id: "ink-tool-readability",
    title: "마커와 글씨 검증",
    ink: {
      version: 4,
      // A transparent bounds guard keeps exported pixel coordinates stable
      // before and after painting. The label is actually below the new marker.
      strokes: [
        {
          id: "bounds-guard",
          brush: "pen",
          width: 1,
          color: "#fffefb",
          opacity: 0,
          points: [
            { x: -200, y: -80, pressure: 1 },
            { x: 200, y: 80, pressure: 1 },
          ],
        },
      ],
      objects: [
        {
          id: "under-marker",
          kind: "label",
          text: "글씨를 읽어 보세요",
          x: 0,
          y: 0,
          width: 300,
          height: 72,
          fontSize: 42,
          color: "#111111",
          fill: false,
        },
      ],
      order: ["bounds-guard", "under-marker"],
      paper: { kind: "white", texture: 0, seed: 1977 },
    },
    inkSettings: {
      color: "#26374a",
      width: 4,
      brush: "pen",
      opacity: 1,
      materialStyle: "classic",
      texture: 0.6,
      taper: 0.8,
    },
  };
}
async function ready(p) {
  await p.locator("[data-mindmap-canvas]").waitFor();
  await p.waitForFunction(
    () =>
      document
        .querySelector("[data-mindmap-canvas]")
        .getAttribute("aria-busy") === "false",
  );
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
}
async function closeDocuments(p) {
  const desktop = p.getByRole("button", {
    name: "문서 패널 닫기",
    exact: true,
  });
  if (await desktop.count()) await desktop.click();
  const mobile = p.getByRole("dialog", { name: "문서 목록", exact: true });
  if (await mobile.count())
    await mobile.getByRole("button", { name: "닫기", exact: true }).click();
}
async function stored(p) {
  await p.waitForTimeout(850);
  return p.evaluate((k) => {
    const w = JSON.parse(localStorage.getItem(k));
    return w.documents.find((d) => d.id === w.activeDocumentId);
  }, key);
}
async function command(p, name) {
  await p.keyboard.press("Escape");
  await p.keyboard.press("Control+k");
  const d = p.getByRole("dialog", { name: "명령 팔레트", exact: true });
  await d.getByPlaceholder("명령 검색…").fill(name);
  await d
    .getByRole("button")
    .filter({ has: p.getByText(name, { exact: true }) })
    .click();
}
async function importFile(p, filename) {
  if (p.viewportSize().width < 768) {
    await p.getByRole("button", { name: "노드 모드", exact: true }).click();
    await p.getByRole("button", { name: "더보기", exact: true }).click();
    await p
      .getByRole("dialog", { name: "더 많은 도구", exact: true })
      .getByRole("button", { name: "JSON 열기", exact: true })
      .click();
  } else await command(p, "JSON 가져오기");
  const d = p.getByRole("dialog", { name: "가져오기", exact: true });
  await d.locator('input[type="file"]').setInputFiles(filename);
  await d.getByRole("button", { name: "가져오기", exact: true }).click();
  await ready(p);
  await closeDocuments(p);
}
async function exportFile(p, format, filename) {
  await command(p, "내보내기");
  const d = p.getByRole("dialog", { name: "내보내기", exact: true });
  await d
    .getByRole("button", { name: format.toUpperCase(), exact: true })
    .click();
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll('[role="dialog"] button')].some(
        (b) => b.textContent.trim() === "다운로드" && !b.disabled,
      ),
    null,
    { timeout: 60000 },
  );
  const wait = p.waitForEvent("download", { timeout: 60000 });
  await d.getByRole("button", { name: "다운로드", exact: true }).click();
  const download = await wait;
  assert.equal(await download.failure(), null);
  await download.saveAs(filename);
  await d.getByRole("button", { name: "닫기", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  return fs.readFileSync(filename);
}
async function screen(p, point) {
  const v = await p.locator(".react-flow__viewport").evaluate((el) => {
    const m = new DOMMatrix(el.style.transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
  const box = await p.locator("[data-ink-input]").boundingBox();
  return {
    x: box.x + v.x + point.x * v.zoom,
    y: box.y + v.y + point.y * v.zoom,
  };
}
async function draw(p, start, end) {
  await p.waitForFunction(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-ink-input]"),
    start,
  );
  await p.mouse.move(start.x, start.y);
  await p.mouse.down();
  await p.mouse.move(end.x, end.y, { steps: 32 });
  await p.mouse.up();
}
async function mapping(p, svg) {
  return p.evaluate((text) => {
    const xml = new DOMParser().parseFromString(text, "image/svg+xml");
    const viewport = xml.querySelector(".react-flow__viewport"),
      m = new DOMMatrix(viewport.style.transform);
    return {
      x: m.e,
      y: m.f,
      zoom: m.a,
      width: +xml.documentElement.getAttribute("width"),
      height: +xml.documentElement.getAttribute("height"),
    };
  }, svg.toString());
}
async function readability(p, before, after, beforeMap, afterMap) {
  return p.evaluate(
    async ({ before, after, beforeMap, afterMap }) => {
      const decode = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return { width: c.width, height: c.height, ctx };
      };
      const a = await decode(before),
        b = await decode(after);
      const pixel = (image, map, x, y) => {
        const ratio = image.width / map.width;
        const data = image.ctx.getImageData(
          Math.round((map.x + x * map.zoom) * ratio),
          Math.round((map.y + y * map.zoom) * ratio),
          1,
          1,
        ).data;
        return [...data];
      };
      const luminance = (rgba) => {
        const linear = rgba.slice(0, 3).map((c) => {
          const x = c / 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const dark = [],
        background = [],
        backgroundChange = [];
      for (let x = -145; x <= 145; x += 1.5)
        for (let y = -5; y <= 5; y++) {
          const old = pixel(a, beforeMap, x, y),
            current = pixel(b, afterMap, x, y),
            l = luminance(old);
          if (l < 0.035) dark.push(luminance(current));
          if (l > 0.94) {
            background.push(luminance(current));
            backgroundChange.push(
              Math.max(
                ...old
                  .slice(0, 3)
                  .map((value, i) => Math.abs(value - current[i])),
              ),
            );
          }
        }
      const percentile = (values, fraction) => {
        const sorted = [...values].sort((x, y) => x - y);
        return sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
        ];
      };
      const foregroundP90 = percentile(dark, 0.9),
        backgroundP10 = percentile(background, 0.1);
      return {
        beforeSize: [a.width, a.height],
        afterSize: [b.width, b.height],
        blackCoreSamples: dark.length,
        whitePaperSamples: background.length,
        afterForegroundLuminanceP90: foregroundP90,
        afterPaperLuminanceP10: backgroundP10,
        conservativeContrast: (backgroundP10 + 0.05) / (foregroundP90 + 0.05),
        retainedDarkFraction: dark.filter((l) => l < 0.25).length / dark.length,
        paperColorChangeMedian: percentile(backgroundChange, 0.5),
      };
    },
    {
      before: "data:image/png;base64," + before.toString("base64"),
      after: "data:image/png;base64," + after.toString("base64"),
      beforeMap,
      afterMap,
    },
  );
}
async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript(() =>
    localStorage.setItem("mindforge-onboarded-v1", "1"),
  );
  const p = await ctx.newPage();
  p.on("pageerror", (error) => report.errors.push(error.message));
  await p.goto(base);
  await p.getByRole("button", { name: "손그림", exact: true }).click();
  await ready(p);
  await closeDocuments(p);
  return { ctx, p };
}
const quick = (p) =>
  p.getByRole("toolbar", { name: "빠른 그리기 도구", exact: true });
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
async function main() {
  let server, browser;
  try {
    if (!process.env.INK_TOOL_BASE) {
      server = spawn("npm", ["run", "start", "--", "--port", "3007"], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let started = false,
        logs = "";
      server.stdout.on("data", (chunk) => {
        logs = (logs + chunk).slice(-4000);
      });
      server.stderr.on("data", (chunk) => {
        logs = (logs + chunk).slice(-4000);
      });
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(base)).ok) {
            started = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      assert.ok(started, logs);
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
    report.browser = browser.version();
    const desktop = await open(browser, { width: 1440, height: 1000 }),
      p = desktop.p;
    const fixturePath = path.join(output, "label-fixture.json");
    fs.writeFileSync(fixturePath, exportDocumentJson(fixture()));
    await importFile(p, fixturePath);
    await p.getByRole("button", { name: "그리기 모드", exact: true }).click();
    await p
      .getByRole("button", { name: "노드와 잉크 화면 맞춤", exact: true })
      .click();
    await p.waitForTimeout(500);
    for (const name of tools)
      assert.ok(
        await quick(p).getByRole("button", { name, exact: true }).isVisible(),
      );
    await quick(p)
      .getByRole("button", { name: "펜 도구", exact: true })
      .click();
    await quick(p)
      .getByRole("button", { name: "색연필 도구", exact: true })
      .click();
    await quick(p)
      .getByRole("button", { name: "마커 도구", exact: true })
      .click();
    assert.equal(
      await p.getByRole("dialog").count(),
      0,
      "three switches require no modal",
    );
    let doc = await stored(p),
      markerSettings = doc.inkSettings;
    assert.equal(markerSettings.brush, "marker");
    assert.ok(markerSettings.opacity <= 0.65 && markerSettings.opacity > 0.05);
    assert.ok(
      Math.min(...rgb(markerSettings.color)) >= 120 &&
        Math.max(...rgb(markerSettings.color)) >= 210,
      "marker defaults to a light pastel color",
    );
    report.checks.push({
      quickSelection: "pen → pencil → marker, three direct toolbar clicks",
      markerSettings,
    });
    const beforeSvg = await exportFile(
      p,
      "svg",
      path.join(output, "before-marker.svg"),
    );
    const beforePng = await exportFile(
      p,
      "png",
      path.join(output, "before-marker.png"),
    );
    await draw(
      p,
      await screen(p, { x: -185, y: 0 }),
      await screen(p, { x: 185, y: 0 }),
    );
    doc = await stored(p);
    const marker = doc.ink.strokes.at(-1);
    assert.equal(
      doc.ink.strokes.length,
      2,
      "a real pointer gesture adds one marker stroke beside the transparent bounds guard",
    );
    assert.equal(marker.brush, "marker");
    assert.equal(marker.color, markerSettings.color);
    assert.equal(marker.opacity, markerSettings.opacity);
    assert.equal(marker.materialStyle, "classic");
    assert.ok(
      doc.ink.order.indexOf("under-marker") < doc.ink.order.indexOf(marker.id),
      "marker is genuinely above the text",
    );
    const afterSvg = await exportFile(
      p,
      "svg",
      path.join(output, "after-marker.svg"),
    );
    const afterPng = await exportFile(
      p,
      "png",
      path.join(output, "after-marker.png"),
    );
    const pixels = await readability(
      p,
      beforePng,
      afterPng,
      await mapping(p, beforeSvg),
      await mapping(p, afterSvg),
    );
    assert.deepEqual(pixels.beforeSize, pixels.afterSize);
    assert.ok(pixels.blackCoreSamples > 100 && pixels.whitePaperSamples > 100);
    assert.ok(
      pixels.conservativeContrast >= 4.5,
      "text must retain readable contrast beneath the marker: " +
        JSON.stringify(pixels),
    );
    assert.ok(pixels.retainedDarkFraction > 0.95);
    assert.ok(
      pixels.paperColorChangeMedian >= 10,
      "the pastel stroke is visibly painted rather than hidden behind the text",
    );
    report.checks.push({ markerAboveBlackKoreanText: pixels });
    await p.mouse.move(1100, 300);
    await p.screenshot({ path: path.join(output, "quick-tools-desktop.png") });
    await quick(p)
      .getByRole("button", { name: "펜 도구", exact: true })
      .click();
    const penSettings = (await stored(p)).inkSettings;
    assert.equal(penSettings.brush, "pen");
    assert.ok(penSettings.opacity >= 0.95);
    assert.ok(
      Math.max(...rgb(penSettings.color)) <= 180,
      "ordinary pen restores a dark ink color",
    );
    report.checks.push({ darkPenRestored: penSettings });
    // Quick tools remain reachable after leaving drawing for selection/eraser.
    for (const mode of ["선택 모드", "지우개 모드"]) {
      await p.getByRole("button", { name: mode, exact: true }).click();
      for (const name of tools)
        assert.ok(
          await quick(p).getByRole("button", { name, exact: true }).isEnabled(),
        );
      await quick(p)
        .getByRole("button", { name: "색연필 도구", exact: true })
        .click();
      assert.equal(
        await p.locator("[data-ink-input]").getAttribute("data-tool"),
        "pen",
      );
    }
    // The visible and accessible names agree for the simplified drawing options.
    await p.getByRole("button", { name: "그리기 도구", exact: true }).click();
    const options = p.getByRole("dialog", { name: "그리기 도구", exact: true });
    assert.ok(await options.isVisible());
    await options.getByRole("button", { name: "완료", exact: true }).click();
    report.checks.push(
      "All six quick tools stay available in selection/eraser modes and return directly to drawing; drawing options use the visible/accessibility name '그리기 도구'.",
    );
    const jsonPath = path.join(output, "marker-readability.json");
    await exportFile(p, "json", jsonPath);
    await p.reload();
    await ready(p);
    const restored = await stored(p);
    assert.deepEqual(
      restored.ink.strokes.find((s) => s.id === marker.id),
      marker,
    );
    await desktop.ctx.close();
    for (const width of [320, 375]) {
      const mobile = await open(browser, { width, height: 812 });
      await importFile(mobile.p, jsonPath);
      await mobile.p
        .getByRole("button", { name: "그리기 모드", exact: true })
        .click();
      const cloudEntry = mobile.p.locator("[data-cloud-status]");
      await cloudEntry.waitFor({ state: "visible" });
      const layout = await mobile.p.evaluate(() => {
        const toolbar = document
          .querySelector("[data-ink-toolbar]")
          .getBoundingClientRect();
        const cloud = document
          .querySelector("[data-cloud-status]")
          .getBoundingClientRect();
        const buttons = [
          ...document.querySelectorAll("[data-ink-brushbar] button"),
        ].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.getAttribute("aria-label"),
            width: r.width,
            height: r.height,
            left: r.left,
            right: r.right,
          };
        });
        const colors = [
          ...document.querySelectorAll("[data-ink-colors] button"),
        ].map((el) => {
          const r = el.getBoundingClientRect();
          return { width: r.width, height: r.height };
        });
        return {
          viewport: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          toolbar: { left: toolbar.left, right: toolbar.right, top: toolbar.top, bottom: toolbar.bottom },
          cloud: { left: cloud.left, right: cloud.right, top: cloud.top, bottom: cloud.bottom },
          buttons,
          colors,
        };
      });
      assert.ok(
        layout.scrollWidth <= width &&
          layout.toolbar.left >= 0 &&
          layout.toolbar.right <= width,
        JSON.stringify(layout),
      );
      assert.equal(layout.buttons.length, 6);
      assert.ok(
        layout.buttons.every(
          (b) =>
            b.width >= 44 && b.height >= 44 && b.left >= 0 && b.right <= width,
        ),
        JSON.stringify(layout),
      );
      assert.ok(
        layout.colors.length >= 4 &&
          layout.colors.every((b) => b.width >= 44 && b.height >= 44),
      );
      const cloudOverlapsTools = layout.cloud.left < layout.toolbar.right &&
        layout.cloud.right > layout.toolbar.left &&
        layout.cloud.top < layout.toolbar.bottom &&
        layout.cloud.bottom > layout.toolbar.top;
      assert.equal(cloudOverlapsTools, false, "Cloud entry obstructs mobile drawing tools: " + JSON.stringify(layout));
      const accessibleModes = [];
      for (const [name, tool] of [["올가미 모드", "lasso"], ["지우개 모드", "eraser"], ["이동 모드", "pan"]]) {
        assert.ok(await cloudEntry.isVisible());
        await mobile.p.getByRole("button", { name, exact: true }).click();
        await mobile.p.locator(`[data-ink-input][data-tool="${tool}"]`).waitFor();
        accessibleModes.push(name);
      }
      await mobile.p.getByRole("button", { name: /^계정 및 클라우드 문서 열기/ }).click();
      const accountDialog = mobile.p.getByRole("dialog", { name: "계정 및 클라우드", exact: true });
      await accountDialog.waitFor({ state: "visible" });
      await accountDialog.getByRole("button", { name: "닫기", exact: true }).click();
      await accountDialog.waitFor({ state: "hidden" });
      await quick(mobile.p)
        .getByRole("button", { name: "마커 도구", exact: true })
        .click();
      await mobile.p.mouse.move(width / 2, 250);
      await mobile.p.screenshot({
        path: path.join(output, "quick-tools-mobile-" + width + ".png"),
      });
      report.checks.push({ mobileLayout: layout, accessibleModes, accountDialogAccessible: true });
      await mobile.ctx.close();
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = error.stack;
    process.exitCode = 1;
    throw error;
  } finally {
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    if (browser) await browser.close();
    if (server?.pid)
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch((error) => console.error(error));
