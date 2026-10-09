# Cloud sharing verification — 2026-10-09

Integrated the uncommitted checkpoint on `codex/supabase-cloud-sharing`, based on
`main` commit `c98fa454c573e5d9759a013c96c0c49ee3050993`. The checkpoint archive's
size and SHA-256 matched the supplied reference. `HANDOFF.md` was read before
restoration. Remote main was unchanged and no existing cloud branch or open PR
was overwritten. No main merge, remote schema change, or production deployment
was performed.

The follow-up on draft PR #13 addresses two P1 data-loss findings and one P2
deletion-scope finding from external Astra review of branch head `6e63337`.
Six focused browser cases reproduced all three findings on that head: **0 of 6
passed before the fixes**. Backend routes and the staged SQL migration are
unchanged by this follow-up. Final unit checks, the local mock production-browser
suite, local-only IO/editing/ink-tools regressions and a scoped follow-up review
have completed. An overall reapproval from the original external Astra reviewer
is not claimed. The earlier branch results alone did not cover these corrections.
Follow-up review also identified related P1 boundaries: runtime bindings retained
after returning to local documents could give a reloaded stale account cache
authority to autosave, and new edits after rehydration could supersede an earlier
same-document browser draft. Their corrections and additional regressions are
included in the same follow-up and covered by the final unit, scoped-review and
local mock production-browser runs.

## Executed checks

| Check | Result | Scope |
| --- | --- | --- |
| Locked dependency installation | Passed | `npm ci` |
| TypeScript | Passed | Post-build `tsc --noEmit --incremental false` on frozen source |
| ESLint | Passed, no warnings | Post-build `npm run lint` on frozen source |
| Production build/start with local mock public configuration | Passed | Full optimization, route table and traces; production JSON manifests valid; actual startup passed in browser suite; public test configuration only |
| Production build/start with all public cloud values blank | Build exited 0; actual production startup passed | Nonempty BUILD_ID and six valid core manifests; startup corroborated by the IO suite |
| Layout, layout integration, IO, ink, and cloud tests | 222 passed; 0 failed; 0 skipped | Existing 207 + 14 cache checks + 1 queue check; authorized 749-node/748-edge private fixture enabled |
| Cloud production-browser scenarios | 28 passed; 0 failed; 0 uncaught page errors | Chromium 140.0.7339.186; original 18 + six baseline cases + two legacy/delayed-GET + two context-boundary cases; local HTTP mocks only |
| Existing JSON/image IO browser regression | 23 checks; 13 downloads; 0 page errors | Clean unconfigured production build, fresh Chromium contexts |
| Existing ink editing browser regression | 9 checks; 0 page errors | Masks/transforms/undo, v6 export/reload/import, 375 px UI |
| Ink tools browser regression | 6 check groups; 0 page errors | Marker readability, persistence, 320/375 px no-overlap and unforced mode/account actions; six screenshots visually checked |
| Follow-up scoped security and data-loss review | Completed; independent cache/queue/store checks 41 passed | Original two P1/one P2 fixes and related context boundaries; not an overall external Astra reapproval or live-service review |

The aggregate command was:

```sh
MMAP_PRIVATE_FIXTURE=/private/path/to/document.json node --import tsx --test \
  tests/layout-engine/*.test.ts tests/layout-integration/*.test.ts \
  tests/io/*.test.ts tests/ink/*.test.ts tests/cloud/*.test.ts
```

An earlier intermediate build left an empty `pages-manifest.json`
despite CLI exit 0; production startup caught that failure before publication.
A clean mock-configuration rebuild completed optimization/traces and the full
route table. Its production JSON manifests were parsed and checked before the
final browser rerun. The final blank-configuration build exited 0 with a nonempty
`BUILD_ID` and six valid core manifests, although its console log ended during
static-page progress rather than showing the full final route table. Actual
production startup and the successful IO/editing runs corroborated that bundle.

Before the external findings, head `6e63337` passed 207 unit tests and 18 cloud
browser scenarios, plus the existing IO, editing and tools regressions. Those
checks did not cover the six subsequently failing reproductions. The prior
203-pass/1-skip result was already superseded by that 207-test run. The private file is supplied
only through `MMAP_PRIVATE_FIXTURE`; its contents are absent from the repository.
Without that file, the optional private-document tests skip rather than embed a
replacement fixture.

