## Inspiration

The inspiration for Rise AI came from a LinkedIn post by Dan, a career coach who repeatedly emphasized one crucial truth: **tailored resumes get more interviews**. After implementing his advice and customizing my resume for each application, I immediately saw results—more callbacks, more interview invitations, more opportunities.

But the process was exhausting. Every job posting meant manually rewriting experience bullets, adjusting my summary, and highlighting different skills. I thought: *What if there was a tool that already knew my background and could instantly generate a tailored resume?* All I'd need to do is review, make minor edits, and hit send.

That's when I realized the perfect solution: **on-device AI**. With Google's Gemini Nano running locally in Chrome, I could build a completely private resume assistant—no servers, no subscriptions, no data leaks. Just instant, personalized resumes for every job opportunity.

## What it does

**Rise AI** transforms job hunting by generating tailored resumes in seconds, right from your browser. Here's how it works:

1. **Browse any job posting** on LinkedIn, Indeed, or any career site
2. **Click the floating Rise AI button** that appears on every page
3. **Paste or select the job description**—Rise AI captures it automatically
4. **Upload your profile once**: education, experience, projects, skills
5. **Generate**: Rise AI uses Gemini Nano to create a custom resume that highlights your most relevant qualifications for that specific role
6. **Review and download**: Get a professionally formatted resume in HTML or PDF

All processing happens **completely offline** using Chrome's built-in AI. Your sensitive career information never leaves your device—no cloud uploads, no API costs, no privacy concerns. You can generate unlimited resumes for free while keeping complete control over your data.

## How we built it

Rise AI is a Chrome extension built on **Manifest V3** with a sophisticated multi-layer architecture designed to work around Chrome's security restrictions:

### Architecture Overview

```
Content Scripts (UI Layer)
    ↕ chrome.runtime messaging
Service Worker (Orchestration)
    ↕ sendMessage + retry backoff
Offscreen Document (API Access)
    ↕ window.ai.languageModel
Gemini Nano (On-device AI)
```

**Why three layers?** Chrome's security model creates unique challenges:
- **Content scripts** can inject UI but can't access `window.ai` APIs
- **Service workers** coordinate between components but have no DOM access
- **Offscreen documents** run in extension context where Gemini Nano APIs are exposed

### Key Technical Components

**1. Shadow DOM Isolation**
We inject the Rise AI panel using Shadow DOM (`bootstrap.js`) to prevent CSS conflicts with host pages. This ensures our UI looks perfect on every website without breaking existing styles.

**2. Gemini Nano Prompt API Integration**
We use Google's experimental Prompt API with an Origin Trial token. Our implementation handles multiple API variants across Chrome versions:

```javascript
const factory =
  window.ai?.languageModel?.create ||
  window.ai?.languageModel?.createSession ||
  window.ai?.createTextSession ||
  window.LanguageModel?.createSession
```

Sessions are configured for deterministic output:
- `temperature: 0.45` (balanced creativity)
- `topK: 40` (nucleus sampling)
- Token limits: 1024 per prompt, 4096 session context

**3. Intelligent Context Management**
The biggest challenge with on-device models is **token limits**. We built a sophisticated prompt construction system:

- **Profile Normalization**: Flattens complex profile objects into plain-text narratives with strict constraints (max 6 bullets per job, max 15 skills, max 2 summary sentences)
- **Token Budget Enforcement**: Pre-flight validation estimates tokens (~4 chars = 1 token) and rejects prompts that exceed Gemini Nano's 1024-token limit
- **TF-IDF Retrieval** (planned): For PDF context, we implemented term frequency scoring to surface only the most relevant chunks

**4. Robust Communication Protocol**
Messaging between layers uses exponential backoff retry for reliability:

```javascript
// Retry up to 10 times with increasing delays: 150ms, 300ms, 450ms...
for (let attempt = 0; attempt < 10; attempt++) {
  try {
    const response = await sendOffscreenMessage("offscreen:ping");
    break;  // Success
  } catch (error) {
    await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
  }
}
```

