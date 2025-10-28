(() => {
  console.log("[RiseAI Offscreen] Script loading...");
  if (window.__riseAiOffscreenReady) {
    console.log("[RiseAI Offscreen] Already initialized, skipping");
    return;
  }

  const state = { sessionPromise: null };

  const createSessionFactory = () => {
    const namespace = window.ai?.languageModel ?? window.LanguageModel ?? null;
    if (!namespace) return null;
    if (typeof namespace.create === "function") return (opts) => namespace.create(opts);
    if (typeof namespace.createSession === "function") return (opts) => namespace.createSession(opts);
    if (typeof namespace.createTextSession === "function") return (opts) => namespace.createTextSession(opts);
    if (typeof window.ai?.createTextSession === "function") return (opts) => window.ai.createTextSession(opts);
    return null;
  };

  const ensureSession = async (options = {}) => {
    if (state.sessionPromise) return state.sessionPromise;
    const factory = createSessionFactory();
    if (!factory) {
      throw new Error("Prompt API unavailable or create() not exposed.");
    }
    const sessionOptions = {
      topK: options.topK ?? 40,
      temperature: options.temperature ?? 0.7,
      expectedOutputs: [
        { type: "text", languages: ["en"] }
      ]
    };

    // DON'T use initialPrompts - it counts against per-prompt token limit
    // Instead, we'll prepend system prompt to user prompt manually

    console.log("[RiseAI Offscreen] Creating session with options:", {
      topK: sessionOptions.topK,
      temperature: sessionOptions.temperature,
      hasExpectedOutputs: !!sessionOptions.expectedOutputs
    });
    state.sessionPromise = factory(sessionOptions);
    try {
      return await state.sessionPromise;
    } catch (error) {
      console.error("[RiseAI Offscreen] Session creation failed:", error);
      state.sessionPromise = null;
      throw error;
    }
  };

  const destroySession = async () => {
    if (!state.sessionPromise) return;
    try {
      const session = await state.sessionPromise;
      session?.destroy?.();
    } catch (error) {
      console.warn("[RiseAI] offscreen destroy failed", error);
    } finally {
      state.sessionPromise = null;
    }
  };

  const composePromptText = (messages, fallbackPrompt) => {
    if (Array.isArray(messages) && messages.length) {
      return messages
        .map((msg) => {
          if (!msg) return "";
          const role = msg.role ? `[${msg.role.toUpperCase()}]` : "";
          const parts = Array.isArray(msg.content) ? msg.content : [msg.content];
          const body = parts
            .map((part) => {
              if (!part) return "";
              if (typeof part === "string") return part;
              if (typeof part === "object" && typeof part.text === "string") return part.text;
              if (typeof part === "object" && typeof part.value === "string") return part.value;
              return String(part);
            })
            .filter(Boolean)
            .join("\n\n");
          return role ? `${role}\n${body}` : body;
        })
        .filter(Boolean)
        .join("\n\n");
    }
    return String(fallbackPrompt ?? "");
  };

  const extractTextSegments = (value, segments, seen) => {
    if (!value) return;
    if (typeof value === "string") {
      if (value) segments.push(value);
      return;
    }
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (typeof value.text === "string") segments.push(value.text);
    if (typeof value.value === "string") segments.push(value.value);

    const enqueue = (candidate) => {
      if (!candidate) return;
      if (Array.isArray(candidate)) {
        candidate.forEach((item) => extractTextSegments(item, segments, seen));
      } else {
        extractTextSegments(candidate, segments, seen);
      }
    };

    enqueue(value.delta);
    enqueue(value.segment);
    enqueue(value.segments);
    enqueue(value.output);
    enqueue(value.candidates);
    enqueue(value.content);
    enqueue(value.parts);
    enqueue(value.messages);
    enqueue(value.data);
  };

  const unwrapResponseText = (payload) => {
    const segments = [];
    const seen = new WeakSet();
    extractTextSegments(payload, segments, seen);
    return segments.join("");
  };

  const handlers = {
    ping() {
      return { ok: true };
    },
    async "prompt:availability"(payload = {}) {
      const namespace = window.ai?.languageModel ?? window.LanguageModel ?? null;
      if (!namespace) {
        throw new Error("Prompt API unavailable.");
      }
      if (typeof namespace.availability !== "function") {
        return { state: "unknown" };
      }
      const options =
        payload.options ?? {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
        };
      return namespace.availability(options);
    },
    async "prompt:generate"(payload = {}) {
      try {
        const session = await ensureSession(payload.options || {});
        let userText = composePromptText(payload.messages, payload.prompt);
        if (!userText.trim()) {
          throw new Error("No prompt supplied.");
        }

        // Prepend system prompt manually to stay within 1024 token limit
        const systemPrompt = payload.options?.systemPrompt;
        if (systemPrompt && typeof systemPrompt === "string") {
          userText = `${systemPrompt.trim()}\n\n${userText}`;
        }

        console.log("[RiseAI Offscreen] Total prompt length:", userText.length, "chars (~" + Math.ceil(userText.length / 4) + " tokens)");

        const response = await session.prompt(userText);
        const aggregatedText = unwrapResponseText(response);
        const finishReason = response?.finishReason ?? "unknown";
        const usage = response?.usage ?? null;

        console.log("[RiseAI Offscreen] Response received, length:", aggregatedText.length);
        return {
          text: aggregatedText,
          finishReason,
          usage,
        };
      } catch (error) {
        console.error("[RiseAI Offscreen] prompt failed", error, { payload });
        throw error;
      }
    },
    async "prompt:reset"() {
      await destroySession();
      return { ok: true };
    },
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[RiseAI Offscreen] Message received:", message?.type);
    if (!message?.type || !message.type.startsWith("offscreen:")) {
      return false;
    }
    const action = message.type.replace("offscreen:", "");
    console.log("[RiseAI Offscreen] Handling action:", action);
    const handler = handlers[action];
    if (!handler) {
      console.error("[RiseAI Offscreen] Unknown action:", action);
      sendResponse({ ok: false, error: `Unknown offscreen action: ${action}` });
      return false;
    }
    const result = handler(message.payload || {});
    if (result instanceof Promise) {
      result
        .then((data) => {
          console.log("[RiseAI Offscreen] Handler success:", action);
          sendResponse({ ok: true, result: data });
        })
        .catch((error) => {
          console.error("[RiseAI Offscreen] Handler error:", action, error);
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }
    sendResponse({ ok: true, result });
    return false;
  });

  console.log("[RiseAI Offscreen] Listener registered, ready!");
  window.__riseAiOffscreenReady = true;
})();
