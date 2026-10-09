# mmap cloud setup

This branch adds Google login, account-owned cloud documents, and revocable
read-only links. Local editing and JSON import/export work without cloud
configuration. The remote service is still pending setup; this document records
the code's configuration and the later setup and verification steps.

## Setup status and approved target

As of 2026-10-09, the approved target is a dedicated `mmap` project in the
`alibowbow` Supabase organization (`gbtgvjjpmiwjtncydbah`), Seoul
(`ap-northeast-2`), on the Free plan. Supabase infrastructure work must use the
Supabase plugin. Project creation is blocked because its `get_cost` call returns
`UNAVAILABLE`; no valid cost confirmation or dedicated project has been created.
The unrelated inactive `Ainew` project must not be reused.

The migration is staged in this repository only. No remote schema was applied.
Google OAuth credentials, provider settings, signup settings, redirect settings,
and persistent access need a later authorized secure setup step. Credentials
must not be requested or supplied through chat or committed to the repository.
No paid infrastructure, merge, or deployment is authorized by these instructions.

The existing Vercel target is `mmap` / `prj_3M18Q4Ryg9cN1Hno0M7u8LFn4dMm`, under
`team_uvD5XsiTVdnuN3xvOT1Eu0VD`, with Node.js 24. Its environment listing returned
HTTP 403. Resolve access through an authorized path before changing environment
values; do not bypass that denial with credentials, a CLI, or another account.

## Public application configuration

Copy `.env.example` to `.env.local` for local development. Both active values are
blank so an unconfigured checkout keeps cloud login disabled.

| Variable | Expected value | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The dedicated project's URL, such as `https://<project-ref>.supabase.co` | Browser Auth and Next.js cloud routes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's public `sb_publishable_...` key | Browser Auth and Next.js cloud routes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional legacy JWT with `role: "anon"` | Compatibility fallback when the publishable key is empty |

The key selection is `PUBLISHABLE_KEY || ANON_KEY`; a nonempty invalid
publishable key prevents fallback. Both client and server reject secret keys and
legacy JWTs with a role other than `anon`. The feature needs no service-role key,
database password, Google secret, or Supabase management token in the app.
`NEXT_PUBLIC_` values are included in the browser bundle, so only public project
configuration belongs there. Restart the development server after changing
`.env.local`. A later approved production build must receive the intended public
values at build time.

Next.js startup/build checks both public key variables before bundling, including
an unused legacy fallback. It rejects privileged keys and values that are neither
a publishable key nor an `anon` JWT, without printing the supplied value. This
check verifies the key type; it does not prove that the project or key is valid.

Implementation: `src/lib/cloudClient.ts`, `src/lib/cloud/server.ts`,
`next.config.mjs`, `scripts/public-cloud-config.mjs`.

## Google signup and returning login

The **Google로 계속하기** button starts
`signInWithOAuth({ provider: "google", options: { redirectTo: origin + "/" } })`.
The first successful flow creates a Supabase Auth account when new-user signup is
enabled. Returning users choose the same Google account to sign in. Signing in
to a browser's Google profile alone does not establish an mmap session.

The browser client uses `flowType: "pkce"`, `detectSessionInUrl: true`,
`persistSession: true`, and `autoRefreshToken: true`. Supabase redirects back to
the app root with an authorization code; the client exchanges it for a session.
There is no application `/auth/callback` route in this implementation. Finish
the flow in the same browser and on the same origin where it began so the local
PKCE verifier is available. Initialization removes the OAuth query
parameters from the address bar. Cancelled or failed login leaves local editing
available and shows an error. The app saves the local workspace before leaving
for Google. If browser storage fails, it stops the login redirect and asks the
user to export JSON first.

For the later approved setup, keep these two redirects distinct:

| Setting | Required target |
| --- | --- |
| Google OAuth client type | Web application |
| Google authorized JavaScript origins | Approved app origins, such as `https://mmap-psi.vercel.app`; local development may use `http://localhost:3000` |
| Google authorized redirect URI | The dedicated Supabase project's callback: `https://<project-ref>.supabase.co/auth/v1/callback` |
| Supabase Auth Site URL | `https://mmap-psi.vercel.app/` for the approved production target |
| Supabase additional redirect URLs | Exact app root URLs used by this code, including `http://localhost:3000/` for approved development |

