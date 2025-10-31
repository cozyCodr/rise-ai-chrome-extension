import { getJobState, getContextState } from "../state.js";
import { estimateTokens, calculatePromptTokens, GEMINI_NANO_LIMITS } from "./token-counter.js";

const BASE_SYSTEM_PROMPT = `You are Rise AI, an on-device assistant that composes tailored resumes.
- Output must be valid JSON following the provided schema.
- Highlight measurable achievements when possible.
- Stay truthful to the supplied profile data; never fabricate.
- Treat the job description strictly as the target role -- never copy its responsibilities as the candidate's work history.
- Keep the professional summary concise (no more than 2 sentences) and grounded in proven accomplishments from the profile.`;

const MAX_SENTENCES_SUMMARY = 2;
const MAX_EXPERIENCE_BULLETS = 6;
const MAX_PROJECT_HIGHLIGHTS = 5;
const MAX_EDUCATION_HIGHLIGHTS = 4;
const MAX_SKILLS = 15;

const toSentenceArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => toSentenceArray(item))
      .filter(Boolean);
  }
  return String(value)
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const clampArray = (value = [], limit = Infinity) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter(Boolean)
    .slice(0, limit);

const formatContactLine = (contacts = {}) => {
  const parts = [
    contacts.email && `Email: ${contacts.email}`,
    contacts.phone && `Phone: ${contacts.phone}`,
    contacts.location && `Location: ${contacts.location}`,
    contacts.website && `Website: ${contacts.website}`,
    contacts.linkedin && `LinkedIn: ${contacts.linkedin}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : "";
};

const formatExperienceSection = (entries = []) =>
  clampArray(entries, 10)
    .map((entry, index) => {
      if (!entry) return null;
      const role = entry.title || entry.role || "Role";
      const company = entry.company || entry.organisation || entry.organization;
      const heading = company ? `${role} at ${company}` : role;
      const location = entry.location || "";
      const dates =
        entry.dates ||
        entry.period ||
        [entry.startDate, entry.endDate || (entry.current ? "Present" : "")]
          .filter(Boolean)
          .join(" - ");
      const bullets =
        clampArray(entry.highlights || entry.bullets || entry.achievements || [], MAX_EXPERIENCE_BULLETS).length
          ? clampArray(entry.highlights || entry.bullets || entry.achievements || [], MAX_EXPERIENCE_BULLETS)
              .map((item) => `- ${item}`)
              .join("\n")
          : entry.description
          ? `- ${entry.description}`
          : "";
      const metaLine = [dates, location].filter(Boolean).join(" | ");
      return [
        `Experience #${index + 1}: ${heading}`,
        metaLine ? `  ${metaLine}` : null,
        bullets,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

const formatProjectSection = (entries = []) =>
  clampArray(entries, 10)
    .map((entry, index) => {
      if (!entry) return null;
      const title = entry.title || entry.name || `Project ${index + 1}`;
      const subtitleParts = [
        entry.role,
        entry.dates || entry.timeline || [entry.startDate, entry.endDate || (entry.current ? "Present" : "")]
          .filter(Boolean)
          .join(" - "),
      ].filter(Boolean);
      const subtitle = subtitleParts.length ? `  ${subtitleParts.join(" | ")}` : "";
      const description = entry.description ? `  ${entry.description}` : "";
      const highlights = clampArray(entry.impact || entry.highlights || entry.results || [], MAX_PROJECT_HIGHLIGHTS)
        .map((item) => `- ${item}`)
        .join("\n");
      const link = entry.link || entry.url ? `  Link: ${entry.link || entry.url}` : "";
      return [
        `Project #${index + 1}: ${title}`,
        subtitle,
        description,
        highlights,
        link,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

const formatEducationSection = (entries = []) =>
  clampArray(entries, 10)
    .map((entry, index) => {
      if (!entry) return null;
      const degree = entry.degree || entry.qualification || entry.program || `Education #${index + 1}`;
      const institution = entry.institution || entry.school || entry.university;
      const heading = institution ? `${degree} - ${institution}` : degree;
      const location = entry.location || "";
      const dates =
        entry.dates ||
        entry.timeline ||
        [entry.startDate, entry.endDate || (entry.current ? "Present" : "")]
          .filter(Boolean)
          .join(" - ");
      const metaLine = [dates, location].filter(Boolean).join(" | ");
      const highlights = clampArray(entry.highlights || entry.bullets || entry.achievements || [], MAX_EDUCATION_HIGHLIGHTS)
        .map((item) => `- ${item}`)
        .join("\n");
      return [
        `Education #${index + 1}: ${heading}`,
        metaLine ? `  ${metaLine}` : null,
        highlights,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

const formatSkills = (skills = []) =>
  clampArray(skills, MAX_SKILLS)
    .map((skill) => (typeof skill === "string" ? skill.trim() : ""))
    .filter(Boolean)
    .join(", ");

const buildProfileNarrative = (profile) => {
  if (!profile) return "";
  const header = profile.header || {};
  const summarySentences = clampArray(
    profile.summary ? toSentenceArray(profile.summary) : profile.summaryPoints || [],
    MAX_SENTENCES_SUMMARY
  );
  const experiencesText = formatExperienceSection(profile.experience || profile.experiences);
  const projectsText = formatProjectSection(profile.projects);
  const educationText = formatEducationSection(profile.education || profile.educations);
  const skillsText = formatSkills(profile.skills || profile.skillSet);
  const certificationsText = clampArray(profile.certifications || [], 10)
    .map((item, idx) => `Certification #${idx + 1}: ${item}`)
    .join("\n");

  const sections = [
    "PROFILE HEADER:",
    header.fullName ? `Name: ${header.fullName}` : null,
    header.headline ? `Headline: ${header.headline}` : null,
    formatContactLine(header),
    summarySentences.length
      ? ["SUMMARY:", ...summarySentences.map((sentence) => `- ${sentence}`)].join("\n")
      : null,
    experiencesText ? `EXPERIENCE:\n${experiencesText}` : null,
    projectsText ? `PROJECTS:\n${projectsText}` : null,
    educationText ? `EDUCATION:\n${educationText}` : null,
    skillsText ? `SKILLS:\n${skillsText}` : null,
    certificationsText ? `CERTIFICATIONS:\n${certificationsText}` : null,
  ];

  return sections.filter(Boolean).join("\n\n");
};

export const buildResumePrompt = async () => {
  const [job, context] = await Promise.all([getJobState(), getContextState()]);
  if (!job?.text) {
    throw new Error("Job description is missing. Add or paste one before generating.");
  }
  const profile = context?.profile;
  if (!profile) {
    throw new Error("Profile details are missing. Add your profile in the Profile tab before generating.");
  }

  const profileNarrative = buildProfileNarrative(profile);
  if (!profileNarrative.trim()) {
    throw new Error("Profile details are incomplete. Add experiences, education, projects, or skills before generating.");
  }

  const systemPrompt = `${BASE_SYSTEM_PROMPT}

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

  const instructions = `

INSTRUCTIONS:
1. Use the PROFILE DATA verbatim as the source of truth. Never invent employers, dates, or accomplishments that are not supplied.
2. Produce exactly two sentences in the summary array and make each sentence highlight quantified or outcome-driven achievements.
3. Experience entries must stay focused on relevant roles from the profile; compress unrelated roles or omit them if the job description does not require them.
4. List projects separately from experience, drawing only from the supplied profile projects. If none exist, omit the section entirely.
5. Limit skills to the top items from the profile that best align with the job description. Do not exceed 15 skills.
6. Format dates as concise ranges (for example, "Jan 2021 - Jun 2023").
7. If certifications or additional distinctions are provided, place them in the certifications array; otherwise omit the property.
8. The JSON must be strictly valid and conform to the schema.`

  const userPrompt = `JOB DESCRIPTION (target role, do not copy verbatim):\n${job.text}\n\nPROFILE DATA (authoritative candidate information):\n${profileNarrative}${instructions}`;

  const tokenCount = calculatePromptTokens({ systemPrompt, userPrompt });
  const totalTokens = tokenCount.total ?? estimateTokens(systemPrompt) + estimateTokens(userPrompt);

  if (totalTokens > GEMINI_NANO_LIMITS.PER_PROMPT) {
    console.warn(
      "[RiseAI] prompt tokens exceed on-device guideline; proceeding anyway.",
      { totalTokens, limit: GEMINI_NANO_LIMITS.PER_PROMPT }
    );
  }

  console.log("[RiseAI] Final prompt tokens:", {
    system: tokenCount.systemTokens,
    user: tokenCount.userTokens,
    total: totalTokens,
  });

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
