# linkedin-post-gatherer

Chrome/Brave extension project for harvesting raw LinkedIn feed posts, filtering non-organic content, and exporting a final local `JSON` payload for later AI analysis.

## Current Direction

- Platform: `Manifest V3`
- Browsers: `Chrome`, `Brave`
- Stack: `JavaScript` + `Vite`
- UI: floating control console plus popup backup, with quick target presets, live metrics, and activity log
- Product mode: local collection and local export only

This repo is intentionally documented as a browser extension, not as a backend worker. The current phase focuses on user-triggered LinkedIn crawling, noise filtering, human-like scrolling, tab-scoped collection state, and final export. It does not send emails, post comments, or sync to external APIs.

Collected post batches are scoped to the current browser tab/session. Persistent local storage is reserved for lightweight UI preferences such as the floating panel position.
Author enrichment cache for BL-002 is persisted in `chrome.storage.local` so repeated authors do not require opening their profile again on later runs.

## MVP Behavior

- Extract `author`, `reposted_by`, `post_text`, `posted_time`, `link`, `is_repost`, `type`, and `extracted_at` from eligible feed posts
- Read `post_text` from LinkedIn's preloaded expandable text box when present, without clicking `more`
- Preserve LinkedIn's relative post age in `posted_time` when a clear value such as `4h` or `2w` is present
- Start and stop crawling explicitly from the floating panel or popup instead of auto-collecting on feed load
- Skip promoted posts, polls, and suggested content
- Scroll in randomized increments between `400px` and `600px`
- Wait randomized delays between `1.5s` and `3.5s`
- Stop automatically at a user-defined accepted-post target with default `50` and supported range `1-200`
- When LinkedIn stops yielding new accepted posts, pause for up to `5m` and retry multiple times before declaring the feed stalled
- Export a local file named `linkedin_dump_[date].json`
- Offer both `Export raw` for the current batch and `Export enriched` for a sequential author-enrichment pass with visible progress
- Enrich author metadata with `author_role`, `author_followers`, and `author_weight`

## Expected Workflow

1. Load the extension locally in a Chromium browser.
2. Open LinkedIn and choose a target post count in the floating panel or popup.
3. Use quick presets such as `25`, `50`, or `100`, or type a custom target.
4. Press `Start` to begin crawler-driven scrolling and collection.
5. Watch the hero metric, status badge, long-wait counter, and activity log as collection progresses.
6. Press `Stop` at any time or let the crawler stop automatically at the target.
7. Export the current raw batch immediately, or start enriched export and monitor post/author progress until the enriched `JSON` is ready.

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
