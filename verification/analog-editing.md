# Analog editing verification

Validated from the production bundle in Chromium 140.0.7339.186.

- `npm run test:ink`: 62 passing tests for legacy geometry, curve editing, visible junctions, local erasure masks, lasso/group movement, materials, history, snapshots, JSON and storage.
- `npm run test:io`: 7 passing tests for portable imports and atomic rejection.
- `npm run build`: compilation, TypeScript, ESLint and static generation passed.
- Existing ink, studio and branch browser suites passed, including actual downloads, fresh-context PNG equality, 320–1440px layouts, simulated touch/pen and 100,000 samples.
- New `npm run test:editing-e2e` checks actual connection assistance, Korean branch labels, curve-handle drag, partial erase/cancel/undo/redo, visible hit testing, lasso selection, group movement/scale/rotation, whole-item erase, autosave and fresh-context v6 JSON import.
- Export pixel sampling confirms the erased point changes from red to paper colour while the surviving point stays red; fresh-import PNG is byte-identical.
- The 375px toolbar and tool dialog fit the viewport. The selected-curve toolbar was also inspected at 320px.

Generated browser artifacts are under ignored `verification/editing/`; the complete new suite result is in `analog-editing-browser.json`.

Partial-erased strokes deliberately disable curve editing, with a visible explanation. Existing unedited strokes keep the released renderer. Physical pen latency and palm rejection were not tested on hardware.
