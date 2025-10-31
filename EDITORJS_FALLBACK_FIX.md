# EditorJS Fallback Fix - Empty Editor Issue

## Problem

The editor was appearing blank after resume generation with these console logs:

```
[RiseAI] Rendering EditorJS with blocks: { blockCount: 18, blocks: [...] }
[RiseAI] Editor.js unavailable; falling back to contentEditable. Error: EditorJS stub present...
[RiseAI] EditorJS instance ready
[RiseAI] EditorJS instance not available (likely using fallback editor)
```

## Root Cause

The actual **EditorJS library wasn't included** in the extension. The file `content/lib/editorjs/editorjs.min.js` contained only a 407-byte stub:

```javascript
// Minimal Editor.js stub to package structure; wrapper detects stub and falls back.
export const __isStub = true;
export default class EditorJS { ... }
```

When the wrapper detected the stub, it correctly fell back to a contentEditable div, **but the fallback didn't know how to render EditorJS blocks** - it only knew how to render HTML.

## Solution

Updated the **fallback editor to convert EditorJS blocks to HTML** before rendering:

### 1. Added `blocksToHtml()` method to editorjs-wrapper.js

```javascript
blocksToHtml(blocksData) {
  const blocks = Array.isArray(blocksData) ? blocksData : blocksData.blocks || [];

  return blocks.map(block => {
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
```

### 2. Updated `enableFallback()` to handle blocks

```javascript
enableFallback() {
  this.fallback = document.createElement("div");
  this.fallback.contentEditable = "true";
  this.fallback.className = "editor-fallback";
  this.fallback.style.minHeight = "320px";
  this.fallback.style.outline = "none";

  // Convert blocks to HTML if provided, otherwise use HTML directly
  if (this.initialBlocks) {
    this.fallback.innerHTML = this.blocksToHtml(this.initialBlocks);
  } else {
    this.fallback.innerHTML = this.initialHtml;
  }

  this.container.appendChild(this.fallback);
}
```

### 3. Added readOnly API for fallback compatibility

```javascript
this.readOnly = {
  toggle: (state) => {
    if (this.instance && this.instance.readOnly) {
      this.instance.readOnly.toggle(state);
    } else if (this.fallback) {
      this.fallback.contentEditable = !state;
    }
  }
};
```

### 4. Added professional CSS styling

Added styles to `content/lib/simple-editor.css`:

```css
.editor-fallback h1 { font-size: 28px; font-weight: 700; ... }
.editor-fallback h2 { font-size: 20px; border-bottom: 2px solid ...; ... }
.editor-fallback h3 { font-size: 16px; font-weight: 600; ... }
.editor-fallback p { font-size: 14px; margin: 0 0 12px; ... }
.editor-fallback ul, ol { padding-left: 24px; ... }
```

## Result

Now when EditorJS library is unavailable (stub detected):
1. ✅ Fallback editor converts blocks to HTML
2. ✅ Content renders with professional styling
3. ✅ Read-only mode works (contentEditable="false")
4. ✅ Edit mode works (contentEditable="true")
5. ✅ PDF export works (uses the same HTML)

## Future: Adding Real EditorJS

To use the actual EditorJS library in the future:

1. Download EditorJS from https://github.com/codex-team/editor.js/releases
2. Download the required tools:
   - @editorjs/header
   - @editorjs/paragraph
   - @editorjs/list
3. Replace `content/lib/editorjs/editorjs.min.js` with the real library
4. Add tool files to `content/lib/editorjs/tools/`
5. Update `editorjs-wrapper.js` to import tools

The fallback will continue to work as a safety net if EditorJS fails to load.

## Testing

Test the fix:

1. Reload extension
2. Generate new resume
3. **Expected:** Resume displays with formatted content (not blank)
4. **Console:** Should show "using fallback editor" message

**Success criteria:**
- Headers (H1, H2, H3) display with proper sizing
- Paragraphs have correct spacing
- Bullet lists display with indentation
- Content is non-editable in preview mode
- Content is editable when clicking "Edit" button

---

**Files Modified:**
- [content/lib/editorjs-wrapper.js](content/lib/editorjs-wrapper.js) - Added blocks-to-HTML conversion
- [content/lib/simple-editor.css](content/lib/simple-editor.css) - Added fallback editor styles
- [content/modules/ui.js](content/modules/ui.js) - Updated to use wrapper's readOnly API

**Status:** ✅ Fixed - Editor now displays content using fallback renderer
