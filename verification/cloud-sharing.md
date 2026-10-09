# Cloud sharing verification — 2026-10-09

Integrated the uncommitted checkpoint on `codex/supabase-cloud-sharing`, based on
`main` commit `c98fa454c573e5d9759a013c96c0c49ee3050993`. The checkpoint archive's
size and SHA-256 matched the supplied reference. `HANDOFF.md` was read before
restoration. Remote main was unchanged and no existing cloud branch or open PR
was overwritten. No main merge, remote schema change, or production deployment
was performed.

## Executed checks

| Check | Result | Scope |
| --- | --- | --- |
| Locked dependency installation | Passed | `npm ci` |
| TypeScript | Passed | `npx tsc --noEmit` |
| ESLint | Passed, no warnings | `npm run lint`, including viewer cleanup |
| Production build with local mock public configuration | Passed | Next.js build; public test configuration only |
| Production build with all public cloud values blank | Passed | Existing local-only operation remains available |
| Layout, layout integration, IO, ink, and cloud tests | 207 passed; 0 failed; 0 skipped | Final application source, with the authorized private fixture enabled |
| Cloud production-browser scenarios | 18 passed; 0 failed; 0 uncaught page errors | Chromium 140.0.7339.186, local HTTP mocks only |
| Existing JSON/image IO browser regression | 23 checks; 13 downloads; 0 page errors | Clean unconfigured production build, fresh Chromium contexts |
| Existing ink editing browser regression | 9 checks; 0 page errors | Masks/transforms/undo, v6 export/reload/import, 375 px UI |
| Ink tools browser regression | 6 check groups; 0 page errors | Marker readability, persistence, 320/375 px no-overlap and unforced mode/account actions |
| Independent security and data-loss review | No remaining blocker/P1/P2 found in the reviewed scope | Owner authorization/RLS, sharing projection, recovery, account boundaries, delayed actions, and SDK logout behavior |

The aggregate command was:

```sh
MMAP_PRIVATE_FIXTURE=/private/path/to/document.json node --import tsx --test \
  tests/layout-engine/*.test.ts tests/layout-integration/*.test.ts \
  tests/io/*.test.ts tests/ink/*.test.ts tests/cloud/*.test.ts
```

An intermediate build left an empty `pages-manifest.json`
despite CLI exit 0; production startup caught that failure before publication.
A clean rebuild completed optimization/traces and the full route table. All
production JSON manifests were parsed and checked before final browser reruns.

The earlier 203-pass/1-skip result was superseded by this full run after the
logout and mobile-toolbar corrections and new private-document tests. The private file is supplied
only through `MMAP_PRIVATE_FIXTURE`; its contents are absent from the repository.
Without that file, the optional private-document tests skip rather than embed a
replacement fixture.

The browser suite exercises mocked Google PKCE/session reload, explicit selected
copy and local isolation, owner autosave, retry/offline/expiry/storage failures,
two-tab compare-and-swap and explicit recovery, recovery after remote deletion,
latest-navigation/account boundaries, delayed conflict/delete responses, the
SDK's failed-server-logout outcome, capability creation/rotation/revocation,
read-only viewer controls and palette/ink, and legacy `#m` links. Viewer/account
screenshots were inspected; the viewer had no page overflow at 390/768 px. The
suite uses fresh Chromium contexts, not a user's signed-in browser profile.

To reproduce only these **local mock** scenarios, build with the mock endpoint,
then run the script; do not use these test values as service configuration:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:43121 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_browser_test_only npm run build
npm run test:cloud-e2e
```

`tests/e2e/cloud-workspace.cjs` owns its mock Auth/cloud server on port 43121,
production app on port 43122, and browser, and closes them when it finishes. Its
fixtures and saves use the production v6 validator/projection. Auth/cloud HTTP
results are simulated; the separate SQL suite tests actual RLS. Rebuild with
the intended public configuration before other acceptance testing or deployment.

## Actual private-document verification

The approved original was materialized into this execution environment through
its exact Library reference, then read and compared byte-for-byte with the
attached copy: 510,851 bytes, JSON v4, 749 nodes, and 748 edges. Hash checks before
and after testing confirmed that both copies remained unchanged. No private
content, exported copy, browser image of that content, or credential was added
to the repository or PR.

`tests/cloud/compatibility.test.ts` exercises the original's portable import,
export, and public projection. `tests/cloud/private-roundtrip.test.ts` further
exercises the existing local save/reload functions, production owner/share
handlers and Supabase SDK, and the actual staged SQL migration in PGlite:

- Import the original, save/reload its local workspace, and export it faithfully
  as v4.
- Create, fetch, update, and refetch an owner record; compare every node, edge,
  appearance and other persisted document field with actual JSONB data.
- Verify other-owner denial, anonymous table denial, SQL/API display-projection
  parity, preservation of the private owner copy, revocation, and deletion.
- Separately test an **in-memory derivative** with synthetic ink v4 and a
  snapshot, exporting v6 while retaining the original nodes/edges/appearance.

The local-storage interface and Auth/Data API HTTP transport are mocked. SQL,
grants, RLS, revision triggers, and share RPC functions execute in a real local
PostgreSQL engine through PGlite. This is an actual-original regression check;
it is **not a live Supabase or Google OAuth acceptance test**.

## Review corrections

The known per-writer API/type mismatch and viewer ref-cleanup warning were
resolved. Additional checks led to restrictive permanent-account RLS, direct
Data API document bounds, safe constraint errors, immutable per-write recovery
cleanup, owner-scoped recovery for deleted server records, request-generation
and document-fingerprint guards, and build-time rejection of privileged public
configuration.

Browser verification also identified two integration issues: shared ReactFlow
wrappers prevented child-button pointer interaction, and list refresh cleared
a warning about preserved concurrent edits. Both were corrected. The installed
Auth SDK may clear its local session despite a failed remote logout; this now
returns locally with preserved drafts and a clear warning, without restoring
stale credentials or changing a newer account.

Visual regression checks found the floating account entry covering mobile ink
controls. The mobile entry is now compact and below the header, with the full
account name/status retained for assistive technology. The account dialog still
provides the local-workspace action. Regression checks use rectangle overlap and
real lasso/eraser/pan clicks at 320/375 px rather than fixed-position expectations.

## Not executed and remaining setup

No live Google signup/login, deployed Supabase Data API/RLS check, cross-device
cloud acceptance test, or production cloud integration succeeded or was claimed.
Physical pen/touch hardware was not tested. No real-time collaboration or media
upload was implemented.

1. Restore the Supabase plugin's `get_cost` capability. Its attempted call
   returned `UNAVAILABLE`; therefore no dedicated `mmap` project or valid cost
   confirmation exists. The approved target remains the `alibowbow` organization,
   Seoul `ap-northeast-2`, Free. The unrelated inactive `Ainew` project was not
   touched.
2. Through the authorized plugin path, select/create the dedicated project and
   review/apply the staged migration after remote schema authorization. Keep
   `mmap_private` outside exposed schemas.
3. Complete Google Web OAuth consent/client and Supabase provider/signup/root
   redirect settings through an authorized secure path. No secret or persistent
   access setting was created or changed here.
4. Resolve Vercel environment access. Listing the existing project's environment
   returned HTTP 403; no alternate credentials, CLI, or account were used to
   bypass it. Set only the approved project's public URL and publishable key
   through authorized access.
5. After a later approved deployment, execute the live checks in
   [cloud-setup.md](../docs/cloud-setup.md). The draft PR does not authorize a
   main merge or production deployment.
