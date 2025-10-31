# EditorJS Integration - Rise AI Chrome Extension

## Overview

The Rise AI Chrome extension now uses **EditorJS** for resume rendering and editing, aligning with the Rise webapp's architecture. This provides a consistent, professional editing experience across both platforms.

---

## Architecture

### Hybrid Approach

We use a **hybrid architecture** that maintains compatibility with Gemini Nano's limitations while delivering a modern EditorJS experience:

1. **Generation**: Gemini Nano generates resumes using the simple, flat schema (to avoid complexity crashes)
2. **Conversion**: The simple schema is automatically converted to EditorJS blocks format
3. **Rendering**: EditorJS renders the blocks in both read-only (preview) and editable modes
4. **Editing**: Users can edit directly in EditorJS, with changes saved as EditorJS blocks
5. **Export**: EditorJS blocks are converted to clean HTML for PDF export

---

## Key Components

### 1. Resume-to-EditorJS Converter
**File**: [content/modules/resume-to-editorjs.js](content/modules/resume-to-editorjs.js)

Converts Rise AI's simple resume format to EditorJS blocks:

```javascript
// Input: Rise AI format
{
  "version": "1.0",
  "sections": [
    {
      "id": "summary",
      "title": "Summary",
      "content": ["Senior engineer with 8+ years experience..."]
    },
    {
      "id": "experience",
      "title": "Experience",
      "content": [
        {
          "title": "Senior Engineer",
          "company": "TechCorp",
          "bullets": ["Led team of 5", "Increased performance by 40%"]
        }
      ]
    }
  ]
}

// Output: EditorJS blocks format
{
  "time": 1735689600000,
  "version": "2.28.0",
  "blocks": [
    {
      "type": "header",
      "data": { "text": "Summary", "level": 2 }
    },
    {
      "type": "paragraph",
      "data": { "text": "Senior engineer with 8+ years experience..." }
    },
    {
      "type": "header",
      "data": { "text": "Experience", "level": 2 }
    },
    {
      "type": "header",
      "data": { "text": "Senior Engineer - TechCorp", "level": 3 }
    },
    {
      "type": "list",
      "data": {
        "style": "unordered",
        "items": ["Led team of 5", "Increased performance by 40%"]
      }
    }
  ]
}
```

**Supported Section Types:**
- `summary` → Paragraph blocks
- `experience` → Header (H3) + paragraph + bullet lists
- `projects` → Header (H3) + paragraph + bullet lists + links
- `skills` → Comma-separated paragraph
- `education` → Header (H3) + paragraph + bullet lists
- `certifications` → Unordered list
- `header` (resume header) → H1 (name) + paragraphs (headline, contacts)

---

### 2. EditorJS-to-HTML Converter
**File**: [content/modules/editorjs-to-html.js](content/modules/editorjs-to-html.js)

Converts EditorJS blocks to clean HTML for PDF export:

```javascript
// Input: EditorJS blocks
{
  "blocks": [
    { "type": "header", "data": { "text": "Experience", "level": 2 } },
    { "type": "list", "data": { "style": "unordered", "items": ["Item 1", "Item 2"] } }
  ]
}

// Output: HTML
<h2>Experience</h2>
<ul><li>Item 1</li><li>Item 2</li></ul>
```

**Supported Block Types:**
- `header` → `<h1>` through `<h6>`
- `paragraph` → `<p>` (preserves links)
- `list` → `<ul>` or `<ol>`
- `quote` → `<blockquote>` with optional `<cite>`
- `delimiter` → `<hr>`

---

### 3. EditorJS Wrapper
**File**: [content/lib/editorjs-wrapper.js](content/lib/editorjs-wrapper.js)

Enhanced to accept EditorJS blocks directly:

```javascript
// Old usage (HTML-based)
const editor = new SimpleEditor({
  root: container,
  initialHtml: "<h2>Title</h2><p>Content</p>"
});

// New usage (EditorJS blocks)
const editor = new SimpleEditor({
  root: container,
  initialBlocks: {
    blocks: [
      { type: "header", data: { text: "Title", level: 2 } },
      { type: "paragraph", data: { text: "Content" } }
    ]
  }
});
```

