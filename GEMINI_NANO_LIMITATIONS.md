# Gemini Nano Prompt Formatting Limitations

## Overview

Gemini Nano (Chrome's on-device AI) has strict limitations beyond just token count. This document explains the prompt formatting constraints discovered while building Rise AI.

---

## The Problem

**Symptom:** `UnknownError: Other generic failures occurred.` with `code: 0`

**Root Cause:** Gemini Nano crashes on complex, verbose prompts even when under the 1024 token limit.

---

## Key Constraints

### 1. **Token Limit is NOT the Only Issue**

While Gemini Nano has a hard limit of **1024 tokens per prompt**, prompts can crash well below this limit if they're too complex.

**Working Example (~600 tokens):**
```javascript
const systemPrompt = `You are Rise AI, an on-device assistant that composes tailored resumes.
- Output must be valid JSON following the provided schema.
- Highlight measurable achievements when possible.

JSON schema:
{
  "version": string,
  "sections": [
    {
      "id": string,
      "title": string,
      "content": unknown
    }
  ]
}

Section expectations:
- summary: content is an array of paragraphs (strings).
- experience: content is an array of objects { title, company?, location?, dates?, bullets[] }.
- skills: content is an array of strings.`;
```

**Crashing Example (~900 tokens):**
```javascript
const systemPrompt = `You are Rise AI. Output valid JSON per schema.

JSON schema:
{
  "version": string,
  "header": {
    "fullName": string,
    "headline": string,
    "contacts": {
      "email"?: string,
      "phone"?: string,
      "location"?: string,
      "website"?: string,
      "linkedin"?: string
    }
  },
  "summary": [string, string],
  "experience": [
    {
      "title": string,
      "company": string,
      "location"?: string,
      "dates"?: string,
      "highlights": [string, ...]
    }
  ],
  "projects"?: [
    {
      "title": string,
      "subtitle"?: string,
      "dates"?: string,
      "description"?: string,
      "impact": [string, ...],
      "link"?: string
    }
  ],
  "education"?: [
    {
      "degree": string,
      "institution": string,
      "location"?: string,
      "dates"?: string,
      "highlights": [string, ...]
    }
  ],
  "skills": [string, ...],
  "certifications"?: [string, ...]
}`;
```

**Why it crashes:**
- Deeply nested object structures (3+ levels)
- Multiple optional fields
- Array type annotations (`[string, ...]`)
- More complex parsing overhead

---

### 2. **Schema Complexity**

**❌ Avoid:**
- Nested objects beyond 2 levels (`header.contacts.email`)
- Detailed type annotations for arrays
- Large numbers of optional fields
- Verbose property names

**✅ Prefer:**
- Flat structures
- Simple object hierarchies (max 2 levels)
- Concise schemas
- Generic `unknown` types for flexibility

**Example - Simple Schema:**
```javascript
{
  "version": string,
  "sections": [
    {
      "id": string,
      "title": string,
      "content": unknown  // Let the model decide structure
    }
  ]
}
```

---

### 3. **Context/Profile Narrative Length**

The chunk-based approach limits context to **450 characters per chunk** with adaptive trimming:

```javascript
const MAX_CONTEXT_CHARS = 450;

const cleanChunkText = (text) => {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= MAX_CONTEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_CONTEXT_CHARS - 3).trimEnd()}...`;
};
```

**Profile-based approach** generates verbose narratives:
```
PROFILE HEADER:
Name: John Doe
Email: john@email.com | Phone: +1 555-0123 | Location: San Francisco, CA | Website: johndoe.com | LinkedIn: linkedin.com/in/johndoe

SUMMARY:
- Senior Software Engineer with 8+ years of experience building scalable web applications
- Specialized in React, TypeScript, and Node.js

