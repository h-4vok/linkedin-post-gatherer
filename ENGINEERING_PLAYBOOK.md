# Engineering Playbook

Reusable working rules for software projects. This file captures portable practices that can be applied across existing and new repositories, including backend services, frontend apps, and browser extensions.

For one-time setup, recommended tooling, and repository bootstrap standards, use `REPO_BASELINE.md` rather than this file.

## Purpose

- Keep engineering work predictable, reviewable, and easy to repeat across repos.
- Separate policy from repo-specific implementation details.
- Make it explicit what should happen at each phase of delivery.

## Rules By Work Phase

### Before Starting

- Read the primary project docs, active architecture notes, and recent decisions before changing behavior.
- Identify the current contracts, extension points, permissions, and verification commands before implementation starts.
- Prefer explicit runtime inputs and documented configuration over hidden defaults.
- For browser-facing automation, identify the execution context up front: page script, content script, background/service worker, or extension UI.

### During Implementation

- Favor idempotent flows where re-running the same task should not duplicate side effects or corrupt local state.
- Keep extension seams explicit so new targets, surfaces, or workflows can plug into shared infrastructure without broad rewrites.
- Separate DOM collection, normalization, storage, and export logic so fragile selectors do not leak across the codebase.
- Prefer graceful degradation when external pages, permissions, or browser APIs behave differently than expected.
- Keep permissions minimal and scoped to the surfaces the feature actually needs.
- Prefer scaffold-to-real implementation paths when a feature or integration will be introduced incrementally.

### Documentation And Decisions

- Keep operational documentation in the repo.
- Record material engineering decisions as ADRs when they lock in contracts, tradeoffs, or important invariants.
- Use high-level diagrams only for runtime, architecture, failure paths, or extension seams.
- Keep diagrams in dedicated Markdown docs under `docs/diagrams/` as a standard default.
- Treat diagrams as operational documentation and update them in the same PR when related behavior changes.
- Keep diagram labels short enough to render cleanly in shared previews.

### Testing And Verification

- Make `npm test` or the equivalent default test command represent the safest, most expected routine test suite for the repo.
- Separate deterministic unit tests from browser-integrated or DOM-contract checks when those are less stable.
- Treat DOM-contract checks as integration signals; do not hide fragility behind unit-test naming.
- Keep the merge gate explicit and small: formatter, linter, build validation, and default tests should be obvious and documented.
- Verify message passing, storage behavior, permission assumptions, and failure handling when a feature spans multiple execution contexts.

### Before Marking Work Done

- Run the repo's documented verification commands for the scope of the change.
- Verify both the happy path and the most relevant failure path for the modified behavior.
- Confirm docs, diagrams, and decision records are aligned with the change.
- Make sure the change is understandable without relying on undocumented tribal knowledge.

### Before Commit

- Apply the repo's formatter if required.
- Run lint checks.
- Run the default test suite and any additional targeted checks impacted by the change.
- If the repo has a build artifact or packaged extension output, validate that it still builds cleanly.

### Before Push Or PR

- Confirm the branch is mergeable using the documented gate for the repo.
- Summarize the user-facing or operator-facing behavior change clearly in the PR.
- Include documentation updates in the same change set when contracts or flows changed.
- Call out permission changes, new browser surfaces, or new target-domain assumptions explicitly.

### After Merge

- Sync local `main` with the remote default branch.
- Clean up merged branches locally and remotely.
- Re-run any follow-up checks only if the repo workflow requires post-merge validation.

## Policy, Automation, And Exceptions

- Document whether a rule is policy, automated enforcement, or a manual expectation.
- Prefer automation for repetitive checks, but document the manual expectation even when automation is missing.
- Keep repo-specific exceptions out of this file; place them in the local repo rules file.
