# Analog editing verification

Validated from the production bundle in Chromium 140.0.7339.186.

- `npm run test:ink`: 68 passing tests for legacy geometry, curve editing, visible junctions, local erasure masks, lasso/group movement, materials, history, snapshots, JSON and storage.
- `npm run test:io`: 7 passing tests for portable imports and atomic rejection.
- `npm run build`: compilation, TypeScript, ESLint and static generation passed.
- Existing ink, studio and branch browser suites passed, including actual downloads, fresh-context PNG equality, 320–1440px layouts, simulated touch/pen and 100,000 samples.
- New `npm run test:editing-e2e` checks actual connection assistance, Korean branch labels, curve-handle drag, partial erase/cancel/undo/redo, visible hit testing, lasso selection, group movement/scale/rotation, whole-item erase, autosave and fresh-context v6 JSON import.
- Export pixel sampling confirms the erased point changes from red to paper colour while the surviving point stays red; fresh-import PNG is byte-identical.
- The 375px toolbar and tool dialog fit the viewport. The selected-curve toolbar was also inspected at 320px.

Generated browser artifacts are under ignored `verification/editing/`; the complete new suite result is in `analog-editing-browser.json`.

Partial-erased strokes deliberately disable curve editing, with a visible explanation. Existing unedited strokes keep the released renderer. Physical pen latency and palm rejection were not tested on hardware.

## Direct tools and marker readability

- Six drawing tools are available directly on the dock; selecting one from selection/erase mode returns to drawing without opening a modal.
- The home action is `손그림` and drawing options are `그리기 도구`.
- Marker selection starts with paired pastel colours and opacity 0.42; highlighter opacity is 0.8 before the existing renderer multiplier. Pen selection restores dark writing colours. Same-tool selections retain explicit settings.
- `npm run test:ink-tools-e2e` passed in Chromium: actual marker drawn above Korean text, 996 black-core and 1,053 paper pixel samples; conservative contrast 6.04 and 100% of black-core samples remain dark.
- 320px/375px layouts have no horizontal overflow and all six tool buttons and colour chips are 44×44px. Autosave/reload preserves the new marker stroke.
- Studio and editing browser suites passed again after the UI changes. Full quick-tool results are in `ink-tools-browser.json`; PNG/SVG artifacts are under ignored `verification/ink-tool-access/`.
