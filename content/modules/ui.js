import { database, Chunking, HistoryRepository, runtimeApi } from "./data.js";

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

const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value === "undefined") return [];
  return [value];
};

const renderSummarySection = (section) => {
  const paragraphs = ensureArray(section.content).map((paragraph) => escapeHtml(`${paragraph}`));
  if (!paragraphs.length) return "";
  return `
    <section class="preview-section">
      <h3 class="preview-section__title">${escapeHtml(section.title ?? "Summary")}</h3>
      ${paragraphs.map((text) => `<p class="preview-section__paragraph">${text}</p>`).join("")}
    </section>
  `;
};

const renderExperienceSection = (section) => {
  const items = ensureArray(section.content);
  if (!items.length) return "";
  const markup = items
    .map((item) => {
      const headerParts = [escapeHtml(item.title ?? "Role")];
      if (item.company) {
        headerParts.push(escapeHtml(item.company));
      }
      const metaParts = [];
      if (item.location) metaParts.push(escapeHtml(item.location));
      if (item.dates) metaParts.push(escapeHtml(item.dates));
      const bullets = ensureArray(item.bullets)
        .map((bullet) => `<li>${escapeHtml(`${bullet}`)}</li>`)
        .join("");
      return `
        <article class="preview-experience__item">
          <header class="preview-experience__header">${headerParts.join(" - ")}</header>
          ${
            metaParts.length
              ? `<div class="preview-experience__meta">${metaParts.join(" - ")}</div>`
              : ""
          }
          ${
            bullets
              ? `<ul class="preview-experience__bullets">${bullets}</ul>`
              : ""
          }
        </article>
      `;
    })
    .join("");
  return `
    <section class="preview-section preview-section--experience">
      <h3 class="preview-section__title">${escapeHtml(section.title ?? "Experience")}</h3>
      <div class="preview-experience">
        ${markup}
      </div>
    </section>
  `;
};

const renderSkillSection = (section) => {
  const skills = ensureArray(section.content)
    .filter((skill) => skill && `${skill}`.trim() !== "")
    .map((skill) => `<span class="preview-skill">${escapeHtml(`${skill}`)}</span>`)
    .join("");
  if (!skills) return "";
  return `
    <section class="preview-section preview-section--skills">
      <h3 class="preview-section__title">${escapeHtml(section.title ?? "Skills")}</h3>
      <div class="preview-skill-list">${skills}</div>
    </section>
  `;
};

const renderEducationSection = (section) => {
  const schools = ensureArray(section.content);
  if (!schools.length) return "";
  const markup = schools
    .map((entry) => {
      const degree = entry.degree ? `<div class="preview-education__degree">${escapeHtml(entry.degree)}</div>` : "";
      const institution = entry.institution
        ? `<div class="preview-education__institution">${escapeHtml(entry.institution)}</div>`
        : "";
      const dates = entry.dates ? `<div class="preview-education__dates">${escapeHtml(entry.dates)}</div>` : "";
      const highlights = ensureArray(entry.highlights)
        .map((highlight) => `<li>${escapeHtml(`${highlight}`)}</li>`)
        .join("");
      return `
        <article class="preview-education__item">
          ${degree}
          ${institution}
          ${dates}
          ${highlights ? `<ul class="preview-education__highlights">${highlights}</ul>` : ""}
        </article>
      `;
    })
    .join("");
  return `
    <section class="preview-section preview-section--education">
      <h3 class="preview-section__title">${escapeHtml(section.title ?? "Education")}</h3>
      <div class="preview-education">${markup}</div>
    </section>
  `;
};

const renderGenericSection = (section) => {
  const title = escapeHtml(section.title ?? "Additional");
  const content = Array.isArray(section.content)
    ? section.content.map((line) => `<p class="preview-section__paragraph">${escapeHtml(`${line}`)}</p>`).join("")
    : `<p class="preview-section__paragraph">${escapeHtml(`${section.content ?? ""}`)}</p>`;
  return `
    <section class="preview-section">
      <h3 class="preview-section__title">${title}</h3>
      ${content}
    </section>
  `;
};

