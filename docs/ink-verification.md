# Hand-drawn mind maps — verification, 2026-10-03

Base: updated `main`, `a41c6ac340b151b7d645e1e7e76655e8a920301e`.
Work branch: `codex/handdrawn-mindmap`. The repository default branch and its
unmerged JEV draft were left untouched. No new project or dependency was added.

## PR #9 production follow-up

PR #9 was made ready and merged at the user's explicit request. The exact
merge SHA above is on Vercel production deployment
`dpl_4A3aJirajcMmEQt3P2sNFWYUzkZ4`, READY, target `production`, project
`prj_3M18Q4Ryg9cN1Hno0M7u8LFn4dMm`. Looking up `mmap-psi.vercel.app`
resolved to that deployment and SHA, with no alias error.

A separate synthetic two-node document on the public production site imported
JSON v2 with Jua and manual coordinates (-200,120) / (450,250). UI reexport
preserved v2, appearance and coordinates; reload restored them. PNG and SVG
previews generated, and the SVG preview decoded (1122×480) with nodes/edge.
The cloud-browser download-event wait timed out, so this production visit does
not establish OS file download success. Actual file downloads were separately
verified in local Chromium suites. No existing user document was edited.

## How to use

- Home → **빈 손그림 보드** starts without a hidden root node. In an existing
  map choose **그리기** to overlay ink; **노드** restores the existing editor.
- Draw with a pen, mouse or single finger. Choose **이동** for one-finger/mouse
  panning. Two contacts navigate/zoom and discard an unfinished ink preview.
  Toolbar +/- and fit include both nodes and ink, with toolbar/safe-area space.
- Choose pen color and 1–32px width. Supplied pen pressure affects width;
  unsupported input uses constant width. An active pen ignores extra touches
  as a best effort, not guaranteed palm rejection.
- **지우개** deletes whole touched ink strokes only. One gesture is one undo.
  Whole clear requires confirmation and is undoable. Topbar undo/redo and
  keyboard shortcuts work; unfinished/cancelled strokes are not committed.
- JSON v3 retains world points/pressure, blank-board flag, per-document pen
  settings, appearance and snapshots. v1/v2 still import as new documents.
  PNG/SVG include ink. Markdown/outline contain node text; ink documents use
  JSON rather than the older URL-sharing format to avoid losing drawings.

## Code and automated checks

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: passed.
- JSON/storage 7, new ink 10, layout integration 18, engine 55: passed.
  `node tests/core.cjs` also passed.
- Ink/store checks cover atomic erase/clear/undo/redo, mixed node and ink history,
  snapshots, switching/duplicate/delete, per-document settings, old imports,
  malformed/future ink rejection before mutation, storage migration, swept
  eraser intersections, dots, stroke-width bounds and sample limits.
- A 100,000-point / 1,000-stroke JSON round trip was ~4.66MB and 229ms in Node
  on this runner. A full 250,000-point v3 file above 10MB also round-tripped.
  v3 ink envelopes allow up to 32MB; other imports retain the 10MB bound.
- Per-stroke SVG path/bounds caches and immutable history references avoid
  copying/redrawing committed geometry on every pointer move. Preview updates
  use animation frames outside the store; storage is debounced after commits.
  Limits: 12,000 samples/stroke, 5,000 strokes, 250,000 samples/document.

## Real Chromium browser checks

Chromium 140.0.7339.186, final local production bundle, independent contexts
and synthetic data. DOM rendering and downloaded files are real browser
results; CDP pen/touch input is device simulation.

- Mouse drawing, world coordinates after pan/zoom, color/width controls,
  pointer cancellation, mode changes, swept eraser, undo/redo and clear
  cancel/confirm/restore passed.
- CDP pen pressure 0.2–0.875 reached stored Pointer Event samples. Emulated
  touch drew; a second contact discarded pending ink and navigated.
- Autosave/reload and actual JSON download → fresh context import/reexport
  retained ink, empty-board mode and pen settings.
- Empty board PNG 1118×960 and SVG contained every committed stroke. Overlay
  ink beyond opposite edges of a node map exported PNG 8192×6116 and SVG;
  every ink path and its width-expanded bounds was inside the export frame.
- Erasing/clearing ink retained node data/coordinates. Switching back supported
  real node label edit, drag and undo while preserving ink.
- 320/360/390/768/884/1440px viewports: no horizontal overflow, ink buttons
  ≥44px. Screenshots visually inspected; node quick actions are hidden in
  drawing mode. 884×1104 represents an inner Fold-sized viewport.
- 100,000 samples / 1,000 strokes loaded and settled in 1,278ms; an automated
  18-move pan gesture took 301ms. Drawing plus the save assertion took 3,429ms
  (includes the test's 850ms debounce wait and data retrieval). Idle animation
  frames had 16.7ms median / 16.8ms p95. An added stroke persisted in the ~4.75MB
  document. These are runner results, not phone benchmarks; navigation leaves
  committed ink unchanged. Details: `verification/ink-browser.json`.
- Existing IO browser regression passed: file round trip, legacy/corrupt files,
  repeated PNG/SVG, manual positions, all six fonts and injected font failure.
  Existing editor browser regression passed: layouts, editing/dragging, IME,
  relations, undo, mobile/desktop and cancelling a 3,000-node worker operation.
  No page runtime errors were observed.

## Limits and release scope

Physical Fold/S Pen pressure and palm rejection, Safari and Firefox were not
verified. Viewport and CDP input emulation are not hardware results. Storage
remains localStorage and can reach the browser's quota before ink limits;
existing visible save errors instruct JSON backup, without reporting success.
32MB is the file import ceiling, including snapshots; unlimited archives and
cloud sync are not provided. Very long strokes finish at the sample cap.

This feature stops at a committed/pushed work branch and **draft PR**. It is
not merged to main, auto-merge is not enabled, and no production deployment is
requested. PR #9 was the only authorized production release.
