import { getJobState, getContextState } from "../state.js";
import { findRelevantChunks } from "../search/chunk-retrieval.js";
import { estimateTokens, calculatePromptTokens, calculateMaxChunks, GEMINI_NANO_LIMITS } from "./token-counter.js";

const BASE_SYSTEM_PROMPT = `You are Rise AI, an on-device assistant that composes tailored resumes.
- Output must be valid JSON following the provided schema.
- Highlight measurable achievements when possible.
- Stay truthful to the supplied context; never fabricate.
- Treat the job description strictly as the target role -- never copy its responsibilities as the candidate's work history.
- Keep the professional summary concise (2-3 sentences) and grounded in proven accomplishments from the context.
- Prioritise experience, projects, and education details; present skills succinctly and avoid filler.`;

const DUMMY_JOHN_DOE_CHUNKS = [
  {
    id: "dummy-1",
    docId: "john-doe-resume.pdf",
    text: "JOHN DOE\njohndoe@email.com | +1 555-0123 | linkedin.com/in/johndoe | github.com/johndoe\n\nProfessional Summary\nSenior Software Engineer with 8+ years of experience building scalable web applications. Specialized in React, TypeScript, and Node.js. Led teams of 5-10 engineers and delivered products serving 1M+ users."
  },
  {
    id: "dummy-2",
    docId: "john-doe-resume.pdf",
    text: "Experience\n\nSenior Frontend Engineer | TechCorp Inc. | San Francisco, CA | 2020 - Present\n- Led development of e-commerce platform using React and TypeScript, increasing conversion rate by 35%\n- Architected component library used across 12 products, reducing development time by 40%\n- Mentored 5 junior engineers and conducted weekly code reviews\n- Implemented automated testing pipeline, achieving 90% code coverage"
  },
  {
    id: "dummy-3",
    docId: "john-doe-resume.pdf",
    text: "Frontend Developer | StartupXYZ | Austin, TX | 2017 - 2020\n- Built responsive web applications serving 500K+ monthly active users\n- Optimized bundle size from 3MB to 800KB, improving load time by 60%\n- Integrated third-party APIs including Stripe, Auth0, and AWS\n- Collaborated with design team to implement pixel-perfect UI/UX\n\nSkills: React, TypeScript, JavaScript, Node.js, PostgreSQL, AWS, Docker, Git, REST APIs, GraphQL, CI/CD"
  }
];

// Set to true to use dummy data for testing
const USE_DUMMY_DATA = false;

const buildContextSummary = (chunks) =>
  chunks
    .map(
      (chunk, idx) =>
        `Context #${idx + 1} (document: ${chunk.docId ?? "unknown"})\n${chunk.text}`
    )
    .join("\n\n");

export const buildResumePrompt = async ({ chunkLimit = 12 } = {}) => {
  const [job, context] = await Promise.all([getJobState(), getContextState()]);
  if (!job?.text) {
    throw new Error("Job description is missing. Add or paste one before generating.");
  }

  // Build system prompt first
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

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
- skills: content is an array of strings.
- education: content is an array of objects { degree?, institution?, dates?, highlights? }.`;

  // Calculate safe chunk limit based on token budget
  const instructions = `

INSTRUCTIONS:
1. Job description is for alignment only. Do not present it as part of the candidate's prior roles.
2. Summary must contain 2-3 sentences that highlight quantified wins backed by the context snippets.
3. Experience entries must reference real employers, roles, and outcomes drawn from the context. Rephrase but never invent facts.
4. Add a "projects" section when the context mentions notable initiatives, using objects { title, description, impact? }. Omit the section if no projects exist.
5. Skills should be a concise list of up to 10 items derived from the context and relevant to the job description.
6. Education should capture degrees, institutions, dates, and honours exactly as provided in the context.
7. Omit sections you cannot substantiate from the context rather than fabricating content.
`;
  const avgChunkSize = 600; // Conservative estimate
  const safeChunkLimit = calculateMaxChunks({
    systemPrompt,
    jobDescription: job.text + instructions,
    avgChunkSize,
    overhead: 100,
  });

  console.log("[RiseAI] Token budget analysis:", {
    requestedChunks: chunkLimit,
    safeChunkLimit,
    systemTokens: estimateTokens(systemPrompt),
    jobTokens: estimateTokens(job.text),
    limit: GEMINI_NANO_LIMITS.PER_PROMPT,
  });

  // Use the smaller of requested or safe limit
  const effectiveLimit = Math.min(chunkLimit, Math.max(1, safeChunkLimit));

  let relevantChunks;

  if (USE_DUMMY_DATA) {
    console.log("[RiseAI] Using DUMMY John Doe data for testing");
    relevantChunks = DUMMY_JOHN_DOE_CHUNKS.slice(0, Math.min(effectiveLimit, 3));
  } else {
    relevantChunks = await findRelevantChunks({
      jobDescription: job.text,
      limit: effectiveLimit,
    });

    if (!relevantChunks.length) {
      throw new Error(
        "No qualification context available. Add PDFs or text snippets in the Setup tab first."
      );
    }
  }

  const userPrompt = `JOB DESCRIPTION (target role, do not copy verbatim):\n${job.text}\n\nQUALIFICATION CONTEXT (candidate evidence):\n${buildContextSummary(relevantChunks)}${instructions}`;

  // Final token validation
  const tokenCount = calculatePromptTokens({ systemPrompt, userPrompt });

  console.log("[RiseAI] Final prompt tokens:", {
    system: tokenCount.systemTokens,
    user: tokenCount.userTokens,
    total: tokenCount.total,
    chunksUsed: relevantChunks.length,
    underLimit: tokenCount.total <= GEMINI_NANO_LIMITS.PER_PROMPT,
  });

  if (tokenCount.total > GEMINI_NANO_LIMITS.PER_PROMPT) {
    console.warn("[RiseAI] Prompt exceeds token limit!", {
      tokens: tokenCount.total,
      limit: GEMINI_NANO_LIMITS.PER_PROMPT,
      overage: tokenCount.total - GEMINI_NANO_LIMITS.PER_PROMPT,
    });
  }

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      job,
      context,
      chunkIds: relevantChunks.map((chunk) => chunk.id),
      tokenCount,
      chunksUsed: relevantChunks.length,
      chunksRequested: chunkLimit,
    },
  };
};
