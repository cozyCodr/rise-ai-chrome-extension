
- [ ] **Milestone 1 – Extension Foundations**
  - [ ] Expand `manifest.json` permissions (`scripting`, `downloads`, `storage`, `fileSystemAccess`, host patterns).
  - [ ] Move FAB UI into Shadow DOM wrapper and prepare toggle messaging to service worker.
  - [ ] Scaffold MV3 service worker with message bus (UI ⇄ worker ⇄ injected scripts).

- [ ] **Milestone 2 – UI Shell & State**
  - [ ] Build portrait control panel component (settings, history, actions).
  - [ ] Implement panel open/close animation + resize transition to landscape preview.
  - [ ] Persist base preferences (Prompt settings, panel state) via `chrome.storage.local`.

- [ ] **Milestone 3 – Context Library**
  - [ ] Integrate File System Access directory picker, store handles securely.
  - [ ] Implement PDF ingestion worker (pdfjs) and chunking cache (IndexedDB).
  - [ ] Surface ingestion status + document counts in UI.

- [ ] **Milestone 4 – Job Description Capture**
  - [ ] Add automatic DOM scraper with heuristics for JD sections.
  - [ ] Support manual selection fallback (context menu or highlight + button).
  - [ ] Normalize JD text (cleanup, deduplicate, metadata tagging).

- [ ] **Milestone 5 – Gemini Nano Bridge**
  - [ ] Inject page script to access `window.ai.languageModel`.
  - [ ] Implement availability checks and error surface in portrait panel.
  - [ ] Design prompt template + response schema (EditorJS/Markdown).

- [ ] **Milestone 6 – Generation & Persistence**
  - [ ] Compose request pipeline (JD + context snippets) and call Gemini.
  - [ ] Map model output to editor state; store resume entries in IndexedDB.
  - [ ] Build history list with open/duplicate/delete actions.

- [ ] **Milestone 7 – Editor & Export**
  - [ ] Implement landscape editor overlay with formatting toolbar.
  - [ ] Add save/versioning logic and sync back to history.
  - [ ] Provide PDF export via `chrome.downloads.download`.

- [ ] **Milestone 8 – Polish & QA**
  - [ ] Implement error toasts/loading indicators across flows.
  - [ ] Add settings for generation params (temperature/topK) and storage pruning.
  - [ ] Document setup instructions, feature overview, and future enhancements.
