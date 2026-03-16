# Extension Architecture

```mermaid
flowchart LR
    LI[LinkedIn Feed Page]
    CS[Content Script<br/>LinkedIn]
    BG[Background / Service Worker]
    ST[chrome.storage.local]
    EX[JSON Export]
    UI[Popup UI]

    LI --> CS
    UI -->|start collection| BG
    BG -->|start / stop / status| CS
    CS -->|filtered post data| BG
    BG --> ST
    BG -->|progress count| UI
    BG --> EX
    UI -->|export request| BG
```

## Notes

- LinkedIn DOM access stays inside the LinkedIn content script layer.
- Background logic coordinates collection state, deduplication, popup status, and export.
- The popup is part of the MVP contract, but it should remain thin.
- Persistence uses `chrome.storage.local` in the current design.