export const buildResumeSectionsHtml = (resume) => {
  if (!resume || typeof resume !== "object") {
    return `<pre class="preview-raw">${escapeHtml(JSON.stringify(resume, null, 2) ?? "")}</pre>`;
  }
  const sections = ensureArray(resume.sections);
  if (!sections.length) {
    return `<p class="preview-empty">No resume sections were returned. Try generating again.</p>`;
  }

  return sections
    .map((section) => {
      const id = (section.id || "").toLowerCase();
      if (id === "summary") return renderSummarySection(section);
      if (id === "experience") return renderExperienceSection(section);
      if (id === "skills") return renderSkillSection(section);
      if (id === "education") return renderEducationSection(section);
      return renderGenericSection(section);
    })
    .join("");
};

export class StatusBadge {
  constructor(element) {
    this.el = element;
  }

  set(message, type = "info") {
    if (!this.el) return;
    this.el.textContent = message ?? "";
    if (!message) {
      delete this.el.dataset.statusType;
    } else {
      this.el.dataset.statusType = type;
    }
  }
}

export class ContextLibrary {
  constructor(elements, statusBadge) {
    this.docListEl = elements.docList;
    this.statusBadge = statusBadge;
    this.currentHandle = null;
    this.currentContext = null;
    this.documentEntries = [];
    this.documentCount = 0;
  }

  renderDocuments(documents) {
    this.documentEntries = Array.isArray(documents) ? documents : [];
    const names = this.documentEntries
      .map((doc) => (typeof doc === "string" ? doc : doc?.name ?? ""))
      .filter(Boolean);
    this.documentCount = this.documentEntries.length;

    if (!this.docListEl) {
      return this.documentCount;
    }

    if (!names.length) {
      this.docListEl.innerHTML = `<li class="panel__docs-empty">Select the directory that holds your qualification PDFs. We'll cache snippets for fast resume tailoring.</li>`;
      return this.documentCount;
    }

    this.docListEl.innerHTML = names
      .slice(0, 3)
      .map(
        (name) =>
          `<li class="panel__docs-item"><span class="panel__docs-item-bullet"></span>${escapeHtml(
            name
          )}</li>`
      )
      .join("");

    return this.documentCount;
  }

  async hydrate() {
    this.renderDocuments(this.documentEntries);
  }

  updateFromContext(context) {
    this.currentContext = context ?? null;
    if (!context) {
      this.renderDocuments([]);
      this.documentCount = 0;
      return;
    }

    const topEntries = Array.isArray(context.topEntries) ? context.topEntries : [];
    const pdfCount = typeof context.pdfFiles === "number" ? context.pdfFiles : null;
    const totalFiles = typeof context.totalFiles === "number" ? context.totalFiles : null;
    const chunkCount = typeof context.chunkCount === "number" ? context.chunkCount : null;

    if (topEntries.length) {
      this.renderDocuments(topEntries);
    } else if ((pdfCount ?? totalFiles ?? chunkCount ?? 0) === 0) {
      this.renderDocuments([]);
    }

    const availableCounts = [];
    if (topEntries.length) availableCounts.push(topEntries.length);
    if (pdfCount !== null) availableCounts.push(pdfCount);
    if (totalFiles !== null) availableCounts.push(totalFiles);
    if (chunkCount !== null) availableCounts.push(chunkCount);

    if (availableCounts.length) {
      this.documentCount = Math.max(...availableCounts, 0);
    }
  }

  hasContextData() {
    const status = this.currentContext?.status;
    if (status && ["pending", "refreshing", "scanning"].includes(status)) {
      return false;
    }
    const chunkCount =
      typeof this.currentContext?.chunkCount === "number" ? this.currentContext.chunkCount : null;
    if (chunkCount !== null && chunkCount <= 0) {
      return false;
    }
    const counts = [
      this.documentCount,
      typeof this.currentContext?.pdfFiles === "number" ? this.currentContext.pdfFiles : 0,
      chunkCount ?? 0,
      typeof this.currentContext?.totalFiles === "number" ? this.currentContext.totalFiles : 0,
    ];
    return counts.some((count) => count > 0);
  }
  async restoreHandle() {
    try {
      const handle = await database.getHandle();
      if (!handle) return null;
      const permission = await handle.queryPermission({ mode: "read" });
      if (permission === "granted") {
        this.currentHandle = handle;
        return handle;
      }
      if (permission === "prompt") {
        const granted = await handle.requestPermission({ mode: "read" });
        if (granted === "granted") {
          this.currentHandle = handle;
          return handle;
        }
      }
    } catch (error) {
      console.warn("[RiseAI] failed to restore directory handle", error);
    }
    return null;
  }

