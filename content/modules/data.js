const DB_CONFIG = {
  NAME: "rise_ai_data",
  VERSION: 1,
  STORES: {
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
        const { RESUMES } = DB_CONFIG.STORES;
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

const withStore = async (storeName, mode, callback) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
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
  saveResume: (entry) =>
    withStore(DB_CONFIG.STORES.RESUMES, "readwrite", (store) => store.put(entry)),
  listResumes: () =>
    withStore(DB_CONFIG.STORES.RESUMES, "readonly", (store) => store.getAll()),
};

export const DEFAULT_PROFILE = {
  header: {
    fullName: "",
    headline: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    linkedin: "",
  },
  summary: "",
  experience: [],
  projects: [],
  education: [],
  skills: [],
  certifications: [],
};

const randomId = (prefix) =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);

const ensureWithId = (entry, prefix) => {
  const result = { ...(entry || {}) };
  if (!result.id) {
    result.id = randomId(prefix);
  }
  return result;
};

const normaliseProfile = (profile) => {
  if (!profile || typeof profile !== "object") {
    return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  }
  const merged = {
    ...DEFAULT_PROFILE,
    ...profile,
    header: { ...DEFAULT_PROFILE.header, ...(profile.header ?? {}) },
  };
  merged.experience = Array.isArray(profile.experience)
    ? profile.experience.map((item) => ensureWithId(item, "exp"))
    : [];
  merged.projects = Array.isArray(profile.projects)
    ? profile.projects.map((item) => ensureWithId(item, "proj"))
    : [];
  merged.education = Array.isArray(profile.education)
    ? profile.education.map((item) => ensureWithId(item, "edu"))
    : [];
  merged.skills = Array.isArray(profile.skills)
    ? profile.skills
    : typeof profile.skills === "string"
    ? profile.skills.split(",").map((skill) => skill.trim()).filter(Boolean)
    : [];
  merged.certifications = Array.isArray(profile.certifications)
    ? profile.certifications
    : typeof profile.certifications === "string"
    ? profile.certifications.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  return merged;
};

export const ProfileStore = {
  async load() {
    const response = await sendRuntimeMessage("rise:context:get-status");
    const context = response?.payload?.context ?? null;
    if (!context?.profile) {
      return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    }
    return normaliseProfile(context.profile);
  },
  async save(profile) {
    const normalised = normaliseProfile(profile);
    await sendRuntimeMessage("rise:profile:save", { profile: normalised });
    return normalised;
  },
  async clear() {
    await sendRuntimeMessage("rise:profile:save", { profile: null });
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
  async generateResume(payload = {}) {
    console.info("[RiseAI] GeminiBridge.generateResume", {
      temperature: payload?.temperature,
      topK: payload?.topK,
    });
    try {
      const response = await sendRuntimeMessage("rise:generator:resume", payload);
      console.info("[RiseAI] GeminiBridge.generateResume response", {
        hasResume: !!response?.payload?.resume,
        finishReason: response?.payload?.metadata?.finishReason ?? null,
      });
      return response;
    } catch (error) {
      console.error("[RiseAI] GeminiBridge.generateResume error", error);
      throw error;
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


