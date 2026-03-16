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
    K --> L[Update popup counter]
    L --> M{Limit reached?}
    M -->|No| C
    M -->|Yes| N[Build final JSON payload]
    N --> O[Download linkedin_dump_[date].json]
```

## Notes

- Collection should be resumable and should not duplicate previously captured posts.
- Failures in extraction should be observable and should not corrupt stored results.
- Export is local-only in the current phase.
- Non-organic feed items are excluded before they enter normalized storage.
