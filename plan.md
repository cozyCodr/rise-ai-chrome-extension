**Objective**

**Key UX Moments**

**High-Level Architecture**
  - Shadow DOM UI for FAB plus control surface (portrait and landscape shells)
  - DOM scraping helpers for job description capture (auto and manual)
  - Bridge code to invoke Gemini Nano from the page world
  - `chrome.storage.local` for lightweight preferences (folder metadata, prompt options, UI state)
  - IndexedDB for processed context snippets and generated resumes (HTML/EditorJS + metadata)
  - File System Access handles to qualification PDFs (with graceful fallback when unsupported)
  1. User selects or refreshes a qualifications directory.
  2. Service worker (or offscreen document) parses PDFs with pdfjs, chunks text (~1k chars), and stores clean snippets.
  3. Lightweight retrieval (keyword filters now, vector search when Prompt API exposes embeddings) matches job descriptions to context.
  - Heuristic DOM scan (keywords, structural cues, embedded JSON-LD)
  - Manual override via user selection plus trigger

**Resume Generation Flow**
1. Control surface submits job description plus selected context snippet IDs.
2. Service worker crafts prompt (system instructions + JD + context summary) and forwards to Gemini Nano.
3. Response arrives as structured Markdown/EditorJS-like data; convert to editable HTML.
4. Save resume with metadata (JD hash, context references, timestamps) in IndexedDB.
5. Notify UI to open preview or surface success toast.

**Editing & Export**

**Persistence & History**

**Gemini Nano Considerations**

**Implementation Milestones**
1. **Foundations**: Manifest permissions, service worker messaging bus, Shadow DOM FAB shell.
2. **UI / State**: Portrait control surface with tabbed navigation, persisted UI preferences, shared styling tokens.
3. **Context Library**: Directory picker, File System Access ingestion, PDF parsing pipeline, status display.
4. **JD Detection**: Autoscanner heuristics, manual selection capture, normalization pipeline.
5. **Gemini Bridge**: Injected page script for Prompt API calls, request/response codec, error handling.
6. **Resume Generation**: Prompt composition, structured output mapping, history persistence.
7. **Landscape Editor**: Full-screen overlay, rich editing tools, responsive transitions.
8. **Download & Persistence**: PDF export flow, history management (delete, duplicate, restore).
9. **Polish & QA**: Error surfaces, loading states, offline resilience, configurable prompt parameters (temperature/topK).

**Open Questions / Risks**

**Next Steps**

**Future Roadmap**

**Publishing Notes**

- The Prompt API requires an Origin Trial token for Chrome extensions. When preparing a distributable build, enroll the extension using the chrome-extension://<EXTENSION_ID> URL, then add the issued token to manifest.json under a "trial_tokens" entry so background scripts, panels, and content surfaces retain access.
- Repeat this process for additional experimental surfaces (for example, Proofreader API) and keep tokens refreshed as they expire.
- The offscreen Prompt bridge currently pipes a single text prompt (system + job + context) to `session.prompt()`. If the Prompt API moves fully to structured messages, migrate to the documented `[{ role, segments: [{ type: "text", text, languageCode }] }]` format and cap total text length (Chrome tends to return “Other generic failures occurred” when the combined prompt grows beyond a few kilobytes).
- Background retries Gemini with a smaller chunk limit (roughly half, minimum 3) if the first attempt returns a generic failure or empty response.