**5. IndexedDB Storage**
We maintain two databases:
- `rise_ai_context`: PDF chunks, document metadata, resume history
- `rise_ai_data`: UI-layer copy for instant preview loading

**6. PDF Text Extraction**
Embedded PDF.js library parses uploaded PDFs client-side, chunks text into ~1KB segments, and stores them for future context retrieval.

**7. JSON Response Parsing with Fallbacks**
Gemini Nano sometimes wraps JSON in markdown blocks. We built a multi-stage parser:
1. Try direct `JSON.parse()`
2. Extract from ` ```json...``` ` blocks
3. Extract from generic ` ```...``` ` blocks
4. Regex match `{...}` patterns

### Tech Stack
- **Chrome Extension Manifest V3**
- **Gemini Nano Prompt API** (Origin Trial)
- **IndexedDB** for persistent storage
- **PDF.js** for document parsing
- **Shadow DOM** for UI isolation
- **TF-IDF algorithm** for context retrieval
- **Vanilla JavaScript** (no frameworks for minimal bundle size)

## Challenges we ran into

**1. Token Limit Nightmares**
Gemini Nano's 1024-token limit is *tiny*. A single job description could consume 400-600 tokens, leaving barely enough room for profile data. We had to:
- Implement aggressive text normalization (strip whitespace, cap sections)
- Build a token estimator to validate prompts before sending
- Design a fallback system that progressively reduces context when generation fails

**2. Streaming Formatted Text (Unsolved)**
We wanted real-time streaming of resume generation, but Gemini Nano's streaming API (`promptStreaming()`) doesn't guarantee consistent JSON format. Our current implementation waits for the full response, but we plan to explore:
- Streaming plain text with post-processing
- Progressive JSON parsing with repair algorithms
- Hybrid approach: stream summary, batch-generate structured sections

**3. Multi-Window Communication Chaos**
Rise AI has three UI components that need to stay in sync:
- **Configuration panel** (edit profile/settings)
- **Job description input** (paste/capture job text)
- **Preview window** (show generated resume)

Coordinating state across these windows required:
- Centralized state management in the service worker
- Broadcast notifications using `chrome.tabs.sendMessage()`
- Message deduplication to prevent infinite update loops

**4. Offscreen Document Initialization Race Conditions**
Chrome's offscreen documents don't signal when they're ready. We encountered "Receiving end does not exist" errors when sending messages too early. Solution: exponential backoff retry with up to 10 attempts (~8.25 seconds total wait time).

**5. Service Worker Keepalive**
Chrome suspends idle service workers after 30 seconds. During long resume generation, the worker would die mid-process. We implemented a keepalive interval:

```javascript
setInterval(() => {
  console.log("keepalive ping");
}, 20000);  // Every 20 seconds
```

**6. Empty Gemini Responses**
When prompts exceeded limits or context was too complex, Gemini Nano would return empty strings with cryptic "Other generic failures occurred" errors. We added:
- Detailed logging at every stage (offscreen, service worker, content script)
- Specific error messages explaining *why* generation failed
- Prompt size guards that prevent submission of oversized requests

**7. Context Overload Management**
Users can upload multiple PDFs as context. Initially, we tried sending all text to Gemini Nano—it crashed or returned nothing. We're implementing:
- Chunk size caps (300-400 chars per snippet)
- Relevance scoring to select only top-N matching chunks
- User warnings when combined prompt exceeds safe thresholds

## Accomplishments that we're proud of

**1. Making AI-Powered Resume Tailoring Free and Private**
In a world where every AI tool charges monthly subscriptions and requires cloud uploads, Rise AI is **completely free** and **100% private**. Job seekers can generate unlimited resumes without worrying about data breaches, API costs, or privacy violations. This levels the playing field, especially for students and early-career professionals who can't afford premium tools.

