# Real EditorJS Integration - Complete Setup

## Overview

The Rise AI Chrome extension now uses the **actual EditorJS library** (not a stub/fallback). This provides a professional block-based editing experience identical to the Rise webapp.

---

## What Changed

### Before (Stub/Fallback)
- EditorJS file was a 407-byte stub
- Fell back to contentEditable div
- Basic HTML rendering only
- No real block-based editing

### After (Real EditorJS)
- Full EditorJS 2.28.2 library (209KB)
- Real block-based editor with tools
- Proper inline toolbar
- Drag & drop blocks
- Professional editing UX

---

## Files Downloaded

### EditorJS Core
- **File**: `content/lib/editorjs/editorjs.umd.min.js`
- **Size**: 209KB
- **Version**: 2.28.2
- **Source**: https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.28.2

### EditorJS Tools

| Tool | File | Size | Purpose |
|------|------|------|---------|
| **Header** | `tools/header.umd.min.js` | 6.9KB | H1-H6 headers |
| **List** | `tools/list.umd.min.js` | 5.9KB | Ordered/unordered lists |
| **Paragraph** | `tools/paragraph.umd.min.js` | 3.3KB | Text paragraphs |

---

## Updated Code

### editorjs-wrapper.js Changes

**Before:**
```javascript
EditorJSMod = await import(
  chrome.runtime.getURL("content/lib/editorjs/editorjs.min.js") // stub
);
```

**After:**
```javascript
// Load real EditorJS
const EditorJSMod = await import(
  chrome.runtime.getURL("content/lib/editorjs/editorjs.umd.min.js")
);

// Load tools
const [HeaderMod, ListMod, ParagraphMod] = await Promise.all([
  import(chrome.runtime.getURL("content/lib/editorjs/tools/header.umd.min.js")),
  import(chrome.runtime.getURL("content/lib/editorjs/tools/list.umd.min.js")),
  import(chrome.runtime.getURL("content/lib/editorjs/tools/paragraph.umd.min.js")),
]);

const EditorJS = EditorJSMod.default || EditorJSMod.EditorJS;
const Header = HeaderMod.default;
const List = ListMod.default;
const Paragraph = ParagraphMod.default;
```

**Tool Configuration:**
```javascript
this.instance = new EditorJS({
  holder: this.container,
  autofocus: true,
  data: { blocks },
  tools: {
    header: {
      class: Header,
      inlineToolbar: true,
      config: {
        placeholder: 'Enter a header',
        levels: [1, 2, 3, 4, 5, 6],
        defaultLevel: 2
      }
    },
    list: {
      class: List,
      inlineToolbar: true,
      config: {
        defaultStyle: 'unordered'
      }
    },
    paragraph: {
      class: Paragraph,
      inlineToolbar: true
    },
  },
});
```

---

## Features Now Available

### 1. Block-Based Editing
- Click to edit individual blocks
- Press Enter to create new blocks
- Backspace at start to merge blocks
- Tab/Shift+Tab to change nesting (lists)

### 2. Inline Toolbar
- Appears when you select text
- Bold, italic, link formatting
- Per-tool specific options

### 3. Block Toolbar
- Left-side "+" button to add blocks
- Drag handle to reorder blocks
- Settings menu per block
- Delete block option

### 4. Block Types
- **Header (H1-H6)**: Section titles, names, job titles
- **Paragraph**: Body text, descriptions
- **List**: Bullet points, ordered lists, nested lists

### 5. Keyboard Shortcuts
- `/` - Open block selector menu
- `Cmd/Ctrl + B` - Bold
- `Cmd/Ctrl + I` - Italic
- `Cmd/Ctrl + K` - Add link
- `Tab` - Indent list item
- `Shift + Tab` - Outdent list item

---

## User Experience Improvements

### Preview Mode (Read-Only)
```javascript
// Automatically set to read-only
this.instance.readOnly.toggle(true);
```
- Content visible but not editable
- Clean, professional appearance
- No editor UI chrome
- Perfect for previewing resumes

### Edit Mode
```javascript
// Switch to editable
this.instance.readOnly.toggle(false);
```
- Full block editing capabilities
- Inline toolbar appears
- Block toolbar visible
- Drag & drop blocks

---

## Fallback Still Works

If EditorJS fails to load for any reason:
1. Wrapper catches the error
2. Falls back to contentEditable div
3. Converts blocks to HTML
4. Displays with custom styling

**This ensures the extension always works**, even if:
- Network issues prevent loading
- Browser compatibility issues
- Unexpected errors occur

---

## Testing the Integration

### 1. Reload Extension
```
chrome://extensions/ → Find "Rise AI" → Click refresh icon
```

### 2. Generate New Resume
- Add profile details
- Paste job description
- Click "Generate Resume"