**Features:**
- Accepts both `initialHtml` (legacy) and `initialBlocks` (new)
- Automatically falls back to contentEditable if EditorJS unavailable
- Supports basic EditorJS tools: header, paragraph, list

---

### 4. Preview Overlay Updates
**File**: [content/modules/ui.js](content/modules/ui.js) - `PreviewOverlay` class

**New Behavior:**

1. **Opening Preview** (`open()` method):
   - Automatically converts resume to EditorJS blocks if not already converted
   - Renders in **read-only EditorJS mode** (users can see but not edit)
   - Stores converted blocks in `entry.editorBlocks`

2. **Toggle Editing** (`toggleEditing()` method):
   - **Enter edit mode**: Creates editable EditorJS instance with current blocks
   - **Exit edit mode**: Saves edited blocks to `entry.editedBlocks`, re-renders in read-only mode

3. **PDF Export** (`exportPdf()` method):
   - Converts EditorJS blocks to HTML using `editorjs-to-html.js`
   - Generates clean, print-friendly PDF with professional styling
   - Falls back to legacy HTML rendering if blocks unavailable

---

## Data Flow

### Resume Generation → Preview → Edit → Export

```
┌─────────────────┐
│  Gemini Nano    │
│  Generates      │
│  Simple Schema  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  resume-to-editorjs.js  │
│  Converts to Blocks     │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────┐
│  PreviewOverlay.open()   │
│  Renders Read-Only       │
│  EditorJS Instance       │
└────────┬─────────────────┘
         │
         ▼
┌───────────────────────────────┐
│  User Clicks "Edit"           │
│  toggleEditing() - Edit Mode  │
└────────┬──────────────────────┘
         │
         ▼
┌───────────────────────────────┐
│  User Edits Content           │
│  EditorJS Blocks Updated      │
└────────┬──────────────────────┘
         │
         ▼
┌───────────────────────────────┐
│  User Clicks "Edit" Again     │
│  Saves to entry.editedBlocks  │
│  Back to Read-Only Mode       │
└────────┬──────────────────────┘
         │
         ▼
┌───────────────────────────────┐
│  User Clicks "Download PDF"   │
│  editorjs-to-html.js          │
│  Converts Blocks to HTML      │
│  Opens Print Dialog           │
└───────────────────────────────┘
```

---

## Resume Entry Structure

Resume entries now store data in multiple formats for compatibility:

```javascript
{
  id: "resume-123",
  title: "Resume Preview",
  createdAt: "1/1/2025, 12:00:00 PM",
  updatedAt: "1/1/2025, 1:00:00 PM",

  // Original format (Gemini Nano output)
  resume: {
    version: "1.0",
    sections: [...]
  },

  // EditorJS format (converted on first open)
  editorBlocks: {
    time: 1735689600000,
    version: "2.28.0",
    blocks: [...]
  },

  // Edited blocks (if user made changes)
  editedBlocks: {
    time: 1735693200000,
    version: "2.28.0",
    blocks: [...]
  },

  // Legacy HTML (for backward compatibility)
  editedHtml: "<h2>Title</h2><p>Content</p>"
}
```

---

## Benefits

### 1. **Consistency with Rise Webapp**
- Both platforms use EditorJS for resume editing
- Users get the same editing experience
- Easy to share resume data between platforms

### 2. **Better Editing Experience**
- Block-based editing (drag, reorder, delete blocks)
- Inline formatting toolbar
- Clean, professional appearance
- No raw HTML editing needed

### 3. **Maintains Gemini Nano Compatibility**
- Simple schema generation avoids token/complexity crashes (see [GEMINI_NANO_LIMITATIONS.md](GEMINI_NANO_LIMITATIONS.md))
- Conversion happens after generation, not during
- EditorJS rendering doesn't affect Gemini Nano