  async pickDirectory() {
    if (typeof window.showDirectoryPicker !== "function") {
      this.statusBadge.set("Directory picker unavailable in this browser.", "error");
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      this.currentHandle = handle;
      await database.saveHandle(handle);
      await runtimeApi.send("rise:context:selected", {
        name: handle.name,
      });
      await this.scanDirectory(handle, { selected: true });
      return handle;
    } catch (error) {
      if (error?.name === "AbortError") return null;
      console.error("[RiseAI] directory selection failed", error);
      this.statusBadge.set("Unable to access folder. Try again.", "error");
      return null;
    }
  }

  async scanDirectory(handle, { selected = false } = {}) {
    if (!handle) {
      this.statusBadge.set("Select a context folder before scanning.", "error");
      return;
    }
    this.currentHandle = handle;
    this.statusBadge.set(`Scanning ${handle.name}...`, "info");

    const documents = [];
    const chunks = [];
    let pdfCount = 0;

    try {
      for await (const entry of handle.values()) {
        if (entry.kind !== "file") continue;
        const file = await entry.getFile();
        if (!file.name.toLowerCase().endsWith(".pdf")) continue;
        pdfCount += 1;
        const text = await Chunking.extractText(file);
        const docRecord = {
          id: file.name,
          name: file.name,
          size: file.size,
          updatedAt: Date.now(),
        };
        documents.push(docRecord);
        const pieces = Chunking.chunkText(text);
        pieces.forEach((piece, index) => {
          chunks.push({
            id: `${file.name}#${index}`,
            docId: file.name,
            text: piece,
            order: index,
          });
        });
      }
    } catch (error) {
      console.error("[RiseAI] scan failed", error);
      this.statusBadge.set("Failed to read folder contents.", "error");
      await runtimeApi.send("rise:context:scan-result", {
        error: error.message,
        scannedAt: Date.now(),
      });
      return;
    }

    this.renderDocuments(documents);
    this.statusBadge.set(`Context updated. ${pdfCount} PDF${pdfCount === 1 ? "" : "s"} indexed.`, "success");

    this.currentContext = {
      name: handle.name,
      status: "ready",
      totalFiles: documents.length,
      pdfFiles: pdfCount,
      chunkCount: chunks.length,
      lastRefreshedAt: Date.now(),
      topEntries: documents.slice(0, 3).map((doc) => doc.name),
    };
    this.documentCount = Math.max(this.documentCount, pdfCount, chunks.length);

    try {
      await runtimeApi.send("rise:context:store", {
        documents,
        chunks,
      });
    } catch (error) {
      console.warn("[RiseAI] failed to persist context in background", error);
    }

    await runtimeApi.send("rise:context:scan-result", {
      name: handle.name,
      totalEntries: documents.length,
      pdfCount,
      chunkCount: chunks.length,
      selected,
      scannedAt: this.currentContext.lastRefreshedAt,
      topEntries: this.currentContext.topEntries,
    });
  }
}

export class JobController {
  constructor(elements, statusBadge) {
    this.summaryEl = elements.summary;
    this.textarea = elements.textarea;
    this.selectionHintEl = elements.selectionHint;
    this.statusBadge = statusBadge;
    this.currentJob = null;
  }

  hydrate(job) {
    this.currentJob = job;
    this.setSummary(job?.text);
    if (typeof job?.text === "string" && this.textarea) {
      this.textarea.value = job.text;
    }
    if (job?.text) {
      this.updateSelectionHint(job.text, job.source ?? "captured");
    }
  }

  setSummary(jobText) {
    if (!this.summaryEl) return;
    if (!jobText) {
      this.summaryEl.textContent = "No job description captured yet.";
      return;
    }
    const normalized = jobText.replace(/\s+/g, " ").trim();
    const clipped = normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
    this.summaryEl.textContent = `Stored job description (${normalized.length} chars): ${clipped}`;
  }