**2. Pushing Gemini Nano to Its Limits**
We're one of the first extensions to productionize Google's experimental Prompt API. We've learned its quirks, built workarounds for its limitations, and created a template for other developers looking to use on-device AI.

**3. Elegant Multi-Layer Architecture**
Despite Chrome's restrictions, we built a clean, maintainable codebase with clear separation between UI, orchestration, and AI layers. The exponential backoff retry, token budget enforcement, and multi-stage JSON parsing demonstrate production-quality engineering.

**4. Real-World Impact Potential**
In today's brutal job market, every advantage matters. Rise AI increases the quality and quantity of applications job seekers can send. **Tailored resumes significantly boost interview rates**—if we help even 100 people land jobs, we've changed lives.

**5. Solving the "Cold Start" Problem**
Most resume tools require tedious data entry. Rise AI lets users upload their existing resume or profile once, then generates unlimited variations instantly. The friction is minimal—exactly what job hunters need when they're already exhausted from applications.

## What we learned

**1. Chrome Extension Architecture (Manifest V3)**
Building Rise AI taught us the intricacies of modern Chrome extensions:

- **Service workers vs. background pages**: MV3 requires service workers that can be suspended, forcing us to design for stateless execution and keepalive patterns
- **Content script isolation**: Content scripts run in a separate JavaScript world from page scripts—they can inject UI but not access page-context APIs like `window.ai`
- **Offscreen documents**: Required for accessing sensitive APIs in MV3, they provide an extension-context iframe for operations that need full API access
- **Message passing patterns**: Coordinating between content scripts, service workers, and offscreen documents requires careful protocol design with retries and error handling

**2. On-Device AI Constraints and Opportunities**
Working with Gemini Nano revealed both the promise and limitations of browser-based AI:

- **Token limits are the primary bottleneck**: At 1024 tokens per prompt, every character counts—we learned to build aggressive text normalization and pre-flight validation
- **Deterministic configuration matters**: Balancing `temperature` and `topK` for consistent JSON output took experimentation
- **Session lifecycle management**: Sessions must be explicitly destroyed to free memory, and session reuse improves latency
- **Prompt engineering for structured output**: Getting reliable JSON from a language model requires explicit schema documentation, strict instructions, and multi-stage parsing fallbacks
- **The future is bright**: As Chrome's AI APIs mature and models grow, on-device AI will enable privacy-preserving apps we can't even imagine yet

**3. Communication Protocols in Distributed Systems**
Our three-layer architecture taught us valuable lessons about async coordination:

- **Exponential backoff is essential**: When dealing with unpredictable initialization times, linear retries waste time while exponential backoff adapts gracefully
- **Request/response correlation**: Using unique request IDs to match async responses (especially with `postMessage`) prevents race conditions
- **Broadcast vs. unicast messaging**: State updates need careful routing—some messages target specific tabs, others broadcast to all content scripts
- **Error propagation**: Errors must bubble up with context—cryptic failures three layers deep are impossible to debug

**4. Token Budget Management**
Building a token-limited system forced creative optimization:

- **Conservative estimation**: Using 4 chars = 1 token as a heuristic provides safety margin
- **Progressive reduction**: When generation fails, automatically retry with smaller context (12 chunks → 6 chunks → 3 chunks)
- **User transparency**: Show users exactly how much token budget remains before they submit

**5. Real-World AI Product Design**
We learned that production AI apps need far more than just calling an API:

- **Graceful degradation**: Always provide actionable error messages ("Your job description is too long—try trimming it to under 2000 characters")
- **Streaming vs. batch**: Streaming improves perceived performance but complicates output parsing—choose based on use case
- **Context curation**: For retrieval systems, relevance scoring prevents overwhelming the model with noise
- **User control**: Let users edit prompts, adjust temperature, and retry generation—don't hide the AI behind black-box magic

