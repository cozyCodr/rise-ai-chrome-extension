import { getJobState, getContextState } from "../state.js";
import { estimateTokens, calculatePromptTokens, GEMINI_NANO_LIMITS } from "./token-counter.js";

const BASE_SYSTEM_PROMPT = `You are Rise AI, an on-device assistant that composes tailored resumes.
- Output must be valid JSON following the provided schema.
- Highlight measurable achievements when possible.
- Stay truthful to the supplied profile data; never fabricate.
- CRITICAL: The job description is ONLY for understanding what to emphasize. NEVER copy responsibilities, requirements, or any details from the job description into the resume. Only use information from the PROFILE SNAPSHOT.
- CRITICAL: Do not invent or add experiences, skills, or qualifications that are not explicitly mentioned in the PROFILE SNAPSHOT, even if they appear in the job description.
- Keep the professional summary concise (no more than 2 sentences) and grounded in proven accomplishments from the profile.
- Prioritise experience, projects, and education details; present skills succinctly and avoid filler.
- IMPORTANT: Before the JSON output, add a single line with format "title::Company Name Resume - Candidate Full Name" where Company Name comes from the job description and Candidate Full Name comes from the profile.`;

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
  const email = header.email ? header.email.trim() : "";
  const phone = header.phone ? header.phone.trim() : "";
  const location = header.location ? header.location.trim() : "";
  const linkedin = header.linkedin ? header.linkedin.trim() : "";
  const github = header.github ? header.github.trim() : "";
  const portfolio = header.portfolio ? header.portfolio.trim() : "";
  const headline = header.headline ? header.headline.trim() : "";

  if (name) lines.push(`Name: ${name}`);
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (location) lines.push(`Location: ${location}`);
  if (linkedin) lines.push(`LinkedIn: ${linkedin}`);
  if (github) lines.push(`GitHub: ${github}`);
  if (portfolio) lines.push(`Portfolio: ${portfolio}`);
  if (headline) lines.push(`Headline: ${headline}`);

  const summary = profile.summary ? profile.summary.trim() : "";
  if (summary) {
    lines.push(`Summary: ${summary}`);
  }

  const experiences = Array.isArray(profile.experience) ? profile.experience : [];
  clampArray(experiences, 5).forEach((exp, index) => {
    if (!exp) return;
    const role = exp.title || exp.role || "Role";
    const company = exp.company || exp.organisation || exp.organization || "";
    const dates = exp.dates || "";
    const location = exp.location || "";
    const bullets = clampArray(exp.highlights || exp.bullets || [], MAX_BULLETS);
    const heading = company ? `${role} at ${company}` : role;
    const sectionLines = [`Experience ${index + 1}: ${heading}`];
    if (dates) sectionLines.push(`Dates: ${dates}`);
    if (location) sectionLines.push(`Location: ${location}`);
    bullets.forEach((point) => {
      sectionLines.push(`- ${point}`);
    });
    lines.push(sectionLines.join("\n"));
  });

  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  clampArray(projects, 4).forEach((project, index) => {
    if (!project) return;
    const title = project.title || project.name || `Project ${index + 1}`;
    const description = project.description || "";
    const impact = project.impact || "";
    const link = project.link || "";
    const dates = project.dates || "";
    const info = [`Project ${index + 1}: ${title}`];
    if (description) info.push(`Description: ${description}`);
    if (impact) info.push(`Impact: ${impact}`);
    if (link) info.push(`Link: ${link}`);
    if (dates) info.push(`Dates: ${dates}`);
    lines.push(info.join("\n"));
  });

  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (skills.length) {
    lines.push(`Skills: ${clampArray(skills, 15).join(", ")}`);
  }

  const education = Array.isArray(profile.education) ? profile.education : [];
  clampArray(education, 3).forEach((edu, index) => {
    if (!edu) return;
    const degree = edu.degree || "";
    const institution = edu.institution || "";
    const dates = edu.dates || "";
    const highlights = clampArray(edu.highlights || [], 3);
    const info = [`Education ${index + 1}${degree ? `: ${degree}` : ""}`];
    if (institution) info.push(`Institution: ${institution}`);
    if (dates) info.push(`Dates: ${dates}`);
    highlights.forEach((highlight) => {
      info.push(`- ${highlight}`);
    });
    lines.push(info.join("\n"));
  });

  const certifications = Array.isArray(profile.certifications) ? profile.certifications : [];
  if (certifications.length) {
    lines.push(`Certifications/Achievements: ${clampArray(certifications, 5).join(", ")}`);
  }

  return lines.join("\n\n");
};