EXPERIENCE:
Experience #1: Senior Frontend Engineer at TechCorp Inc.
  Jan 2020 - Present | San Francisco, CA
  - Led development of e-commerce platform using React and TypeScript, increasing conversion rate by 35%
  - Architected component library used across 12 products, reducing development time by 40%
  - Mentored 5 junior engineers and conducted weekly code reviews
  - Implemented automated testing pipeline, achieving 90% code coverage

Experience #2: Frontend Developer at StartupXYZ
  Jun 2017 - Dec 2019 | Austin, TX
  - Built responsive web applications serving 500K+ monthly active users
  - Optimized bundle size from 3MB to 800KB, improving load time by 60%

PROJECTS:
Project #1: E-commerce Platform Redesign
  Lead Developer | Jan 2021 - Jun 2021
  Complete redesign of legacy e-commerce platform
  - Increased conversion rate by 35%
  - Reduced page load time by 60%
  Link: https://github.com/johndoe/ecommerce

EDUCATION:
Education #1: B.S. Computer Science - Stanford University
  2013 - 2017 | Stanford, CA
  - Graduated with Honors

SKILLS:
React, TypeScript, JavaScript, Node.js, PostgreSQL, AWS, Docker, Git, REST APIs, GraphQL, CI/CD, Redux, Webpack, Jest, Cypress

CERTIFICATIONS:
Certification #1: AWS Certified Solutions Architect
Certification #2: Google Cloud Professional Developer
```

**This narrative alone is ~1600 characters (~400 tokens)!**

Combined with:
- System prompt: ~400 tokens
- Job description: ~200-400 tokens
- Instructions: ~100 tokens

**Total: 1100-1300 tokens** → Exceeds limit and crashes

---

### 4. **Adaptive Chunk Trimming**

The working chunk-based system uses **adaptive trimming**:

```javascript
// Start with requested chunks
let selectedChunks = [...relevantChunks];
let userPrompt = composeUserPrompt({ jobText, chunks: selectedChunks, instructions });
let tokenCount = calculatePromptTokens({ systemPrompt, userPrompt });

// Progressively drop chunks until under limit
while (tokenCount.total > GEMINI_NANO_LIMITS.PER_PROMPT && selectedChunks.length > 1) {
  selectedChunks = selectedChunks.slice(0, -1);
  userPrompt = composeUserPrompt({ jobText, chunks: selectedChunks, instructions });
  tokenCount = calculatePromptTokens({ systemPrompt, userPrompt });

  console.warn("[RiseAI] Prompt tokens above limit, dropping last context chunk", {
    remainingChunks: selectedChunks.length,
    tokens: tokenCount.total,
    limit: GEMINI_NANO_LIMITS.PER_PROMPT,
  });
}
```

**Key principle:** Gracefully degrade by removing context until prompt fits.

---

## Best Practices

### ✅ DO:

1. **Keep schemas simple and flat**
   - Max 2 levels of nesting
   - Use `unknown` for flexible content types
   - Minimize optional fields

2. **Limit context per section**
   - Cap each chunk at 450 characters
   - Use adaptive trimming to stay under token limits
   - Prioritize relevance over completeness

3. **Use concise instructions**
   - Keep instructions under 200 tokens
   - Use numbered lists (1-7 points max)
   - Avoid verbose explanations

4. **Implement progressive fallback**
   - Try with full context first
   - Drop chunks iteratively if over limit
   - Always validate token count before sending

5. **Monitor and log**
   ```javascript
   console.log("[RiseAI] Final prompt tokens:", {
     system: tokenCount.systemTokens,
     user: tokenCount.userTokens,
     total: tokenCount.total,
     chunksUsed: selectedChunks.length,
     underLimit: tokenCount.total <= GEMINI_NANO_LIMITS.PER_PROMPT,
   });
   ```

### ❌ DON'T:

1. **Don't use deeply nested schemas**
   - Avoid 3+ levels of object nesting
   - Don't specify detailed array types

2. **Don't send verbose narratives**
   - Avoid structured formatting with labels
   - Don't include unnecessary metadata

3. **Don't assume token limit is the only constraint**
   - Complexity matters as much as size
   - Test prompts even when under 1024 tokens

4. **Don't hardcode large prompts**
   - Always calculate and validate token count
   - Implement dynamic trimming

5. **Don't ignore errors**
   - Log full error details for debugging
   - Implement retry logic with reduced context

---

## Token Budget Breakdown

**Safe distribution for 1024-token limit:**

| Component | Tokens | Percentage |
|-----------|--------|------------|
| System Prompt (schema + rules) | 250-350 | 25-35% |
| Job Description | 150-250 | 15-25% |
| Context/Profile | 300-450 | 30-45% |
| Instructions | 50-100 | 5-10% |
| Buffer (safety margin) | 100-150 | 10-15% |
| **Total** | **~900** | **90%** |

**Never exceed 900 tokens total** to account for:
- Token estimation inaccuracy (~10% margin of error)
- Model processing overhead
- Safety buffer for edge cases

---

## Error Messages

### Common Errors

**1. `UnknownError: Other generic failures occurred.`**
- **Cause:** Prompt too complex or too long
- **Solution:** Reduce schema complexity, trim context, simplify instructions

**2. `The model process crashed too many times for this version.`**
- **Cause:** Repeated crashes corrupted Gemini Nano state
- **Solution:** Restart Chrome (`chrome://restart`), reload extension

