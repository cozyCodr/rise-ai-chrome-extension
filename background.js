import {
  STORAGE_KEYS,
  getContextState,
  setContextState,
  getJobState,
  setJobState,
} from "./background/state.js";
import { buildResumePrompt } from "./background/generation/prompt-template.js";
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

registerHandler("rise:profile:save", async (payload = {}, sender) => {
  const profile = payload?.profile ?? null;
  const context = profile
    ? {
        id: crypto?.randomUUID?.() ?? `profile-${Date.now()}`,
        status: "ready",
        lastUpdatedAt: Date.now(),
        profile,
      }
    : null;
  await setContextState(context);
  notifyTab(sender?.tab?.id, { type: "rise:update-context", payload: { context } });
  return { type: "rise:profile:status", payload: { context } };
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

registerHandler("rise:generator:resume", async (payload = {}) => {
  console.info("[RiseAI] background resume generation", {
    timestamp: new Date().toISOString(),
  });

  const prompt = await buildResumePrompt();
  const generation = await generateViaOffscreen({
    options: {
      systemPrompt: prompt.systemPrompt,
      temperature: payload.temperature ?? 0.25,
      topK: payload.topK ?? 32,
    },
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    prompt: prompt.userPrompt,
  });

  if (!generation?.text) {
    throw new Error("Gemini returned an empty response.");
  }

  const resume = parseResumeJson(generation.text);

  return {
    type: "rise:generator:resume",
    payload: {
      resume,
      metadata: {
        prompt,
        finishReason: generation?.finishReason ?? null,
        usage: generation?.usage ?? null,
      },
      rawText: generation.text,
    },
  };
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