### 4. **Future-Proof**
- Easy to add new EditorJS block types (quotes, tables, etc.)
- Can sync with Rise webapp's EditorJS tools
- Supports rich content without schema complexity

---

## EditorJS Block Types Used

| Block Type | Usage | Example |
|-----------|-------|---------|
| **header** | Section titles, job titles, name | `<h2>Experience</h2>` |
| **paragraph** | Body text, descriptions, contacts | Professional summary text |
| **list** | Bullet points, skills, certifications | Unordered: achievements<br>Ordered: steps |

### Future Additions (Rise Webapp Compatible)
- **quote** - Testimonials, recommendations
- **image** - Profile picture, project screenshots
- **table** - Structured data (skills matrix)
- **delimiter** - Visual section separators

---

## Backward Compatibility

The system maintains full backward compatibility:

1. **Legacy HTML (`editedHtml`)**: Still supported for old resume entries
2. **Simple Schema (`resume`)**: Always generated by Gemini Nano, never removed
3. **Fallback Rendering**: If EditorJS fails, falls back to HTML renderers in [ui.js](content/modules/ui.js:482-508)

---

## Testing Checklist

- [ ] Generate new resume → Should render with EditorJS in read-only mode
- [ ] Click "Edit" button → Should switch to editable EditorJS mode
- [ ] Make changes in edit mode → Click "Edit" again → Changes should persist in read-only mode
- [ ] Download PDF → Should generate clean PDF from EditorJS blocks
- [ ] Download JSON → Should include both `resume` (simple) and `editorBlocks` (EditorJS)
- [ ] Open old resume (pre-EditorJS) → Should auto-convert to EditorJS blocks
- [ ] Close and reopen edited resume → Should show edited blocks, not original

---

## Common Issues & Solutions

### Issue: "EditorJS is not defined"
**Cause**: EditorJS library not loaded
**Solution**: Check `content/lib/editorjs/editorjs.min.js` exists and is in `web_accessible_resources`

### Issue: Changes don't persist after editing
**Cause**: `entry.editedBlocks` not being saved
**Solution**: Ensure `toggleEditing()` calls `await this.editorInstance.instance.save()` and stores result

### Issue: PDF export shows old content
**Cause**: Using `entry.resume` instead of `entry.editedBlocks`
**Solution**: `exportPdf()` should check `editedBlocks` first, then `editorBlocks`, then fall back to `resume`

### Issue: Blocks render but aren't editable
**Cause**: Read-only mode not being toggled
**Solution**: In `open()`, call `this.readOnlyEditorInstance.instance.readOnly.toggle(true)` after initialization

---

## Files Modified

| File | Changes |
|------|---------|
| [content/modules/ui.js](content/modules/ui.js) | Updated `PreviewOverlay` class: `open()`, `close()`, `toggleEditing()`, `exportPdf()` |
| [content/lib/editorjs-wrapper.js](content/lib/editorjs-wrapper.js) | Added `initialBlocks` parameter support |
| [content/modules/resume-to-editorjs.js](content/modules/resume-to-editorjs.js) | **New file** - Converts simple schema to EditorJS blocks |
| [content/modules/editorjs-to-html.js](content/modules/editorjs-to-html.js) | **New file** - Converts EditorJS blocks to HTML |
| [manifest.json](manifest.json) | Already includes `content/modules/*.js` in `web_accessible_resources` |

---

## References

- **EditorJS Documentation**: https://editorjs.io/
- **Rise Webapp EditorJS Implementation**: [rise-webapp/frontend/components/editor-component.tsx](../rise-webapp/frontend/components/editor-component.tsx)
- **Gemini Nano Limitations**: [GEMINI_NANO_LIMITATIONS.md](GEMINI_NANO_LIMITATIONS.md)
- **EditorJS Block Types Reference**: [rise-webapp/frontend/types/editor.ts](../rise-webapp/frontend/types/editor.ts)

---

**Last Updated**: 2025-01-01
**Version**: 0.2.0 (with EditorJS integration)
