import {
  STORAGE_KEYS,
  getContextState,
  setContextState,
  getJobState,
  setJobState,
} from "./background/state.js";
import { buildResumePrompt } from "./background/generation/prompt-template.js";
import { invalidateChunkCache } from "./background/search/chunk-retrieval.js";
import { replaceContextStores } from "./background/chunks/indexed-db.js";
import {
  availabilityViaOffscreen,
  generateViaOffscreen,
  resetOffscreenSession,
} from "./background/prompt-session.js";

const log = (...args) => console.log("[RiseAI]", ...args);

chrome.runtime.onInstalled.addListener(() => {
  log("Service worker installed");
});

let keepaliveInterval = null;

const startKeepalive = () => {
  if (keepaliveInterval) return;
  keepaliveInterval = setInterval(() => {
    log("keepalive ping");
  }, 20000);
};

const stopKeepalive = () => {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
};

chrome.runtime.onStartup.addListener(() => {
  log("Service worker startup");
  startKeepalive();
});

chrome.runtime.onConnect.addListener((port) => {
  log("Port connected:", port.name);
  startKeepalive();
  port.onDisconnect.addListener(() => {
    log("Port disconnected");
  });
});

startKeepalive();

const messageHandlers = new Map();
const registerHandler = (type, handler) => messageHandlers.set(type, handler);

const notifyTab = (tabId, message) => {
  if (typeof tabId !== "number") return;
  chrome.tabs.sendMessage(tabId, message, () => {
    if (chrome.runtime.lastError) {
      log("notify error", chrome.runtime.lastError.message);
    }
  });
};

registerHandler("rise:context:get-status", async () => {
  const context = await getContextState();
  return { type: "rise:context:status", payload: { context } };
});

registerHandler("rise:context:selected", async (payload = {}, sender) => {
  const context = {
    id: crypto.randomUUID(),
    name: payload.name ?? "Qualifications",
    pickedAt: Date.now(),
    status: "pending",
    totalFiles: payload.totalFiles ?? 0,
    pdfFiles: payload.pdfFiles ?? payload.totalFiles ?? 0,
    chunkCount: payload.chunkCount ?? 0,
  };
  await setContextState(context);
  notifyTab(sender.tab?.id, { type: "rise:update-context", payload: { context } });
  return { type: "rise:context:status", payload: { context } };
});

registerHandler("rise:context:refresh", async (_, sender) => {
  const current = await getContextState();
  if (!current) {
    return {
      type: "rise:context:status",
      payload: { context: null, message: "No context folder selected yet." },
    };
  }
  const updated = { ...current, status: "refreshing", lastRefreshedAt: Date.now() };
  await setContextState(updated);
  notifyTab(sender.tab?.id, { type: "rise:update-context", payload: { context: updated } });
  return { type: "rise:context:status", payload: { context: updated } };
});

registerHandler("rise:context:scan-result", async (payload = {}, sender) => {
  const current = await getContextState();
  if (!current) {
    return {
      type: "rise:context:status",
      payload: { context: null, message: "No context recorded. Pick a folder again." },
    };
  }
  const updated = {
    ...current,
    status: payload.error ? "error" : "ready",
    totalFiles: payload.totalEntries ?? current.totalFiles ?? 0,
    pdfFiles: payload.pdfCount ?? current.pdfFiles ?? 0,
    chunkCount: payload.chunkCount ?? current.chunkCount ?? 0,
    lastRefreshedAt: payload.scannedAt ?? Date.now(),
    errorMessage: payload.error ?? null,
    topEntries: payload.topEntries ?? current.topEntries ?? [],
  };
  await setContextState(updated);
  notifyTab(sender.tab?.id, { type: "rise:update-context", payload: { context: updated } });
  return { type: "rise:context:status", payload: { context: updated } };
});

registerHandler("rise:context:store", async (payload = {}) => {
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
  await replaceContextStores({ documents, chunks });
  invalidateChunkCache();
  return {
    type: "rise:context:store:ack",
    payload: { documentCount: documents.length, chunkCount: chunks.length },
  };
});

registerHandler("rise:context:view", async (_, sender) => {
  const context = await getContextState();
  notifyTab(sender.tab?.id, { type: "rise:update-context", payload: { context } });
  return { type: "rise:context:status", payload: { context } };
});

registerHandler("rise:jd:get", async (_, sender) => {
  const job = await getJobState();
  notifyTab(sender.tab?.id, { type: "rise:update-jd", payload: { job } });
  return { type: "rise:jd:status", payload: { job } };
});

