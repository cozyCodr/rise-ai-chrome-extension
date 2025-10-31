# Testing EditorJS Integration

## Quick Test Steps

### 1. Reload Extension
```
1. Go to chrome://extensions/
2. Find "Rise AI"
3. Click the refresh icon
```

### 2. Generate New Resume

1. Open the Rise AI panel on any job posting page
2. Add your profile details (if not already added)
3. Paste a job description
4. Click "Generate Resume"
5. Wait for generation to complete

**Expected Result:**
- Preview overlay should open
- Resume should render using EditorJS (not plain HTML)
- Content should be visible with proper formatting
- Headers (H1, H2, H3), paragraphs, and bullet lists should display

**Check Console:**
```
[RiseAI] Rendering EditorJS with blocks: { blockCount: X, blocks: {...} }
[RiseAI] EditorJS instance ready
[RiseAI] EditorJS read-only mode enabled
```

### 3. Test Edit Mode

1. With the preview open, click the "Edit" button
2. Try editing content (add text, modify bullets, etc.)
3. Click "Edit" again to save changes

**Expected Result:**
- Edit mode should show editable EditorJS interface
- You can click into blocks and type
- Saving should return to read-only mode with your changes visible

**Check Console:**
```
Editing mode enabled.
Changes applied to preview.
```

### 4. Test PDF Export

1. With preview open, click "Download PDF"
2. Print dialog should open

**Expected Result:**
- Clean, formatted PDF preview
- All content from EditorJS blocks should be visible
- Professional styling (no "blocks" or raw JSON)

### 5. Test History Reopening

1. Close the preview
2. Open the "History" tab
3. Click on the resume you just generated

**Expected Result:**
- Preview opens with EditorJS rendering
- Content matches what you saw before
- If you edited, edited version should show

---

## Debugging Empty Editor

If the editor appears empty after generation:

### Check Console Logs

Look for these messages:

**✅ Success:**
```
[RiseAI] Rendering EditorJS with blocks: { blockCount: 15, blocks: {...} }
[RiseAI] EditorJS instance ready
[RiseAI] EditorJS read-only mode enabled
```

**❌ Problem - No blocks:**
```
[RiseAI] No blocks provided for rendering
```
**Solution:** Check if `convertResumeToEditorJS()` is being called and returning blocks

**❌ Problem - Conversion error:**
```
[RiseAI] Failed to render EditorJS, falling back to HTML
```
**Solution:** Check browser console for the full error stack trace

### Inspect Resume Entry

Open console and run:
```javascript
// Get the most recent resume from history
const app = document.querySelector('[data-rise-panel]')?.__riseApp;
const latestResume = app?.history?.entries?.[0];

console.log('Resume entry:', latestResume);
console.log('Has resume:', !!latestResume?.resume);
console.log('Has editorBlocks:', !!latestResume?.editorBlocks);
console.log('Blocks count:', latestResume?.editorBlocks?.blocks?.length || 0);
```

**Expected Output:**
```
Resume entry: {
  id: "resume-...",
  resume: { version: "1.0", sections: [...] },
  editorBlocks: { time: ..., version: "2.28.0", blocks: [...] },
  ...
}
Has resume: true
Has editorBlocks: true
Blocks count: 15
```

### Check EditorJS Library

Verify EditorJS is loaded:
```javascript
// In console
const url = chrome.runtime.getURL("content/lib/editorjs/editorjs.min.js");
console.log('EditorJS URL:', url);

// Try to import it
import(url).then(mod => {
  console.log('EditorJS loaded:', mod);
}).catch(err => {
  console.error('Failed to load EditorJS:', err);
});
```

---

## Common Issues & Fixes

### Issue 1: "EditorJS is not defined"
**Symptoms:** Console shows `EditorJS constructor not found`
**Fix:** Ensure [content/lib/editorjs/editorjs.min.js](content/lib/editorjs/editorjs.min.js) exists

### Issue 2: Empty editor after generation
**Symptoms:** Preview opens but shows nothing
**Possible Causes:**
1. `convertResumeToEditorJS()` not being called
2. Blocks conversion returning empty array
3. `await` missing on `previewOverlay.open()`

**Fix:**
- Check [content/panel-app.js:439](content/panel-app.js#L439) has `await this.previewOverlay.open(saved);`
- Check [content/modules/ui.js:1387-1391](content/modules/ui.js#L1387-L1391) for conversion logic

### Issue 3: Content shows but not editable
**Symptoms:** Can see content but clicking "Edit" does nothing
**Fix:** Check if `readOnly.toggle(true)` is being called on the instance

### Issue 4: Edits don't persist
**Symptoms:** Make changes in edit mode, but they disappear on re-opening
**Fix:** Ensure `entry.editedBlocks` is being saved to history (check [content/modules/ui.js:1504-1505](content/modules/ui.js#L1504-L1505))

### Issue 5: PDF shows raw JSON
**Symptoms:** PDF export shows `{ "blocks": [...] }` instead of formatted content
**Fix:** Check [content/modules/ui.js:1545-1548](content/modules/ui.js#L1545-L1548) is importing `convertEditorJSToHtml`

---

## Manual Fallback Test

To verify the fallback HTML rendering still works:

1. Open console
2. Run this to simulate EditorJS failure:
```javascript
const app = document.querySelector('[data-rise-panel]').__riseApp;
const previewOverlay = app.previewOverlay;

// Temporarily break EditorJS
const original = previewOverlay.ensureEditorModule;
previewOverlay.ensureEditorModule = async () => {
  throw new Error('Simulated EditorJS failure');
};

// Open a resume (should fall back to HTML)
const entry = app.history.entries[0];
await previewOverlay.open(entry);

// Restore
previewOverlay.ensureEditorModule = original;
```

**Expected:** Resume should still display using HTML fallback

---

## Performance Checks

### Initialization Time
EditorJS should initialize within 1-2 seconds:

```javascript
console.time('EditorJS Init');
// Generate resume...
// Check console when "[RiseAI] EditorJS instance ready" appears
console.timeEnd('EditorJS Init');
```

**Expected:** < 2000ms

### Memory Usage
Check Chrome Task Manager (Shift+Esc):
- Extension should use < 50MB with EditorJS rendered
- No memory leaks when opening/closing previews

---

## Success Criteria

✅ **All tests pass if:**

1. New resume generation shows EditorJS-rendered content
2. Edit mode allows inline editing of blocks
3. Changes persist when toggling edit mode
4. PDF export shows clean, formatted HTML
5. Reopening from history shows correct content
6. Console shows no errors
7. Fallback HTML rendering works if EditorJS fails

---

## Reporting Issues

If you encounter issues, please include:

1. **Console logs** from generation through preview
2. **Resume entry structure** (from inspection steps above)
3. **Browser version** (chrome://version)
4. **Extension version** (from manifest.json)
5. **Steps to reproduce**

Post issues at: https://github.com/anthropics/rise-ai-chrome-extension/issues

---

**Last Updated:** 2025-01-01
