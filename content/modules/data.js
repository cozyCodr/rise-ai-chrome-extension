const DB_CONFIG = {
  NAME: "rise_ai_context",
  VERSION: 4,
  STORES: {
    HANDLES: "handles",
    DOCUMENTS: "documents",
    CHUNKS: "chunks",
    RESUMES: "resumes",
  },
};

let dbPromise = null;

const openDatabase = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const { HANDLES, DOCUMENTS, CHUNKS, RESUMES } = DB_CONFIG.STORES;
        if (!db.objectStoreNames.contains(HANDLES)) {
          db.createObjectStore(HANDLES);
        }
        if (!db.objectStoreNames.contains(DOCUMENTS)) {
          db.createObjectStore(DOCUMENTS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CHUNKS)) {
          db.createObjectStore(CHUNKS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(RESUMES)) {
          db.createObjectStore(RESUMES, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
};

const ensureTransaction = (db, storeName, mode) => {
  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error(`Object store "${storeName}" is unavailable. Refresh Rise AI to rescan your library.`);
  }
  return db.transaction(storeName, mode);
};

const withStore = async (storeName, mode, callback) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = ensureTransaction(db, storeName, mode);
    } catch (error) {
      db.close();
      dbPromise = null;
      reject(error);
      return;
    }
    const store = tx.objectStore(storeName);
    let result;
    try {
      const possibleRequest = callback(store, tx);
      if (possibleRequest && "onsuccess" in possibleRequest && "onerror" in possibleRequest) {
        possibleRequest.onsuccess = () => {
          result = possibleRequest.result;
        };
        possibleRequest.onerror = () => {
          reject(possibleRequest.error);
        };
      } else {
        result = possibleRequest;
      }
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
};

export const database = {
  saveDocument: (doc) =>
    withStore(DB_CONFIG.STORES.DOCUMENTS, "readwrite", (store) => store.put(doc)),
  listDocuments: () =>
    withStore(DB_CONFIG.STORES.DOCUMENTS, "readonly", (store) => store.getAll()),
  clearDocuments: () =>
    withStore(DB_CONFIG.STORES.DOCUMENTS, "readwrite", (store) => store.clear()),
  saveChunk: (chunk) =>
    withStore(DB_CONFIG.STORES.CHUNKS, "readwrite", (store) => store.put(chunk)),
  clearChunks: () =>
    withStore(DB_CONFIG.STORES.CHUNKS, "readwrite", (store) => store.clear()),
  saveResume: (entry) =>
    withStore(DB_CONFIG.STORES.RESUMES, "readwrite", (store) => store.put(entry)),
  listResumes: () =>
    withStore(DB_CONFIG.STORES.RESUMES, "readonly", (store) => store.getAll()),
  saveHandle: (handle) =>
    withStore(DB_CONFIG.STORES.HANDLES, "readwrite", (store) => store.put(handle, "context")),
  getHandle: () =>
    withStore(DB_CONFIG.STORES.HANDLES, "readonly", (store) => store.get("context")),
};

let pdfjsPromise = null;

const loadPdfjs = async () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import(chrome.runtime.getURL("vendor/pdfjs/pdf.mjs")).then((pdfjs) => {
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.mjs");
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
};

const normaliseWhitespace = (text = "") => text.replace(/\s+/g, " ").trim();

export const Chunking = {
  async extractText(file) {
    if (!file) return "";
    try {
      const pdfjs = await loadPdfjs();
      const buffer = await file.arrayBuffer();
      const task = pdfjs.getDocument({ data: buffer, useSystemFonts: true });
      const pdf = await task.promise;
      let text = "";
      const maxPages = Math.min(pdf.numPages, 40);
      for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => (typeof item.str === "string" ? item.str : ""))
          .join(" ");
        text += `${pageText}\n`;
        if (text.length > 20000) break;
      }
      await pdf.destroy();
      return normaliseWhitespace(text);
    } catch (error) {
      console.warn("[RiseAI] PDF extraction failed", error);
      return "";
    }
  },
  chunkText(text, size = 900, overlap = 120) {
    const cleaned = normaliseWhitespace(text);
    if (!cleaned) return [];
    const chunks = [];
    let start = 0;
    while (start < cleaned.length) {
      const end = Math.min(start + size, cleaned.length);
      let segment = cleaned.slice(start, end);
      if (end < cleaned.length) {
        const lastSpace = segment.lastIndexOf(" ");
        if (lastSpace > 200) {
          segment = segment.slice(0, lastSpace);
        }
      }
      chunks.push(segment.trim());
      if (end >= cleaned.length) break;
      start = end - overlap;
    }
    return chunks.filter(Boolean);
  },
};

