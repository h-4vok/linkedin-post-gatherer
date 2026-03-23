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
- `posted_time`: Relative LinkedIn post age such as `4h` or `2w` when available.
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
- Start only when the user explicitly triggers collection.
- Allow the user to stop collection at any time.
- Stop automatically after reaching a user-defined accepted-post target (default: 50 posts, minimum 1, maximum 200).
- If LinkedIn temporarily stops yielding new posts, tolerate long idle periods by pausing and retrying before declaring the feed exhausted.

### D. User Interface (Popup)

- **Start Button:** Triggers scroll and extraction.
- **Stop Button:** Stops active crawling without clearing the accumulated batch.
- **Target Input:** Lets the user choose a post target between 1 and 200.
- **Quick Presets:** Provide fast target presets such as 25, 50, and 100.
- **Real-time Counter:** Displays `Posts identified: X / target`.
- **Status Badge and Metrics:** Show crawler mode, repost count, and long-wait progress.
- **Activity Log:** Show the latest crawler actions without requiring the user to open DevTools.
- **Export JSON Button:** Generates and downloads a `linkedin_dump_[date].json` file.

## 4. Output JSON Schema

```json
[
  {
    "link": "urn:li:activity:123456789",
    "author": "Author Name",
    "reposted_by": "Reposter Name",
    "post_text": "Full post text...",
    "posted_time": "4h",
    "is_repot": false,
    "type": "organic",
    "extracted_at": "2026-03-16T20:00:00Z"
  }
]
```
