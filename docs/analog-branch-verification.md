# Analog branch expression — review record, 2026-10-03

## Released PR #10 (separate authorization)

The remote PR, main and checks were reread before release. The approved head
`98ab7764438360b9ada467be8fcb34fb12ddaf6d` and main
`a41c6ac340b151b7d645e1e7e76655e8a920301e` had not changed. GitHub Vercel
status and the preview check were successful. PR #10 was marked ready and
merged with an expected-head guard using a merge commit:
`00f233ff990530f87336acfe5b49af53d2d8ab02`.

Existing project `prj_3M18Q4Ryg9cN1Hno0M7u8LFn4dMm` production
`dpl_8PhtXP9ausgzna1TaDCofDWHxkNn` is READY at that exact merge SHA.
The deployment lookup by `mmap-psi.vercel.app` returned the same ID/SHA,
production target, alias and no alias error. On the public site, a new blank
synthetic board opened without nodes, accepted actual mouse drawing, restored
it after reload, exposed the six-tool toolbox, emitted an ink-bearing JSON v4
preview and generated a PNG preview. Public smoke checks did not inspect
local downloaded file bytes. Local production-browser file checks below did.
The user's existing documents, including the 22-node map, were not opened or
edited. The release result was reported before starting this refinement.

## Separate review branch and use

`codex/analog-branch-feel` starts from the released merge SHA. This additional
change is for a new **draft PR only**, not another production release. The
separate JEV default branch is untouched; no app/project/service/account,
dependency, credential, permission or paid integration was added.

Home → **빈 손그림 보드** → **아날로그 도구함 → 도구 → 브러시 → 손그림 가지**.
Draw branches anywhere along your own trajectory. **가늘어짐** adjusts the
root-to-tip taper and **가지 손맛** adjusts restrained edge/pigment variation.
**기본 붓터치** retains the released brush envelope for lettering/painting.
The optional start/end **유기적 가지** helper uses the new branch treatment
by default; it remains explicit assistance and is never applied to freehand
input automatically. Pen, pencil, marker and highlighter keep their roles.
**예제 → 새 문서로 가지 필치 비교 열기** opens a new editable comparison.
Existing marks retain their appearance unless the user explicitly selects and
applies new options. Selection, ink erasing and history operate as before.

## Geometry and portability

- `branchStyle: hand-v1` is a stored, versioned opt-in profile. Absent/classic
  styles retain the exact released renderer (a baseline path hash is tested).
- Width follows arc distance, not pointer-event/sample count: broad start to
  a continuously narrowing tip. Supplied pressure is spatially filtered into
  width; pressure-free mouse/finger samples still have a full taper.
- No input point is rewritten. Extra samples lie exactly on the existing
  smoothed centreline segments. Seed/style changes never offset that centreline.
  No random path wobble, automatic arrangement or semantic conversion exists.
- Symmetric slow edge variation is limited to 2.4% of radius at maximum feel.
  A light pigment core and up to 28 short fibres follow the same trajectory.
  One compound fibre path plus body/core paths, three path elements total;
  no filter, per-point element, bitmap overlay or external texture asset.
  Root caps have a short longitudinal extent to avoid round root blobs.
- Geometry/pigment paths are cached by immutable stroke. Subdivision retains
  every existing centreline sample and adds at most 1,024 points per stroke.
  Existing frame previews, memoization and debounced saves remain in place.
- New ink uses schema **v3 / document JSON v5**. Old documents continue to
  export v4 when they have no new ink/settings/snapshots. v1–v4 imports remain
  supported. Unknown profile/future ink rejects before store mutation. The old
  deployed app rejects v5 rather than silently losing the new design.
- Seed, feel/taper/profile, paper, transforms, paint order and world points
  survive autosave/reload, undo/redo, snapshots and real JSON file transfer.
  Paper/object/order edits never downgrade v3 ink. The screen and both image
  exports share the same paths. Bounds include all transformed marks.
