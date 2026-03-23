# Extension Architecture

```mermaid
flowchart LR
    LI[LinkedIn Feed Page]
    LP[LinkedIn Profile Tab]
    CS[Content Script<br/>LinkedIn]
    BG[Background / Service Worker]
    ST[chrome.storage.local]
    GS[Gemini AI Studio API]
    EX[JSON Export]
    UI[Popup UI]

    LI --> CS
    LP --> CS
    UI -->|start collection| BG
    UI -->|AI config| ST
    BG -->|start / stop / status| CS
    CS -->|filtered post data| BG
    UI -->|raw or enriched export| BG
    UI -->|ignored debug preview| BG
    BG -->|profile extract request| CS
    BG -->|serial AI validation| GS
    BG --> ST
    BG -->|progress count| UI
    BG -->|AI activity| CS
    BG --> EX
```

## Notes

- LinkedIn DOM access stays inside the LinkedIn content script layer.
- Background logic coordinates collection state, deduplication, popup status, AI validation, raw export, and sequential enriched export.
- The popup is part of the MVP contract, but it should remain thin.
- Persistence uses `chrome.storage.local` for author cache and lightweight UI preferences, plus tab-scoped session state for active collection data.
- AI validation is configured from the popup and processed conservatively to fit Google AI Studio free-tier limits.