let selectionAttached = false;
let lastSelection = window.__riseAiLastSelectionText || "";

const captureSelection = () => {
  try {
    const selection = document.getSelection();
    if (!selection || !selection.rangeCount) return;
    const text = selection.toString().trim();
    if (!text) return;
    const host = document.getElementById("rise-ai-root");
    if (host && selection.anchorNode) {
      if (host.contains(selection.anchorNode)) return;
      if (host.shadowRoot && host.shadowRoot.contains(selection.anchorNode)) return;
    }
    lastSelection = text;
    window.__riseAiLastSelectionText = text;
    window.dispatchEvent(new CustomEvent("riseai-selection-update", { detail: { text } }));
  } catch (error) {
    console.warn("[RiseAI] selection capture error", error);
  }
};

export const SelectionTracker = {
  init() {
    if (selectionAttached) return;
    document.addEventListener("selectionchange", captureSelection, true);
    document.addEventListener(
      "mouseup",
      () => {
        setTimeout(captureSelection, 16);
      },
      true
    );
    document.addEventListener(
      "keyup",
      (event) => {
        if (["Shift", "Enter", "Escape"].includes(event.key)) {
          captureSelection();
        }
      },
      true
    );
    selectionAttached = true;
  },
  get() {
    return window.__riseAiLastSelectionText || lastSelection || "";
  },
};

const sendRuntimeMessage = (type, payload) =>
  new Promise((resolve, reject) => {
    try {
      if (!chrome.runtime?.id) {
        reject(new Error("Extension context invalidated. Reload the page."));
        return;
      }
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || "";
          if (errorMsg.includes("message port closed") || errorMsg.includes("Receiving end does not exist")) {
            reject(new Error("Background service worker inactive. Try again."));
          } else {
            reject(new Error(errorMsg));
          }
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error ?? "Background request failed."));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });

export const GeminiBridge = {
  async generateResume(payload, { onChunk } = {}) {
    const requestId = `resume-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const enrichedPayload = { ...(payload || {}), requestId };
    console.info("[RiseAI] GeminiBridge.generateResume", {
      chunkLimit: enrichedPayload?.chunkLimit,
      temperature: enrichedPayload?.temperature,
      topK: enrichedPayload?.topK,
      requestId,
    });
    let listener = null;
    if (typeof onChunk === "function") {
      listener = (message) => {
        if (message?.type !== "rise:gemini:stream") return;
        const chunk = message.payload || {};
        if (chunk.requestId !== requestId) return;
        try {
          onChunk(chunk);
        } catch (error) {
          console.warn("[RiseAI] GeminiBridge chunk listener error", error);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
    }
    try {
      const response = await sendRuntimeMessage("rise:generator:resume", enrichedPayload);
      console.info("[RiseAI] GeminiBridge.generateResume response", {
        hasResume: !!response?.payload?.resume,
        finishReason: response?.payload?.metadata?.finishReason ?? null,
      });
      return response;
    } catch (error) {
      console.error("[RiseAI] GeminiBridge.generateResume error", error);
      throw error;
    } finally {
      if (listener) {
        chrome.runtime.onMessage.removeListener(listener);
      }
    }
  },
};

const normaliseEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const createdAtMs = entry.createdAtMs ?? Date.now();
      const updatedAtMs = entry.updatedAtMs ?? createdAtMs;
      return {
        ...entry,
        id: entry.id ?? `resume-${createdAtMs}`,
        createdAtMs,
        updatedAtMs,
        createdAt: entry.createdAt ?? new Date(createdAtMs).toLocaleString(),
        updatedAt: entry.updatedAt ?? new Date(updatedAtMs).toLocaleString(),
        editedHtml: entry.editedHtml ?? null,
      };
    })
    .sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0))
    .slice(0, 20);

export const HistoryRepository = {
  async fetch() {
    const rows = await database.listResumes();
    return normaliseEntries(rows);
  },
  async save(entry) {
    const [normalised] = normaliseEntries([entry]);
    await database.saveResume(normalised);
    return normalised;
  },
};

const PREF_STORAGE_KEY = "riseai:ui-preferences";

export const Preferences = {
  async load() {
    return new Promise((resolve) => {
      if (!chrome.storage?.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get([PREF_STORAGE_KEY], (data) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(data?.[PREF_STORAGE_KEY] ?? {});
      });
    });
  },
  async save(patch) {
    if (!chrome.storage?.local) return;
    const current = await Preferences.load();
    return new Promise((resolve) => {
      const next = { ...current, ...patch };
      chrome.storage.local.set({ [PREF_STORAGE_KEY]: next }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[RiseAI] preference save failed", chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  },
};

export const runtimeApi = {
  send: sendRuntimeMessage,
};


