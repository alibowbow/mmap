/* Real file downloads and fresh-browser import. npm run build first.
   IO_DEV=1 uses next dev; IO_SERVER_CWD allows checking the unchanged baseline. */
const { spawn } = require("node:child_process");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { portableFixture } = require("../io/fixture.ts");
const { getHiddenNodeIds } = require("../../src/lib/tree.ts");
const key = "mindforge-workspace-v1",
  baseline = process.env.IO_BASELINE === "1";
const port = Number(process.env.IO_PORT || 3001),
  base = "http://localhost:" + port;
const output = fs.mkdtempSync(path.join(os.tmpdir(), "mindbranch-io-"));
const report = { browser: "", baseline, downloads: [], checks: [], errors: [] };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function command(page, title) {
  await page.keyboard.press("Escape");
  if (page.viewportSize().width < 768 && title === "JSON 가져오기") {
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("button", { name: "JSON 열기", exact: true }).click();
    return;
  }
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "명령 팔레트" });
  await palette.getByPlaceholder("명령 검색…").fill(title);
  await palette
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
}
async function ready(page) {
  await page.waitForSelector(".react-flow__node");
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-mindmap-canvas]")
        ?.getAttribute("aria-busy") === "false",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}
async function openExport(page) {
  await command(page, "내보내기");
  const dialog = page.getByRole("dialog", { name: "내보내기", exact: true });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "JSON", exact: true }).click();
  await dialog.evaluate(() => document.fonts.ready);
  return dialog;
}
async function download(page, trigger, suffix) {
  const event = page.waitForEvent("download", { timeout: 60000 });
  await trigger();
  const file = await event;
  assert.equal(await file.failure(), null);
  const target = path.join(output, suffix);
  await file.saveAs(target);
  const bytes = fs.readFileSync(target);
  assert.ok(bytes.length > 0);
  report.downloads.push({ name: suffix, bytes: bytes.length });
  return bytes;
}
async function exportJson(page, suffix) {
  const dialog = await openExport(page);
  const bytes = await download(
    page,
    () => dialog.getByRole("button", { name: "다운로드", exact: true }).click(),
    suffix,
  );
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  return JSON.parse(bytes.toString());
}
async function importFile(page, raw) {
  await command(page, "JSON 가져오기");
  const dialog = page.getByRole("dialog", { name: "가져오기", exact: true });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "document.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  await dialog.getByRole("button", { name: "가져오기", exact: true }).click();
  await ready(page);
}
function payload(doc) {
  return {
    title: doc.title,
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      data: n.data,
      position: n.position,
      width: n.width,
      height: n.height,
      measured: n.measured,
    })),
    appearance: doc.appearance,
    layoutMode: doc.layoutMode,
    relations: doc.relations,
  };
}
async function pngInfo(bytes, page) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  assert.ok(width >= 960 && width <= 8192 && height >= 960 && height <= 8192);
  const pixels = await page.evaluate(
    async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 128, 128);
      const data = ctx.getImageData(0, 0, 128, 128).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4)
        colors.add([data[i], data[i + 1], data[i + 2]].join(","));
      return colors.size;
    },
    "data:image/png;base64," + bytes.toString("base64"),
  );
  assert.ok(
    pixels > 100,
    "PNG contains rendered content, not a blank background",
  );
  return { width, height, colors: pixels };
}

async function assertImageBounds(svg, doc, page) {
  const hidden = getHiddenNodeIds(doc.nodes);
  const visible = doc.nodes.filter((n) => !hidden.has(n.id));
  const frame = await page.evaluate((text) => {
    const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = parsed.documentElement,
      viewport = parsed.querySelector(".react-flow__viewport");
    const matrix = new DOMMatrix(viewport.style.transform);
    return {
      width: Number(root.getAttribute("width")),
      height: Number(root.getAttribute("height")),
      x: matrix.e,
      y: matrix.f,
      zoom: matrix.a,
      ids: [...parsed.querySelectorAll(".react-flow__node")].map((n) =>
        n.getAttribute("data-id"),
      ),
    };
  }, svg.toString());
  assert.deepEqual(frame.ids.sort(), visible.map((n) => n.id).sort());
  for (const node of visible) {
    const x = frame.x + node.position.x * frame.zoom,
      y = frame.y + node.position.y * frame.zoom;
    const width = (node.measured?.width ?? node.width ?? 232) * frame.zoom;
    const height = (node.measured?.height ?? node.height ?? 76) * frame.zoom;
    assert.ok(
      x >= 0 &&
        y >= 0 &&
        x + width <= frame.width &&
        y + height <= frame.height,
      node.id + " clipped",
    );
  }
  // Read the real detoured edge geometry, rather than only endpoint boxes.
  const paths = await page
    .locator(".react-flow__viewport .react-flow__edge-path")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const b = el.getBBox();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }),
    );
  for (const path of paths) {
    const x = frame.x + path.x * frame.zoom,
      y = frame.y + path.y * frame.zoom;
    assert.ok(
      x >= 0 &&
        y >= 0 &&
        x + path.width * frame.zoom <= frame.width &&
        y + path.height * frame.zoom <= frame.height,
      "edge path clipped",
    );
  }
  return { visibleNodes: visible.length, edgePaths: paths.length, frame };
}

