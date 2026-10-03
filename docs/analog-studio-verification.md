# Analog mind-map studio — verification, 2026-10-03

> Release follow-up, 2026-10-03: the user subsequently approved PR #10.
> It was merged at `00f233ff990530f87336acfe5b49af53d2d8ab02`; production
> `dpl_8PhtXP9ausgzna1TaDCofDWHxkNn` is READY at that exact SHA and
> `https://mmap-psi.vercel.app/` resolves to it. The checks below are the
> historical pre-release record. The separate branch-expression review is
> documented in [analog-branch-verification.md](analog-branch-verification.md).

Continues draft PR #10 on `codex/handdrawn-mindmap`, parent
`4e31c67aff9a2c13a77e2b752e61daa45b4c15a1`, base main
`a41c6ac340b151b7d645e1e7e76655e8a920301e`. The latest remote PR was still
open/draft/unmerged with those refs before publication. No new app, repository,
Sites/Vercel project, account, dependency or paid service was created. The default
branch's separate JEV work was left untouched. This PR is not a production release.

## Workflow

Home → **아날로그 모드 · 빈 손그림 보드** opens a genuinely empty board with
no root node. The default is a freehand pen. Write words, draw branches and
colour pictures anywhere. Node creation, automatic layout, branch conversion
and handwriting recognition are not prerequisites. Existing node documents
still have their digital editor and may optionally overlay ink.

- **그리기**: freehand pen, pencil, marker, highlighter or brush. Choose tools,
  1–64 world-pixel width, colour, opacity and relevant texture/taper options in
  **아날로그 도구함 → 도구/색**. Three palettes, six basic colours and eight
  document-specific recent colours are available.
- Pencil has seeded grain with paper showing through. Pen has a clear thin
  rounded line. Marker has a broad band, flat ends and a light seeded streak.
  Highlighter uses group alpha, so independent overlapping strokes darken.
  Brush has a tapered width envelope even for pressure-free mouse/finger input.
  Supplied pen pressure affects pen/pencil/brush width; marker/highlighter keep
  their broad nib. Original unstyled v3 ink keeps its old geometry.
- Freehand uses midpoint quadratic smoothing following the actual trajectory,
  capped at twice the stored sample count. Optional **유기적 가지** is a
  start/end curved, tapered assistance tool with bend and taper controls.
  It is never applied automatically to freehand marks.
- **선택**: pick a frontmost stroke, picture or label; drag in world coordinates.
  The compact row changes scale (15% steps), rotation (15° steps), front order
  and deletion. The toolbox applies style changes or sends it behind other ink.
  Each committed transform/style/order action is undoable.
- **그림/글씨**: ten original basic vector motifs (circle, box, arrow, star,
  leaf, bulb, heart, book, sun, cloud), optional fill, tap or drag to set size.
  Optional single-line label input (40 characters in the UI) has colour and
  size controls. Freehand lettering remains fully independent of labels.
- **종이**: existing canvas, white, cream or kraft plus seeded grain strength.
  Paper belongs to the document and is included in history and exports.
- **이동**: one-finger/mouse pan. Two fingers pan/zoom in drawing/selection
  modes and discard pending drawing. Zoom +/- and fit reserve the bottom dock
  and safe area. Drawing, selection and navigation are separate modes.
- **지우개** removes whole touched ink/art items, never nodes. Whole clear asks
  for confirmation, preserves paper/nodes and is undoable. Pointer cancellation,
  second-contact navigation, lost capture, blur and Escape discard previews.

## Persistence and rendering

JSON **v4** contains ink schema v2: brush/style/seed, all world points and
pressure, objects, transforms, explicit paint order, paper and per-document
settings. Existing v1/v2/v3 and unversioned documents import safely as copies;
legacy ink schema v1 remains supported. Invalid/future tools, seeds, paper,
transforms, objects or non-permutation paint orders reject the entire import
before changing the current document. Snapshots, duplicate/switch, autosave,
refresh and undo retain complete ink state. URL sharing is disabled for ink or
object-only art to avoid silent loss; use JSON.

The same SVG components and path geometry render on screen and in PNG/SVG.
Paper expands to the export frame, then restores its camera-sized DOM. All
rotated/scaled art contributes to bounds; transient previews and selection
outlines are excluded. PNG is 2× the SVG frame, up to 8192×8192. SVG export uses
the existing HTML foreignObject capture pipeline; browser viewing works, while
some vector illustration applications may not support foreignObject content.

Committed marks are memoized. Immutable per-stroke path, smoothed-points and
bounds caches, frame-based local previews, shared history references and
post-commit debounced storage avoid serializing/redrawing all ink on each move.
Texture uses one bounded compound-path pattern per textured stroke: 12 small
pieces; paper uses 32 pieces. It does not create an element per ink sample.
Limits remain 12,000 samples/stroke, 5,000 strokes, 250,000 samples/document;
objects have a 1,000-item cap. v3/v4 ink files allow 32MB including snapshots;
other legacy files retain 10MB. localStorage quota may be reached sooner; the
existing visible save-failure notice advises JSON backup and document cleanup.

