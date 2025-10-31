/**
 * Converts Rise AI's simple resume format to EditorJS blocks
 * This allows us to keep the simple schema for Gemini Nano while
 * rendering with EditorJS for a consistent experience with rise-webapp
 */

/**
 * Converts a Rise AI resume to EditorJS blocks format
 * @param {Object} resume - Resume in Rise AI format { version, sections: [] }
 * @returns {Object} EditorJS format { time, blocks: [], version }
 */
export const convertResumeToEditorJS = (resume) => {
  if (!resume || typeof resume !== "object") {
    return {
      time: Date.now(),
      version: "2.28.0",
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "Invalid resume data. Please regenerate.",
          },
        },
      ],
    };
  }

  const blocks = [];

  // Add header section if it exists
  if (resume.header && typeof resume.header === "object") {
    const header = resume.header;

    // Full name as H1
    if (header.fullName && header.fullName.trim()) {
      blocks.push({
        type: "header",
        data: {
          text: header.fullName.trim(),
          level: 1,
        },
      });
    }

    // Headline as paragraph
    if (header.headline && header.headline.trim()) {
      blocks.push({
        type: "paragraph",
        data: {
          text: header.headline.trim(),
        },
      });
    }

    // Contact info as paragraph
    const contacts = [
      header.email,
      header.phone,
      header.location,
      header.website,
      header.linkedin,
    ]
      .filter(Boolean)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (contacts.length > 0) {
      blocks.push({
        type: "paragraph",
        data: {
          text: contacts.join(" | "),
        },
      });
    }
  }

  // Process sections
  const sections = Array.isArray(resume.sections) ? resume.sections : [];

  for (const section of sections) {
    if (!section || typeof section !== "object") continue;

    const sectionId = (section.id || "").toLowerCase();
    const title = section.title || "Section";

    // Section title as H2
    blocks.push({
      type: "header",
      data: {
        text: title,
        level: 2,
      },
    });

    // Convert content based on section type
    if (sectionId === "summary") {
      convertSummarySection(section.content, blocks);
    } else if (sectionId === "experience") {
      convertExperienceSection(section.content, blocks);
    } else if (sectionId === "projects") {
      convertProjectsSection(section.content, blocks);
    } else if (sectionId === "skills") {
      convertSkillsSection(section.content, blocks);
    } else if (sectionId === "education") {
      convertEducationSection(section.content, blocks);
    } else if (sectionId === "certifications") {
      convertCertificationsSection(section.content, blocks);
    } else {
      // Generic section - try to handle any content type
      convertGenericContent(section.content, blocks);
    }
  }

  // If no blocks were generated, add a placeholder
  if (blocks.length === 0) {
    blocks.push({
      type: "paragraph",
      data: {
        text: "No resume content generated. Please try again.",
      },
    });
  }

  return {
    time: Date.now(),
    version: "2.28.0",
    blocks,
  };
};

const convertSummarySection = (content, blocks) => {
  const paragraphs = Array.isArray(content) ? content : [content];

  for (const para of paragraphs) {
    if (!para) continue;
    const text = String(para).trim();
    if (text) {
      blocks.push({
        type: "paragraph",
        data: { text },
      });
    }
  }
};

const convertExperienceSection = (content, blocks) => {
  const items = Array.isArray(content) ? content : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    // Job title and company as H3
    const headerParts = [];
    if (item.title) headerParts.push(item.title);
    if (item.company) headerParts.push(item.company);

    if (headerParts.length > 0) {
      blocks.push({
        type: "header",
        data: {
          text: headerParts.join(" - "),
          level: 3,
        },
      });
    }

    // Location and dates as paragraph
    const metaParts = [];
    if (item.location) metaParts.push(item.location);
    if (item.dates) metaParts.push(item.dates);

    if (metaParts.length > 0) {
      blocks.push({
        type: "paragraph",
        data: {
          text: metaParts.join(" | "),
        },
      });
    }

    // Bullets as unordered list
    const bullets = Array.isArray(item.bullets)
      ? item.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [];

    if (bullets.length > 0) {
      blocks.push({
        type: "list",
        data: {
          style: "unordered",
          items: bullets,
        },
      });
    }

    // Description as paragraph if present
    if (item.description && String(item.description).trim()) {
      blocks.push({
        type: "paragraph",
        data: {
          text: String(item.description).trim(),
        },
      });
    }
  }
};

