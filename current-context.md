# Current Status – Resume Generation Failing

## Issue Summary
- Gemini Nano’s Prompt API returns an empty response (`Other generic failures occurred` once we try to parse it) even after reducing the context slice.
- The service worker logs show both the primary attempt (`chunkLimit: 12`) and our fallback attempt (`chunkLimit: 6`) ending with `Gemini returned empty text`.
- Offscreen logging confirms the prompt we send is a long plain-text blob (system instructions + job description + context). No JSON is returned, so `parseResumeJson` throws.
- Because the model returns nothing, the UI winds up showing “Gemini returned an empty response”.

## Current Prompt Shape
- We flatten the job description and up to 12 (or 6 on retry) context snippets into a single string: `"JOB DESCRIPTION …\n\nCONTEXT CHUNKS …\n\nINSTRUCTIONS …"`.
- The prompt payload does **not** currently split PDF text beyond our chunking; we already merged the snippets before sending them.
- The prompt length is still very large (job description ~4K chars + context ~6–8 chunks) and may exceed what `session.prompt()` can handle.

## Next Actions
1. **Trim and normalize context text**: strip duplicate whitespace, cap each snippet (e.g. 300–400 chars), and remove PDFs that produce extremely long passages. This keeps the request within Prompt API limits.
2. **Add prompt-size guards**: log total characters and bail if the combined prompt exceeds a chosen threshold; show a specific error so the user knows to reduce context.
3. **Investigate streamed responses**: switching to `promptStreaming()` may surface partial output instead of getting an empty string (useful if Nano times out while generating).
4. **Fallback strategy**: if Nano keeps returning nothing, surface an actionable message (“Gemini couldn’t produce a result. Try trimming the job description or removing context files.”) and avoid writing an empty entry to history.
- The standalone sample (`samples/prompt-interface/`) still works when streaming is enabled, so the Prompt API itself is healthy—our issue is specific to the extension payload, not the API availability.
