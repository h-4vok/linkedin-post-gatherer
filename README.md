# linkedin-post-gatherer

Chrome/Brave extension project for harvesting raw LinkedIn feed posts, filtering non-organic content, and exporting a final local `JSON` payload for later AI analysis.

## Current Direction

- Platform: `Manifest V3`
- Browsers: `Chrome`, `Brave`
- Stack: `JavaScript` + `Vite`
- UI: popup with start button, live counter, and export action
- Product mode: local collection and local export only

This repo is intentionally documented as a browser extension, not as a backend worker. The current phase focuses on LinkedIn home-feed collection, noise filtering, human-like scrolling, tab-scoped collection state, and final export. It does not send emails, post comments, or sync to external APIs.

Collected post batches are scoped to the current browser tab/session. Persistent local storage is reserved for lightweight UI preferences such as the floating panel position.

## MVP Behavior

- Extract `author`, `reposted_by`, `post_text`, `posted_time`, `link`, `is_repost`, `type`, and `extracted_at` from eligible feed posts
- Read `post_text` from LinkedIn's preloaded expandable text box when present, without clicking `more`
- Preserve LinkedIn's relative post age in `posted_time` when a clear value such as `4h` or `2w` is present
- Skip promoted posts, polls, and suggested content
- Scroll in randomized increments between `400px` and `600px`
- Wait randomized delays between `1.5s` and `3.5s`
- Stop automatically at a user-defined post limit with default `50`
- Export a local file named `linkedin_dump_[date].json`

## Expected Workflow

1. Load the extension locally in a Chromium browser.
2. Open LinkedIn and start the hunting flow from the popup.
3. Watch the live `Posts identified: X / limit` counter as collection progresses.
4. Review accumulated results in local extension state.
5. Export the final `JSON` payload for downstream manual use.

## Standard Commands

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run format`
- `npm run format:write`
- `npm test`

## Docs Map

- `ENGINEERING_PLAYBOOK.md`: reusable engineering policy
- `REPO_WORK_RULES.md`: repo-specific working rules
- `DELIVERY_CHECKLIST.md`: close-out checklist
- `CODEX_PROJECT.md`: runtime contracts and architecture intent
- `CODEX_STRUCTURE.md`: expected code layout
- `DECISIONS.md`: ADRs
- `docs/diagrams/`: architecture and flow diagrams
