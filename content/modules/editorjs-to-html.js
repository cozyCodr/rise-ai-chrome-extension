/**
 * Converts EditorJS blocks to HTML for PDF export and other purposes
 * @param {Object|Array} data - EditorJS data ({ blocks: [] } or blocks array)
 * @returns {string} HTML string
 */
export const convertEditorJSToHtml = (data) => {
  if (!data) return "";

  const blocks = Array.isArray(data) ? data : data.blocks || [];

  return blocks
    .map((block) => {
      if (!block || !block.type) return "";

      switch (block.type) {
        case "header":
          return convertHeader(block.data);
        case "paragraph":
          return convertParagraph(block.data);
        case "list":
          return convertList(block.data);
        case "quote":
          return convertQuote(block.data);
        case "delimiter":
          return "<hr>";
        default:
          return `<!-- Unsupported block type: ${block.type} -->`;
      }
    })
    .filter(Boolean)
    .join("");
};

const escapeHtml = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const convertHeader = (data) => {
  if (!data || !data.text) return "";
  const level = Math.min(Math.max(Number(data.level || 2), 1), 6);
  const text = data.text || "";

  // Preserve links but escape other HTML
  const processedText = text.replace(/<a\s+([^>]*)>(.*?)<\/a>/gi, (match, attrs, content) => {
    // Keep the link as is if it looks valid
    if (attrs.includes('href')) {
      return match;
    }
    return escapeHtml(content);
  });

  return `<h${level}>${processedText}</h${level}>`;
};

const convertParagraph = (data) => {
  if (!data || !data.text) return "";
  const text = data.text || "";

  // Preserve links but escape other HTML
  const processedText = text.replace(/<a\s+([^>]*)>(.*?)<\/a>/gi, (match, attrs, content) => {
    if (attrs.includes('href')) {
      return match;
    }
    return escapeHtml(content);
  });

  return `<p>${processedText}</p>`;
};

const convertList = (data) => {
  if (!data || !Array.isArray(data.items) || data.items.length === 0) return "";

  const tag = data.style === "ordered" ? "ol" : "ul";
  const items = data.items
    .map((item) => {
      if (!item) return "";
      const text = String(item).trim();
      if (!text) return "";
      return `<li>${escapeHtml(text)}</li>`;
    })
    .filter(Boolean)
    .join("");

  return items ? `<${tag}>${items}</${tag}>` : "";
};

const convertQuote = (data) => {
  if (!data || !data.text) return "";
  const text = escapeHtml(data.text || "");
  const caption = data.caption ? `<cite>${escapeHtml(data.caption)}</cite>` : "";
  return `<blockquote>${text}${caption}</blockquote>`;
};
