# Requirements: LinkedIn Intelligence Harvester (Chrome Extension)

## 1. Project Purpose
Develop a Chrome Extension (Manifest V3) to automate the collection of raw data from the LinkedIn feed for subsequent AI analysis. The tool must prioritize "human-like" behavior to avoid detection and strictly filter out non-organic content.

## 2. Tech Stack
- **Platform:** Chrome Extension API (Manifest V3)
- **Languages:** JavaScript (Vanilla), HTML, CSS
- **Storage:** `chrome.storage.local` for session data persistence

## 3. Core Functionalities (MVP)

### A. Data Extraction (Content Script)
Identify and extract the following fields from each post container:
- `author_name`: Name of the author or the person reposting.
- `reposted_by`: Name of the reposter when LinkedIn explicitly marks the post as a repost.
- `post_text`: Full textual content of the post.
- `link`: link to post.
- `is_repost`: Boolean flag indicating shared content.
- `timestamp`: Extraction date/time.

### B. Noise Filters (Exclusions)
The script MUST skip:
- **Promoted Posts:** Any container with "Promoted" or "Publicidad" labels.
- **Polls:** Any post containing interactive voting options.
- **Suggested Content:** Non-organic "Suggested for you" posts.

### C. Human-Like Scroll Engine
To load dynamic content and mimic human browsing:
- Scroll in increments of 400px to 600px.
- Random delays of 1.5s to 3.5s between scrolls.
- Stop automatically after reaching a user-defined limit (default: 50 posts).

### D. User Interface (Popup)
- **Start Hunting Button:** Triggers the scroll and extraction.
- **Real-time Counter:** Displays `Posts identified: X / 50`.
- **Export JSON Button:** Generates and downloads a `linkedin_dump_[date].json` file.

## 4. Output JSON Schema
```json
[
  {
    "link": "urn:li:activity:123456789",
    "author": "Author Name",
    "reposted_by": "Reposter Name",
    "post_text": "Full post text...",
    "is_repot": false,
    "type": "organic",
    "extracted_at": "2026-03-16T20:00:00Z"
  }
]
