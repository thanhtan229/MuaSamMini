# MuaSamMini Project Guidance

## Purpose

MuaSamMini is a mobile-first shopping list web app built with HTML, CSS, and JavaScript. V1 stores list data in the browser with `localStorage` and is intended for release on GitHub Pages as a PWA.

## Approved scope

- **V1:** create, edit, remove, and mark shopping-list items as purchased; persist the list locally; provide a responsive mobile interface; support PWA installation and offline app-shell loading.
- **V1.1:** add one action to remove all purchased items, with confirmation before deletion. Cancelling confirmation must leave the list unchanged.
- Do not add categories, quantities, search, accounts, cloud sync, analytics, backend services, or other features without Owner approval.

## Data and user safety

- Treat item names and all stored values as untrusted input. Render user text as text, not executable HTML.
- Validate and version localStorage data before use. Handle missing, malformed, or unavailable storage without silently replacing or deleting recoverable user data; report the issue and preserve the original value where possible.
- Do not send list data to a server, third party, analytics service, or network endpoint. No credentials or secrets belong in the repository.
- Destructive bulk actions require an explicit in-app confirmation. A cancelled action must not mutate data.

## Mobile and PWA / GitHub Pages

- Keep the interface usable on narrow mobile screens and with keyboard navigation; use semantic controls and visible focus.
- GitHub Pages may serve this app below a repository subpath. Avoid root-absolute asset URLs. Keep manifest `start_url`/`scope`, asset paths, and service-worker registration/scope correct for the deployed subpath.
- Cache only the app shell and static assets needed for offline startup. Do not cache or transmit user list data. Version caches and define safe cleanup/update behavior.
- Do not claim PWA/offline success until it has been checked at the actual Pages subpath over HTTPS.

## Verification and review

- Record the exact verification commands after the project scaffold defines them; do not invent commands.
- Check item CRUD, persistence across reload, malformed/unavailable storage handling, mobile layout, keyboard/accessibility basics, PWA installability, offline startup, and subpath asset/service-worker paths.
- QA FAIL or Reviewer REQUEST CHANGES blocks PASS. The Developer must not review their own work. Reviewers report findings and do not edit code.
- Apply Reviewer Policy B: LOW requires independent AGY Argon review; MEDIUM requires Argon and Codex Terra when a risk trigger applies; HIGH requires both. Limit rework to three rounds per issue, then report unresolved issues to the Owner.

## Agent and permission boundaries

- Do not launch an AGY Worker until its effective permissions and sandbox are verified. A configured `--mode=auto` is not proof of effective sandboxing. If a permission prompt appears, stop and report it; do not approve it or use a bypass.
- Do not use Claude. Use Sol only with separate explicit Owner approval. Select a model explicitly where supported and distinguish requested model, Orca receipt, and observed actual model.
- Set a task-specific worker/quota limit before dispatch; do not run concurrent workers editing the same files.

## Release boundary

GitHub Pages is the intended V1 target, but creating a GitHub remote/repository, committing, pushing, merging, publishing, or deploying requires separate explicit Owner approval. Never bypass permission controls or change global settings/hooks for this project.