An approved preview origin also needs its own allowed root URL because the code
uses `window.location.origin`. Google credentials are configured through the
authorized secure provider path, separate from application environment values.
Configure Google audience/consent and the basic `openid`, email, and profile
scopes for login. This feature requests no Google Drive access.

See the current [Supabase Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google),
[PKCE guide](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), and
[Google OAuth client documentation](https://developers.google.com/identity/openid-connect/openid-connect).

## Database migration and access model

Review `supabase/migrations/20261009152955_cloud_documents_and_revocable_shares.sql`
for the dedicated project. It was created with the pinned Supabase CLI and is
**staged only**. Apply it only after the project is explicitly selected and remote
schema changes are authorized, using the Supabase plugin. Do not run a blanket
grant or disable RLS to resolve an access error.

`public.cloud_documents` contains the owner ID, full portable document JSON,
revision, timestamp, and sharing state. Owner policies restrict select, insert,
update, and delete to `auth.uid() = owner_id`. A restrictive policy also requires
the signed Auth claim `is_anonymous` to be `false`; anonymous Auth accounts or a
missing claim cannot use the owner table even through the Data API directly.
Ownership and record identity are immutable; ordinary authenticated callers can
update document content only. Revision and timestamp changes are managed by a
trigger. Every owner API request validates its bearer JWT with Supabase Auth
`getUser`, rejects anonymous Auth accounts, and forwards that user's JWT to the
RLS-scoped Data API client.

Database constraints validate the document container, node/edge fields, and
selected graph/ink bounds. They cap compact JSON at 4 MiB and canonical JSONB
text at 8 MiB, preventing a direct Data API write from bypassing the cloud size
limit. Full import normalization and display validation remain at the Next.js
API boundary.

Keep the Data API enabled with `public` exposed, and keep `mmap_private` outside
the exposed schemas. The migration explicitly grants the required owner table
privileges and public RPC execution privileges. New tables require explicit
grants under current Supabase defaults; grants permit access to an object while
RLS determines which rows a caller can use. Anonymous visitors have no direct
`cloud_documents` table access.

`mmap_private.document_shares` stores one SHA-256 token hash per document, with no
table grants or policies for API roles. Public security-invoker wrappers expose
only the owner share operation and the narrow token lookup. The private definer
helpers have an empty search path and explicit execution grants; the share
mutation verifies the requesting owner before modifying a hash.
It also rejects anonymous Auth accounts and missing/nonfalse `is_anonymous`
claims, matching the owner table restriction.

Review current [Data API security guidance](https://supabase.com/docs/guides/api/securing-your-api)
and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
when applying the migration. The application uses Node.js cloud routes and the
pinned packages `@supabase/supabase-js` 2.117.3, `supabase` 2.120.0, and PGlite
0.5.8. Node.js 24 matches the existing Vercel configuration.

## Local documents, cloud saves, and recovery

Login does not upload a workspace. Select a local document, choose
**선택한 문서를 클라우드로 복사**, and confirm. This creates one cloud copy with a
new document identity; the local original remains in this browser. Only opened
or explicitly copied cloud records are registered for cloud autosave. Returning
to local documents keeps the Google session active; logout returns to the local
workspace and signs out this browser's session when it succeeds. A logout error
has two possible outcomes. If the Auth SDK clears its local session despite a
server error, the app returns to local documents, preserves account-scoped drafts,
and warns that server logout was not confirmed; sign in with the same account to
recover them. It does not restore stale credentials. If the SDK keeps the session
active, the app preserves the current document and pending drafts and asks the
user to retry. A late logout result does not change a newer signed-in account.

Cloud workspace caches and pending drafts are scoped to the account. Each
writer/tab has a distinct pending draft, so saving one tab's edits cannot clear
another tab's newer draft. Recovery data stays on this browser; it does not make
an unsaved edit available on another device.

Cloud records opened from the account panel also save account-scoped
acknowledgment metadata: the record/document identities, server revision and a
content fingerprint. Editing an account cache from the main document list
preserves an independent writer draft even after reload, when no autosave queue
binding exists. Before a server response replaces the cache, divergent browser
work is preserved and offered for explicit recovery, including edits made while
the fetch is pending. If the cached content's revision basis cannot be proved,
recovery opens a browser copy with a `(브라우저 복구)` title suffix. This also
applies to a previously opened cloud cache when its saved acknowledgment no
longer establishes that basis; metadata presence alone is not proof. The edited
title and body remain in the copy. The app does not infer an upload target from
a document ID or automatically upload that unknown-basis content.
Returning to local documents preserves recovery drafts, then clears the
autosave bindings and observed acknowledgment state from the previous account
workspace. A cache later restored or replaced by another tab cannot inherit
those runtime bindings as authority to upload stale content.
The previous editing context's drafts remain archived, and the new context uses
a new writer identity so editing the same document cannot supersede an earlier
independent browser draft during cleanup.

Opening a cloud document with pending drafts shows **저장 대기 내용 선택**.
Choose a dated draft with **저장 대기 내용 복구**, open **서버 최신본 열기**,
or cancel. Opening the server copy at this stage keeps all recovery drafts.
Recovering a draft does not silently choose or discard another tab's work; a
draft based on an older server revision enters conflict resolution.

The separate **브라우저 복구 문서** list also shows this account's pending browser
drafts when the server document was deleted or no cloud records remain. Opening
one creates an account-scoped browser copy with a new identity and a
`(브라우저 복구)` title suffix. It does not register that copy for autosave or
upload it. Edit or export it, then use **선택한 문서를 클라우드로 복사** and confirm
when a new cloud record is wanted. A successful copy of the unchanged selection
consumes only its exact recovery source; other writers' and newer drafts remain.
A failed copy or edits made while a copy is in flight leave the recovery work
available.

Edits to that browser recovery copy have their own writer draft in addition to
the account workspace cache. Another tab saving its workspace cannot consume
that independent draft or the original recovery source. The copy remains
browser-only until **선택한 문서를 클라우드로 복사** is explicitly confirmed.

In an account workspace, the main document-list menu uses **브라우저 사본 삭제**.
Its confirmation and completion message explain that only this browser copy is
removed; the cloud document and shared link remain active. To delete the server
record and invalidate its link, use **클라우드 문서 삭제** in the account panel
and confirm that action. Local-workspace deletion keeps its existing behavior.

| Status/action | Meaning and next step |
| --- | --- |
| 클라우드 저장됨 | The current registered document has been acknowledged by the server. |
| 클라우드 저장 대기 / 저장 중 | A local edit is queued or being sent. Keep the page open until completion. |
| 오프라인 / 저장 실패 | The server has not acknowledged the edit. Use **저장 다시 시도** after connectivity or the error is resolved. |
| 충돌 · 선택 필요 | Another writer changed the server revision. Autosave stops rather than overwriting that version. |
| 내 변경을 새 사본으로 저장 | Preserve the current changes as a separate cloud document. |
| 서버 최신본 불러오기 | After confirmation, discard the current tab's changes and its selected recovery draft, then load the latest server document. Other writers' drafts remain. |
| 브라우저 복구 문서 | Open an account-scoped browser copy, including when its server record is gone. Upload requires an explicit cloud-copy action. |
| Browser recovery storage unavailable | Export JSON before closing. In-memory edits are not a durable browser backup. |

Pending draft selection and discard apply to the selected draft rather than all
writers' drafts. A stale recovered draft still needs conflict resolution. After
session expiry, sign in with the same account to recover its browser drafts.
Switching accounts must not send the previous account's queued edits using the
new account's token. Browser caches and drafts remain after logout; on a shared
device, remove browser data after exporting any needed local documents.
If browser storage is blocked or full, available in-memory recovery lasts only
for the current page session; export JSON before reloading or closing it.

Cloud document JSON is limited to 4 MiB of UTF-8 content; the request boundary
allows a further 64 KiB for the envelope. Local JSON import remains limited to
32 MiB. Large local documents can stay local or be exported. Version 4/5/6
documents and ink version 4 use the existing portable import/export format.

## Read-only links

The owner chooses **읽기 전용 링크 만들기** after the document has saved. The URL
has the form `/share#token=<capability>`. Anyone with it can read the shared
display content without signing in. The viewer supports search, local branch
collapse, pan/zoom, appearance, and ink without entering the editor workspace.

One active token points to the latest saved document, so later successful saves
keep the same link valid. Reopening or reloading the viewer fetches that latest
version; there is no live push subscription. **새 링크 발급** rotates the token
and invalidates the previous link. **공유 끄기** revokes it; deleting the cloud
record also invalidates its link. These actions stop future lookups; an already
fetched copy cannot be taken back.

The token contains 32 random bytes (256 bits), encoded as 43 URL-safe characters.
The database stores only its hash, so an existing raw link cannot be recovered
after leaving the session that issued it. If the owner loses it, issue a new
link. The fragment stays out of the page request URL and the lookup sends the
raw token in a POST body with no-store handling. A stored hash is not a usable
capability.

Sharing returns a deep allowlist of display fields, including labels,
descriptions, links, tags, checklists, appearance, and ink. It excludes owner
identity, document history/snapshots, navigation to other private documents,
and token hashes. Review the display content before sharing; the allowlist does
not remove sensitive text that an owner intentionally put in visible fields.

## Verification scope and later live check

`npm run test:cloud` includes security, route, store isolation, and compatibility
checks. The SQL suite executes the actual staged migration in local PGlite with
synthetic Auth roles and `auth.uid()`, exercising real PostgreSQL grants, RLS,
revision behavior, and token rotation/revocation. Route tests mock Supabase
network responses. Local browser tests with mocked Auth/cloud endpoints verify
UI behavior and recovery flows, not a deployed Supabase service or Google OAuth.
Passing these checks does not establish live provider or Data API integration.

External Astra review of branch head `6e63337` identified two P1 data-loss cases
in cache/recovery editing and one P2 ambiguity in browser-copy deletion. Six
focused browser reproductions passed 0 of 6 on that head. Follow-up corrections
and regression tests are in the same draft PR. The final unit aggregate passed
222 checks with no failures or skips, including the authorized private original.
A scoped follow-up read-only review completed with 41 independent cache/queue/store
checks passing. The local mock production-browser suite passed 28 scenarios with
no failures or uncaught page errors. The blank-configuration production app also
passed startup, 23 IO checks with 13 downloads, nine editing checks and six
ink-tools check groups, with no page errors. Follow-up review also found related
P1 boundaries where retained
runtime bindings could autosave a stale account cache after returning to local
documents or newer same-document edits could supersede a previous context's
browser draft. These boundaries have their own corrections and regressions. The
scoped follow-up review is not an overall reapproval from the original external
Astra reviewer or a live-service acceptance result. See
[the verification report](../verification/cloud-sharing.md)
for the current executed results and their limits.

No successful Google OAuth flow, live Supabase project, applied remote migration,
or production cloud integration is verified yet. After authorized setup and a
later approved deployment, verify with disposable documents:

1. First Google signup, returning login, cancellation, refresh, and logout.
2. A selected local copy preserves its original and is editable on another
   signed-in device with the same account.
3. A second account cannot list, fetch, modify, or share the first account's
   records; an unauthenticated visitor cannot read the owner table.
4. Two writers cause a revision conflict without overwriting either version;
   explicit recovery/copy/latest choices preserve the intended drafts.
5. Offline retry, session expiry, account switch, and unavailable browser
   storage keep unsaved work visible and offer an export path.
6. Delete the last server record while a newer edit is pending, then sign in
   again after reloading. The standalone browser recovery list opens its draft;
   explicitly copying it consumes only that selected source and keeps other
   writers' drafts.
7. The same link shows a new saved version; rotation, revocation, and deletion
   prevent new lookups. A viewer remains read-only and excludes private fields.
8. After refresh, browser restart, account switch and offline editing, reopen an
   account cache from the main document list and then from the account panel.
   Its edits must remain recoverable before any server replacement. Repeat while
   a server GET is delayed and with missing legacy acknowledgment metadata.
9. Edit a browser recovery copy, save another account document in a second tab,
   then reload. The edited copy and its unconsumed source draft must remain;
   neither uploads until an explicit cloud-copy action.
10. Main-list **브라우저 사본 삭제** removes only the browser copy and says so;
    account-panel **클라우드 문서 삭제** removes the server record and invalidates
    the shared link.
11. Return to local documents, let another tab replace the account workspace
    cache, then open a different cloud record. The stale cached document must
    not autosave using a binding from the previous account workspace.

This checklist is a future verification plan. It is not authorization to create
infrastructure, change providers, apply a migration, or deploy.
