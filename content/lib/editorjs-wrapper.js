// Lightweight wrapper that adapts Editor.js to the existing SimpleEditor interface
// Expected interface in PreviewOverlay:
//   const { SimpleEditor } = await ensureEditorModule();
//   const ed = new SimpleEditor({ root, initialHtml, initialBlocks });
//   ed.focus(); const html = ed.getHtml(); ed.destroy();

export class SimpleEditor {
  constructor({ root, initialHtml = "", initialBlocks = null }) {
    if (!root) throw new Error("Editor root element is required.");
    this.root = root;
    this.instance = null;
    this.container = document.createElement("div");
    this.container.className = "editorjs-container";
    this.root.appendChild(this.container);
    this.initialHtml = String(initialHtml || "");
    this.initialBlocks = initialBlocks; // EditorJS blocks format
    this.fallback = null;

    // Create a fake readOnly API for fallback compatibility
    this.readOnly = {
      toggle: (state) => {
        if (this.instance && this.instance.readOnly) {
          this.instance.readOnly.toggle(state);
          // Add/remove readonly class for CSS styling
          if (state) {
            this.container.classList.add('editorjs-container--readonly');
          } else {
            this.container.classList.remove('editorjs-container--readonly');
          }
        } else if (this.fallback) {
          this.fallback.contentEditable = !state;
        }
      }
    };

    this._ready = this.ensureEditor().catch((err) => {
      console.warn("[RiseAI] Editor.js unavailable; falling back to contentEditable.", err);
      this.enableFallback();
    });
  }

  async ensureEditor() {
    // Load EditorJS and its tools
    try {
      // Load EditorJS core
      const EditorJSMod = await import(
        chrome.runtime.getURL("content/lib/editorjs/editorjs.umd.min.js")
      );

      // Check if it's a stub
      if (EditorJSMod && EditorJSMod.__isStub) {
        throw new Error("EditorJS stub present; using fallback editor.");
      }

      // Load tools
      const [HeaderMod, ListMod, ParagraphMod] = await Promise.all([
        import(chrome.runtime.getURL("content/lib/editorjs/tools/header.umd.min.js")),
        import(chrome.runtime.getURL("content/lib/editorjs/tools/list.umd.min.js")),
        import(chrome.runtime.getURL("content/lib/editorjs/tools/paragraph.umd.min.js")),
      ]);

      const EditorJS = EditorJSMod.default || EditorJSMod.EditorJS || window.EditorJS;
      const Header = HeaderMod.default || window.Header;
      const List = ListMod.default || window.List;
      const Paragraph = ParagraphMod.default || window.Paragraph;

      if (!EditorJS) {
        throw new Error("EditorJS constructor not found.");
      }

      console.log("[RiseAI] Loaded EditorJS and tools:", {
        hasHeader: !!Header,
        hasList: !!List,
        hasParagraph: !!Paragraph
      });

      // Use EditorJS blocks directly if provided, otherwise convert from HTML
      const blocks = this.initialBlocks
        ? (Array.isArray(this.initialBlocks) ? this.initialBlocks : this.initialBlocks.blocks || [])
        : this.htmlToBlocks(this.initialHtml);

      console.log("[RiseAI] Creating EditorJS with", blocks.length, "blocks");

      this.instance = new EditorJS({
        holder: this.container,
        autofocus: true,
        data: { blocks },
        tools: {
          header: Header ? {
            class: Header,
            inlineToolbar: true,
            config: {
              placeholder: 'Enter a header',
              levels: [1, 2, 3, 4, 5, 6],
              defaultLevel: 2
            }
          } : undefined,
          list: List ? {
            class: List,
            inlineToolbar: true,
            config: {
              defaultStyle: 'unordered'
            }
          } : undefined,
          paragraph: Paragraph ? {
            class: Paragraph,
            inlineToolbar: true
          } : undefined,
        },
      });

      await this.instance.isReady;
      console.log("[RiseAI] EditorJS initialized successfully");
    } catch (e) {
      console.error("[RiseAI] Failed to load EditorJS:", e);
      // If packaged import fails or is a stub, rethrow to trigger fallback
      throw e;
    }
  }