  updateSelectionHint(text, source = "selection") {
    if (!this.selectionHintEl) return;
    if (!text) {
      this.selectionHintEl.textContent = "Highlight text on the page or paste it below.";
      return;
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    const clipped = normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
    const originLabel = source === "selection" ? "Highlighted" : source === "pasted" ? "Pasted" : "Captured";
    this.selectionHintEl.textContent = `${originLabel} (${normalized.length} chars): ${clipped}`;
  }

  getTextareaValue() {
    return (this.textarea?.value ?? "").trim();
  }

  setTextareaValue(value) {
    if (this.textarea) {
      this.textarea.value = value ?? "";
    }
  }

  focusTextarea() {
    this.textarea?.focus({ preventScroll: true });
  }
}

export class PreviewOverlay {
  constructor(elements, statusBadge) {
    this.layer = elements.layer;
    this.overlay = elements.overlay;
    this.titleEl = elements.title;
    this.metaEl = elements.meta;
    this.contentEl = elements.content;
    this.editorContainer = elements.editor;
    this.loaderEl = elements.loader;
    this.loaderSpinnerEl = elements.loaderSpinner;
    this.loaderMessageEl = elements.loaderMessage;
    this.statusBadge = statusBadge;
    this.currentEntry = null;
    this.editing = false;
    this.editorInstance = null;
    this.editorModule = null;
    this.streamingPreEl = null;
  }

