# MuaSamMini — Project Scope and Quality Gates

## Goal

Build a small, mobile-first shopping list app with HTML, CSS, and JavaScript. V1 uses browser-local storage and is prepared for PWA use and a future GitHub Pages release. This document records approved scope; it is not evidence that implementation or release has happened.

## Scope

### V1

- Add, edit, delete, and mark an item purchased/unpurchased.
- Persist the list in `localStorage` across reloads in the same browser profile.
- V1 supports operations in a single tab only. Concurrent use across multiple tabs and guaranteed cross-tab synchronization are outside V1 scope. Storage failures in the supported single-tab flow must be handled without silent data loss.
- Responsive, mobile-first interface.
- PWA manifest, installable assets, and offline app-shell support.
- GitHub Pages is the target for V1, but no remote, repository, push, or publication is approved yet.

### V1.1

- Add a single action to remove all purchased items.
- Ask for confirmation before deletion. If the user cancels, keep all items unchanged.
- No categories, quantities, search, or other unapproved additions.

## Acceptance criteria

### V1

1. A user can add a non-empty item, edit it, remove it, and toggle purchased state.
2. The list persists after reload in the same browser profile.
3. Invalid or unavailable localStorage is handled without silently overwriting recoverable data; the app gives a clear error state.
4. Item text is rendered safely as text; it cannot inject markup or script.
5. Core actions are usable on a narrow mobile viewport, with semantic controls, keyboard access, and visible focus.
6. PWA manifest, icons, start URL, scope, and service-worker paths work below the GitHub Pages repository subpath (not only at `/`).
7. After first successful load, the app shell opens offline. User list data remains local and is not included in network/cache requests.
8. At the later V1 release gate, validate the actual HTTPS Pages URL and confirm there are no browser console errors in core flows.

### V1.1

1. The clear-purchased action removes only purchased items after explicit confirmation.
2. Cancelling confirmation leaves storage and the visible list unchanged.
3. The action handles storage errors without reporting a false success.

## Data and PWA quality gates

- Use a versioned storage key/schema and validate data on read. Do not replace malformed content silently; surface an error and preserve the original value where possible.
- Do not add network sync, analytics, third-party tracking, or remote storage.
- Test service-worker install/update/cache cleanup at the Pages subpath. Cache only required static app assets; do not cache list data.
- Keep V1 and V1.1 acceptance checks separate so the V1.1 bulk-delete feature is not accidentally pulled into V1.
- Exact build/test commands are **TBD** until implementation files exist. Report observed commands and outcomes; do not claim unrun checks passed.

## Reviewer Policy B

| Risk | Required review |
|---|---|
| LOW | Independent AGY Argon review; Codex final review optional. |
| MEDIUM | Independent AGY Argon review; Codex Terra review when a risk trigger applies. |
| HIGH | Independent AGY Argon review and Codex Terra review. |

Reviewers must be independent of the Developer and must not edit code. QA FAIL or REQUEST CHANGES blocks PASS. Limit rework to three rounds per issue; escalate unresolved findings to the Owner. LocalStorage migration/data-loss risk, service-worker cache behavior, security changes, broad impact, or difficult rollback may raise the risk classification. Publishing remains a separate Owner approval gate.

## Short implementation plan

1. After approval, establish the local project scaffold and verified commands.
2. Implement V1 list behavior and localStorage handling.
3. Add mobile layout and PWA assets/service worker with subpath-safe paths.
4. Run acceptance checks, QA, and independent review; fix findings within the rework limit.
5. Prepare the V1 release packet and wait for explicit Owner approval before creating a remote, pushing, or publishing to GitHub Pages.
6. Collect V1 feedback, then implement only the approved V1.1 bulk-clear action.

## Open release inputs

GitHub owner/organization, repository name and visibility, and Pages source/URL are not set. Resolve them before release preparation; this project initialization does not create a GitHub repository or remote.
