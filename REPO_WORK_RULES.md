# Repo Work Rules

Repository-specific working rules for `linkedin-post-gatherer`. This file applies the shared playbook to the current repo without replacing existing docs.

## Purpose

- Capture the local rules of engagement for day-to-day work in this repository.
- Make repo-specific commands, contracts, and delivery expectations explicit.

## Repo Defaults

- The product is a Chrome/Brave browser extension built on `Manifest V3`.
- The official stack is `JavaScript` + `Vite` + `ESLint` + `Prettier` + `Vitest`.
- The current product goal is user-triggered crawling of the LinkedIn home feed and local generation of a final `JSON` payload for later AI analysis.
- The MVP is a single-browser workflow with a floating in-page panel, popup backup UI, LinkedIn content script, background coordination, and tab-scoped session persistence.
- This phase does not send emails or post comments. It may call Gemini AI Studio for post-validation when AI review is enabled.

## Target Architecture

- `public/manifest.json` defines permissions, browser entrypoints, and extension metadata.
- `src/background/` owns collection session state, cross-context coordination, export orchestration, and storage writes.
- `src/content/linkedin/` owns page interaction, feed scanning, human-like scrolling, DOM extraction, and LinkedIn selector contracts.
- `src/shared/` holds pure utilities, schemas, filters, normalizers, storage contracts, and message definitions shared across contexts.
- `src/export/` owns serialization and final `JSON` output shaping.
- `src/ui/` or equivalent popup surface owns user controls, real-time counters, and export actions while staying thin.

## Verification Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Default test command: `npm test`
- Lint: `npm run lint`
- Format check: `npm run format`
- Format write: `npm run format:write`

## Mergeable Gate

A branch is mergeable only when all of these pass:

1. `npm run format`
2. `npm run lint`
3. `npm test`
4. `npm run build`

Recommended local order before commit:

1. `npm run format:write`
2. `npm run lint`
3. `npm test`
4. `npm run build`

## Testing Rules

- `npm test` should remain deterministic and should not require a logged-in browser session.
- Unit tests should cover data shaping, exclusion filters, storage adapters, human-like scroll parameter helpers, and message contracts.
- DOM parsing and selector logic should be tested with fixtures when possible so LinkedIn contract drift is visible without relying on live browsing.
- Browser-manual validation is still required for the main collection flow because extension contexts and host pages are integration-heavy.

## Operational Flow Rules

- Request the minimum permissions and host permissions needed for the current feature set.
- Keep LinkedIn-specific DOM logic isolated from background, storage, and export logic.
- Treat page selectors, exclusion heuristics, and scroll behavior as fragile contracts that must be easy to update.
- Make collection flows resumable and deduplicated so re-running a scan does not duplicate the same post in local state.
- Prefer rate-limited scrolling, bounded retries, and observable failure reasons over aggressive automation loops.
- Separate post detection, exclusion filtering, normalization, storage, and final export so each stage can be verified independently.
- Keep crawler start/stop controls explicit; the extension must not begin active scrolling until the user starts a run.
- The MVP scroll engine should stay within documented bounds unless requirements change:
  - scroll increments between `400px` and `600px`
  - delays between `1.5s` and `3.5s`
  - automatic stop at a user-configurable accepted-post target with default `50`
- The MVP must skip non-organic content including promoted posts, polls, and suggested content.

## Storage And Messaging Rules

- Persist only the minimum local state required for the active tab/session collection flow, and reserve durable local storage for lightweight UI preferences.
- Keep a documented message contract between content scripts, background, and optional UI surfaces.
- Do not couple storage shape to raw DOM fragments when a normalized intermediate structure can be stored instead.
- Make it easy to clear or regenerate local run data during development and debugging.
- Use `chrome.storage.local` as the default persistence layer unless a later ADR changes that decision.

## Output Contract Rules

- The exported artifact is a local `JSON` file named in the shape `linkedin_dump_[date].json`.
- Each exported item should preserve the normalized MVP contract:
  - `link`
  - `author`
  - `reposted_by`
  - `post_text`
  - `posted_time`
  - `is_repost`
  - `type`
  - `extracted_at`
- AI-enriched exports may also include a persisted `interest_validation` block with Gemini-derived status or controlled fallback state.
- Treat crawler operational logs in the service worker as the primary debug stream for run control, scrolling, and stop conditions.
- When requirements contain naming mistakes, internal docs should use the corrected canonical field name rather than copying the typo into long-term contracts.

## Documentation Rules

- Keep high-level Mermaid diagrams in `docs/diagrams/`.
- Maintain at least an architecture diagram and a collection/export flow diagram.
- Update affected diagram docs in the same PR when permissions, message flow, context boundaries, or collection behavior changes.
- Keep `README.md` lightweight and use it as a navigation hub to deeper docs.
- Keep material decisions in `DECISIONS.md` when they affect behavior, permissions, or contract stability.

## Completion Notification Rule

- When a task is completed, send a Windows system notification with the exact message `linkedin-post-gathered: Tarea terminada`.

## Repo Conventions Worth Preserving

- Shared domain logic should stay framework-agnostic and reusable across extension contexts.
- Extension surfaces should communicate through explicit contracts, not ad hoc global state.
- New browser surfaces should reuse shared storage, filtering, normalization, and export helpers where possible.
- Avoid adding future-domain placeholders that expand permissions or architecture before the product actually needs them.
