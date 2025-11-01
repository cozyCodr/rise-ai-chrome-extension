import { getJobState, getContextState } from "../state.js";
import { estimateTokens, calculatePromptTokens, GEMINI_NANO_LIMITS } from "./token-counter.js";

const BASE_SYSTEM_PROMPT = `You are Rise AI, an on-device assistant that drafts professional cover letters.
- Use only the candidate information provided in the PROFILE SNAPSHOT.
- Treat the job description as context about the role, not as the candidate's experience.
- Never claim the candidate performed tasks that appear only in the job description.
- CRITICAL: Do NOT include any placeholder fields, brackets, or instructions like "[insert X]" or "if applicable". Write complete, final text only.
- CRITICAL: Do NOT mention where the job was posted or add any external references not in the profile snapshot.
- Produce a polished, plain-text letter with multiple short paragraphs.
- Address the reader respectfully and close with a confident sign-off.`;

const MAX_BULLETS = 4;

const clampArray = (value = [], limit = Infinity) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter(Boolean)
    .slice(0, limit);

const buildProfileSnapshot = (profile) => {
  if (!profile || typeof profile !== "object") return "";
  const header = profile.header || {};
  const lines = [];
  const name = header.fullName ? header.fullName.trim() : "";
  const headline = header.headline ? header.headline.trim() : "";
  if (name) {
    lines.push(`Name: ${name}`);
  }
  if (headline) {
    lines.push(`Headline: ${headline}`);
  }
  const summary = profile.summary ? profile.summary.trim() : "";
  if (summary) {
    lines.push(`Summary: ${summary}`);
  }

  const experiences = Array.isArray(profile.experience) ? profile.experience : [];
  clampArray(experiences, 3).forEach((exp, index) => {
    if (!exp) return;
    const role = exp.title || exp.role || "Role";
    const company = exp.company || exp.organisation || exp.organization || "";
    const dates = exp.dates || "";
    const bullets = clampArray(exp.highlights || exp.bullets || [], MAX_BULLETS);
    const heading = company ? `${role} at ${company}` : role;
    const sectionLines = [`Experience ${index + 1}: ${heading}`];
    if (dates) sectionLines.push(`Dates: ${dates}`);
    bullets.forEach((point, idx) => {
      sectionLines.push(`- ${point}`);
    });
    lines.push(sectionLines.join("\n"));
  });

  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  clampArray(projects, 2).forEach((project, index) => {
    if (!project) return;
    const title = project.title || project.name || `Project ${index + 1}`;
    const summaryLine = project.description || project.impact?.[0] || project.highlights?.[0] || "";
    const info = [`Project ${index + 1}: ${title}`];
    if (summaryLine) info.push(summaryLine);
    lines.push(info.join("\n"));
  });

  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (skills.length) {
    lines.push(`Skills: ${clampArray(skills, 12).join(", ")}`);
  }

  const certifications = Array.isArray(profile.certifications) ? profile.certifications : [];
  if (certifications.length) {
    lines.push(`Certifications: ${clampArray(certifications, 4).join(", ")}`);
  }

  return lines.join("\n\n");
};

export const buildCoverLetterPrompt = async () => {
  const [job, context] = await Promise.all([getJobState(), getContextState()]);
  if (!job?.text) {
    throw new Error("Job description is missing. Add or paste one before generating.");
  }
  const profile = context?.profile;
  if (!profile) {
    throw new Error("Profile details are missing. Add your profile in the Profile tab before generating.");
  }

  const profileSnapshot = buildProfileSnapshot(profile);
  if (!profileSnapshot.trim()) {
    throw new Error("Profile details are incomplete. Add experiences, education, projects, or skills before generating.");
  }

  const systemPrompt = `${BASE_SYSTEM_PROMPT}`;

  const instructions = `

COVER LETTER REQUIREMENTS:
1. Start with "Dear Hiring Manager," on the first line.
2. On the second line (as a separate paragraph), write "RE:" followed by a concise, professional reference to the specific role and company from the job description. Keep this under 15 words. Example: "RE: Application for Senior Front-End Engineer at Playmerce"
3. In the body paragraphs, highlight the most relevant achievements from the profile snapshot that align with the role.
4. Express genuine interest in the role/company using wording inspired by the job description without copying responsibilities.
5. Do NOT include placeholder text like "[Platform where you saw the job posting]" or "[insert X]" or "if applicable" - write final, complete text only.
6. Do NOT mention how or where the candidate found the job posting.
7. Close with confidence, including a call to action and professional sign-off.
8. Keep the tone warm, professional, and concise (3-5 short paragraphs total, including the RE line).
9. Output only the cover letter text (no JSON, no markdown fences, no extra formatting, no placeholders).`;

  const userPrompt = `JOB DESCRIPTION (context only):
${job.text}

PROFILE SNAPSHOT (authoritative data):
${profileSnapshot}${instructions}`;

  const tokenCount = calculatePromptTokens({ systemPrompt, userPrompt });
  const totalTokens = tokenCount.total ?? estimateTokens(systemPrompt) + estimateTokens(userPrompt);

  if (totalTokens > GEMINI_NANO_LIMITS.PER_PROMPT) {
    console.warn(
      "[RiseAI] cover letter prompt tokens exceed on-device guideline; proceeding anyway.",
      { totalTokens, limit: GEMINI_NANO_LIMITS.PER_PROMPT }
    );
  }

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      job,
      profile,
      tokenCount: {
        ...tokenCount,
        total: totalTokens,
      },
    },
  };
};
