import {
  SelectionTracker,
  GeminiBridge,
  Preferences,
  ProfileStore,
  runtimeApi,
} from "./modules/data.js";
import {
  StatusBadge,
  ProfileManager,
  ProfileOverlay,
  JobController,
  PreviewOverlay,
  ResumeHistory,
} from "./modules/ui.js";

const uiSelectors = {
  textarea: '[data-slot="jd-input"]',
  jobStatus: '[data-slot="generation-status"]',
  profileStatus: '[data-slot="profile-status"]',
  profileSummary: '[data-slot="profile-summary"]',
  historyList: '[data-slot="history"]',
  previewOverlay: '[data-overlay="preview"]',
  previewTitle: '[data-slot="preview-title"]',
  previewMeta: '[data-slot="preview-meta"]',
  previewContent: '[data-slot="preview-content"]',
  previewEditor: '[data-slot="preview-editor"]',
  previewLoader: '[data-slot="preview-loader"]',
  previewLoaderSpinner: '[data-slot="preview-loader-spinner"]',
  previewLoaderMessage: '[data-slot="preview-loader-message"]',
  openProfileBtn: '[data-action="open-profile-editor"]',
  openGenerationBtn: '[data-action="open-generation-modal"]',
  generationModal: '[data-job-modal]',
  generationResumeBtn: '[data-job-modal] [data-action="generate-resume"]',
  generationCoverBtn: '[data-job-modal] [data-action="generate-cover-letter"]',
  generationCloseBtn: '[data-action="close-generation-modal"]',
  downloadJsonBtn: '[data-action="download-resume-json"]',
  downloadPdfBtn: '[data-action="download-resume-pdf"]',
  toggleEditingBtn: '[data-action="toggle-editing"]',
  closePreviewBtn: '[data-action="close-preview"]',
  jobForm: '[data-action="submit-jd"]',
};

const escapeHtml = (value = "") =>
  `${value}`.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

const formatLetterHtml = (text = "") => {
  const normalized = `${text}`.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return `<pre class="preview-letter__pre">${escapeHtml(normalized)}</pre>`;
  }
  const markup = paragraphs
    .map((paragraph) => {
      const htmlParagraph = escapeHtml(paragraph).replace(/\n/g, "<br>");
      return `<p class="preview-letter__paragraph">${htmlParagraph}</p>`;
    })
    .join("");
  return `<div class="preview-letter">${markup}</div>`;
};



