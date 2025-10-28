import {
  SelectionTracker,
  GeminiBridge,
  Preferences,
  runtimeApi,
} from "./modules/data.js";
import {
  StatusBadge,
  ContextLibrary,
  JobController,
  PreviewOverlay,
  ResumeHistory,
} from "./modules/ui.js";

const uiSelectors = {
  summary: '[data-slot="jd-summary"]',
  textarea: '[data-slot="jd-input"]',
  selectionHint: '[data-slot="selection-hint"]',
  jobStatus: '[data-slot="generation-status"]',
  contextStatus: '[data-slot="library-status"]',
  docList: '[data-slot="doc-list"]',
  historyList: '[data-slot="history"]',
  previewOverlay: '[data-overlay="preview"]',
  previewTitle: '[data-slot="preview-title"]',
  previewMeta: '[data-slot="preview-meta"]',
  previewContent: '[data-slot="preview-content"]',
  previewEditor: '[data-slot="preview-editor"]',
  previewLoader: '[data-slot="preview-loader"]',
  previewLoaderSpinner: '[data-slot="preview-loader-spinner"]',
  previewLoaderMessage: '[data-slot="preview-loader-message"]',
  pickDirectoryBtn: '[data-action="pick-directory"]',
  refreshBtn: '[data-action="refresh-library"]',
  useSelectionBtn: '[data-action="use-selection"]',
  generateBtn: '[data-action="generate-resume"]',
  downloadJsonBtn: '[data-action="download-resume-json"]',
  downloadPdfBtn: '[data-action="download-resume-pdf"]',
  toggleEditingBtn: '[data-action="toggle-editing"]',
  closePreviewBtn: '[data-action="close-preview"]',
  jobForm: '[data-action="submit-jd"]',
};

const statusLabels = {
  pending: "awaiting scan",
  refreshing: "refreshing...",
  scanning: "scanning...",
  ready: "ready",
  error: "error",
};

const summarizeContext = (context) => {
  if (!context) {
    return "No context folder selected yet.";
  }
  const parts = [];
  if (context.name) {
    parts.push(context.name);
  }
  const pdfFiles = typeof context.pdfFiles === "number" ? context.pdfFiles : undefined;
  const totalFiles = typeof context.totalFiles === "number" ? context.totalFiles : undefined;
  if (typeof pdfFiles === "number") {
    parts.push(
      pdfFiles === 0 ? "no PDFs indexed yet" : `${pdfFiles} PDF${pdfFiles === 1 ? "" : "s"} indexed`
    );
  } else if (typeof totalFiles === "number") {
    parts.push(
      totalFiles === 0 ? "no files indexed yet" : `${totalFiles} file${totalFiles === 1 ? "" : "s"} indexed`
    );
  }
  if (typeof context.chunkCount === "number" && context.chunkCount > 0) {
    parts.push(`${context.chunkCount} chunk${context.chunkCount === 1 ? "" : "s"}`);
  }
  if (context.status && statusLabels[context.status]) {
    parts.push(statusLabels[context.status]);
  }
  if (context.lastRefreshedAt) {
    const date = new Date(context.lastRefreshedAt);
    if (!Number.isNaN(date.getTime())) {
      parts.push(`refreshed ${date.toLocaleString()}`);
    }
  }
  return parts.join(" | ");
};