registerHandler("rise:jd:update", async (payload = {}, sender) => {
  const job = {
    text: payload.text ?? "",
    source: payload.source ?? "auto",
    updatedAt: Date.now(),
  };
  await setJobState(job);
  notifyTab(sender.tab?.id, { type: "rise:update-jd", payload: { job } });
  return { type: "rise:jd:status", payload: { job } };
});

registerHandler("rise:gemini:availability", async (payload = {}) => {
  const result = await availabilityViaOffscreen(payload);
  return { type: "rise:gemini:availability", payload: result };
});

registerHandler("rise:gemini:generate", async (payload = {}) => {
  const result = await generateViaOffscreen(payload);
  return { type: "rise:gemini:generate", payload: result };
});

registerHandler("rise:gemini:reset", async () => {
  const result = await resetOffscreenSession();
  return { type: "rise:gemini:reset", payload: result };
});

const parseResumeJson = (text = "") => {
  if (!text) throw new Error("Gemini returned an empty response.");
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch (error) {
    const fenceMatch =
      direct.match(/```json\s*([\s\S]*?)```/) ||
      direct.match(/```([\s\S]*?)```/) ||
      direct.match(/\{[\s\S]*\}/);
    if (fenceMatch) {
      const jsonCandidate = fenceMatch[1] ?? fenceMatch[0];
      return JSON.parse(jsonCandidate);
    }
    throw error;
  }
};

registerHandler("rise:generator:resume", async (payload = {}, sender) => {
  const requestId =
    typeof payload.requestId === "string" && payload.requestId
      ? payload.requestId
      : `resume-${crypto?.randomUUID?.() || Date.now()}`;
  const targetTabId = sender?.tab?.id;
  const forwardStreamChunk = (chunk) => {
    if (!targetTabId) return;
    notifyTab(targetTabId, {
      type: "rise:gemini:stream",
      payload: {
        requestId,
        ...chunk,
      },
    });
  };

  const baseChunkLimit = payload.chunkLimit ?? 6;
  const attemptedLimits = [];
  let lastError = null;

  const limitsToTry = [baseChunkLimit, Math.max(3, Math.floor(baseChunkLimit / 2))];

  for (const currentLimit of limitsToTry) {
    if (!currentLimit || attemptedLimits.includes(currentLimit)) continue;
    attemptedLimits.push(currentLimit);

    try {
      console.info("[RiseAI] background resume attempt", {
        chunkLimit: currentLimit,
        timestamp: new Date().toISOString(),
      });

      const prompt = await buildResumePrompt({ chunkLimit: currentLimit });
      const generation = await generateViaOffscreen({
        requestId,
        options: {
          systemPrompt: prompt.systemPrompt,
          temperature: payload.temperature ?? 0.65,
          topK: payload.topK ?? 40,
        },
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        prompt: prompt.userPrompt,
      }, { onChunk: forwardStreamChunk });

      if (!generation?.text) {
        console.warn("[RiseAI] Gemini returned empty text", {
          chunkLimit: currentLimit,
        });
        lastError = new Error("Gemini returned an empty response.");
        continue;
      }

      const resume = parseResumeJson(generation.text);

      return {
        type: "rise:generator:resume",
        payload: {
          resume,
          metadata: {
            prompt,
            chunkLimit: currentLimit,
            finishReason: generation?.finishReason ?? null,
            usage: generation?.usage ?? null,
          },
          rawText: generation.text,
        },
      };
    } catch (error) {
      console.warn("[RiseAI] background resume attempt failed", {
        chunkLimit: currentLimit,
        error: error?.message ?? String(error),
      });
      lastError = error;

      const message = typeof error?.message === "string" ? error.message : "";
      const retryable =
        message.includes("Other generic failures occurred") ||
        message.includes("Gemini returned an empty response");
      if (!retryable) {
        break;
      }
    }
  }

  throw lastError ?? new Error("Resume generation failed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.type === "string" && message.type.startsWith("offscreen:")) {
    return false;
  }
  const handler = messageHandlers.get(message?.type);
  if (!handler) {
    sendResponse?.({ ok: false, error: `Unhandled message type: ${message?.type}` });
    return;
  }

  try {
    const result = handler(message.payload, sender);
    if (result instanceof Promise) {
      result
        .then((data) => sendResponse?.({ ok: true, ...data }))
        .catch((error) => sendResponse?.({ ok: false, error: error.message }));
      return true;
    }
    sendResponse?.({ ok: true, ...result });
  } catch (error) {
    sendResponse?.({ ok: false, error: error.message });
  }
});


