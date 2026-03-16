# CODEX Structure Documentation

## Purpose

Repository structure reference aligned with the current browser-extension direction of the codebase.

## Top-Level

- `README.md`: Project overview, local workflow, and extension usage entrypoint.
- `CODEX_PROJECT.md`: Project behavior and contracts overview.
- `CODEX_STRUCTURE.md`: This file.
- `docs/diagrams/`: Mermaid diagram docs for MV3 architecture and collection/export flow.
- `DECISIONS.md`: ADRs and durable engineering decisions.
- `public/manifest.json`: Extension manifest when implementation begins.
- `package.json`: Scripts and dependencies when the runtime scaffold is added.
- `REQS.MD`: Current MVP product requirements and extraction contract.

## Expected Source Tree (`src/`)

- `src/background/`: Background or service-worker orchestration, collection session state, and export coordination.
- `src/content/linkedin/`: LinkedIn-specific content scripts, selectors, exclusion logic, scroll engine, and extraction logic.
- `src/shared/`: Shared types-by-convention, message contracts, normalizers, storage adapters, and pure helpers.
- `src/export/`: `JSON` shaping and export helpers.
- `src/ui/popup/`: Popup UI for start, status, and export actions.

## Context Boundaries

- Background logic should coordinate state and export flows, not parse LinkedIn DOM.
- LinkedIn content scripts should own host-page access, exclusion rules, and DOM contract handling.
- Shared modules should remain browser-surface-agnostic wherever possible.
- Popup UI should consume shared state and commands rather than embed collection logic directly.

## Tests (`test/` or `src/**/*.test.js`)

- Unit tests for shared logic, exclusion filters, normalization, storage, scroll helpers, and export helpers.
- Fixture-based tests for LinkedIn DOM parsing and selector contracts.
- Messaging tests for content-script to background coordination.
- Manual validation notes for unpacked-extension runtime checks when browser behavior is involved.

## Documentation Alignment Notes

- Do not reintroduce backend-agent terminology, country-specific flows, or upstream publish contracts in this repo.
- Keep structure docs aligned with the actual extension contexts that exist in code.
- Keep the popup-driven MVP explicit: start collection, show progress, export `JSON`.