The browser suite exercises mocked Google PKCE/session reload, explicit selected
copy and local isolation, owner autosave, retry/offline/expiry/storage failures,
two-tab compare-and-swap and explicit recovery, recovery after remote deletion,
latest-navigation/account boundaries, delayed conflict/delete responses, the
SDK's failed-server-logout outcome, capability creation/rotation/revocation,
read-only viewer controls and palette/ink, and legacy `#m` links. Follow-up cases
cover cached main-list editing across refresh, browser restart, account switch
and offline use; an edited recovery copy after another tab saves; explicit
browser-copy deletion; edits during a delayed server GET; and missing legacy
acknowledgment metadata. Additional cases check returning to local documents
before another tab replaces the owner cache, then opening a different cloud
document without uploading that stale cache, and retaining prior same-document
browser drafts across context rehydration and later cleanup. Viewer/account
screenshots were inspected; the viewer had no page overflow at 390/768 px. The
suite uses fresh Chromium contexts, not a user's signed-in browser profile.

Follow-up browser assertions accept an explicit browser-recovery title suffix
while requiring the same edited title/body and no implicit upload. Cross-tab
setups first establish the current server revision, and delayed-GET cases hold
the response until the intended navigation occurs. These harness refinements
avoid treating safe recovery, an already-stale setup or an elapsed delay as a
new application defect; the original six failing baseline reproductions remain
separate evidence.

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

The follow-up fixes the externally reproduced findings:

| Finding | Reproduced behavior | Follow-up correction |
| --- | --- | --- |
| P1: cached cloud document edited from the main list | After reload or switching documents, the cache lacked a queue binding; opening its server record could replace edits. Four focused cases cover refresh, restart, account switch and offline use. | Persist account-scoped acknowledgment metadata and independent writer drafts for cache edits. Before accepting a server GET, compare the cached document and preserve divergent work for explicit recovery. |
| P1: edited browser recovery copy | Its edits depended on the shared account workspace cache; another tab's save could replace that cache and lose the copy after reload. | Give the browser copy an independent writer draft, retain its unconsumed source draft and recover it without automatic upload. |
| P2: main document-list deletion | The generic delete action/message removed only a browser copy while the cloud record and shared link remained active. | Label and confirm **브라우저 사본 삭제**, then explain in the completion toast that the cloud document and shared link remain. Actual server deletion remains **클라우드 문서 삭제** in the account panel. |
| Related P1 found during follow-up review: stale cache after leaving the account workspace | Runtime queue entries and observed acknowledgment state survived returning to local documents. Another tab could replace the account workspace with stale content; opening a different cloud record could then enqueue that content using the previously observed revision. | Preserve recovery drafts before leaving the account workspace, then clear queue bindings and observed runtime acknowledgment state. Reloaded account cache alone must not authorize an implicit upload. |
| Related P1 found during follow-up review: an earlier draft after cache rehydration | A new editing context for the same document could supersede an earlier browser draft. | Archive prior context drafts and rotate the writer identity when observed bindings are cleared. Later writes and exact-key cleanup must retain those independent drafts. |

Shared cache metadata alone does not prove the basis of a divergent document.
When the cached revision basis cannot be proved, including absent or ambiguous
metadata or divergent content despite a saved acknowledgment, recovery creates
a browser copy with a `(브라우저 복구)` suffix. It preserves the edited title/body
and avoids registering an unknown record for autosave. A delayed GET also
preserves edits made while its response is pending. A scoped read-only follow-up
review verified these paths, draft archiving/writer rotation, queue-generation
guards, exact copy-source cleanup, quota/account isolation and desktop/mobile
delete confirmation. Its independent cache/queue/store run passed 41 of 41
checks. It found no remaining blocker/P1/P2 in those reviewed fixes and context
boundaries; that limited result does not establish an overall external Astra
reapproval or live Google/Supabase integration. Production-browser evidence is
recorded separately above.

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
