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
    J --> K2[Capture ignored sample buffer]
    K --> L[User triggers AI validation]
    L --> M[Send chunked Gemini bulk request]
    M --> N[Persist interest_validation]
    N --> O[Emit AI activity to panel]
    O --> P[Update popup counter]
    P --> Q{Limit reached?}
    Q -->|No| C
    Q -->|Yes| R{Export mode}
    R -->|Raw| S[Build raw JSON payload]
S --> T["Download linkedin_dump_[date].json"]
    R -->|Ignored debug| U[Build ignored-samples JSON preview]
    U --> V[Copy or inspect in popup]
    R -->|Enriched| W[Resolve unique authors]
    W --> X[Reuse local author cache]
    X --> Y[Open one LinkedIn profile tab at a time]
    Y --> Z[Extract role and followers]
    Z --> AA[Classify author weight]
    AA --> AB[Update enrichment progress]
    AB --> AC[Build enriched JSON payload]
AC --> AD["Download linkedin_dump_[date]_enriched.json"]
```

## Notes

- Collection should be resumable and should not duplicate previously captured posts.
- Failures in extraction should be observable and should not corrupt stored results.
- Export is local-only in the current phase.
- Enriched export is sequential and exposes explicit post/author progress while the raw batch remains available immediately.
- Non-organic feed items are excluded before they enter normalized storage.
- Gemini validation runs after capture when the user starts it from the popup, uses fixed-size chunks, and may leave posts in `pending` or `unknown` when quota pressure or errors occur.