## Final checks

- TypeScript, lint and production build passed; no new dependencies.
- IO/storage 7; ink/studio 16 (10 existing + 6 new); layout integration 18;
  layout engine 55; `tests/core.cjs`: passed.
- New unit checks cover deterministic style/texture, pressure and fallback
  geometry, all-freehand example content, transformed bounds/hit testing,
  swept object eraser, paper/transform/order undo and snapshots, JSON round trip,
  malformed/future rejection without mutation and 100k textured samples.
- Node 100k textured points / 500 strokes: ~4.61MB; validation and cached path
  construction about 242ms on this runner. Full 250k-point ink over 10MB imports
  within the 32MB ceiling. These are runner measurements, not phone benchmarks.

## Real browser and input simulation

Chromium **140.0.7339.186**, final local production bundle, independent browser
contexts and synthetic test documents. The user's existing 22-node map was not
opened or modified. The attached reference pixels were inspected privately;
its image file and specific artwork are not included in this repository or demo.

- The original editable **생각의 정원 / IDEA GARDEN** contains **299 freehand
  ink strokes, zero nodes, zero text objects/stamps and no assisted branches**.
  Its branches, thin lettering, pencil shading and doodles use stored point
  trajectories. It is an editable example, not a claim of physical handwriting.
  The comparison sheet shows six visibly distinct profiles and overlap samples.
  Exported PNG pixels were inspected directly; overlapping captions/doodles were
  repositioned and the final pixels checked again.
- Actual mouse input drew all six tool profiles, handwritten **GROW**, pencil
  hatching and a leaf outline without any node/text/shape/recognition tool.
  Pressure-free points stored constant input pressure; brush taper still varied.
- CDP simulated pen pressure changes reached stored samples and brush geometry.
  CDP single-touch drawing, two-finger pan/zoom without committing pending ink,
  touch cancellation and Escape cancellation passed. These are simulations.
- Stroke and object selection after pan/zoom, translation/scale/rotation,
  front/back order, reversible deletion, paper undo/redo, ink-only erase and
  confirmed whole-clear/restore passed.
- Actual JSON file downloads → fresh browser file imports → PNG reexports were
  **byte-identical** for both examples. Autosave and reload retained all styles,
  seeds, paper, order and art. PNG and SVG preserve texture/alpha/layers and every
  transformed bound; exported SVG omits selection/preview layers.
- Final PNG comparison: **2240×2286**; garden: **2842×1938**. Exported garden SVG
  had 1,021 elements for 299 strokes; comparison had 142. Paper/ink seeds and
  layer order were inspected in SVG. Files are provided separately, not committed.
- 320×720, folded Fold 344×882, inner Fold 674×842 and 768×900 viewports: dock
  stays inside the screen, controls ≥44px, toolbox fits, fit zoom remains usable.
  Desktop and folded/inner screenshots were visually inspected.
- 100k mixed pencil/marker points / 500 textured strokes: 3,500 ink SVG elements,
  ~4.60MB JSON; real file import + settle/save around 5.7s including automation
  and waits, a two-event pan about 50ms. Reload retained all 500 strokes.
- Existing ink browser regression passed (overlay node edit/drag/undo,
  cancellation, erase, legacy files, real JSON downloads, output boundaries,
  100k legacy points / 1,000 strokes). Existing IO and editor browser regressions
  passed: malformed files, six fonts/font failure, PNG/SVG, manual coordinates,
  IME, layouts/relations, undo/mobile and 3,000-node worker cancellation.
  No page runtime errors were observed.

Raw results: `verification/studio-browser.json`, `verification/ink-browser.json`,
`verification/layout-browser.json`. Reproduce with `npm run build`,
`npm run test:studio-e2e`, `npm run test:ink-e2e`, `npm run test:io-e2e` and
`npm run test:e2e`. Production deployment was not requested.

## Practical limits

Selection is single-item; multi-select/group transforms, arbitrary vector import,
editable path control points, curved text binding and a fill-bucket are not
implemented. Colour freely by overlapping marker/pencil strokes or using the
optional filled shapes. This is stylized vector analog ink, not wet-media fluid
simulation. Objects/labels are optional helpers; freehand is the default.

Physical Galaxy Fold/S Pen pressure or palm rejection, Safari/Firefox and desktop
SVG illustration software were not verified. Best-effort ignore-touch-during-pen
logic is not a palm-rejection guarantee. No AI conversion, handwriting recognition,
new accounts, cloud sync or paid tools were added. PR #10 stays draft/unmerged;
main and the existing production site are unchanged.
