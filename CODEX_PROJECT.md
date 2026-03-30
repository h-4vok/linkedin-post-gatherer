# CODEX Project Documentation

## Repository Name

`linkedin-post-gatherer`

## High-Level Intent

Browser extension for Chrome/Brave that automates raw data collection from the LinkedIn home feed, filters non-organic content, stores collection progress locally, and exports a final local `JSON` output for later AI analysis.

This repo currently targets `Manifest V3`, `JavaScript` vanilla, and `Vite`. The MVP is a user-triggered crawler with a LinkedIn content script, background coordination, a floating in-page control panel, popup backup controls, optional Gemini AI Studio post-validation, and local export. It does not send emails or post replies.

## Mermaid Documentation Convention

- Use Mermaid only for high-level views that help explain runtime flow, architecture, or cross-context behavior.
- Keep one diagram per concern so docs stay readable in Markdown and GitHub.
- Diagrams must reflect current code and documented contracts, not planned or aspirational behavior.
- Keep diagrams in dedicated Markdown docs under `docs/diagrams/` instead of standalone `.mmd` files.
- Treat diagram docs as operational documentation, not optional supporting material.
- Update affected diagrams in the same change set when permissions, message flow, context boundaries, or collection behavior changes.
- Use GitHub rendering as the shared reference and keep labels short enough for common Markdown previews.

## Main Responsibilities

1. Observe the LinkedIn main feed through a LinkedIn-scoped content script.
2. Crawl the feed with bounded, human-like timing and distance parameters after explicit user start.
3. Exclude promoted posts, polls, and suggested content before capture.
4. Extract raw post metadata into a stable normalized structure.
5. Accumulate deduplicated results in local extension state.
6. Expose progress in the popup UI and export either a raw or enriched `JSON` payload for downstream manual use.

## Product Boundaries

- In scope:
  - LinkedIn home-feed inspection
  - Human-like incremental scrolling
  - Post extraction and normalization
  - Exclusion of promoted, poll, and suggested posts
  - Local persistence for in-progress collection through `chrome.storage.local`
  - Floating panel and popup controls with start/stop and target count
  - Optional Gemini AI Studio relevance validation after capture
  - Final `JSON` export
- Explicitly out of scope for this phase:
  - Sending emails
  - Posting comments or reactions
  - Running as a backend job or scheduler-driven worker

## Technology Stack

- Platform: Chrome/Brave extension, `Manifest V3`
- Language: `JavaScript`, plus browser-native `HTML` and `CSS` for the popup UI
- Build tool: `Vite`
- Persistence: `chrome.storage.local`
- Tests: `Vitest`
- Lint/format: `ESLint`, `Prettier`

## Execution Contexts

- `background/service worker`
  - Owns coordination, crawler session state, export orchestration, storage access, structured logging, and cross-context messaging.
- `content script` for LinkedIn
  - Owns feed access, DOM parsing, exclusion logic, active scroll behavior, and per-page extraction.
- `popup UI`
  - Mirrors crawler controls, target count, progress display, and export trigger while delegating business logic to shared modules and background coordination.

## Runtime Flow

1. The extension loads with the minimum required permissions and host permissions.
2. The user starts a crawl run from the floating panel or popup with an accepted-post target, defaulting to `50`.
3. A LinkedIn content script inspects the active feed surface and scrolls in bounded randomized increments of `400px` to `600px`.
4. Between scrolls, the collector waits a randomized delay of `1.5s` to `3.5s`.
5. For each discovered post container, exclusion rules remove promoted posts, polls, and suggested content.
6. Extracted post data is normalized into a stable internal structure and sent through an explicit message contract to background logic.
7. Background logic deduplicates and stores intermediate collection state, then optionally runs Gemini AI Studio validation as a manual post-capture bulk job in fixed chunks.
8. The floating panel and popup receive progress updates in the form `Posts identified: X / target`, while the popup also shows AI validation and author-enrichment status.
9. When requested, export logic produces either a raw `linkedin_dump_[date].json` file or an enriched `linkedin_dump_[date]_enriched.json` file after sequential author enrichment.

## Core Operational Contracts

- Permissions should stay minimal and documented.
- Host-specific selectors belong in the LinkedIn content-script layer, not in shared business logic.
- Shared data structures should be normalized before they enter storage or export code.
- Message contracts between contexts should be versionable and explicit.
- Crawler commands, crawl progress, and service-worker log events should flow through explicit tab-scoped messages.
- Collection must tolerate partial failures, missing selectors, and repeated runs without duplicating results.
- The main extraction contract for each item is:
  - `link`
  - `author`
  - `reposted_by`
  - `post_text`
  - `posted_time`
  - `is_repost`
  - `type`
  - `extracted_at`
- The enriched export extends each item with:
  - `author_role`
  - `author_followers`
  - `author_weight`
- AI validation may also persist an `interest_validation` block on each item for raw and enriched export flows.
- The requirements file contains the typo `is_repot`; the documented repository contract should use `is_repost`.
- `type` should remain compatible with the current MVP expectation of organic content that passed the exclusion filters.
- `post_text` should prefer the preloaded LinkedIn expandable text node so long posts can be captured without triggering UI expansion.
- `posted_time` should preserve LinkedIn's raw relative timestamp string when available and may safely remain `null` when the DOM does not expose it clearly.

## Testing Strategy

- Default tests should remain deterministic and runnable without live LinkedIn access.
- Unit tests should cover:
  - post normalization
  - exclusion filters
  - storage contracts
  - scroll parameter generation
  - export shaping
  - message payload validation
- DOM extraction should prefer fixture-based tests so selector drift is visible and reviewable.
- Live LinkedIn drift debugging should use the repo dump utility and runbook in `docs/debugging/linkedin-feed-dump.md` instead of a flaky always-on integration test.
- Manual browser validation is required for major changes to manifest, messaging, and LinkedIn DOM interaction.

## Key Risks

- LinkedIn DOM changes can break extraction behavior without any code change in this repo.
- Cross-context message drift can create silent failures if message shapes are not validated.
- Excessive permissions or over-coupled browser surfaces can make the extension harder to review and evolve.
- Aggressive or unrealistic scrolling patterns can create brittle runtime behavior and increase detection risk.
