# LinkedIn Feed Dump Runbook

Use this runbook when the harvester starts skipping too many posts, logs repeated `missing-author`, or enters `Waiting for more posts to load` even though the feed still has visible content.

## When To Use It

- The crawler captures one or two posts and then appears to stall
- Service-worker logs show repeated `scan-results` with `accepted: 0`
- The page console shows lots of `missing-author`
- LinkedIn visibly changed the feed header or author block

## How To Capture A Dump

1. Open LinkedIn feed in the browser with the extension loaded.
2. Open DevTools on the page.
3. Open [`scripts/debug/linkedin-feed-dump.js`](/C:/src/linkedin-post-gatherer/linkedin-post-gatherer--andromeda/scripts/debug/linkedin-feed-dump.js).
4. Paste the script into the page console and run it.
5. Save the resulting JSON into a local scratch file such as `.debug/debug-feed.json`.

## What The Dump Contains

- Current page URL and title
- Feed root metadata
- A sample of up to 8 `div[role="listitem"]` posts
- `textPreview` for quick inspection
- Truncated `outerHTML` for selector debugging
- Parent scroll-chain metadata to debug scroll-container drift

## What To Check First

- Whether the author/relation block still exposes `1st`, `2nd`, `3rd+`, or `Following`
- Whether those markers are now in `p`, `span`, `aria-label`, or another container
- Whether `Suggested` or `Promoted` labels moved or changed wording
- Whether the feed root still contains `div[role="listitem"]`
- Whether the scroll chain still reaches a scrollable ancestor

## Typical Failure Patterns

- `missing-author` spikes:
  The author block shape changed. Inspect `aria-label`, profile anchors, and the header text container first.

- `suggested` spikes:
  LinkedIn is mixing recommended content into the feed. Verify wording and whether the label changed.

- `accepted: 0` with visible posts:
  Either the extractor drifted or the list items are being rescanned without net-new accepted content.

- Scroll does not progress:
  Inspect the `scrollChain` and verify which ancestor is actually scrollable.

## Expected Workflow After A Dump

1. Save the dump under `.debug/`.
2. Compare the new dump against the extractor assumptions in `src/shared/extractor.js`.
3. Adjust the extractor heuristics and fixture tests.
4. Re-run `npm test` and `npm run build`.