  enableFallback() {
    this.fallback = document.createElement("div");
    this.fallback.contentEditable = "true";
    this.fallback.className = "editor-fallback";
    this.fallback.style.minHeight = "320px";
    this.fallback.style.outline = "none";

    // If we have blocks, convert them to HTML for the fallback
    if (this.initialBlocks) {
      this.fallback.innerHTML = this.blocksToHtml(this.initialBlocks);
    } else {
      this.fallback.innerHTML = this.initialHtml;
    }

    this.container.appendChild(this.fallback);
  }

  blocksToHtml(blocksData) {
    const blocks = Array.isArray(blocksData) ? blocksData : blocksData.blocks || [];

    return blocks.map(block => {
      if (!block || !block.type) return '';

      switch (block.type) {
        case 'header':
          const level = block.data?.level || 2;
          return `<h${level}>${this.escapeHtml(block.data?.text || '')}</h${level}>`;

        case 'paragraph':
          return `<p>${this.escapeHtml(block.data?.text || '')}</p>`;

        case 'list':
          const tag = block.data?.style === 'ordered' ? 'ol' : 'ul';
          const items = (block.data?.items || [])
            .map(item => `<li>${this.escapeHtml(item || '')}</li>`)
            .join('');
          return items ? `<${tag}>${items}</${tag}>` : '';

        default:
          return '';
      }
    }).filter(Boolean).join('');
  }

  htmlToBlocks(html) {
    // Very simple converter: headers, lists, paragraphs, with explicit links
    const textWithLinks = (node) => {
      if (!node) return "";
      if (node.nodeType === 3) return node.nodeValue || ""; // text node
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toLowerCase();
      if (tag === "a") {
        const href = node.getAttribute("href") || "";
        // Prefer full URL visibility
        return href;
      }
      let out = "";
      node.childNodes.forEach((n) => {
        out += textWithLinks(n);
      });
      return out;
    };

    // Linkify plain text into URLs
    const linkify = (text) => {
      const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;
      return String(text || "").replace(URL_RE, (u) => u);
    };

    const blocks = [];
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const children = Array.from(div.childNodes);
    for (const node of children) {
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        blocks.push({ type: "header", data: { text: linkify(node.textContent || ""), level: Number(tag.slice(1)) || 3 } });
      } else if (tag === "ul" || tag === "ol") {
        const style = tag === "ol" ? "ordered" : "unordered";
        const items = Array.from(node.querySelectorAll("li")).map((li) => linkify(textWithLinks(li)) || "");
        if (items.length) blocks.push({ type: "list", data: { style, items } });
      } else if (tag === "p" || tag === "section" || tag === "div") {
        const text = linkify(textWithLinks(node).trim());
        if (text) blocks.push({ type: "paragraph", data: { text } });
      }
    }
    if (!blocks.length && (html || "").trim()) {
      blocks.push({ type: "paragraph", data: { text: linkify((div.textContent || "").trim()) } });
    }
    return blocks;
  }

  async focus() {
    await this._ready;
    if (this.instance) return this.instance.focus?.();
    this.fallback?.focus?.();
  }

  getHtml() {
    if (this.instance) {
      // Convert blocks to simple HTML we already render in preview
      // Note: keep HTML minimal to stay small and print-friendly
      return this.instance.save().then(({ blocks }) => {
        const linkifyToAnchors = (text) => {
          const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;
          return String(text || "").replace(URL_RE, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
        };
        return blocks
          .map((b) => {
            if (b.type === "header") {
              const lvl = Math.min(Math.max(Number(b.data.level || 3), 1), 6);
              return `<h${lvl}>${linkifyToAnchors(this.escapeHtml(b.data.text || ""))}</h${lvl}>`;
            }
            if (b.type === "list") {
              const tag = b.data.style === "ordered" ? "ol" : "ul";
              const items = (b.data.items || [])
                .map((t) => `<li>${linkifyToAnchors(this.escapeHtml(String(t || "")))}</li>`) 
                .join("");
              return `<${tag}>${items}</${tag}>`;
            }
            return `<p>${linkifyToAnchors(this.escapeHtml(b.data.text || ""))}</p>`;
          })
          .join("");
      });
    }
    return this.fallback?.innerHTML || "";
  }

  escapeHtml(value) {
    return String(value).replace(/[&<>\"']/g, (ch) => {
      switch (ch) {
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
          return ch;
      }
    });
  }

  destroy() {
    try {
      this.instance?.destroy?.();
    } catch (e) {}
    this.instance = null;
    this.container.remove();
  }
}
