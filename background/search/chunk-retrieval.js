const DB_NAME = "rise_ai_context";
const DB_VERSION = 4;
const CHUNK_STORE = "chunks";

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
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

const readAllChunks = async () => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNK_STORE, "readonly");
    const store = tx.objectStore(CHUNK_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
};

const normalize = (text = "") =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (text = "") => normalize(text).split(" ").filter(Boolean);

const createTermFrequency = (tokens) => {
  const map = new Map();
  tokens.forEach((token) => map.set(token, (map.get(token) || 0) + 1));
  return map;
};

const scoreChunk = (queryMap, chunkMap) => {
  let score = 0;
  queryMap.forEach((weight, term) => {
    if (chunkMap.has(term)) {
      score += weight * chunkMap.get(term);
    }
  });
  return score;
};

let cachedChunks = null;

const ensureChunks = async () => {
  if (!cachedChunks) {
    const rows = await readAllChunks();
    cachedChunks = rows.map((row) => ({
      ...row,
      _tokenMap: null,
    }));
  }
  return cachedChunks;
};

export const invalidateChunkCache = () => {
  cachedChunks = null;
};

export const findRelevantChunks = async ({ jobDescription, limit = 12 }) => {
  if (!jobDescription) return [];
  const chunks = await ensureChunks();
  if (!chunks.length) return [];

  const queryTokens = tokenize(jobDescription);
  if (!queryTokens.length) return [];
  const queryMap = createTermFrequency(queryTokens);

  const scored = chunks
    .map((chunk) => {
      if (!chunk._tokenMap) {
        const tokens = tokenize(chunk.text ?? "");
        chunk._tokenMap = createTermFrequency(tokens);
      }
      const score = scoreChunk(queryMap, chunk._tokenMap);
      return score > 0
        ? {
            id: chunk.id,
            docId: chunk.docId,
            text: chunk.text,
            order: chunk.order ?? 0,
            score,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
};

export const findChunksGroupedByDocument = async ({ jobDescription, limitPerDoc = 4 }) => {
  const chunks = await findRelevantChunks({ jobDescription, limit: limitPerDoc * 5 });
  if (!chunks.length) return [];
  const grouped = new Map();
  chunks.forEach((chunk) => {
    const list = grouped.get(chunk.docId) || [];
    if (list.length < limitPerDoc) {
      list.push(chunk);
      grouped.set(chunk.docId, list);
    }
  });
  return Array.from(grouped.entries()).map(([docId, chunks]) => ({ docId, chunks }));
};
