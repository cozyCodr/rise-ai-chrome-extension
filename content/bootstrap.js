(() => {
  "use strict";

  if (!chrome?.runtime?.id) {
    console.warn("[RiseAI] runtime unavailable; aborting content bootstrap.");
    return;
  }

  const HOST_ID = "rise-ai-root";
  const PANEL_STATES = {
    CLOSED: "closed",
    PORTRAIT: "portrait",
    LANDSCAPE: "landscape",
  };

  if (document.getElementById(HOST_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.position = "fixed";
  host.style.inset = "auto 0 0 auto";
  host.style.zIndex = "2147483646";
  host.style.pointerEvents = "none";

  const shadowRoot = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  const injectPanelCss = async () => {
    const cssUrl = chrome.runtime.getURL("content/panel.css");
    try {
      const response = await fetch(cssUrl);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const styleEl = document.createElement("style");
      styleEl.textContent = await response.text();
      shadowRoot.appendChild(styleEl);
    } catch (error) {
      console.warn("[RiseAI] unable to load panel.css", error);
      const fallback = document.createElement("style");
      fallback.textContent = `
        :host {
          all: initial;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .rise-ai-container {
          pointer-events: auto;
        }
      `;
      shadowRoot.appendChild(fallback);
    }
  };

  const container = document.createElement("div");
  container.className = "rise-ai-container";
  shadowRoot.appendChild(container);

  const fabButton = document.createElement("button");
  fabButton.type = "button";
  fabButton.className = "rise-ai-fab";
  fabButton.id = "rise-ai-fab";
  fabButton.textContent = "r.Ai";
  fabButton.setAttribute("aria-expanded", "false");

  const panel = document.createElement("section");
  panel.className = "rise-ai-panel";
  panel.dataset.state = PANEL_STATES.PORTRAIT;

  container.appendChild(fabButton);
  container.appendChild(panel);

  const loadPanelTemplates = async () => {
    const markupUrl = chrome.runtime.getURL("content/panel.html");
    const wrapper = document.createElement("div");
    wrapper.className = "rise-ai-panel__wrapper";
    let overlayLayer = null;
    let profileLayer = null;
    try {
      const response = await fetch(markupUrl);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const portraitTemplate = doc.querySelector("template#rise-ai-portrait-template");
      if (!portraitTemplate) throw new Error("portrait template missing");
      const portraitInstance = portraitTemplate.content.cloneNode(true);
      wrapper.appendChild(portraitInstance);
      panel.appendChild(wrapper);
      const previewTemplate = doc.querySelector("template#rise-ai-preview-template");
      if (previewTemplate) {
        const fragment = previewTemplate.content.cloneNode(true);
        overlayLayer =
          fragment.querySelector("[data-preview-layer]") || fragment.firstElementChild || null;
        if (overlayLayer) {
          container.appendChild(overlayLayer);
        }
      }
      const profileTemplate = doc.querySelector("template#rise-ai-profile-template");
      if (profileTemplate) {
        const fragment = profileTemplate.content.cloneNode(true);
        profileLayer =
          fragment.querySelector("[data-profile-layer]") || fragment.firstElementChild || null;
        if (profileLayer) {
          container.appendChild(profileLayer);
        }
      }
      return { wrapper, overlayLayer, profileLayer };
    } catch (error) {
      console.error("[RiseAI] failed to load panel template", error);
      panel.innerHTML = `
        <div style="padding:20px;font:500 14px/1.5 'Inter','Segoe UI',sans-serif;color:#111214;">
          Rise AI panel failed to load. Reload the page to try again.
        </div>
      `;
      return { wrapper: null, overlayLayer: null, profileLayer: null };
    }
  };

  const injectPageBridge = () => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/page-bridge.js");
    script.type = "text/javascript";
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  };

  const setupBridgeListener = () => {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.type !== "rise-ai:bridge-request") return;
      window.postMessage(data, "*");
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "rise:bridge:call") {
        const { action, payload } = message.payload || {};
        const requestId = `bridge-${Date.now()}-${Math.random()}`;

        const listener = (event) => {
          if (event.source !== window) return;
          const data = event.data;
          if (data?.type !== "rise-ai:bridge-response" || data.requestId !== requestId) return;

          window.removeEventListener("message", listener);
          if (data.ok) {
            sendResponse({ ok: true, result: data.payload });
          } else {
            sendResponse({ ok: false, error: data.error });
          }
        };

        window.addEventListener("message", listener);
        window.postMessage({
          type: "rise-ai:bridge-request",
          requestId,
          action,
          payload,
        }, "*");

        return true;
      }
    });
  };

  const init = async () => {
    injectPageBridge();
    setupBridgeListener();
    await injectPanelCss();
    const { wrapper, overlayLayer, profileLayer } = await loadPanelTemplates();
    if (!wrapper) return;
    try {
      const moduleUrl = chrome.runtime.getURL("content/panel-app.js");
      const { mountPanelApp } = await import(moduleUrl);
      const overlay = overlayLayer?.querySelector('[data-overlay="preview"]') ?? null;
      const profileOverlay =
        profileLayer?.querySelector('[data-overlay="profile"]') ?? null;
      const profileForm = profileOverlay?.querySelector('[data-slot="profile-form"]') ?? null;
      mountPanelApp({
        host,
        shadowRoot,
        panel,
        fabButton,
        wrapper,
        overlayLayer,
        overlay,
        profileLayer,
        profileOverlay,
        profileForm,
        panelStates: PANEL_STATES,
      });
    } catch (error) {
      console.error("[RiseAI] failed to mount panel app", error);
    }
  };

  init();
})();