  async ensureEditorModule() {
    if (this.editorModule) return this.editorModule;
    const cssUrl = chrome.runtime.getURL("content/lib/simple-editor.css");
    if (!document.querySelector('link[data-rise-editor="css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssUrl;
      link.dataset.riseEditor = "css";
      document.head.appendChild(link);
    }
    this.editorModule = await import(chrome.runtime.getURL("content/lib/simple-editor.js"));
    return this.editorModule;
  }

  open(entry) {
    this.currentEntry = entry;
    this.streamingPreEl = null;
    if (!this.overlay || !this.titleEl || !this.metaEl || !this.contentEl) return;
    if (this.layer) {
      this.layer.hidden = false;
    }
    this.overlay.hidden = false;
    if (this.loaderEl) {
      this.loaderEl.hidden = true;
    }
    this.titleEl.textContent = entry.title ?? "Resume Preview";
    this.metaEl.textContent = entry.updatedAt
      ? `Updated ${entry.updatedAt}`
      : entry.createdAt
      ? `Generated ${entry.createdAt}`
      : "";
    this.contentEl.innerHTML = buildResumeSectionsHtml(entry.resume);
    this.contentEl.style.display = "";
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    this.editing = false;
  }

  close() {
    if (!this.overlay) return;
    this.overlay.hidden = true;
    if (this.layer) {
      this.layer.hidden = true;
    }
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    if (this.contentEl) {
      this.contentEl.style.display = "";
    }
    if (this.loaderEl) {
      this.loaderEl.hidden = true;
    }
    this.editing = false;
    this.editorInstance = null;
    this.currentEntry = null;
    this.streamingPreEl = null;
  }

  async toggleEditing() {
    if (!this.currentEntry || !this.editorContainer) return this.currentEntry;
    if (!this.editing) {
      const { SimpleEditor } = await this.ensureEditorModule();
      this.editorContainer.hidden = false;
      this.editorContainer.innerHTML = "";
      if (this.contentEl) {
        this.contentEl.style.display = "none";
      }
      this.editorInstance = new SimpleEditor({
        root: this.editorContainer,
        initialHtml: this.currentEntry.editedHtml || buildResumeSectionsHtml(this.currentEntry.resume),
      });
      this.editorInstance.focus();
      this.editing = true;
      this.statusBadge.set("Editing mode enabled.", "info");
      return this.currentEntry;
    }

    const html = this.editorInstance?.getHtml?.() ?? "";
    this.currentEntry.editedHtml = html || this.currentEntry.editedHtml || buildResumeSectionsHtml(this.currentEntry.resume);
    this.currentEntry.updatedAtMs = Date.now();
    this.currentEntry.updatedAt = new Date(this.currentEntry.updatedAtMs).toLocaleString();
    const summary = this.extractSummaryTitle(this.currentEntry);
    if (summary) this.currentEntry.title = summary;
    if (this.contentEl) {
      this.contentEl.innerHTML = this.currentEntry.editedHtml;
      this.contentEl.style.display = "";
    }
    this.editorContainer.hidden = true;
    this.editorContainer.innerHTML = "";
    this.editorInstance = null;
    this.editing = false;
    this.statusBadge.set("Changes applied to preview.", "success");
    return this.currentEntry;
  }

  showLoading(message = "Preparing your tailored resume...") {
    if (this.layer) this.layer.hidden = false;
    if (this.overlay) this.overlay.hidden = false;
    if (this.loaderEl) {
      this.loaderEl.hidden = false;
    }
    if (this.loaderSpinnerEl) {
      this.loaderSpinnerEl.hidden = false;
    }
    if (this.loaderMessageEl) {
      this.loaderMessageEl.textContent = message;
    }
    if (this.contentEl) {
      this.contentEl.style.display = "none";
      this.contentEl.innerHTML = "";
    }
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    this.currentEntry = null;
    this.editing = false;
    this.streamingPreEl = null;
  }

  beginStreaming(message = "Generating with Gemini...") {
    if (this.loaderMessageEl) {
      this.loaderMessageEl.textContent = message;
    }
    if (this.loaderSpinnerEl) {
      this.loaderSpinnerEl.hidden = false;
    }
    if (this.contentEl) {
      this.contentEl.style.display = "";
      this.contentEl.innerHTML =
        '<pre class="rise-ai-stream-output" style="max-height:320px;overflow:auto;white-space:pre-wrap;"></pre>';
      this.streamingPreEl = this.contentEl.querySelector(".rise-ai-stream-output");
    }
  }

  updateStreaming(text = "") {
    if (this.streamingPreEl) {
      this.streamingPreEl.textContent = text;
    }
  }

  endStreaming() {
    this.streamingPreEl = null;
  }

  showMessage({ title = "Rise AI", body = "", tone = "info" } = {}) {
    if (this.layer) this.layer.hidden = false;
    if (this.overlay) this.overlay.hidden = false;
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.metaEl) this.metaEl.textContent = "";
    if (this.loaderEl) {
      this.loaderEl.hidden = false;
    }
    if (this.loaderSpinnerEl) {
      this.loaderSpinnerEl.hidden = true;
    }
    if (this.loaderMessageEl) {
      this.loaderMessageEl.textContent = body;
    }
    if (this.contentEl) {
      this.contentEl.style.display = "none";
      this.contentEl.innerHTML = "";
    }
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    this.statusBadge.set(body, tone);
    this.streamingPreEl = null;
  }

  extractSummaryTitle(entry) {
    if (!entry) return "";
    const temp = document.createElement("div");
    temp.innerHTML = entry.editedHtml || buildResumeSectionsHtml(entry.resume);
    const candidate = temp.querySelector(".preview-section__paragraph");
    if (!candidate) return "";
    const text = candidate.textContent.trim();
    return text ? `${text.slice(0, 64)}${text.length > 64 ? "..." : ""}` : "";
  }