class PanelApp {
  constructor({
    panel,
    fabButton,
    wrapper,
    overlayLayer,
    overlay,
    profileLayer,
    profileOverlay,
    profileForm,
    panelStates,
  }) {
    this.panel = panel;
    this.fabButton = fabButton;
    this.wrapper = wrapper;
    this.overlayLayer = overlayLayer;
    this.overlay = overlay;
    this.profileLayer = profileLayer;
    this.profileOverlayEl = profileOverlay;
    this.profileForm = profileForm;
    this.panelStates = panelStates;
    this.activeTab = "profile";
    this.panelOpen = false;
    this.lastProfile = null;

    this.profileBadge = new StatusBadge(wrapper.querySelector(uiSelectors.profileStatus));
    this.jobBadge = new StatusBadge(wrapper.querySelector(uiSelectors.jobStatus));

    this.profileManager = new ProfileManager(
      {
        summary: wrapper.querySelector(uiSelectors.profileSummary),
      },
      this.profileBadge
    );

    this.profileOverlay = new ProfileOverlay({
      layer: profileLayer,
      overlay: profileOverlay,
      form: profileForm,
    });

    this.jobController = new JobController(
      {
        textarea: wrapper.querySelector(uiSelectors.textarea),
        summary: null,
        selectionHint: null,
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
    this.openGenerationButton = wrapper.querySelector(uiSelectors.openGenerationBtn);
    this.generationModal = wrapper.querySelector(uiSelectors.generationModal);
    this.generationResumeButton = wrapper.querySelector(uiSelectors.generationResumeBtn);
    this.generationCoverButton = wrapper.querySelector(uiSelectors.generationCoverBtn);
    this.generationCloseButtons = Array.from(
      wrapper.querySelectorAll(uiSelectors.generationCloseBtn)
    );
    this.generateButton = this.openGenerationButton;
    this.openProfileButton = wrapper.querySelector(uiSelectors.openProfileBtn);
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
    const hasProfile = this.profileManager.hasProfileData();
    const hasJob = Boolean((this.jobController.currentJob?.text || "").trim());
    if (this.generateButton) {
      const ready = hasProfile && hasJob;
      this.generateButton.disabled = !ready;
      this.generateButton.setAttribute("aria-disabled", ready ? "false" : "true");
      if (!ready) {
        this.generateButton.removeAttribute("data-busy");
      }
    }
  }

  maybeSelectInitialTab(profile, resumes) {
    if (!this.profileManager.hasProfileData()) {
      this.switchTab("profile");
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

    this.openProfileButton?.addEventListener("click", () => {
      this.handleOpenProfileEditor();
    });


    this.openGenerationButton?.addEventListener("click", () => {
      this.openGenerationModal();
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

    this.generationResumeButton?.addEventListener("click", () => {
      this.closeGenerationModal();
      this.handleGenerate();
    });

    this.generationCoverButton?.addEventListener("click", () => {
      this.handleGenerateCoverLetter();
    });

    this.generationCloseButtons.forEach((button) => {
      button.addEventListener("click", () => this.closeGenerationModal());
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
          this.handleProfileUpdate(message.payload ?? {});
          break;
        case "rise:update-jd":
          this.handleJobPayload(message.payload ?? {});
          break;
        default:
          break;
      }
    });
  }

  handleProfileUpdate(payload = {}) {
    console.info("[RiseAI] profile update", {
      timestamp: new Date().toISOString(),
    });
    const context = payload.context ?? null;
    const profile = context?.profile ?? null;
    const message = payload.message;
    this.lastProfile = profile;
    if (profile) {
      this.profileManager.setProfile(profile);
      this.profileBadge.set(message || "Profile ready.", "success");
    } else {
      this.profileManager.setProfile(null);
      this.profileBadge.set(message || "Add your profile details to begin.", "info");
    }
    this.updateGenerateButtonState();
  }

  async handleOpenProfileEditor() {
    try {
      const existing = this.profileManager.getProfile();
      const draft = existing ? JSON.parse(JSON.stringify(existing)) : null;
      const updated = await this.profileOverlay.open(draft ?? null);
      if (!updated) {
        return;
      }
      const saved = await ProfileStore.save(updated);
      this.profileManager.setProfile(saved);
      this.profileBadge.set("Profile saved.", "success");
      this.updateGenerateButtonState();
    } catch (error) {
      console.error("[RiseAI] profile editing failed", error);
      this.profileBadge.set("Unable to save profile. Try again.", "error");
    }
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
    this.updateGenerateButtonState();
    return job;
  }

  async commitJobDescription(text, source) {
    const trimmed = (text || "").replace(/\s+/g, " ").trim();
    if (!trimmed) {
      this.jobBadge.set("Paste or highlight a job description before saving.", "error");
      this.jobController.focusTextarea();
      return null;
    }

    this.jobBadge.set("Saving job description...", "info");
    const payload = { text: trimmed, source: source || "manual" };

    try {
      const response = await runtimeApi.send("rise:jd:update", payload);
      const savedJob = response?.payload?.job ?? payload;
      this.jobController.hydrate(savedJob);
      this.jobBadge.set("Job description saved.", "success");
      return savedJob;
    } catch (error) {
      console.error("[RiseAI] job save failed", error);
      this.jobBadge.set("Unable to save the job description. Try again.", "error");
      return null;
    } finally {
      this.updateGenerateButtonState();
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

  openGenerationModal() {
    if (!this.generationModal) {
      this.handleGenerate();
      return;
    }
    this.generationModal.hidden = false;
    this.openGenerationButton?.setAttribute("aria-expanded", "true");
  }

  closeGenerationModal() {
    if (this.generationModal) {
      this.generationModal.hidden = true;
    }
    this.openGenerationButton?.setAttribute("aria-expanded", "false");
  }

  async handleGenerate() {
    this.closeGenerationModal();
    if (!this.profileManager.hasProfileData()) {
      const profileMessage = "Add your profile details in the Profile tab before generating.";
      this.profileBadge.set(profileMessage, "error");
      this.jobBadge.set(profileMessage, "error");
      this.switchTab("profile");
      this.openProfileButton?.focus({ preventScroll: true });
      return;
    }
    if (!this.jobController.currentJob?.text) {
      this.jobBadge.set("Add or paste a job description before generating.", "error");
      this.switchTab("job");
      return;
    }
    console.info("[RiseAI] resume generation requested", {
      jobLength: this.jobController.currentJob?.text?.length ?? 0,
      profileReady: this.profileManager.hasProfileData(),
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
      const response = await GeminiBridge.generateResume({ temperature: 0.25, topK: 32 });
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

      const resume = result.resume ?? null;
      const timestamp = Date.now();
      const resumeTitle = resume?.header?.fullName
        ? `${resume.header.fullName} - Resume`
        : 'Resume generated';
      const entry = {
        id: `resume-${timestamp}`,
        title: resumeTitle,
        createdAtMs: timestamp,
        createdAt: new Date(timestamp).toLocaleString(),
        updatedAtMs: timestamp,
        updatedAt: new Date(timestamp).toLocaleString(),
        resume,
        metadata: result.metadata ?? null,
        rawText: result.rawText ?? '',
        editedHtml: null,
      };
      console.info("[RiseAI] resume generation succeeded", {
        finishReason: result.metadata?.finishReason ?? null,
      });
      const saved = await this.history.add(entry);
      await this.previewOverlay.open(saved);
      this.jobBadge.set("Resume ready.", "success");
    } catch (error) {
      console.error("[RiseAI] resume generation failed", error);
      const message = typeof error?.message === "string" ? error.message : "Resume generation failed.";
      if (message.includes("Profile details")) {
        this.profileBadge.set(message, "error");
        this.switchTab("profile");
        this.updateGenerateButtonState();
        this.openProfileButton?.focus({ preventScroll: true });
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

  async handleGenerateCoverLetter() {
    this.closeGenerationModal();
    if (!this.profileManager.hasProfileData()) {
      const profileMessage = "Add your profile details in the Profile tab before generating.";
      this.profileBadge.set(profileMessage, "error");
      this.jobBadge.set(profileMessage, "error");
      this.switchTab("profile");
      this.openProfileButton?.focus({ preventScroll: true });
      return;
    }
    if (!this.jobController.currentJob?.text) {
      this.jobBadge.set("Add or paste a job description before generating.", "error");
      this.switchTab("job");
      return;
    }
    console.info("[RiseAI] cover letter generation requested", {
      jobLength: this.jobController.currentJob?.text?.length ?? 0,
      profileReady: this.profileManager.hasProfileData(),
      timestamp: new Date().toISOString(),
    });

    const panelWasOpen = this.panelOpen;
    this.wasPanelOpenBeforePreview = panelWasOpen;
    if (panelWasOpen) {
      this.closePanel();
    }
    this.previewOverlay.showLoading("Drafting your cover letter with Gemini Nano...");
    this.jobBadge.set("Generating cover letter with Gemini Nano...", "info");

    if (this.generateButton) {
      this.generateButton.disabled = true;
      this.generateButton.setAttribute("data-busy", "true");
    }

    try {
      const response = await GeminiBridge.generateCoverLetter({ temperature: 0.35, topK: 32 });
      const result = response.payload ?? {};
      const letterText = (result.letter ?? result.rawText ?? "").trim();
      if (!letterText) {
        this.previewOverlay.showMessage({
          title: "No response from Gemini",
          body: "Gemini returned an empty cover letter. Try adjusting the job description or refreshing your profile.",
          tone: "error",
        });
        this.jobBadge.set("Gemini returned an empty response. Try again.", "error");
        return;
      }

      const timestamp = Date.now();
      const letterHtml = formatLetterHtml(letterText);
      const entry = {
        id: `letter-${timestamp}`,
        type: "cover-letter",
        title: "Cover Letter generated",
        createdAtMs: timestamp,
        createdAt: new Date(timestamp).toLocaleString(),
        updatedAtMs: timestamp,
        updatedAt: new Date(timestamp).toLocaleString(),
        letterText,
        letterHtml,
        metadata: result.metadata ?? null,
        rawText: result.rawText ?? letterText,
        resume: null,
        editedHtml: null,
      };
      const saved = await this.history.add(entry);
      await this.previewOverlay.open(saved);
      this.jobBadge.set("Cover letter ready.", "success");
    } catch (error) {
      console.error("[RiseAI] cover letter generation failed", error);
      const message =
        typeof error?.message === "string" ? error.message : "Cover letter generation failed.";
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
    if (current.type === "cover-letter") {
      this.jobBadge.set("Editing cover letters isn't supported yet.", "info");
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

  async onHistoryClick(event) {
    const card = event.target.closest(".history-item");
    if (!card) return;
    const entry = this.history.getById(card.dataset.resumeId);
    if (entry) {
      const panelWasOpen = this.panelOpen;
      this.wasPanelOpenBeforePreview = panelWasOpen;
      if (panelWasOpen) {
        this.closePanel();
      }
      await this.previewOverlay.open(entry);
    }
  }

  async init() {
    SelectionTracker.init();
    this.updateGenerateButtonState();
    const resumes = await this.history.hydrate();

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
      this.handleProfileUpdate(contextResponse.value.payload ?? {});
    } else {
      this.profileManager.setProfile(null);
    }

    if (jobResponse.status === "fulfilled") {
      this.handleJobPayload(jobResponse.value.payload ?? {});
    }

    const profile =
      contextResponse.status === "fulfilled"
        ? contextResponse.value.payload?.context?.profile ?? null
        : null;
    this.maybeSelectInitialTab(profile, resumes);
    this.updateGenerateButtonState();
  }
}

export const mountPanelApp = ({
  panel,
  fabButton,
  wrapper,
  overlayLayer,
  overlay,
  profileLayer,
  profileOverlay,
  profileForm,
  panelStates,
}) => {
  const app = new PanelApp({
    panel,
    fabButton,
    wrapper,
    overlayLayer,
    overlay,
    profileLayer,
    profileOverlay,
    profileForm,
    panelStates,
  });
  app.init().catch((error) => {
    console.error("[RiseAI] panel init failed", error);
  });
  return app;
};





















