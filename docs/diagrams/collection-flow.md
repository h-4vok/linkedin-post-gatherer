# Collection And Export Flow

```mermaid
flowchart TD
    A[User clicks Start Hunting] --> B[Read capture limit<br/>default 50]
    B --> C[Scan LinkedIn feed]
    C --> D[Scroll 400px to 600px]
    D --> E[Wait 1.5s to 3.5s]
    E --> F[Inspect post container]
    F --> G{Promoted, poll, or suggested?}
    G -->|Yes| H[Skip container]
    G -->|No| I[Extract raw fields]
    I --> J[Normalize item shape]
    J --> K[Deduplicate and store locally]
    K --> L[Queue Gemini validation]
    L --> M[Validate one post at a time]
    M --> N[Persist interest_validation]
    N --> O[Update popup counter]
    O --> P{Limit reached?}
    P -->|No| C
    P -->|Yes| Q{Export mode}
    Q -->|Raw| R[Build raw JSON payload]
    R --> S[Download linkedin_dump_[date].json]
    Q -->|Enriched| T[Resolve unique authors]
    T --> U[Reuse local author cache]
    U --> V[Open one LinkedIn profile tab at a time]
    V --> W[Extract role and followers]
    W --> X[Classify author weight]
    X --> Y[Update enrichment progress]
    Y --> Z[Build enriched JSON payload]
    Z --> AA[Download linkedin_dump_[date]_enriched.json]
```

## Notes

- Collection should be resumable and should not duplicate previously captured posts.
- Failures in extraction should be observable and should not corrupt stored results.
- Export is local-only in the current phase.
- Enriched export is sequential and exposes explicit post/author progress while the raw batch remains available immediately.
- Non-organic feed items are excluded before they enter normalized storage.
- Gemini validation runs after capture, respects free-tier limits through serial processing, and may leave posts in `pending` or `unknown` when quota pressure or errors occur.