**3. `The model execution session has been destroyed.`**
- **Cause:** Session reused with incompatible parameters or after manual reset
- **Solution:** Create fresh session for each generation (don't cache sessions)

**4. `Prompt API unavailable or create() not exposed.`**
- **Cause:** Gemini Nano not downloaded or flags not enabled
- **Solution:** Enable flags, download model via `chrome://components`

---

## Working Configuration (Rise AI)

**Current stable setup:**

```javascript
// Simple, flat schema
const systemPrompt = `You are Rise AI, an on-device assistant that composes tailored resumes.
- Output must be valid JSON following the provided schema.
- Highlight measurable achievements when possible.
- Stay truthful to the supplied context; never fabricate.

JSON schema:
{
  "version": string,
  "sections": [
    {
      "id": string,
      "title": string,
      "content": unknown
    }
  ]
}

Section expectations:
- summary: content is an array of paragraphs (strings).
- experience: content is an array of objects { title, company?, location?, dates?, bullets[] }.
- skills: content is an array of strings.`;

// Short chunks with adaptive trimming
const MAX_CONTEXT_CHARS = 450;
const cleanChunkText = (text) => {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_CONTEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_CONTEXT_CHARS - 3).trimEnd()}...`;
};

// Session configuration
const sessionOptions = {
  topK: 40,
  temperature: 0.45,
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};
```

**Why this works:**
- Simple 2-level schema: ~150 tokens
- Chunks limited to 450 chars: ~110 tokens each
- Adaptive trimming keeps total under 900 tokens
- Fresh session per generation (no state corruption)

---

## Future Improvements

As Gemini Nano matures (larger models, higher limits), we can:

1. **Increase context window** - Support longer job descriptions and profiles
2. **Use detailed schemas** - Move to structured header/experience/projects format
3. **Enable streaming** - Real-time generation with progressive updates
4. **Support multimodal input** - Analyze company websites, job posting screenshots

For now, **simplicity and conservative limits** are key to reliability.

---

## References

- [Chrome AI Prompt API Origin Trial](https://developer.chrome.com/docs/ai/built-in)
- [Gemini Nano Token Limits](https://github.com/explainers-by-googlers/prompt-api)
- Rise AI Implementation: `background/generation/prompt-template.js`
- Offscreen Handler: `background/offscreen/prompt-runner.js`

---

**Last Updated:** 2025-01-01
**Stable Commit:** `e0fcf2b` (chunk-based system with adaptive trimming)
