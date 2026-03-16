# Repo Baseline

Opinionated baseline for new repositories and for existing repositories that are being normalized over time. This file captures recommended setup, tooling, and default documentation standards.

## Purpose

- Define the default engineering capabilities a healthy repo should have.
- Make one-time setup decisions explicit instead of leaving them as tribal knowledge.
- Give teams a reusable standard for new repos without forcing every repo to be identical in implementation details.

## Baseline Capabilities

Every repo should have these capabilities, even if the exact tooling differs:

- A formatter with both check and write commands
- A linter with a failing CI check
- A default test command representing the safest routine suite
- A documented merge gate
- A build command that validates the distributable artifact
- In-repo architecture and operational documentation
- A place for engineering decisions or ADRs
- CI/CD that runs the merge gate in the shared remote platform

## Recommended Default Tooling

These are defaults, not universal mandates:

- Build tool: `Vite` or equivalent
- Formatter: `Prettier` or equivalent
- Linter: `ESLint` or equivalent
- Test runner: `Vitest`, `Jest`, or equivalent
- Diagrams: Mermaid in Markdown when diagrams are needed
- CI platform: GitHub Actions or the repo's shared CI platform

Choose different tools only when there is a clear repo-specific reason.

## Recommended Default Scripts

Prefer a small standard command surface:

- `npm run dev`
- `npm run build`
- `npm run format:write`
- `npm run format`
- `npm run lint`
- `npm test`

Optional but commonly useful:

- `npm run test:watch`
- `npm run test:coverage`
- `npm run preview`
- `npm run package`

## Recommended Documentation Baseline

Prefer these docs in most repos:

- `README.md` as a lightweight entrypoint
- `AGENTS.md` for agent bootstrap
- `DECISIONS.md` for ADRs or important decisions
- `docs/diagrams/` for high-level Mermaid diagrams when needed
- A reusable engineering playbook and a repo-specific rules file when the team wants shared conventions across repos

For browser-extension repos, also document:

- Supported browsers and manifest version
- Extension execution contexts and message flow
- Required permissions and host permissions
- Local development and unpacked-load workflow

## Mermaid Standard

If a repo uses diagrams, prefer this convention:

- Use Mermaid inside Markdown docs
- Keep diagrams in `docs/diagrams/`
- Keep one diagram per concern
- Use diagrams only for high-level runtime, architecture, failure, or extension views
- Update diagrams in the same PR as the related code or behavior change
- Keep labels short enough to render well in GitHub and common editor previews

## Local Automation

Recommended, but optional when bootstrapping:

- Pre-commit hooks for lightweight checks
- Pre-push hooks for slower but important checks
- PR templates and issue templates

Do not rely only on local hooks; the merge gate should still run in CI.

## Exceptions Policy

- This file defines the default standard, not an inflexible law.
- Repo-specific deviations should be documented in that repo's local rules file.
- When a repo does not follow part of the baseline yet, record the gap explicitly instead of pretending the standard is already enforced.
