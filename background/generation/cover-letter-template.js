import { getJobState, getContextState } from "../state.js";
import { estimateTokens, calculatePromptTokens, GEMINI_NANO_LIMITS } from "./token-counter.js";

const BASE_SYSTEM_PROMPT = `You are Rise AI, an on-device assistant that drafts professional cover letters.
- Use only the candidate information provided in the PROFILE SNAPSHOT.
- Treat the job description as context about the role, not as the candidate's experience.
- Never claim the candidate performed tasks that appear only in the job description.
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
1. Address the letter to "Hiring Manager" if no name is provided.
2. Begin with a compelling opening that references the target role.
3. Highlight the most relevant achievements from the profile snapshot.
4. Mention a specific reason the role/company is appealing, using wording inspired by the job description without copying responsibilities.
5. Close with confidence, including a call to action and professional sign-off.
6. Keep the tone warm, professional, and concise (3-5 short paragraphs).
7. Output only the cover letter text (no JSON, no markdown fences).`;

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
