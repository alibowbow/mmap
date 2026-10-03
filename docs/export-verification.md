# Export/import verification — 2026-10-03

Base: `main` / `4cc2cd73434ab60a0316493e9fd118343ac5d227`. Vercel's production
deployment was linked to this commit, not the repository's default
`claude/mindforge-web-app-oapt8w` branch. No open PR or existing local work was
overwritten. No repository `AGENTS.md`, `CLAUDE.md`, `.agents/skills` or other
skill instructions were present on either remote branch.

## Observed in a real browser

Headless Chromium 140.0.7339.186, running the existing app's production bundle
locally. Tests used separate browser contexts and synthetic documents; no user
browser storage or documents were accessed.

- Unchanged production source: actual JSON export → empty browser context →
  import → reexport lost the workspace-wide Jua/vivid design. The recipient used
  `inter`; the old file had no appearance object. External Jua was unavailable
  in this test environment, which is not evidence of a production font outage.
- Unchanged source PNG download succeeded: 5064×3466, nonempty PNG bytes and
  visible rendered content. The earlier user-reported download-event timeout
  was not reproduced as an app failure.
- Version 2: actual file export/import/reexport and reload preserved the
  22-node Korean map (root + six branches), long labels, descriptions, tags,
  checklists, per-node overrides, collapse, positions, measured geometry,
  relations and document appearance. Import created a new ID and retained the
  preexisting sample.
- Corrupt/partial JSON, invalid fonts and future versions showed errors in the
  import dialog and disabled import; cancel retained the existing documents.
- Version 1 JSON used safe defaults. A file without measured sizes retained its
  manual positions after real DOM measurement.
- Repeated direct PNG downloads and dialog PNG generation produced valid
  4544×3466 files; wide manual coordinates produced a valid 8192×3466 file.
  PNG signatures, dimensions and rendered pixels were checked. SVG contained
  all 19 visible nodes (three descendants collapsed), actual edge paths and
  embedded Jua. Projected node/path bounds were inside the normal and large
  export frames. Default Pretendard SVG also embedded its fonts.
- All six selectable font families loaded from app assets. An injected font
  asset failure showed an error and disabled image download. PNG regeneration
  and rapid PNG→SVG switching completed without stale preview results.
- 360, 390, 768, 884 and 1440px viewport emulation: import/export had no horizontal
  overflow; export controls were at least 44px. Screenshots were visually
  inspected, including the Korean JSON preview and Fold-sized inner viewport.
- Existing editor browser suite passed: mobile/desktop widths, node editing,
  dragging, layout modes, PNG/SVG, relation/arrow/label, IME, undo and cancellation
  of an in-progress 3000-node worker operation. No page runtime errors.

## Verified by code/automated checks

- `npm run test:io`: 7 tests passed, including v1/bare/wrapper compatibility,
  complete design and snapshot/size preservation, UTF-8 limits, graph/field
  rejection, import failure immutability, per-document design switching and
  measurement-only position preservation.
- `npm run test:layout-integration`: 18 tests passed.
- `npm run test:layout`: 55 tests passed.
- `node tests/core.cjs`: document-library and outline regression passed.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: passed.
- `npm run test:io-e2e`, `npm run test:e2e`: passed against the final app bundle.

## Limits

Safari, Firefox, physical phones/Fold hardware, the original user's private map
and its exact PNG file were not tested. Viewport emulation is not a physical
device result. Successful file downloads in this suite do not prove every OS
download flow; the app therefore says the download started. A local font-asset
failure was deliberately injected rather than observed on production.

This work stops at a work branch and draft PR. Production/main are not merged,
auto-merge is not enabled, and no production deployment is requested.
