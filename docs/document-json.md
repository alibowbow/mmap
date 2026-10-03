# Portable document JSON (version 2)

Exports keep the existing `format: "mindforge-document"` identifier and add
`version: 2`. The `document` contains the existing title, nodes, edges, relations,
viewport and layout mode, plus a document-level `appearance` object. Import
validates the entire file before creating a new document with a new ID. It never
replaces the current document, even when the imported ID matches it.

## Design fields

`appearance` stores `theme`, `font`, `nodeStyle`, `levelFontSizes`, `edgeStyle`,
`edgeAnimated`, `edgeWidth`, `edgeColorMode`, `edgeLine`, `nodeTint`, `canvasBg`,
`accent` and `rainbowBranches`. These are the existing editor controls; no new
design system is introduced. The selected light/dark/system preference is saved
(a system theme follows the receiving device). Per-node content, visual overrides,
positions, explicit dimensions, measured geometry and collapsed state remain in
`nodes`. Relations, subtree layout modes and local snapshots are retained.

Existing local workspaces copy their saved global appearance into each document
once when loaded. Opening a document restores its own appearance. Design edits
update only the active document. Files lacking appearance use safe defaults
defined in `src/lib/appearance.ts`, independently of the recipient's design.

## Compatibility and validation

The importer accepts version 1, unversioned `{ document: ... }` wrappers and bare
document objects. It also accepts the `mindbranch-document` format alias. Missing
optional fields use defaults; present invalid fields fail with an understandable
message. Unknown future wrapper versions fail rather than being guessed.

Files and pasted JSON are limited to 10 MiB of UTF-8; documents to 20,000 nodes.
Coordinates must be finite and within ±1,000,000; dimensions must be positive.
Node IDs must be unique, parents must exist, and the tree must have one root and
no cycles. Relation endpoints must exist. Design enums, four level font sizes
(10–34), node content types and checklist entries are checked. Partial required
node fields are rejected. UI-only flags and unsafe executable link schemes are
not imported. Cross-document references retain their IDs; referenced documents
are not embedded in this single-document format.

All selectable fonts are served with the app. Jua and the other optional families
no longer depend on a Google Fonts stylesheet. Images wait for actual loaded
FontFaces, React Flow measurement and settled routes; unavailable fonts produce
an error instead of silently saving a substitute. Initial measurements when
opening a map only reroute edges, preserving saved manual coordinates. Explicit
editing/design changes and auto layout keep their existing placement behavior.

## Images and local URLs

The direct PNG/SVG actions and the export dialog use the same image pipeline.
Capture requests are serialized because html-to-image temporarily changes edge
SVG dimensions. Node and route bounds are included; PNG keeps the existing 2×
pixel ratio and 4096px logical dimension cap. Collapsed descendants stay hidden.
Downloads report that they started; the browser does not expose a reliable signal
to the app that the OS finished saving a file.

A local `?doc=...` URL only identifies a document in that browser's storage.
Moving a map to another device requires JSON export/import. The existing encoded
share-link feature is unchanged and does not replace a portable design backup.

## Regression commands

- `npm run test:io`: schema/legacy failures, geometry and store preservation.
- `npm run build && npm run test:io-e2e`: real file downloads, fresh-context
  import/reexport, reload, corrupt/future files, Korean text, manual geometry,
  PNG/SVG, font availability/failure and mobile/Fold viewport emulation.
- `npm run test:layout`, `npm run test:layout-integration`, `npm run test:e2e`
  cover the existing layout engine/editor regressions. `node tests/core.cjs`
  checks the document-library/outline paths.

The browser suite only creates isolated test workspaces. It does not access a
user's browser storage. `IO_DEV=1` runs a development server; `IO_SERVER_CWD`
can point to an unchanged checkout and `IO_BASELINE=1` diagnoses version 1.
Screenshots and downloaded fixtures are local verification artifacts, not
production documents. Physical Fold devices, Safari and Firefox are not covered
by Chromium viewport emulation.