**6. PDF Parsing Challenges**
Client-side PDF extraction is surprisingly complex:

- **Text extraction isn't perfect**: Tables, multi-column layouts, and scanned images produce garbled text
- **Chunking strategy matters**: We settled on ~1KB chunks to balance granularity and retrieval accuracy
- **Metadata preservation**: Storing document IDs, chunk order, and timestamps enables smart context assembly

**7. IndexedDB Best Practices**
Managing dual databases taught us practical storage patterns:

- **Separate concerns**: Keep UI-optimized data (flat history) separate from retrieval-optimized data (chunked context)
- **Versioning**: Plan for schema migrations from day one—IndexedDB version conflicts are painful
- **Batch operations**: Bulk insert chunks from PDFs in transactions for performance

## What's next for Resume in Seconds (Rise AI)

**1. Intelligent Form Filling**
Most job applications require filling tedious online forms (LinkedIn Easy Apply, Workday, Greenhouse). We plan to:
- Detect form fields using semantic analysis (e.g., "What's your experience with React?" → skills section)
- Auto-populate text areas with relevant profile content
- Generate context-aware answers for open-ended questions
- Support multi-page applications with session state preservation

**2. Cover Letter Generation**
Leverage the same AI engine to create personalized cover letters:
- Analyze job description for company values and role requirements
- Extract relevant stories from user's experience
- Generate 3-4 paragraph letters with proper formatting
- Provide multiple tone options (formal, enthusiastic, creative)

**3. Streaming Resume Generation**
Improve perceived performance with real-time updates:
- Stream summary section first (quick feedback)
- Progressively render experience bullets as they're generated
- Show loading states per section instead of blocking entire UI
- Implement streaming JSON parser with error recovery

**4. Advanced Context Retrieval**
Upgrade from TF-IDF to semantic search:
- Integrate lightweight embedding models (e.g., TinyBERT)
- Use cosine similarity for relevance scoring
- Support multi-document context assembly (combine relevant chunks from multiple PDFs)
- Let users manually pin important context sections

**5. Multi-Format Export**
Expand beyond HTML/PDF:
- Generate LaTeX for academic CVs
- Export to ATS-friendly plain text
- Create LinkedIn profile optimizations
- Support custom templates (modern, classic, minimalist)

**6. A/B Testing Insights**
Help users optimize their applications:
- Track which resume versions get callbacks
- Suggest improvements based on successful patterns
- Highlight overused phrases or weak language
- Compare resume against job description (keyword gap analysis)

**7. Collaborative Profiles**
Enable teams and mentors to help with profiles:
- Share profile templates (e.g., university career centers)
- Import LinkedIn profiles automatically
- Version control for resume iterations
- Comments and suggestions on profile sections

**8. Offline-First PWA Companion**
Extend beyond Chrome extension:
- Standalone Progressive Web App for mobile
- Sync profiles across devices with end-to-end encryption
- Desktop app with native file system access
- Support for other Chromium browsers (Edge, Brave)

**9. Enterprise Features**
Monetization path through B2B:
- University career center licenses (bulk student access)
- Corporate outplacement services (help laid-off employees)
- Resume review teams (collaborate on candidate profiles)
- Analytics dashboard (track application success rates)

**10. Expanded AI Capabilities (as Chrome's APIs mature)**
- **Multimodal input**: Analyze company websites, job posting images
- **Larger context windows**: Support full transcripts, lengthy projects
- **Fine-tuning**: Let users create custom models trained on their writing style
- **Prompt chaining**: Break generation into multi-step reasoning (analyze JD → identify gaps → enhance profile → format resume)

---

**The Long-Term Vision**
Rise AI aims to be the **private, free, AI-powered career companion** that every job seeker deserves. By keeping everything on-device, we eliminate privacy concerns while democratizing access to tools that were previously behind paywalls. As browser-based AI continues improving, we'll stay at the forefront—proving that powerful, ethical AI applications don't require compromising user data.