### 3. Expected Console Logs
```
[RiseAI] Loaded EditorJS and tools: { hasHeader: true, hasList: true, hasParagraph: true }
[RiseAI] Creating EditorJS with 18 blocks
[RiseAI] EditorJS initialized successfully
[RiseAI] Read-only mode enabled
```

### 4. Visual Checks

**Preview Mode:**
- [ ] Content displays with professional styling
- [ ] Headers are larger and bold
- [ ] Lists have bullets/numbers
- [ ] No editing UI visible
- [ ] Can't click to edit

**Edit Mode (Click "Edit" button):**
- [ ] Can click into blocks to edit
- [ ] Inline toolbar appears on text selection
- [ ] Left toolbar has "+" button
- [ ] Can drag blocks to reorder
- [ ] Can add new blocks with "+"
- [ ] Tab/Shift+Tab works in lists

### 5. Interaction Tests
- [ ] Click between blocks - cursor moves
- [ ] Press Enter - creates new paragraph
- [ ] Select text - inline toolbar appears
- [ ] Hover left side - drag handle appears
- [ ] Press "/" - block selector menu opens

---

## File Structure

```
rise-ai/
└── content/
    └── lib/
        └── editorjs/
            ├── editorjs.umd.min.js      (209KB - EditorJS core)
            ├── editorjs.min.js          (407B - old stub, kept for reference)
            └── tools/
                ├── header.umd.min.js    (6.9KB)
                ├── list.umd.min.js      (5.9KB)
                └── paragraph.umd.min.js (3.3KB)
```

**Total Size**: ~225KB (acceptable for a full editor)

---

## Future Enhancements

### Additional Tools to Consider

| Tool | Use Case | Size |
|------|----------|------|
| **Quote** | Testimonials, recommendations | ~3KB |
| **Image** | Profile pictures, project screenshots | ~8KB |
| **Table** | Skills matrix, project details | ~12KB |
| **Delimiter** | Visual section separators | ~2KB |
| **Code** | Technical portfolio samples | ~5KB |

### How to Add More Tools

1. Download the tool:
```bash
curl -L "https://cdn.jsdelivr.net/npm/@editorjs/quote@latest/dist/quote.umd.min.js" \
  -o content/lib/editorjs/tools/quote.umd.min.js
```

2. Import in wrapper:
```javascript
const QuoteMod = await import(
  chrome.runtime.getURL("content/lib/editorjs/tools/quote.umd.min.js")
);
const Quote = QuoteMod.default;
```

3. Add to tools config:
```javascript
tools: {
  // ... existing tools
  quote: {
    class: Quote,
    inlineToolbar: true,
    config: {
      quotePlaceholder: 'Enter a quote',
      captionPlaceholder: "Quote's author"
    }
  }
}
```

4. Update converter in `resume-to-editorjs.js` to handle quote blocks

---

## Troubleshooting

### Issue: EditorJS not loading
**Symptoms**: Falls back to contentEditable
**Check**: Browser console for import errors
**Solution**: Ensure files exist and manifest includes them

### Issue: Tools not working
**Symptoms**: Can create blocks but toolbar is limited
**Check**: Console for "tool not found" errors
**Solution**: Verify tool files downloaded correctly

### Issue: Styles look wrong
**Note**: EditorJS 2.28+ has inline styles, no separate CSS needed
**If needed**: Can add custom CSS to override defaults

### Issue: Read-only mode shows editing UI
**Check**: Ensure `readOnly.toggle(true)` is called after `isReady`
**Fix**: See [ui.js:1440-1442](content/modules/ui.js#L1440-L1442)

---

## Performance Notes

### Initial Load
- EditorJS loads ~225KB on first use
- Browser caches for subsequent loads
- Loads asynchronously (non-blocking)

### Runtime
- Minimal memory footprint
- Efficient block rendering
- No performance issues with 50+ blocks

### Comparison

| Version | Size | Features |
|---------|------|----------|
| **Stub** | 407B | None (fallback only) |
| **Real EditorJS** | 225KB | Full block editor |
| **Rise Webapp** | ~300KB | EditorJS + more tools |

---

## Benefits Over Fallback

| Feature | Fallback | Real EditorJS |
|---------|----------|---------------|
| Block editing | ❌ | ✅ |
| Inline toolbar | ❌ | ✅ |
| Drag & drop | ❌ | ✅ |
| Block types | Basic HTML | Header, List, Paragraph |
| Keyboard shortcuts | ❌ | ✅ |
| Professional UX | Basic | Excellent |

---

## Documentation Links

- **EditorJS Docs**: https://editorjs.io/
- **Getting Started**: https://editorjs.io/getting-started
- **Tools List**: https://editorjs.io/tools
- **API Reference**: https://editorjs.io/api
- **Block Tools Tutorial**: https://editorjs.io/creating-a-block-tool

---

**Status**: ✅ Real EditorJS fully integrated
**Version**: EditorJS 2.28.2
**Last Updated**: 2025-01-01