  downloadJson(entry) {
    if (!entry?.resume) {
      this.statusBadge.set("No resume to download yet.", "error");
      return;
    }
    const blob = new Blob([JSON.stringify(entry.resume, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entry.id || "resume"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.statusBadge.set("Resume JSON downloaded.", "success");
  }

  exportPdf(entry) {
    if (!entry?.resume) {
      this.statusBadge.set("No resume to export yet.", "error");
      return;
    }
    const sectionsHtml = entry.editedHtml || buildResumeSectionsHtml(entry.resume);
    const docHtml = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(
      entry.title ?? "Resume"
    )}</title><style>
      body{font-family:'Inter','Segoe UI',system-ui,sans-serif;margin:40px;color:#111214;}
      h1{margin:0 0 12px;font-size:22px;}
      h2{margin:4px 0 24px;font-size:13px;color:#5b5c5f;}
      .preview-section{border-bottom:1px solid rgba(17,17,18,0.12);padding-bottom:16px;margin-bottom:20px;}
      .preview-section:last-of-type{border-bottom:none;margin-bottom:0;}
      .preview-section__title{margin:0 0 12px;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;}
      .preview-section__paragraph{margin:0 0 10px;font-size:13px;line-height:1.6;}
      .preview-experience__item{margin-bottom:14px;}
      .preview-experience__header{font-weight:600;font-size:13px;display:flex;gap:8px;flex-wrap:wrap;}
      .preview-experience__meta{font-size:12px;color:#5b5c5f;display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;}
      .preview-experience__bullets{margin:8px 0 0 18px;font-size:13px;}
      .preview-skill-list{display:flex;flex-wrap:wrap;gap:8px;}
      .preview-skill{padding:6px 10px;border-radius:999px;background:#f3f4f6;font-size:12px;}
      .preview-education__item{margin-bottom:16px;font-size:13px;}
      .preview-education__degree{font-weight:600;}
      .preview-education__institution{color:#5b5c5f;margin-top:2px;}
      .preview-education__dates{color:#5b5c5f;font-size:12px;margin-top:4px;}
      .preview-education__highlights{margin:8px 0 0 18px;font-size:13px;}
    </style></head><body><h1>${escapeHtml(entry.title ?? "Resume")}</h1><h2>${
      entry.updatedAt ? `Updated ${escapeHtml(entry.updatedAt)}` : entry.createdAt ? `Generated ${escapeHtml(entry.createdAt)}` : ""
    }</h2>${sectionsHtml}</body></html>`;
    const printWindow = window.open("", "_blank", "noopener=yes,width=900,height=1120");
    if (!printWindow) {
      this.statusBadge.set("Pop-up blocked. Allow pop-ups to export PDF.", "error");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(docHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
        this.statusBadge.set("Print dialog opened for PDF export.", "success");
      } catch (error) {
        console.error("[RiseAI] PDF export failed", error);
        this.statusBadge.set("Unable to export to PDF.", "error");
      }
    }, 250);
  }
}
export class ResumeHistory {
  constructor(listEl, previewOverlay, statusBadge) {
    this.listEl = listEl;
    this.previewOverlay = previewOverlay;
    this.statusBadge = statusBadge;
    this.entries = [];
    this.entryIndex = new Map();
  }

  async hydrate() {
    const stored = await HistoryRepository.fetch();
    this.entries = stored;
    this.entryIndex.clear();
    stored.forEach((entry) => this.entryIndex.set(entry.id, entry));
    this.render();
    return stored;
  }

  render() {
    if (!this.listEl) return;
    if (!this.entries.length) {
      this.listEl.innerHTML = `<p class="history-empty">No resumes yet. Generate your first one to see it here.</p>`;
      return;
    }
    this.listEl.innerHTML = this.entries
      .map((entry) => {
        const meta = entry.updatedAt || entry.createdAt || "";
        return `<article class="history-item" data-resume-id="${entry.id}">
          <span class="history-item__title">${escapeHtml(entry.title ?? "Resume")}</span>
          <span class="history-item__meta">${escapeHtml(meta)}</span>
        </article>`;
      })
      .join("");
  }

  async add(entry) {
    const saved = await HistoryRepository.save(entry);
    this.entryIndex.set(saved.id, saved);
    const existingIndex = this.entries.findIndex((item) => item.id === saved.id);
    if (existingIndex !== -1) {
      this.entries.splice(existingIndex, 1, saved);
    } else {
      this.entries.unshift(saved);
    }
    this.entries = this.entries.slice(0, 20);
    this.render();
    return saved;
  }

  async update(entry) {
    const saved = await HistoryRepository.save(entry);
    this.entryIndex.set(saved.id, saved);
    const index = this.entries.findIndex((item) => item.id === saved.id);
    if (index !== -1) {
      this.entries.splice(index, 1, saved);
    } else {
      this.entries.unshift(saved);
    }
    this.entries = this.entries.slice(0, 20);
    this.render();
    return saved;
  }

  getById(id) {
    return this.entryIndex.get(id) || null;
  }
}