const convertProjectsSection = (content, blocks) => {
  const items = Array.isArray(content) ? content : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    // Project title as H3
    if (item.title) {
      blocks.push({
        type: "header",
        data: {
          text: item.title,
          level: 3,
        },
      });
    }

    // Role and dates as paragraph
    const metaParts = [];
    if (item.role) metaParts.push(item.role);
    if (item.dates) metaParts.push(item.dates);

    if (metaParts.length > 0) {
      blocks.push({
        type: "paragraph",
        data: {
          text: metaParts.join(" | "),
        },
      });
    }

    // Description as paragraph
    if (item.description && String(item.description).trim()) {
      blocks.push({
        type: "paragraph",
        data: {
          text: String(item.description).trim(),
        },
      });
    }

    // Impact as unordered list
    const impact = Array.isArray(item.impact)
      ? item.impact.map((i) => String(i || "").trim()).filter(Boolean)
      : [];

    if (impact.length > 0) {
      blocks.push({
        type: "list",
        data: {
          style: "unordered",
          items: impact,
        },
      });
    }

    // Link as paragraph with anchor
    const link = item.link || item.url;
    if (link && String(link).trim()) {
      blocks.push({
        type: "paragraph",
        data: {
          text: `<a href="${String(link).trim()}" target="_blank" rel="noopener">View project</a>`,
        },
      });
    }
  }
};

const convertSkillsSection = (content, blocks) => {
  const skills = Array.isArray(content)
    ? content.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  if (skills.length > 0) {
    // Skills as comma-separated paragraph for better readability
    blocks.push({
      type: "paragraph",
      data: {
        text: skills.join(", "),
      },
    });
  }
};

const convertEducationSection = (content, blocks) => {
  const items = Array.isArray(content) ? content : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    // Degree as H3
    if (item.degree) {
      blocks.push({
        type: "header",
        data: {
          text: item.degree,
          level: 3,
        },
      });
    }

    // Institution and dates as paragraph
    const metaParts = [];
    if (item.institution) metaParts.push(item.institution);
    if (item.dates) metaParts.push(item.dates);

    if (metaParts.length > 0) {
      blocks.push({
        type: "paragraph",
        data: {
          text: metaParts.join(" | "),
        },
      });
    }

    // Highlights as unordered list
    const highlights = Array.isArray(item.highlights)
      ? item.highlights.map((h) => String(h || "").trim()).filter(Boolean)
      : [];

    if (highlights.length > 0) {
      blocks.push({
        type: "list",
        data: {
          style: "unordered",
          items: highlights,
        },
      });
    }
  }
};

const convertCertificationsSection = (content, blocks) => {
  const items = Array.isArray(content)
    ? content.map((c) => String(c || "").trim()).filter(Boolean)
    : [];

  if (items.length > 0) {
    blocks.push({
      type: "list",
      data: {
        style: "unordered",
        items,
      },
    });
  }
};

const convertGenericContent = (content, blocks) => {
  if (!content) return;

  if (Array.isArray(content)) {
    for (const item of content) {
      convertGenericContent(item, blocks);
    }
  } else if (typeof content === "object") {
    // Try to render as formatted text
    blocks.push({
      type: "paragraph",
      data: {
        text: JSON.stringify(content, null, 2),
      },
    });
  } else {
    const text = String(content).trim();
    if (text) {
      blocks.push({
        type: "paragraph",
        data: { text },
      });
    }
  }
};
