# Delivery Checklist

Use this checklist before saying a task is done, before committing, and before opening or updating a PR.

## Before Saying "Done"

- The requested behavior is implemented and the relevant failure path was considered.
- Code, docs, diagrams, and manifest assumptions agree with each other.
- Any contract or design decision worth preserving is documented or queued for an ADR.
- No unrelated local changes are mixed into the work.
- Any new permission, host permission, or browser surface was reviewed for necessity.
- If the change touches extraction logic, promoted posts, polls, and suggested-content exclusions were considered explicitly.
- If the change touches UI, the popup start action, real-time counter, and export action still match the documented MVP.
- If the change touches crawler control, verify `Start`, `Stop`, target count bounds, and the no-progress stop condition.
- If the change touches logging, verify the service worker receives operator-meaningful run logs in addition to any page-console output.
- A Windows system notification was sent with the message `linkedin-post-gathered: Tarea terminada`.

## Before Commit

- `npm run format:write`
- `npm run lint`
- `npm test`
- `npm run build`
- Run any extra targeted validation required by the change scope, such as a manual unpacked-extension smoke test when touching manifest, content scripts, or cross-context messaging.
- For collection-flow changes, validate the configured capture limit, scroll pacing bounds, and `chrome.storage.local` behavior.

## Before Push Or PR

- The branch is clean except for intended changes.
- The PR description explains the operator impact in plain language.
- Related docs and diagram updates are included in the same change set.
- If behavior changed, reviewers can quickly locate the relevant docs and manifest assumptions.
- Permission changes, new message channels, and new host-domain assumptions are called out explicitly.
- Output-schema changes, selector changes, and exclusion-rule changes are called out explicitly.

## After Merge

- Pull latest `main`.
- Delete merged local and remote branches.
- Confirm no follow-up cleanup is left behind locally.