const composeUserPrompt = ({ jobText, profileSnapshot, instructions }) =>
  `JOB DESCRIPTION (target role, do not copy verbatim):\n${jobText}\n\nPROFILE SNAPSHOT (authoritative data):\n${profileSnapshot}${instructions}`;

export const buildResumePrompt = async ({ chunkLimit = 50 } = {}) => {
  const [job, context] = await Promise.all([getJobState(), getContextState()]);
  if (!job?.text) {
    throw new Error("Job description is missing. Add or paste one before generating.");
  }

  // Build system prompt first
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

JSON schema:
{
  "version": string,
  "header": {
    "fullName": string,
    "email"?: string,
    "phone"?: string,
    "location"?: string,
    "linkedin"?: string,
    "github"?: string,
    "portfolio"?: string,
    "headline"?: string
  },
  "sections": [
    {
      "id": string,
      "title": string,
      "content": unknown
    }
  ]
}

Section expectations:
- header: required object with candidate contact info and headline from profile.
- summary: content is an array of paragraphs (strings).
- experience: content is an array of objects { title, company?, location?, dates?, bullets[] }.
- projects: content is an array of objects { title, description?, impact?, link?, dates? }.
- skills: content is an array of strings.
- education: content is an array of objects { degree?, institution?, dates?, highlights? }.
- certifications: content is an array of strings for certifications/achievements.`;

  const instructions = `

INSTRUCTIONS:
1. FIRST LINE: Output a title line in this exact format: "title::Company Name Resume - Candidate Full Name" (e.g., "title::Playmerce Resume - John Doe"). Extract the company name from the job description and the candidate's full name from the profile.
2. SECOND LINE ONWARD: Output valid JSON following the schema above.
3. The job description is ONLY a reference to understand what aspects of the candidate's background to emphasize. DO NOT copy any responsibilities, skills, or requirements from the job description into the resume.
4. ONLY include information that is explicitly stated in the PROFILE SNAPSHOT sections above. If something is not mentioned in the profile, DO NOT add it to the resume, even if it appears in the job description.
5. Header must include all contact information from the profile snapshot (name, email, phone, location, LinkedIn, GitHub, portfolio, headline).
6. Summary must contain no more than 2 sentences (ideally exactly 2) that highlight quantified wins backed by the profile data.
7. Experience entries must reference real employers, roles, and outcomes drawn ONLY from the profile; keep standalone project work in the projects section instead of experience.
8. Add a "projects" section when the profile mentions notable initiatives, using objects { title, description?, impact?, link?, dates? }. Omit the section if no projects exist.
9. Skills should be a concise list of up to 12 items derived ONLY from the profile (not the job description), selecting those most relevant to the target role.
10. Education should capture degrees, institutions, dates, and highlights exactly as provided in the profile.
11. Certifications/Achievements should be listed if present in the profile under "Certifications/Achievements".
12. Omit sections you cannot substantiate from the profile rather than fabricating content.
`;

  const profile = context?.profile;
  if (!profile) {
    throw new Error("Profile details are missing. Add your profile in the Profile tab before generating.");
  }

  const profileSnapshot = buildProfileSnapshot(profile);
  if (!profileSnapshot.trim()) {
    throw new Error("Profile details are incomplete. Add experiences, education, projects, or skills before generating.");
  }

  const userPrompt = composeUserPrompt({ jobText: job.text, profileSnapshot, instructions });
  const tokenCount = calculatePromptTokens({ systemPrompt, userPrompt });
  const totalTokens = tokenCount.total ?? estimateTokens(systemPrompt) + estimateTokens(userPrompt);

  console.log("[RiseAI] Prompt composition complete:", {
    system: tokenCount.systemTokens,
    user: tokenCount.userTokens,
    total: totalTokens,
  });

  if (totalTokens > GEMINI_NANO_LIMITS.PER_PROMPT) {
    console.warn(
      "[RiseAI] resume prompt tokens exceed on-device guideline; proceeding anyway.",
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