async function main() {
  fs.mkdirSync("verification", { recursive: true });
  const server = spawn(
    "npm",
    [
      "run",
      process.env.IO_DEV === "1" ? "dev" : "start",
      "--",
      "--port",
      String(port),
    ],
    {
      cwd: process.env.IO_SERVER_CWD || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  let serverLogs = "";
  server.stdout.on("data", (chunk) => (serverLogs += chunk));
  server.stderr.on("data", (chunk) => (serverLogs += chunk));
  let browser;
  try {
    let started = false;
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(base)).ok) {
          started = true;
          break;
        }
      } catch {}
      await delay(500);
    }
    assert.ok(started, serverLogs);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    report.browser = browser.version();
    const doc = portableFixture(),
      workspace = {
        version: 1,
        ...doc.appearance,
        documents: [{ ...doc, appearance: undefined }],
        activeDocumentId: doc.id,
        sidebarCollapsed: true,
        inspectorOpen: false,
      };
    const first = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await first.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.addInitScript(
      ({ key, workspace }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(workspace));
      },
      { key, workspace },
    );
    await page.goto(base + "/?doc=" + doc.id);
    await ready(page);
    await page
      .getByRole("button", { name: "지도 디자인", exact: true })
      .click();
    await page.getByRole("button", { name: "비비드", exact: true }).click();
    if (!(await page.getByRole("button", { name: "둥근체 (Jua)" }).isVisible()))
      await page
        .getByRole("button", { name: "지도 디자인", exact: true })
        .click();
    await page.getByRole("button", { name: "둥근체 (Jua)" }).click();
    await page.keyboard.press("Escape");
    await ready(page);
    const exported = await exportJson(
      page,
      baseline ? "baseline.json" : "portable.json",
    );
    assert.equal(exported.document.nodes.length, 22);
    assert.equal(
      exported.document.nodes.filter((n) => n.data.parentId === "root").length,
      6,
    );
    const loaded = await page.evaluate(
      () =>
        [...document.fonts].filter(
          (f) =>
            f.family.replace(/['"]/g, "") === "Jua" && f.status === "loaded",
        ).length,
    );
    report.juaFacesLoaded = loaded;
    if (!baseline) {
      assert.ok(loaded > 0);
      assert.equal(exported.version, 3);
      assert.equal(exported.document.appearance.font, "jua");
      assert.equal(exported.document.appearance.nodeStyle, "soft");
      assert.equal(exported.document.appearance.rainbowBranches, true);
    }
    // Truly new context: no cookies, localStorage, or init script from source.
    const fresh = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const imported = await fresh.newPage();
    imported.on("pageerror", (e) => report.errors.push(e.message));
    await imported.goto(base);
    await imported
      .getByRole("button", { name: "가져오기", exact: true })
      .first()
      .click();
    let dialog = imported.getByRole("dialog", {
      name: "가져오기",
      exact: true,
    });
    await dialog
      .locator('input[type="file"]')
      .setInputFiles(
        path.join(output, baseline ? "baseline.json" : "portable.json"),
      );
    await dialog.getByRole("button", { name: "가져오기", exact: true }).click();
    await ready(imported);
    const roundtrip = await exportJson(
      imported,
      baseline ? "baseline-reexport.json" : "reexport.json",
    );
    if (baseline) {
      assert.equal(exported.document.appearance, undefined);
      assert.equal(roundtrip.document.appearance, undefined);
      report.checks.push({
        baselineDesignLoss: true,
        sourceFont: workspace.font,
        recipientFont: await imported.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)).font,
          key,
        ),
      });
      const png = await download(
        page,
        () => command(page, "PNG 이미지로 저장"),
        "baseline.png",
      );
      report.checks.push({ baselinePNG: await pngInfo(png, page) });
      return;
    }
    assert.deepEqual(payload(roundtrip.document), payload(exported.document));
    report.checks.push(
      "UI JSON export -> fresh browser file import -> reexport preserves content, design and geometry",
    );
    const importedId = roundtrip.document.id;
    assert.notEqual(importedId, exported.document.id);
    await imported.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key) || "{}").documents?.length === 2,
      key,
    );
    await imported.reload();
    await ready(imported);
    const reloaded = await exportJson(imported, "reloaded.json");
    assert.deepEqual(payload(reloaded.document), payload(roundtrip.document));
    report.checks.push(
      "New document, original sample retained, refresh persists design",
    );

    // Reject bad files in the actual dialog without replacing an open document.
    for (const raw of [
      { ...exported, version: 999 },
      {
        ...exported,
        document: { ...exported.document, appearance: { font: "unknown" } },
      },
      { document: { nodes: [{}] } },
    ]) {
      const before = await imported.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        key,
      );
      await command(imported, "JSON 가져오기");
      dialog = imported.getByRole("dialog", { name: "가져오기", exact: true });
      await dialog
        .getByRole("textbox", { name: "JSON 내용" })
        .fill(JSON.stringify(raw));
      await dialog.getByRole("alert").waitFor();
      assert.ok(
        await dialog
          .getByRole("button", { name: "가져오기", exact: true })
          .isDisabled(),
      );
      await dialog.getByRole("button", { name: "취소", exact: true }).click();
      const after = await imported.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        key,
      );
      assert.deepEqual(after.documents, before.documents);
      assert.equal(after.activeDocumentId, before.activeDocumentId);
    }
    await command(imported, "JSON 가져오기");
    dialog = imported.getByRole("dialog", { name: "가져오기", exact: true });
    await dialog
      .getByRole("textbox", { name: "JSON 내용" })
      .fill('{"document":');
    await dialog.getByRole("alert").waitFor();
    assert.ok(
      await dialog
        .getByRole("button", { name: "가져오기", exact: true })
        .isDisabled(),
    );
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    report.checks.push(
      "Malformed, partial, invalid style and future JSON rejected without overwriting documents",
    );

    for (let i = 0; i < 2; i++) {
      const png = await download(
        imported,
        () => command(imported, "PNG 이미지로 저장"),
        "direct-" + i + ".png",
      );
      report.checks.push({ repeatedPNG: await pngInfo(png, imported) });
    }
    dialog = await openExport(imported);
    await dialog.getByRole("button", { name: "PNG", exact: true }).click();
    await dialog.getByAltText("마인드맵 미리보기").waitFor({ timeout: 60000 });
    const png = await download(
      imported,
      () =>
        dialog.getByRole("button", { name: "다운로드", exact: true }).click(),
      "dialog.png",
    );
    report.checks.push({ dialogPNG: await pngInfo(png, imported) });
    await dialog.getByRole("button", { name: "다시 생성" }).click();
    await dialog.getByRole("button", { name: "SVG", exact: true }).click();
    await dialog.getByAltText("마인드맵 미리보기").waitFor({ timeout: 60000 });
    const svg = await download(
      imported,
      () =>
        dialog.getByRole("button", { name: "다운로드", exact: true }).click(),
      "diagram.svg",
    );
    assert.match(svg.toString(), /<svg/);
    assert.match(svg.toString(), /한국어 메시지 지도/);
    assert.match(svg.toString(), /Jua/);
    report.checks.push({
      imageBounds: await assertImageBounds(svg, reloaded.document, imported),
    });
    assert.match(
      svg.toString(),
      /data:application\/font|data:font|data:application\/octet-stream/,
    );
    report.checks.push(
      "PNG preview/regeneration, rapid PNG->SVG tab change, SVG content and embedded font",
    );
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();

    const large = JSON.parse(JSON.stringify(exported));
    large.document.title = "넓은 수동 좌표 지도";
    large.document.nodes.forEach((n) => {
      n.position.x *= 6;
    });
    await importFile(imported, large);
    const largeExport = await exportJson(imported, "large.json");
    assert.deepEqual(
      largeExport.document.nodes.map((n) => n.position),
      large.document.nodes.map((n) => n.position),
    );
    const largePNG = await download(
      imported,
      () => command(imported, "PNG 이미지로 저장"),
      "large.png",
    );
    const largeInfo = await pngInfo(largePNG, imported);
    assert.equal(largeInfo.width, 8192);
    await imported
      .getByRole("button", { name: "더 많은 도구", exact: true })
      .click();
    const largeSVG = await download(
      imported,
      () =>
        imported
          .getByRole("menuitem", { name: "SVG 이미지 저장", exact: true })
          .click(),
      "large.svg",
    );
    report.checks.push({
      largeCanvas: largeInfo,
      bounds: await assertImageBounds(largeSVG, largeExport.document, imported),
    });

    const manual = {
      format: "mindforge-document",
      version: 1,
      document: portableFixture(),
    };
    delete manual.document.appearance;
    await importFile(imported, manual);
    const manualExport = await exportJson(
      imported,
      "manual-no-measurements.json",
    );
    assert.deepEqual(
      manualExport.document.nodes.map((n) => n.position),
      manual.document.nodes.map((n) => n.position),
    );
    report.checks.push(
      "Legacy manual positions without cached sizes survive real font measurement",
    );

    // Legacy file goes into a NEW document and defaults independent of Jua map.
    const legacy = JSON.parse(JSON.stringify(exported));
    legacy.version = 1;
    delete legacy.document.appearance;
    await importFile(imported, legacy);
    const legacyExport = await exportJson(imported, "legacy-reexport.json");
    assert.equal(legacyExport.document.appearance.font, "inter");
    await imported.getByRole("button", { name: "더 많은 도구", exact: true }).click();
    const defaultSVG = await download(imported, () => imported.getByRole("menuitem", { name: "SVG 이미지 저장", exact: true }).click(), "default-font.svg");
    assert.match(defaultSVG.toString(), /Pretendard Variable/);
    assert.match(defaultSVG.toString(), /src: url\(&quot;data:|src: url\("data:/);
    assert.ok(defaultSVG.length < 10 * 1024 * 1024, "unused fallback font files are not embedded");
    report.checks.push(
      "Legacy v1 file imported as new document with safe default design",
    );

    await imported.goto(base + "/?doc=" + importedId);
    await ready(imported);

    for (const width of [360, 390, 768, 884, 1440]) {
      await imported.setViewportSize({
        width,
        height: width < 500 ? 840 : 1000,
      });
      dialog = await openExport(imported);
      const dimensions = await dialog.evaluate((el) => {
        const buttons = [...el.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            label: b.textContent || b.ariaLabel,
            width: r.width,
            height: r.height,
          };
        });
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          width: el.getBoundingClientRect().width,
          buttons,
        };
      });
      assert.equal(dimensions.overflow, false);
      assert.ok(dimensions.width <= width);
      assert.ok(
        dimensions.buttons.every((b) => b.width >= 44 && b.height >= 44),
        JSON.stringify(dimensions),
      );
      await imported.screenshot({
        path: "verification/io-export-" + width + ".png",
      });
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await imported.screenshot({
        path: "verification/io-canvas-" + width + ".png",
      });
      await command(imported, "JSON 가져오기");
      dialog = imported.getByRole("dialog", { name: "가져오기", exact: true });
      assert.equal(
        await dialog.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await imported.screenshot({
        path: "verification/io-import-" + width + ".png",
      });
      await dialog.getByRole("button", { name: "취소", exact: true }).click();
      report.checks.push({
        responsiveViewport: width,
        exportImportNoOverflow: true,
        exportButtons44px: true,
      });
    }
    // Every selectable font is served with the app; no Google font connection.
    for (const [id, label, family] of [
      ["inter", "Pretendard", "Pretendard Variable"],
      ["noto", "본고딕", "Noto Sans KR"],
      ["myeongjo", "명조체", "Nanum Myeongjo"],
      ["jua", "둥근체 (Jua)", "Jua"],
      ["gaegu", "손글씨", "Gaegu"],
      ["mono", "고정폭", "JetBrains Mono"],
    ]) {
      await imported
        .getByRole("button", { name: "지도 디자인", exact: true })
        .click();
      await imported.getByRole("button", { name: label }).click();
      await imported.keyboard.press("Escape");
      await ready(imported);
      await imported
        .locator("[data-mindmap-canvas]")
        .click({ position: { x: 10, y: 10 } });
      const faces = await imported.evaluate(async (family) => {
        return Promise.all(
          [400, 700].map(async (weight) => {
            const fs = await document.fonts.load(
              weight + ' 16px "' + family + '"',
              "한글 English",
            );
            return fs.length > 0 && fs.every((f) => f.status === "loaded");
          }),
        );
      }, family);
      assert.deepEqual(faces, [true, true], id);
      report.checks.push({ selectableFontLoaded: id });
    }

    const blocked = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    await blocked.route(/\.(?:woff2?|ttf)(?:\?|$)/, (route) => route.abort());
    const failure = await blocked.newPage();
    let unwantedDownloads = 0;
    failure.on("download", () => unwantedDownloads++);
    await failure.addInitScript(
      ({ key, doc }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            ...doc.appearance,
            documents: [doc],
            activeDocumentId: doc.id,
          }),
        ),
      { key, doc: exported.document },
    );
    await failure.goto(base + "/?doc=" + exported.document.id);
    await ready(failure);
    dialog = await openExport(failure);
    await dialog.getByRole("button", { name: "PNG", exact: true }).click();
    await dialog.getByText(/글꼴을 불러오지 못했습니다/).waitFor();
    assert.ok(
      await dialog
        .getByRole("button", { name: "다운로드", exact: true })
        .isDisabled(),
    );
    assert.equal(unwantedDownloads, 0);
    report.checks.push(
      "Injected font asset failure shows clear error and prevents a fallback-font image download",
    );
    assert.deepEqual(report.errors, []);
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    fs.writeFileSync(
      "verification/io-" + (baseline ? "baseline" : "report") + ".json",
      JSON.stringify({ ...report, output }, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