class PanelApp {
  constructor({ panel, fabButton, wrapper, overlayLayer, overlay, panelStates }) {
    this.panel = panel;
    this.fabButton = fabButton;
    this.wrapper = wrapper;
    this.overlayLayer = overlayLayer;
    this.overlay = overlay;
    this.panelStates = panelStates;
    this.activeTab = "setup";
    this.panelOpen = false;
    this.lastContext = null;

    this.contextBadge = new StatusBadge(wrapper.querySelector(uiSelectors.contextStatus));
    this.jobBadge = new StatusBadge(wrapper.querySelector(uiSelectors.jobStatus));

    this.contextLibrary = new ContextLibrary(
      {
        docList: wrapper.querySelector(uiSelectors.docList),
      },
      this.contextBadge
    );

    this.jobController = new JobController(
      {
        summary: wrapper.querySelector(uiSelectors.summary),
        textarea: wrapper.querySelector(uiSelectors.textarea),
        selectionHint: wrapper.querySelector(uiSelectors.selectionHint),
      },
      this.jobBadge
    );

    this.previewOverlay = new PreviewOverlay(
      {
        layer: overlayLayer,
        overlay,
        title: overlay?.querySelector(uiSelectors.previewTitle),
        meta: overlay?.querySelector(uiSelectors.previewMeta),
        content: overlay?.querySelector(uiSelectors.previewContent),
        editor: overlay?.querySelector(uiSelectors.previewEditor),
        loader: overlay?.querySelector(uiSelectors.previewLoader),
        loaderSpinner: overlay?.querySelector(uiSelectors.previewLoaderSpinner),
        loaderMessage: overlay?.querySelector(uiSelectors.previewLoaderMessage),
      },
      this.jobBadge
    );

    this.history = new ResumeHistory(
      wrapper.querySelector(uiSelectors.historyList),
      this.previewOverlay,
      this.jobBadge
    );
    this.wasPanelOpenBeforePreview = false;

    this.tabs = Array.from(wrapper.querySelectorAll("[data-tab]"));
    this.panels = Array.from(wrapper.querySelectorAll("[data-panel]"));
    this.generateButton = wrapper.querySelector(uiSelectors.generateBtn);
    this.pickDirectoryButton = wrapper.querySelector(uiSelectors.pickDirectoryBtn);
    this.boundOnHistoryClick = this.onHistoryClick.bind(this);
  }

  setPanelState(state) {
    if (!this.panel) return;
    this.panel.dataset.state = state;
  }

  openPanel() {
    if (this.panelOpen) return;
    this.panel.classList.add("rise-ai-panel--visible");
    this.fabButton.classList.add("rise-ai-fab--active");
    this.fabButton.setAttribute("aria-expanded", "true");
    this.panelOpen = true;
    this.setPanelState(this.panelStates.PORTRAIT);
    Preferences.save({ panelOpen: true }).catch(() => {});
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panel.classList.remove("rise-ai-panel--visible");
    this.fabButton.classList.remove("rise-ai-fab--active");
    this.fabButton.setAttribute("aria-expanded", "false");
    this.panelOpen = false;
    this.setPanelState(this.panelStates.CLOSED);
    Preferences.save({ panelOpen: false }).catch(() => {});
  }

