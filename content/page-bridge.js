(() => {
  if (window.__riseAiBridgeReady) return;

  const RESPONSE_TYPE = "rise-ai:bridge-response";
  const REQUEST_TYPE = "rise-ai:bridge-request";
  const READY_TYPE = "rise-ai:bridge-ready";

  const post = (data) => window.postMessage(data, "*");

  const ok = (requestId, result) =>
    post({ type: RESPONSE_TYPE, ok: true, requestId, payload: result });

  const fail = (requestId, error) =>
    post({
      type: RESPONSE_TYPE,
      ok: false,
      requestId,
      error: error instanceof Error ? error.message : String(error ?? "Unknown error"),
    });

  const getLanguageModelNamespace = () => window.ai?.languageModel ?? null;

  let sessionPromise = null;

  const ensureSession = async (options = {}) => {
    if (sessionPromise) return sessionPromise;
    const namespace = getLanguageModelNamespace();
    if (!namespace) {
      throw new Error("Prompt API unavailable or create() not exposed.");
    }

    const createSession = (() => {
      if (typeof namespace.create === "function") {
        return (opts) => namespace.create(opts);
      }
      if (typeof namespace.createSession === "function") {
        return (opts) => namespace.createSession(opts);
      }
      if (typeof window.ai?.createTextSession === "function") {
        return (opts) => window.ai.createTextSession(opts);
      }
      if (typeof namespace.createTextSession === "function") {
        return (opts) => namespace.createTextSession(opts);
      }
      return null;
    })();

    if (!createSession) {
      throw new Error("Prompt API unavailable or create() not exposed.");
    }
    const defaultOptions = {
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      topK: options.topK ?? 40,
      temperature: options.temperature ?? 0.7,
      initialPrompts: [],
    };
    if (options.systemPrompt) {
      defaultOptions.initialPrompts.push({
        role: "system",
        content: options.systemPrompt,
      });
    }
    if (Array.isArray(options.initialPrompts)) {
      defaultOptions.initialPrompts.push(...options.initialPrompts);
    }
    if (Array.isArray(options.expectedInputs)) {
      defaultOptions.expectedInputs = options.expectedInputs;
    }
    if (Array.isArray(options.expectedOutputs)) {
      defaultOptions.expectedOutputs = options.expectedOutputs;
    }
    sessionPromise = createSession(defaultOptions);
    try {
      const session = await sessionPromise;
      return session;
    } catch (error) {
      sessionPromise = null;
      throw error;
    }
  };

  const destroySession = async () => {
    if (!sessionPromise) return;
    try {
      const session = await sessionPromise;
      session?.destroy?.();
    } catch (error) {
      console.warn("[RiseAI] Failed to destroy session", error);
    } finally {
      sessionPromise = null;
    }
  };

  const handlers = {
    async availability(payload = {}) {
      const namespace = getLanguageModelNamespace();
      if (!namespace?.availability) {
        throw new Error("Prompt API availability() not exposed.");
      }
      const options =
        payload.options ?? {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
        };
      return namespace.availability(options);
    },

    async reset() {
      await destroySession();
      return { ok: true };
    },

    async generate(payload = {}) {
      const options = payload.options || {};
      const session = await ensureSession(options);
      const messages = Array.isArray(payload.messages)
        ? payload.messages
        : [
            {
              role: "user",
              content: String(payload.prompt ?? ""),
            },
          ];
      if (!messages.length) {
        throw new Error("No prompt supplied.");
      }
      const response = await session.prompt(messages);
      return {
        text: response?.text ?? "",
        finishReason: response?.finishReason ?? "unknown",
        usage: response?.usage ?? null,
      };
    },
  };

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== REQUEST_TYPE) return;

    const { requestId, action, payload } = data;
    if (!requestId || !action) return;

    const handler = handlers[action];
    if (!handler) {
      fail(requestId, `Unknown action: ${action}`);
      return;
    }

    try {
      const result = await handler(payload);
      ok(requestId, result);
    } catch (error) {
      fail(requestId, error);
    }
  });

  window.addEventListener("beforeunload", () => {
    destroySession();
  });

  window.__riseAiBridgeReady = true;
  post({ type: READY_TYPE });
})();