- Existing limits remain 5,000 strokes, 12,000 points/stroke and 250,000
  points/document. Ink JSON v3–v5 has the existing 32MB ceiling; local browser
  storage can fill sooner. Its visible rescue notice and JSON export work.

## Final verification

TypeScript `npx tsc --noEmit`, lint and production build passed. Unit suites:
ink/studio/branch **21** (5 new branch checks), IO **7**, layout integration
**18**, engine **55**, plus `tests/core.cjs`: all passed. The checks cover
centreline invariance, distance-based taper, pressure fallback/smoothing,
deterministic seed/cache/fibre limits, exact released geometry, v1–v4 imports,
unsupported style/ink rejection, transforms, erasing/history/snapshots and
portable storage. No production source changes followed the final build.

Actual **Chromium 140.0.7339.186**, local production bundle, synthetic documents:

- Editable original IDEA GARDEN before/after: identical colour/width/points,
  only 18 explicitly identified freehand branches opt into hand-v1. Lettering
  and little drawings remain freehand. Reference pixels were privately inspected;
  the attachment and its specific artwork are not copied or published.
- Actual comparison PNG **5762×2430** and individual PNGs were exported through
  the UI and visually inspected. The SVG comparison contains 602 art items and
  2,074 elements; its 18 hand-v1 strokes have three paths each, no filters,
  geometry identical to the live screen, and all bounds inside the output.
- Actual JSON v5 download → new Chromium context file import → PNG export:
  **byte-identical PNG**. Reload retained all ink/paper/style/order/transforms.
- Real mouse freehand fallback; zoom/pan world coordinates; select, drag,
  rotate/scale, erase and undo/redo; switching back to classic brush: passed.
- CDP **simulated** pen pressure variation and pressure-free touch passed.
  Touch drawing, one-finger movement without ink and two-finger pinch passed
  at **320×720, 344×882, 674×842, 768×900**. Toolbox/dock screenshots inspected;
  selected-style hover keeps contrast. Smaller toolbox content scrolls.
- **100,000 points / 500 new branches**: 1,500 descendant SVG elements,
  **4,624,310 JSON bytes**, import/settle/autosave **7,984ms**, two-event pan
  **71ms**, successful reload. These include automation waits and concurrent
  regression work; they are runner measurements, not phone benchmarks.
- Accumulated synthetic documents exceeded Chromium local quota: the existing
  warning appeared, all 500 live strokes remained visible and a real rescue
  JSON download retained them. The successful performance/save test used a
  separate clean context, preserving the other test documents.
- Existing studio, basic ink, IO/font/image export and editor/layout browser
  regressions passed. Both old examples still yield identical PNGs after actual
  file transfer. Legacy node edit/drag, world coordinates, IME, histories,
  malformed imports, six fonts/font-error protection, exports, mobile layout
  and 3,000-node worker cancellation passed. No page runtime errors.

Results: `verification/branch-browser.json`, `verification/studio-browser.json`,
`verification/ink-browser.json`, `verification/layout-browser.json`,
`verification/pr10-production.json`. Reproduce after `npm run build` with
`npm run test:branch-e2e`, `test:studio-e2e`, `test:ink-e2e`, `test:io-e2e` and
`test:e2e`. PNGs are delivered separately, not committed.

## Limits

This is restrained vector pigment, not a wet-paint physics simulation. Junctions
are drawn manually; no automatic union or snapping changes the user's geometry.
Very different branch widths/colours or widely separated starts can still show
an intentional seam. New taper is evaluated over the current whole stroke;
a preview may narrow as its endpoint grows, then becomes fixed on commit.

Physical Galaxy Fold/S Pen pressure, palm rejection, Safari/Firefox and external
SVG illustration editors are **unverified**. The existing SVG foreignObject
compatibility limitation remains. No handwriting recognition or AI conversion.