  togglePanelVisibility() {
    if (this.panelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  switchTab(tab) {
    if (!tab || this.activeTab === tab) return;
    this.activeTab = tab;
    this.tabs.forEach((button) => {
      button.setAttribute("aria-selected", button.dataset.tab === tab ? "true" : "false");
    });
    this.panels.forEach((panel) => {
      const active = panel.dataset.panel === tab;
      panel.classList.toggle("panel__section--hidden", !active);
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
  }

  updateGenerateButtonState() {
    const hasContext = this.contextLibrary.hasContextData();
    if (this.generateButton) {
      this.generateButton.disabled = !hasContext;
      this.generateButton.setAttribute("aria-disabled", hasContext ? "false" : "true");
    }
  }

  maybeSelectInitialTab(context, resumes) {
    if (!context || context.status !== "ready") {
      this.switchTab("setup");
      return;
    }
    if (Array.isArray(resumes) && resumes.length) {
      this.switchTab("history");
      return;
    }
    this.switchTab("job");
  }

  registerListeners() {
    this.fabButton.addEventListener("click", () => {
      this.togglePanelVisibility();
      chrome.runtime
        .sendMessage({ type: "ping", payload: { source: "fab" } })
        .catch(() => {
          /* ignore ping errors */
        });
    });

    this.pickDirectoryButton?.addEventListener("click", async () => {
      await this.contextLibrary.pickDirectory();
      this.updateGenerateButtonState();
    });

    this.wrapper.querySelector(uiSelectors.refreshBtn)?.addEventListener("click", async () => {
      this.contextBadge.set("Refresh in progress.", "info");
      if (!this.contextLibrary.currentHandle) {
        this.contextBadge.set("Select a qualifications folder first.", "error");
        return;
      }
      await this.contextLibrary.scanDirectory(this.contextLibrary.currentHandle);
      this.updateGenerateButtonState();
    });

    this.wrapper.querySelector(uiSelectors.useSelectionBtn)?.addEventListener("click", () => {
      this.handleUseSelection();
    });

    this.generateButton?.addEventListener("click", () => {
      this.handleGenerate();
    });

    this.overlay?.querySelector(uiSelectors.downloadJsonBtn)?.addEventListener("click", () =>
      this.handleDownloadJson()
    );
    this.overlay?.querySelector(uiSelectors.downloadPdfBtn)?.addEventListener("click", () =>
      this.handleDownloadPdf()
    );
    this.overlay?.querySelector(uiSelectors.toggleEditingBtn)?.addEventListener("click", () =>
      this.handleToggleEditing()
    );
    this.overlay?.querySelector(uiSelectors.closePreviewBtn)?.addEventListener("click", () =>
      this.handleClosePreview()
    );

    const scrim = this.overlayLayer?.querySelector(".preview-layer__scrim");
    scrim?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handleClosePreview();
    });

    this.wrapper.querySelector(uiSelectors.jobForm)?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handleJobSave();
    });

    this.tabs.forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    this.history.listEl?.addEventListener("click", this.boundOnHistoryClick);

    window.addEventListener("riseai-selection-update", (event) => {
      this.jobController.updateSelectionHint(event.detail?.text ?? "", "selection");
    });

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this.overlayLayer && !this.overlayLayer.hidden) {
          this.handleClosePreview();
        }
      },
      true
    );

    chrome.runtime.onMessage.addListener((message) => {
      if (!message?.type) return;
      switch (message.type) {
        case "rise:update-context":
          this.handleContextUpdate(message.payload ?? {});
          break;
        case "rise:update-jd":
          this.handleJobPayload(message.payload ?? {});
          break;
        default:
          break;
      }
    });
  }

  handleContextUpdate(payload = {}) {
    console.info("[RiseAI] context update", {
      status: payload?.context?.status ?? null,
      pdfFiles: payload?.context?.pdfFiles ?? null,
      chunkCount: payload?.context?.chunkCount ?? null,
      timestamp: new Date().toISOString(),
    });
    const context = payload.context ?? null;
    const message = payload.message;
    this.lastContext = context;
    this.contextLibrary.updateFromContext(context);
    const parts = [summarizeContext(context)];
    if (context?.errorMessage) parts.push(context.errorMessage);
    if (message) parts.push(message);
    this.contextBadge.set(parts.filter(Boolean).join(" | "), context?.status === "error" ? "error" : "info");
    this.updateGenerateButtonState();
  }

  handleJobPayload(payload = {}) {
    console.info("[RiseAI] job update", {
      source: payload?.job?.source ?? null,
      length: payload?.job?.text?.length ?? 0,
      timestamp: new Date().toISOString(),
    });
    const job = payload.job ?? null;
    if (job) {
      this.jobController.hydrate(job);
    }
    return job;
  }

  async commitJobDescription(text, source) {
    const trimmed = (text || "").replace(/\s+/g, " ").trim();
    if (!trimmed) {
      this.jobBadge.set("Paste or highlight a job description before saving.", "error");
      this.jobController.focusTextarea();
      return null;
    }
    if (this.generateButton) {
      this.generateButton.disabled = true;
      this.generateButton.setAttribute("data-busy", "true");
    }
    this.jobBadge.set("Generating resume with Gemini Nano...", "info");

    const panelWasOpen = this.panelOpen;
    this.wasPanelOpenBeforePreview = panelWasOpen;
    if (panelWasOpen) {
      this.closePanel();
    }
    this.previewOverlay.showLoading("Generating a tailored resume with Gemini Nano...");

    try {
      const response = await GeminiBridge.generateResume({ chunkLimit: 12, temperature: 0.45 });
      const result = response.payload ?? {};

      if (!result?.rawText && !result?.resume) {
        console.warn("[RiseAI] Gemini returned an empty payload", result);
        this.previewOverlay.showMessage({
          title: "No response from Gemini",
          body: "Gemini returned an empty response. Try adjusting the job description or refreshing your context library.",
          tone: "error",
        });
        this.jobBadge.set("Gemini returned an empty response. Try again.", "error");
        return;
      }

      const entry = {
        id: `resume-${Date.now()}`,
        title: "Resume generated",
        createdAtMs: Date.now(),
        createdAt: new Date().toLocaleString(),
        updatedAtMs: Date.now(),
        updatedAt: new Date().toLocaleString(),
        resume: result.resume ?? null,
        metadata: result.metadata ?? null,
        rawText: result.rawText ?? "",
        editedHtml: null,
      };
      console.info("[RiseAI] resume generation succeeded", {
        finishReason: result.metadata?.finishReason ?? null,
        chunkIds: result.metadata?.prompt?.metadata?.chunkIds ?? [],
      });
      const saved = await this.history.add(entry);
      this.previewOverlay.open(saved);
      this.jobBadge.set("Resume ready.", "success");
    } catch (error) {
      console.error("[RiseAI] resume generation failed", error);
      const message = typeof error?.message === "string" ? error.message : "Resume generation failed.";
      if (message.includes("No qualification context available")) {
        const setupMessage = "Add qualification PDFs or text snippets in the Setup tab before generating.";
        this.contextLibrary.statusBadge.set(setupMessage, "error");
        this.switchTab("setup");
        this.updateGenerateButtonState();
      }
      this.previewOverlay.showMessage({
        title: "Generation failed",
        body: message,
        tone: "error",
      });
      this.jobBadge.set(message, "error");
    } finally {
      if (this.generateButton) {
        this.generateButton.removeAttribute("data-busy");
        this.updateGenerateButtonState();
      }
    }
  }

  async handleJobSave() {
    const text = this.jobController.getTextareaValue();
    await this.commitJobDescription(text, "pasted");
  }

  async handleUseSelection() {
    const text = SelectionTracker.get();
    if (!text || text.length < 40) {
      this.jobBadge.set("Highlight at least a sentence or two before using this action.", "error");
      return;
    }
    this.jobController.setTextareaValue(text);
    this.jobController.updateSelectionHint(text, "selection");
    await this.commitJobDescription(text, "selection");
  }

  async handleGenerate() {
    if (!this.contextLibrary.hasContextData()) {
      const setupMessage = "Add qualification PDFs or text snippets in the Setup tab before generating.";
      this.contextLibrary.statusBadge.set(setupMessage, "error");
      this.jobBadge.set(setupMessage, "error");
      this.switchTab("setup");
      this.pickDirectoryButton?.focus({ preventScroll: true });
      return;
    }
    if (!this.jobController.currentJob?.text) {
      this.jobBadge.set("Add or paste a job description before generating.", "error");
      this.switchTab("job");
      return;
    }
    console.info("[RiseAI] resume generation requested", {
      jobLength: this.jobController.currentJob?.text?.length ?? 0,
      chunkCount: this.contextLibrary.documentCount,
      timestamp: new Date().toISOString(),
    });

    const panelWasOpen = this.panelOpen;
    this.wasPanelOpenBeforePreview = panelWasOpen;
    if (panelWasOpen) {
      this.closePanel();
    }
    this.previewOverlay.showLoading("Generating a tailored resume with Gemini Nano...");
    this.jobBadge.set("Generating resume with Gemini Nano...", "info");

    if (this.generateButton) {
      this.generateButton.disabled = true;
      this.generateButton.setAttribute("data-busy", "true");
    }

    try {
      const response = await GeminiBridge.generateResume({ chunkLimit: 12, temperature: 0.45 });
      const result = response.payload ?? {};

      if (!result?.rawText && !result?.resume) {
        console.warn("[RiseAI] Gemini returned an empty payload", result);
        this.previewOverlay.showMessage({
          title: "No response from Gemini",
          body: "Gemini returned an empty response. Try adjusting the job description or refreshing your context library.",
          tone: "error",
        });
        this.jobBadge.set("Gemini returned an empty response. Try again.", "error");
        return;
      }

      const entry = {
        id: `resume-${Date.now()}`,
        title: "Resume generated",
        createdAtMs: Date.now(),
        createdAt: new Date().toLocaleString(),
        updatedAtMs: Date.now(),
        updatedAt: new Date().toLocaleString(),
        resume: result.resume ?? null,
        metadata: result.metadata ?? null,
        rawText: result.rawText ?? "",
        editedHtml: null,
      };
      console.info("[RiseAI] resume generation succeeded", {
        finishReason: result.metadata?.finishReason ?? null,
        chunkIds: result.metadata?.prompt?.metadata?.chunkIds ?? [],
      });
      const saved = await this.history.add(entry);
      this.previewOverlay.open(saved);
      this.jobBadge.set("Resume ready.", "success");
    } catch (error) {
      console.error("[RiseAI] resume generation failed", error);
      const message = typeof error?.message === "string" ? error.message : "Resume generation failed.";
      if (message.includes("No qualification context available")) {
        const setupMessage = "Add qualification PDFs or text snippets in the Setup tab before generating.";
        this.contextLibrary.statusBadge.set(setupMessage, "error");
        this.switchTab("setup");
        this.updateGenerateButtonState();
      }
      this.previewOverlay.showMessage({
        title: "Generation failed",
        body: message,
        tone: "error",
      });
      this.jobBadge.set(message, "error");
    } finally {
      if (this.generateButton) {
        this.generateButton.removeAttribute("data-busy");
        this.updateGenerateButtonState();
      }
    }
  }

  handleDownloadJson() {
    if (this.previewOverlay.editing) {
      this.jobBadge.set("Save your edits before downloading.", "error");
      return;
    }
    const current = this.previewOverlay.currentEntry;
    if (current) {
      this.previewOverlay.downloadJson(current);
    }
  }

  handleDownloadPdf() {
    if (this.previewOverlay.editing) {
      this.jobBadge.set("Save your edits before exporting to PDF.", "error");
      return;
    }
    const current = this.previewOverlay.currentEntry;
    if (current) {
      this.previewOverlay.exportPdf(current);
    }
  }

  async handleToggleEditing() {
    const current = this.previewOverlay.currentEntry;
    if (!current) {
      this.jobBadge.set("Open a resume preview before editing.", "error");
      return;
    }
    const updated = await this.previewOverlay.toggleEditing();
    if (!this.previewOverlay.editing && updated) {
      const saved = await this.history.update(updated);
      this.previewOverlay.currentEntry = saved;
    }
  }

  handleClosePreview() {
    this.previewOverlay.close();
    if (this.wasPanelOpenBeforePreview) {
      this.openPanel();
      this.setPanelState(this.panelStates.PORTRAIT);
    } else {
      this.setPanelState(this.panelStates.CLOSED);
    }
    this.wasPanelOpenBeforePreview = false;
    this.jobBadge.set("Preview closed.", "info");
  }

  onHistoryClick(event) {
    const card = event.target.closest(".history-item");
    if (!card) return;
    const entry = this.history.getById(card.dataset.resumeId);
    if (entry) {
      const panelWasOpen = this.panelOpen;
      this.wasPanelOpenBeforePreview = panelWasOpen;
      if (panelWasOpen) {
        this.closePanel();
      }
      this.previewOverlay.open(entry);
    }
  }

  async init() {
    SelectionTracker.init();
    await this.contextLibrary.hydrate();
    this.updateGenerateButtonState();
    const resumes = await this.history.hydrate();
    const restoredHandle = await this.contextLibrary.restoreHandle();
    if (restoredHandle && !this.lastContext) {
      // defer rescan until we know current context state
      this.contextLibrary.currentHandle = restoredHandle;
    }

    this.registerListeners();

    const [prefs, contextResponse, jobResponse] = await Promise.allSettled([
      Preferences.load(),
      runtimeApi.send("rise:context:get-status"),
      runtimeApi.send("rise:jd:get"),
    ]);

    if (prefs.status === "fulfilled" && prefs.value.panelOpen) {
      this.openPanel();
    }

    if (contextResponse.status === "fulfilled") {
      this.handleContextUpdate(contextResponse.value.payload ?? {});
      if (
        !contextResponse.value.payload?.context &&
        this.contextLibrary.currentHandle &&
        restoredHandle
      ) {
        await this.contextLibrary.scanDirectory(restoredHandle);
        this.updateGenerateButtonState();
      }
    }

    if (jobResponse.status === "fulfilled") {
      this.handleJobPayload(jobResponse.value.payload ?? {});
    }

    const context = contextResponse.status === "fulfilled" ? contextResponse.value.payload?.context ?? null : null;
    this.maybeSelectInitialTab(context ?? this.contextLibrary.currentContext, resumes);
    this.updateGenerateButtonState();
  }
}

export const mountPanelApp = ({ panel, fabButton, wrapper, overlayLayer, overlay, panelStates }) => {
  const app = new PanelApp({ panel, fabButton, wrapper, overlayLayer, overlay, panelStates });
  app.init().catch((error) => {
    console.error("[RiseAI] panel init failed", error);
  });
  return app;
};









