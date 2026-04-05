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
    K --> L{Optional manual pass}
    L -->|Run enrichment| M[Resolve unique authors]
    M --> N[Reuse local author cache]
    N --> O[Open one LinkedIn profile tab at a time]
    O --> P[Extract role and followers]
    P --> Q[Classify author weight]
    Q --> R[Persist enrichment snapshot]
    K --> S[User triggers AI validation]
    R --> S
    S --> T[Reset items to pending and send chunked Gemini bulk request]
    T --> U[Persist interest_validation]
    U --> V[Emit AI activity to panel]
    V --> W[Update popup counter]
    W --> X{Limit reached?}
    X -->|No| C
    X -->|Yes| Y{Debug preview or download}
    Y -->|Download result| Z[Compose latest snapshot]
    Z --> AA["Download linkedin_crawl_result_[yyyymmdd-hhmmss].json"]
    Y -->|Ignored debug| AB[Build ignored-samples JSON preview]
    AB --> AC[Copy or inspect in popup]
```

## Notes

- Collection should be resumable and should not duplicate previously captured posts.
- Failures in extraction should be observable and should not corrupt stored results.
- Export is local-only in the current phase.
- The LinkedIn panel downloads the latest stable result snapshot and disables download while the crawler, enrichment, or AI validation is running.
- Author enrichment is sequential, preserves partial progress on cancellation, and the latest download composes that snapshot with the latest AI validation overlay.
- Enriched author classification may end in `trivial` when enrichment cannot find followers or a strong enough role signal; `low` is reserved for authors with real but weak follower evidence.
- Non-organic feed items are excluded before they enter normalized storage.
- Gemini validation runs after capture, uses fixed-size chunks, and may leave posts in `pending` or `unknown` when quota pressure or errors occur.
