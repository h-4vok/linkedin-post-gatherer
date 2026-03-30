# Engineering Decisions

## ADR-0001: Use Manifest V3 for the extension platform

### Status

Accepted

### Context

This repository is being repurposed from backend-oriented documentation into a Chrome/Brave browser-extension project. The extension needs a documented platform baseline that matches current Chromium extension expectations.

### Decision

Use `Manifest V3` as the platform contract for the repository.

### Consequences

- Positive:
  - Aligns the repo with current Chrome/Brave extension expectations.
  - Makes background/service-worker boundaries explicit in docs and architecture.
  - Gives a clear baseline for permissions, messaging, and packaging guidance.
- Tradeoff:
  - Requires the repo to account for MV3-specific service-worker and permission constraints from the start.

## ADR-0002: Standardize on JavaScript plus Vite

### Status

Accepted

### Context

The repository needs a default toolchain that is lightweight, fast to bootstrap, and suitable for a plain JavaScript browser extension without adding framework-specific complexity.

### Decision

Use `JavaScript` as the implementation language and `Vite` as the default build tool.

### Consequences

- Positive:
  - Keeps the initial stack small and accessible.
  - Supports a clean local dev/build workflow for extension assets.
  - Avoids introducing React or TypeScript before the repo actually needs them.
- Tradeoff:
  - Some type-safety and framework ergonomics are deferred in favor of simplicity.

## ADR-0003: Keep v1 output local and assistive

### Status

Accepted

### Context

The original workflow idea included downstream actions such as drafting or sending output elsewhere. For this phase, the product goal is narrower: gather relevant LinkedIn post data and produce a reusable result without transmitting it.

### Decision

Treat the extension as local-output-only for v1. The primary artifact is a final `JSON` payload generated for later AI or human use.

### Consequences

- Positive:
  - Reduces scope, integration complexity, and permission pressure.
  - Keeps the extension focused on collection quality and export correctness.
  - Avoids coupling the repo to email flows or third-party APIs prematurely.
- Tradeoff:
  - Downstream workflows remain manual until a later phase explicitly adds them.

## ADR-0004: Treat DOM contracts as fragile integration boundaries

### Status

Accepted

### Context

LinkedIn feed extraction depends on host-page markup that can change without warning. Those changes are different in nature from ordinary business-logic bugs and should be documented as such.

### Decision

Treat LinkedIn DOM selectors and extraction logic as fragile integration boundaries. Cover them with fixture-based tests where possible and with manual browser validation when changes affect live page interaction.

### Consequences

- Positive:
  - Makes selector drift a first-class maintenance concern.
  - Encourages separation between DOM parsing and normalized shared logic.
  - Supports reviewable fixtures instead of hiding host-page assumptions deep in runtime code.
- Tradeoff:
  - Some runtime confidence will still depend on manual verification against the real site.

## ADR-0005: Use popup-driven collection with bounded human-like scrolling

### Status

Accepted

### Context

The requirements define a popup-driven MVP that starts collection explicitly, reports progress live, and uses bounded randomized scrolling behavior to load feed content without relying on continuous refresh or unbounded automation.

### Decision

Use a popup surface as the primary control point for the MVP and keep the scroll engine inside documented bounds:

- increments between `400px` and `600px`
- delays between `1.5s` and `3.5s`
- default capture limit of `50`

### Consequences

- Positive:
  - Keeps user intent explicit and easy to observe during runtime.
  - Provides a concrete UX contract for progress reporting and export.
  - Makes scroll behavior reviewable and testable instead of burying it inside ad hoc page logic.
- Tradeoff:
  - Scroll timing will likely need tuning as the LinkedIn feed behavior evolves.

## ADR-0006: Canonicalize the exported post schema

### Status

Accepted

### Context

The requirements define an MVP export shape but contain a field typo, `is_repot`, that should not become a long-term repository contract.

### Decision

Use this canonical normalized export shape for the MVP:

- `link`
- `author`
- `post_text`
- `is_repost`
- `type`
- `extracted_at`

Treat the requirements typo as non-canonical documentation noise and correct it in repo-facing docs and code.

### Consequences

- Positive:
  - Prevents a typo from leaking into runtime contracts and tests.
  - Keeps storage, export, and fixture data consistent across the repo.
  - Makes future consumers of the exported `JSON` easier to support.
- Tradeoff:
  - The implementation should still note the difference so future readers understand why docs diverge from the original typo.

## ADR-0007: Run Gemini validation as a manual chunked bulk job

### Status

Accepted

### Context

The backlog adds a second-stage relevance decision using Gemini AI Studio. This repository runs as a Manifest V3 browser extension and will use the Google AI Studio free tier, which makes quota spikes and rate limiting a practical runtime concern.

### Decision

Run Gemini validation in the background service worker as a manual post-processing job:

- start only when the user explicitly triggers it from the popup
- process fixed-size chunks of posts per Gemini request
- retry only transient failures
- on `429`, read the server-provided retry delay and wait that amount plus `5s`
- persist `interest_validation` on each post with fallback state `unknown` after retries are exhausted
- configure the integration from the popup, not from the floating panel

### Consequences

- Positive:
  - Keeps the crawler responsive and independent from AI latency.
  - Reduces request pressure by classifying batches instead of posting one request per item.
  - Preserves traceability in exported data even when Gemini is unavailable.
- Tradeoff:
  - Large batches still need chunk sizing discipline and careful prompt shaping.
