/* Production-bundle browser regression. npm run build first. Optional
   BROWSER_EXECUTABLE_PATH / BROWSER_ARGS_JSON for an externally installed browser. */
const { spawn } = require("node:child_process");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const baseline = require("../layout-engine/fixtures/baseline.json");
const { fixture } = require("../layout-engine/fixtures/generate.ts");
const { runLayout } = require("../../src/lib/layout.ts");
const { buildEdgesFromNodes } = require("../../src/lib/tree.ts");
const key = "mindforge-workspace-v1",
  results = [];
let browserVersion;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const options = {
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
    : {}),
  args: JSON.parse(process.env.BROWSER_ARGS_JSON || '["--no-sandbox"]'),
};
function workspace(nodes) {
  const doc = {
    id: "e2e-map",
    title: "엔진 검증",
    nodes,
    edges: buildEdgesFromNodes(nodes),
    relations: [],
    layoutMode: "right-tree",
    createdAt: "2026-09-09",
    updatedAt: "2026-09-09",
  };
  return {
    version: 1,
    documents: [doc],
    activeDocumentId: doc.id,
    theme: "light",
    sidebarCollapsed: true,
    inspectorOpen: false,
  };
}
async function ready(page, count) {
  try {
    await page.waitForFunction(
      (n) => document.querySelectorAll(".react-flow__node").length >= n,
      count,
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-mindmap-canvas]")
          ?.getAttribute("aria-busy") === "false",
      null,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-route-state]").length > 0 &&
        [...document.querySelectorAll("[data-route-state]")].every(
          (e) => e.dataset.routeState === "ok",
        ),
      null,
      { timeout: 20000 },
    );
    await page.waitForTimeout(100);
  } catch (error) {
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          busy: document
            .querySelector("[data-mindmap-canvas]")
            ?.getAttribute("aria-busy"),
          failedEdges: [...document.querySelectorAll("[data-route-state]")]
            .filter((e) => e.dataset.routeState !== "ok")
            .slice(0, 8)
            .map((e) => ({
              id: e.closest(".react-flow__edge")?.dataset.id,
              state: e.dataset.routeState,
            })),
          result: window.__lastLayoutResult
            ? {
                status: window.__lastLayoutResult.status,
                metrics: window.__lastLayoutResult.metrics,
                diagnostics: window.__lastLayoutResult.diagnostics.slice(0, 12),
              }
            : null,
          root: window.__lastLayoutInput?.nodes[0],
        })),
      ),
    );
    await page.screenshot({ path: "verification/failure.png" });
    throw error;
  }
}
async function rects(page) {
  return page.locator(".react-flow__node").evaluateAll((es) =>
    es.map((e) => {
      const m = new DOMMatrix(e.style.transform);
      return {
        id: e.dataset.id,
        x: m.e,
        y: m.f,
        width: e.offsetWidth,
        height: e.offsetHeight,
      };
    }),
  );
}
async function noOverlap(page) {
  const rs = await rects(page);
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i],
        b = rs[j];
      assert.ok(
        !(
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.6 &&
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.6
        ),
        `Node overlap ${a.id}/${b.id}`,
      );
    }
  return rs;
}
async function init(page, nodes, relations = []) {
  const ws = workspace(nodes);
  ws.documents[0].relations = relations;
  await page.addInitScript(
    ({ ws, key }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(ws));
      window.__layoutMessages = [];
      window.__layoutTimes = [];
      window.__layoutTerminations = [];
      window.__localEditTimes = [];
      window.__longTasks = [];
      new PerformanceObserver((list) => {
        window.__longTasks.push(
          ...list
            .getEntries()
            .map((e) => ({ start: e.startTime, duration: e.duration })),
        );
      }).observe({ type: "longtask", buffered: true });
      document.addEventListener(
        "keydown",
        (e) => {
          if (
            e.target.tagName === "TEXTAREA" &&
            e.key === "Enter" &&
            !e.isComposing
          ) {
            window.__editStart = performance.now();
          }
        },
        true,
      );
      new MutationObserver(() => {
        if (
          !window.__editStart ||
          document
            .querySelector("[data-mindmap-canvas]")
            ?.getAttribute("aria-busy") !== "false"
        )
          return;
        const start = window.__editStart,
          generation = window.__layoutMessages.length;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (
              window.__editStart === start &&
              generation === window.__layoutMessages.length &&
              document
                .querySelector("[data-mindmap-canvas]")
                ?.getAttribute("aria-busy") === "false"
            ) {
              window.__localEditTimes.push(performance.now() - start);
              window.__editStart = null;
            }
          }),
        );
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-busy"],
      });
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(...args) {
          super(...args);
          this.starts = new Map();
          this.addEventListener("message", (event) => {
            window.__lastLayoutResult = event.data;
            const s = event.data?.stamp;
            if (s) {
              const start = this.starts.get(s.requestGeneration);
              if (start)
                requestAnimationFrame(() =>
                  requestAnimationFrame(() =>
                    window.__layoutTimes.push(performance.now() - start),
                  ),
                );
            }
          });
        }
        postMessage(input, ...rest) {
          window.__lastLayoutInput = input;
          window.__layoutMessages.push(input.stamp);
          this.starts.set(input.stamp.requestGeneration, performance.now());
          if (window.__cancelNextLayout && input.strategy === "full") {
            window.__cancelNextLayout = false;
            setTimeout(() => {
              window.__cancelAt = performance.now();
              document.querySelector('button[aria-label="실행 취소"]').click();
            }, 10);
          }
          return super.postMessage(input, ...rest);
        }
        terminate() {
          window.__layoutTerminations.push(performance.now());
          return super.terminate();
        }
      };
    },
    { ws, key },
  );
  await page.goto("http://localhost:3011/?doc=e2e-map");
  const close = page.getByRole("button", { name: "닫기", exact: true });
  if (await close.count()) await close.first().click();
  await ready(page, nodes.length);
  if (await close.count()) await close.first().click();
  await page.waitForTimeout(250);
}
(async () => {
  fs.mkdirSync("verification", { recursive: true });
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3011"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  server.stdout.on("data", (b) => (logs += b));
  server.stderr.on("data", (b) => (logs += b));
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch("http://localhost:3011")).ok) break;
      } catch {}
      await delay(100);
    }
    for (const width of process.env.E2E_SCENARIOS === "large"
      ? []
      : process.env.E2E_WIDTHS
        ? process.env.E2E_WIDTHS.split(",")
            .map(Number)
            .filter((n) => n > 0)
        : [360, 390, 768, 1024, 1440]) {
      const browser = await chromium.launch(options);
      browserVersion = browser.version();
      try {
        const page = await browser.newPage({
            viewport: { width, height: 900 },
            hasTouch: width < 768,
            isMobile: width < 768,
          }),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await init(
          page,
          baseline.nodes.map((n, i) => ({
            ...n,
            position: baseline.positions["right-tree"][i],
          })),
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await noOverlap(page);
        const initialRequests = await page.evaluate(
          () => window.__layoutMessages.length,
        );
        await page.waitForTimeout(400);
        assert.equal(
          await page.evaluate(() => window.__layoutMessages.length),
          initialRequests,
          "measurement loop",
        );
        const before = await rects(page);
        // Pointer selection and camera movement do not produce worker requests.
        const node = page.locator('.react-flow__node[data-id="n0"]');
        await node.click();
        if (width < 768) {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("Input.synthesizePinchGesture", {
            x: width / 2,
            y: 450,
            scaleFactor: 1.1,
            relativeSpeed: 400,
            gestureSourceType: "touch",
          });
        } else {
          await page.mouse.move(width / 2, 780);
          await page.mouse.wheel(0, 100);
        }
        await page.waitForTimeout(200);
        assert.equal(
          await page.evaluate(() => window.__layoutMessages.length),
          initialRequests,
          "selection/zoom rerouted",
        );
        assert.deepEqual(
          (await rects(page)).map((n) => [n.id, n.x, n.y]),
          before.map((n) => [n.id, n.x, n.y]),
        );
        await page
          .getByRole("button", { name: "겹침 없이 자동 배열", exact: true })
          .first()
          .click();
        await ready(page, 14);
        if (width >= 768) {
          await page
            .getByRole("button", { name: "배열 방식 선택", exact: true })
            .click();
          await page.getByRole("menuitem", { name: /방사형/ }).click();
          await ready(page, 14);
          await noOverlap(page);
          await page
            .getByRole("button", { name: "실행 취소", exact: true })
            .first()
            .click();
          await ready(page, 14);
        }
        // Editing commits once; IME Enter is ignored while composing.
        await page.locator('.react-flow__node[data-id="n0"]').dblclick();
        const input = page.locator('.react-flow__node[data-id="n0"] textarea');
        await input.fill("편집 검증");
        await input.dispatchEvent("keydown", {
          key: "Enter",
          code: "Enter",
          isComposing: true,
        });
        assert.equal(await input.count(), 1);
        await input.press("Enter");
        await ready(page, 14);
        await page
          .getByRole("button", { name: "실행 취소", exact: true })
          .first()
          .click();
        await ready(page, 14);
        if (width === 1440) {
          // Real free drag, with one undo, then a growing label and localized cleanup.
          await page
            .getByRole("button", { name: "화면 맞춤", exact: true })
            .click();
          await page.waitForTimeout(500);
          const leaf = page.locator('.react-flow__node[data-id="n2"]');
          const b = await leaf.boundingBox();
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
          await page.mouse.down();
          await page.mouse.move(
            b.x + b.width / 2 + 32,
            b.y + b.height / 2 + 18,
            { steps: 5 },
          );
          await page.mouse.up();
          await ready(page, 14);
          await page
            .getByRole("button", { name: "실행 취소", exact: true })
            .click();
          await ready(page, 14);
          const old = await rects(page);
          await leaf.dblclick();
          await leaf
            .locator("textarea")
            .fill("한 가지의 긴 제목을 수정합니다. ".repeat(12));
          await leaf.locator("textarea").press("Enter");
          await ready(page, 14);
          await noOverlap(page);
          const next = await rects(page);
          assert.deepEqual(
            next.find((n) => n.id === "n11"),
            old.find((n) => n.id === "n11"),
            "distant branch moved",
          );
          // Fold/unfold retains stored descendant positions and returns valid routes.
          await page
            .getByRole("button", { name: "화면 맞춤", exact: true })
            .click();
          await page.waitForTimeout(500);
          const branch = page.locator('.react-flow__node[data-id="n1"]');
          await branch
            .getByRole("button", { name: "접기", exact: true })
            .click();
          await page.waitForTimeout(200);
          await branch
            .getByRole("button", { name: "펼치기", exact: true })
            .click();
          await ready(page, 14);
          await noOverlap(page);
          for (const format of ["SVG", "PNG"]) {
            await page
              .getByRole("button", { name: "더 많은 도구", exact: true })
              .click();
            const download = page.waitForEvent("download", { timeout: 30000 });
            await page
              .getByRole("menuitem", {
                name: `${format} 이미지 저장`,
                exact: true,
              })
              .click();
            const file = await download;
            await file.saveAs(`verification/export.${format.toLowerCase()}`);
            assert.ok(
              fs.statSync(`verification/export.${format.toLowerCase()}`).size >
                1000,
            );
          }
          await page.waitForTimeout(900);
          const saved = await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)),
            key,
          );
          assert.ok(!JSON.stringify(saved).includes("requestGeneration"));
          assert.equal(saved.documents[0].nodes.length, 14);
          await page.reload();
          await ready(page, 14);
          assert.ok(
            (await page.locator("body").innerText()).includes(
              "한 가지의 긴 제목",
            ),
          );
        }
        await page.screenshot({ path: `verification/editor-${width}.png` });
        const status = {
          width,
          errors,
          routes: await page
            .locator("[data-route-state]")
            .evaluateAll((es) =>
              es.reduce(
                (a, e) => (
                  (a[e.dataset.routeState] =
                    (a[e.dataset.routeState] || 0) + 1),
                  a
                ),
                {},
              ),
            ),
          workerToPaintMs: await page.evaluate(() => window.__layoutTimes),
        };
        assert.deepEqual(errors, []);
        results.push(status);
        console.log(JSON.stringify(status));
      } finally {
        await browser.close();
      }
    }
    // 200 nodes: separately record full-button automation and real Enter -> paint.
    if (process.env.E2E_SCENARIOS !== "large") {
      const browser = await chromium.launch(options);
      try {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        await init(page, runLayout(fixture(200), "right-tree"));
        const times = [];
        for (let i = 0; i < 3; i++) {
          const t = performance.now();
          await page
            .getByRole("button", { name: "겹침 없이 자동 배열", exact: true })
            .click();
          await page.waitForTimeout(100);
          await ready(page, 200);
          times.push(performance.now() - t);
        }
        for (let i = 0; i < 10; i++) {
          const root = page.locator('.react-flow__node[data-id="n0"]');
          await root.dblclick();
          await root.locator("textarea").fill(`국소 수정 ${i}`);
          await root.locator("textarea").press("Enter");
          await ready(page, 200);
        }
        results.push({
          count: 200,
          scenario: "full layout button; polling/stability waits included",
          endToEndMs: times,
          workerToPaintMs: await page.evaluate(() => window.__layoutTimes),
          localEditEnterToPaintMs: await page.evaluate(
            () => window.__localEditTimes,
          ),
        });
      } finally {
        await browser.close();
      }
      // Cross links use the validated path for the visible line, arrow and label.
      const relationBrowser = await chromium.launch(options);
      try {
        const page = await relationBrowser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await init(page, runLayout(fixture(3), "right-tree"), [
          { id: "rel-test", source: "n1", target: "n2", label: "검증 관계" },
        ]);
        const before = await page.evaluate(
          () => window.__layoutMessages.length,
        );
        await page
          .getByRole("button", { name: "검증 관계", exact: true })
          .click();
        await page.waitForTimeout(200);
        assert.equal(
          await page.evaluate(() => window.__layoutMessages.length),
          before,
          "relation selection rerouted",
        );
        const relation = page.locator('.react-flow__edge[data-id="rel-test"]');
        assert.ok(
          (await relation.locator('g[data-route-state="ok"] > path').count()) >=
            2,
          "validated line and arrow",
        );
        await page
          .getByRole("button", { name: "검증 관계", exact: true })
          .dblclick();
        const input = page.getByPlaceholder("관계 이름");
        await input.fill("한글 관계 변경");
        await input.dispatchEvent("keydown", {
          key: "Enter",
          isComposing: true,
        });
        assert.equal(await input.count(), 1);
        await input.press("Enter");
        await ready(page, 3);
        await page
          .getByRole("button", { name: "한글 관계 변경", exact: true })
          .dblclick();
        await input.fill("취소할 이름");
        await input.press("Escape");
        assert.equal(
          await page
            .getByRole("button", { name: "한글 관계 변경", exact: true })
            .count(),
          1,
        );
        await page
          .getByRole("button", { name: "관계선 삭제", exact: true })
          .click();
        assert.equal(await relation.count(), 0);
        await page
          .getByRole("button", { name: "실행 취소", exact: true })
          .click();
        await ready(page, 3);
        assert.equal(await relation.count(), 1);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: "verification/relations.png" });
        results.push({
          scenario:
            "relation line/arrow/label, select without reroute, IME, cancel, delete and undo",
          passed: true,
          errors,
        });
      } finally {
        await relationBrowser.close();
      }
    }
    const largeBrowser = await chromium.launch(options);
    browserVersion = largeBrowser.version();
    try {
      const page = await largeBrowser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await init(page, runLayout(fixture(3000), "right-tree"));
      // Imported estimates and actual card dimensions differ. Establish the
      // explicit measured full-layout baseline before testing cancellation.
      await page
        .getByRole("button", { name: "겹침 없이 자동 배열", exact: true })
        .click();
      await ready(page, 3000);
      await noOverlap(page);
      const root = page.locator('.react-flow__node[data-id="n0"]');
      const original = (await root.innerText()).split("\n")[0];
      // At the editor's minimum zoom a 3000-node scene extends beyond the
      // viewport. Use the supported keyboard edit path for the selected root.
      await root.focus();
      await root.press("F2");
      await root.locator("textarea").fill("취소 검사");
      await root.locator("textarea").press("Enter");
      await ready(page, 3000);
      await page.evaluate(() => {
        window.__cancelNextLayout = true;
        window.__longTasks = [];
        window.__layoutTerminations = [];
      });
      await page
        .getByRole("button", { name: "배열 방식 선택", exact: true })
        .click();
      await page.getByRole("menuitem", { name: /방사형/ }).click();
      await page.waitForFunction(
        () =>
          window.__cancelAt &&
          window.__layoutTerminations.some((t) => t >= window.__cancelAt),
        null,
        { timeout: 20000 },
      );
      await ready(page, 3000);
      await page.waitForTimeout(500);
      assert.ok((await root.innerText()).includes(original));
      assert.equal(await page.locator(".react-flow__node").count(), 3000);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const { metrics } = await cdp.send("Performance.getMetrics");
      const measurements = await page.evaluate(() => ({
        cancelToTerminateMs:
          window.__layoutTerminations.find((t) => t >= window.__cancelAt) -
          window.__cancelAt,
        longTasks: window.__longTasks,
      }));
      assert.deepEqual(errors, []);
      results.push({
        count: 3000,
        scenario:
          "cancel running radial worker with undo; no stale mode/label application",
        ...measurements,
        mainJSHeapUsedBytes: metrics.find((m) => m.name === "JSHeapUsedSize")
          .value,
        errors,
      });
    } finally {
      await largeBrowser.close();
    }
    fs.writeFileSync(
      "verification/layout-browser.json",
      JSON.stringify(
        {
          browserVersion,
          executable: options.executablePath || chromium.executablePath(),
          notes:
            "Desktop headless Chromium, emulated mobile viewports; no real-phone measurements. Main JS heap excludes worker heap and is not a peak-memory bound.",
          results,
        },
        null,
        2,
      ) + "\n",
    );
  } catch (error) {
    console.error(error);
    console.error(logs.slice(-2000));
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
