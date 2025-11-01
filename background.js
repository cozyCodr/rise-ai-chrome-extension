import {
  STORAGE_KEYS,
  getContextState,
  setContextState,
  getJobState,
  setJobState,
} from "./background/state.js";
import { buildResumePrompt } from "./background/generation/prompt-template.js";
import { buildCoverLetterPrompt } from "./background/generation/cover-letter-template.js";
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
    title: payload.title ?? "",
    company: payload.company ?? "",
    reference: payload.reference ?? "",
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

const extractTitleAndJson = (text = "") => {
  if (!text) throw new Error("Gemini returned an empty response.");
  const trimmed = text.trim();

  // Extract title if present (format: "title::Company Name Resume - John Doe")
  let title = null;
  let jsonText = trimmed;

  const titleMatch = trimmed.match(/^title::(.+?)(?:\n|$)/);
  if (titleMatch) {
    title = titleMatch[1].trim();
    // Remove the title line from the text
    jsonText = trimmed.substring(titleMatch[0].length).trim();
  }

  // Parse JSON
  let resume;
  try {
    resume = JSON.parse(jsonText);
  } catch (error) {
    const fenceMatch =
      jsonText.match(/```json\s*([\s\S]*?)```/) ||
      jsonText.match(/```([\s\S]*?)```/) ||
      jsonText.match(/\{[\s\S]*\}/);
    if (fenceMatch) {
      const jsonCandidate = fenceMatch[1] ?? fenceMatch[0];
      resume = JSON.parse(jsonCandidate);
    } else {
      throw error;
    }
  }

  return { title, resume };
};

const parseResumeJson = (text = "") => {
  const { resume } = extractTitleAndJson(text);
  return resume;
};

registerHandler("rise:generator:resume", async (payload = {}) => {
  console.info("[RiseAI] background resume generation", {
    timestamp: new Date().toISOString(),
  });

  const prompt = await buildResumePrompt();
  const generation = await generateViaOffscreen({
    options: {
      systemPrompt: prompt.systemPrompt,
      temperature: payload.temperature ?? 0.45,
      topK: payload.topK ?? 40,
    },
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    prompt: prompt.userPrompt,
  });

  if (!generation?.text) {
    throw new Error("Gemini returned an empty response.");
  }

  const { title, resume } = extractTitleAndJson(generation.text);

  return {
    type: "rise:generator:resume",
    payload: {
      resume,
      generatedTitle: title,
      metadata: {
        prompt,
        finishReason: generation?.finishReason ?? null,
        usage: generation?.usage ?? null,
      },
      rawText: generation.text,
    },
  };
});

registerHandler("rise:generator:cover-letter", async (payload = {}) => {
  console.info("[RiseAI] background cover letter generation", {
    timestamp: new Date().toISOString(),
  });

  const prompt = await buildCoverLetterPrompt();
  const generation = await generateViaOffscreen({
    options: {
      systemPrompt: prompt.systemPrompt,
      temperature: payload.temperature ?? 0.35,
      topK: payload.topK ?? 32,
    },
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    prompt: prompt.userPrompt,
  });

  if (!generation?.text) {
    throw new Error("Gemini returned an empty response.");
  }

  const letterText = generation.text.trim();
  if (!letterText) {
    throw new Error("Gemini returned an empty cover letter.");
  }

  return {
    type: "rise:generator:cover-letter",
    payload: {
      letter: letterText,
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

