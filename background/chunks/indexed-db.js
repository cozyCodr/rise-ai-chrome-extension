const DB_NAME = "rise_ai_context";
const DB_VERSION = 4;
const DOCUMENT_STORE = "documents";
const CHUNK_STORE = "chunks";

export const openContextDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("resumes")) {
        db.createObjectStore("resumes", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const runBatch = async (documents = [], chunks = []) => {
  const db = await openContextDb();
  return new Promise((resolve, reject) => {
    const stores = [DOCUMENT_STORE, CHUNK_STORE];
    const tx = db.transaction(stores, "readwrite");
    const docStore = tx.objectStore(DOCUMENT_STORE);
    const chunkStore = tx.objectStore(CHUNK_STORE);
    docStore.clear();
    chunkStore.clear();
    documents.forEach((doc) => {
      try {
        docStore.put(doc);
      } catch (error) {
        console.warn("[RiseAI] failed to store document record", error);
      }
    });
    chunks.forEach((chunk) => {
      try {
        chunkStore.put(chunk);
      } catch (error) {
        console.warn("[RiseAI] failed to store chunk record", error);
      }
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
};

export const getAllChunks = async () => {
  const db = await openContextDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNK_STORE, "readonly");
    const store = tx.objectStore(CHUNK_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      resolve(Array.isArray(request.result) ? request.result : []);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getChunksByDoc = async (docId) => {
  if (!docId) return [];
  const db = await openContextDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNK_STORE, "readonly");
    const store = tx.objectStore(CHUNK_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : [];
      resolve(rows.filter((row) => row.docId === docId));
    };
    request.onerror = () => reject(request.error);
  });
};

export const replaceContextStores = async ({ documents = [], chunks = [] } = {}) => {
  await runBatch(documents, chunks);
};

