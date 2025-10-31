import { DEFAULT_PROFILE, HistoryRepository } from "./data.js";

const escapeHtml = (value = "") =>
  `${value}`.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value === "undefined") return [];
  return [value];
};

const MAX_SUMMARY_SENTENCES = 2;

const extractSentences = (text = "") => {
  if (typeof text !== "string") return [];
  return (text.match(/[^.!?]+[.!?]*/g) || [])
    .map((segment) => segment.trim())
    .filter(Boolean);
};

// Clamp an array-like input to a maximum length with basic string trimming
const clampArray = (value, limit = Infinity) =>
  ensureArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter((v) => (typeof v === "string" ? v.length > 0 : Boolean(v)))
    .slice(0, limit);
const toTrimmedArray = (value) =>
  ensureArray(value)
    .map((item) => `${item}`.trim())
    .filter(Boolean);

const formatDateRange = (entry = {}) => {
  if (!entry || typeof entry !== "object") return "";
  const direct = `${
    entry.dates ?? entry.period ?? entry.timeline ?? ""
  }`.trim();
  if (direct) return direct;
  const start = `${entry.startDate ?? ""}`.trim();
  const rawEnd = `${entry.endDate ?? ""}`.trim();
  const end = rawEnd || (entry.current ? "Present" : "");
  return [start, end].filter(Boolean).join(" - ");
};

const renderResumeHeader = (header = {}) => {
  if (!header || typeof header !== "object") return "";
  const name = `${header.fullName ?? ""}`.trim();
  const headline = `${header.headline ?? ""}`.trim();
  const contacts = [
    header.email && `Email: ${header.email}`,
    header.phone && `Phone: ${header.phone}`,
    header.location && `${header.location}`,
    header.website && `${header.website}`,
    header.linkedin && `${header.linkedin}`,
  ]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (!name && !headline && !contacts.length) return "";
  const contactLine = contacts.length ? contacts.join(" | ") : "";
  return `
    <header class="preview-header">
      ${name ? `<h1 class="preview-header__name">${escapeHtml(name)}</h1>` : ""}
      ${
        headline
          ? `<p class="preview-header__headline">${escapeHtml(headline)}</p>`
          : ""
      }
      ${
        contactLine
          ? `<p class="preview-header__contacts">${escapeHtml(contactLine)}</p>`
          : ""
      }
    </header>
  
`;
};

const renderSummarySection = (section) => {
  const sentences = [];
  ensureArray(section.content).forEach((paragraph) => {
    extractSentences(`${paragraph}`).forEach((sentence) => {
      if (sentences.length < MAX_SUMMARY_SENTENCES) {
        sentences.push(sentence);
      }
    });
  });
  if (!sentences.length) return "";
  const summaryText = sentences
    .slice(0, MAX_SUMMARY_SENTENCES)
    .join(" ")
    .trim();
  return `
    <section class="preview-section">
      <h3 class="preview-section__title">${escapeHtml(
        section.title ?? "Summary"
      )}</h3>
      <p class="preview-section__paragraph">${escapeHtml(summaryText)}</p>
    </section>
  `;
};

const renderExperienceSection = (section) => {
  const items = ensureArray(section.content);
  if (!items.length) return "";
  const markup = items
    .map((item) => {
      const headerParts = [escapeHtml(item.title ?? "Role")];
      if (item.company) {
        headerParts.push(escapeHtml(item.company));
      }
      const metaParts = [];
      if (item.location) metaParts.push(escapeHtml(item.location));
      if (item.dates) metaParts.push(escapeHtml(item.dates));
      const bullets = ensureArray(item.bullets)
        .map((bullet) => `<li>${escapeHtml(`${bullet}`)}</li>`)
        .join("");
      return `
        <article class="preview-experience__item">
          <header class="preview-experience__header">${headerParts.join(
            " - "
          )}</header>
          ${
            metaParts.length
              ? `<div class="preview-experience__meta">${metaParts.join(
                  " - "
                )}</div>`
              : ""
          }
          ${
            bullets
              ? `<ul class="preview-experience__bullets">${bullets}</ul>`
              : ""
          }
        </article>
      `;
    })
    .join("");
  return `
    <section class="preview-section preview-section--experience">
      <h3 class="preview-section__title">${escapeHtml(
        section.title ?? "Experience"
      )}</h3>
      <div class="preview-experience">
        ${markup}
      </div>
    </section>
  `;
};

const renderProjectsSection = (section) => {
  const projects = ensureArray(section.content);
  if (!projects.length) return "";
  const markup = projects
    .map((project) => {
      const title = escapeHtml(project.title ?? "Project");
      const subtitleParts = [];
      if (project.role) subtitleParts.push(escapeHtml(project.role));
      if (project.dates || project.timeline || project.period) {
        subtitleParts.push(
          escapeHtml(project.dates ?? project.timeline ?? project.period)
        );
      }
      const description = project.description
        ? `<p class="preview-project__description">${escapeHtml(
            `${project.description}`
          )}</p>`
        : "";
      const impactList = ensureArray(
        project.impact ??
          project.highlights ??
          project.results ??
          project.bullets
      )
        .filter((item) => item && `${item}`.trim() !== "")
        .map((item) => `<li>${escapeHtml(`${item}`)}</li>`)
        .join("");
      const link =
        project.url || project.link
          ? `<a class="preview-project__link" href="${escapeHtml(
              project.url ?? project.link
            )}" target="_blank" rel="noopener">View project</a>`
          : "";
      return `
        <article class="preview-project__item">
          <header class="preview-project__header">
            <span class="preview-project__title">${title}</span>
            ${
              subtitleParts.length
                ? `<span class="preview-project__meta">${subtitleParts.join(
                    " | "
                  )}</span>`
                : ""
            }
          </header>
          ${description}
          ${
            impactList
              ? `<ul class="preview-project__impact">${impactList}</ul>`
              : ""
          }
          ${link}
        </article>
      `;
    })
    .join("");
  return `
    <section class="preview-section preview-section--projects">
      <h3 class="preview-section__title">${escapeHtml(
        section.title ?? "Projects"
      )}</h3>
      <div class="preview-projects">
        ${markup}
      </div>
    </section>
  `;
};

const renderSkillSection = (section) => {
  const skills = ensureArray(section.content)
    .filter((skill) => skill && `${skill}`.trim() !== "")
    .map(
      (skill) => `<span class="preview-skill">${escapeHtml(`${skill}`)}</span>`
    )
    .join("");
  if (!skills) return "";
  return `
    <section class="preview-section preview-section--skills">
      <h3 class="preview-section__title">${escapeHtml(
        section.title ?? "Skills"
      )}</h3>
      <div class="preview-skill-list">${skills}</div>
    </section>
  `;
};
const renderCertificationsSection = (section) => {
  const items = toTrimmedArray(section.content);
  if (!items.length) return "";
  const markup = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `
    <section class="preview-section preview-section--certifications">
      <h3 class="preview-section__title">${escapeHtml(
        section.title ?? "Certifications"
      )}</h3>
      <ul class="preview-certifications">${markup}</ul>
    </section>
  
`;
};

const renderEducationSection = (section) => {
  const schools = ensureArray(section.content);
  if (!schools.length) return "";
  const markup = schools
    .map((entry) => {
      const degree = entry.degree
        ? `<div class="preview-education__degree">${escapeHtml(
            entry.degree
          )}</div>`
        : "";
      const institution = entry.institution
        ? `<div class="preview-education__institution">${escapeHtml(
            entry.institution
          )}</div>`
        : "";
      const dates = entry.dates
        ? `<div class="preview-education__dates">${escapeHtml(
            entry.dates
          )}</div>`
        : "";
      const highlights = ensureArray(entry.highlights)
        .map((highlight) => `<li>${escapeHtml(`${highlight}`)}</li>`)
        .join("");
      return `
        <article class="preview-education__item">
          ${degree}
          ${institution}
          ${dates}
          ${
            highlights
              ? `<ul class="preview-education__highlights">${highlights}</ul>`
              : ""
          }
        </article>
      `;
    })
    .join("");
  return `
    <section class="preview-section preview-section--education">
      <h3 class="preview-section__title">${escapeHtml(
        section.title ?? "Education"
      )}</h3>
      <div class="preview-education">${markup}</div>
    </section>
  `;
};

const renderGenericContent = (value) => {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) {
    return value.map((item) => renderGenericContent(item)).join("");
  }
  if (typeof value === "object") {
    return `<pre class="preview-section__json">${escapeHtml(
      JSON.stringify(value, null, 2)
    )}</pre>`;
  }
  return `<p class="preview-section__paragraph">${escapeHtml(`${value}`)}</p>`;
};

const renderGenericSection = (section) => {
  const title = escapeHtml(section.title ?? "Additional");
  const contentHtml = renderGenericContent(section.content);
  return `
    <section class="preview-section">
      <h3 class="preview-section__title">${title}</h3>
      ${contentHtml}
    </section>
  `;
};
const createSummarySection = (summary) => {
  const sentences = toTrimmedArray(summary);
  if (!sentences.length) return null;
  return {
    id: "summary",
    title: "Summary",
    content: sentences.slice(0, MAX_SUMMARY_SENTENCES),
  };
};

const createExperienceSection = (entries) => {
  const content = ensureArray(entries)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const bullets = toTrimmedArray(
        entry.highlights ??
          entry.bullets ??
          entry.achievements ??
          entry.results ??
          entry.responsibilities
      );
      const item = {
        title: `${entry.title ?? entry.role ?? ""}`.trim(),
        company: `${
          entry.company ?? entry.organisation ?? entry.organization ?? ""
        }`.trim(),
        location: `${entry.location ?? ""}`.trim(),
        dates: formatDateRange(entry),
        bullets,
      };
      if (
        !item.title &&
        !item.company &&
        !item.location &&
        !item.dates &&
        !bullets.length
      ) {
        return null;
      }
      return item;
    })
    .filter(Boolean);
  if (!content.length) return null;
  return { id: "experience", title: "Experience", content };
};

const createProjectsSection = (entries) => {
  const content = ensureArray(entries)
    .map((project) => {
      if (!project || typeof project !== "object") return null;
      const impact = toTrimmedArray(
        project.impact ??
          project.highlights ??
          project.results ??
          project.bullets
      );
      const link = `${project.link ?? project.url ?? ""}`.trim();
      const item = {
        title: `${project.title ?? project.name ?? ""}`.trim(),
        role: `${project.role ?? ""}`.trim(),
        dates: formatDateRange(project),
        description: `${project.description ?? ""}`.trim(),
        impact,
        url: link,
        link,
      };
      const hasContent =
        item.title ||
        item.role ||
        item.dates ||
        item.description ||
        item.url ||
        impact.length;
      if (!hasContent) return null;
      return item;
    })
    .filter(Boolean);
  if (!content.length) return null;
  return { id: "projects", title: "Projects", content };
};

const createEducationSection = (entries) => {
  const content = ensureArray(entries)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const highlights = toTrimmedArray(
        entry.highlights ?? entry.results ?? entry.achievements
      );
      const institutionParts = [
        `${entry.institution ?? entry.school ?? entry.university ?? ""}`.trim(),
        `${entry.location ?? ""}`.trim(),
      ].filter(Boolean);
      const item = {
        degree: `${entry.degree ?? entry.qualification ?? ""}`.trim(),
        institution: institutionParts.join(", "),
        dates: formatDateRange(entry),
        highlights,
      };
      if (
        !item.degree &&
        !item.institution &&
        !item.dates &&
        !highlights.length
      )
        return null;
      return item;
    })
    .filter(Boolean);
  if (!content.length) return null;
  return { id: "education", title: "Education", content };
};

const createSkillsSection = (skills) => {
  const content = toTrimmedArray(skills);
  if (!content.length) return null;
  return { id: "skills", title: "Skills", content };
};

const createCertificationsSection = (certifications) => {
  const content = toTrimmedArray(certifications);
  if (!content.length) return null;
  return { id: "certifications", title: "Certifications", content };
};

const normaliseResumeSections = (resume) => {
  if (!resume || typeof resume !== "object") return [];
  const existing = Array.isArray(resume.sections)
    ? resume.sections.filter(Boolean)
    : [];
  if (existing.length) return existing;
  const sections = [];
  const summarySection = createSummarySection(resume.summary);
  if (summarySection) sections.push(summarySection);
  const experienceSection = createExperienceSection(resume.experience);
  if (experienceSection) sections.push(experienceSection);
  const projectsSection = createProjectsSection(resume.projects);
  if (projectsSection) sections.push(projectsSection);
  const educationSection = createEducationSection(resume.education);
  if (educationSection) sections.push(educationSection);
  const skillsSection = createSkillsSection(resume.skills);
  if (skillsSection) sections.push(skillsSection);
  const certificationsSection = createCertificationsSection(
    resume.certifications
  );
  if (certificationsSection) sections.push(certificationsSection);
  return sections;
};

export const buildResumeSectionsHtml = (resume) => {
  if (!resume || typeof resume !== "object") {
    return `<pre class="preview-raw">${escapeHtml(
      JSON.stringify(resume, null, 2) ?? ""
    )}</pre>`;
  }
  const sections = normaliseResumeSections(resume);
  if (!sections.length) {
    return `<p class="preview-empty">No resume sections were returned. Try generating again.</p>`;
  }

  const headerHtml = renderResumeHeader(resume.header ?? {});
  const sectionsHtml = sections
    .map((section) => {
      const id = (section.id || "").toLowerCase();
      if (id === "summary") return renderSummarySection(section);
      if (id === "experience") return renderExperienceSection(section);
      if (id === "projects") return renderProjectsSection(section);
      if (id === "skills") return renderSkillSection(section);
      if (id === "education") return renderEducationSection(section);
      if (id === "certifications") return renderCertificationsSection(section);
      return renderGenericSection(section);
    })
    .join("");

  return [headerHtml, sectionsHtml].filter(Boolean).join("");
};

export class StatusBadge {
  constructor(element) {
    this.el = element;
  }

  set(message, type = "info") {
    if (!this.el) return;
    this.el.textContent = message ?? "";
    if (!message) {
      delete this.el.dataset.statusType;
    } else {
      this.el.dataset.statusType = type;
    }
  }
}

const randomId = (prefix) =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const parseMultiline = (value = "") =>
  `${value}`
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatContactSummary = (header = {}) => {
  const contacts = [
    header.email,
    header.phone,
    header.location,
    header.website,
    header.linkedin,
  ]
    .map((item) => (item || "").trim())
    .filter(Boolean);
  return contacts.join("  |  ");
};

const renderProfileSection = (title, pill, rows) => {
  if (!rows.length) return "";
  const pillHtml = pill
    ? `<span class="profile-summary__pill">${escapeHtml(pill)}</span>`
    : "";
  const itemsHtml = rows
    .map((row) => {
      const titleHtml = row.title
        ? `<span class="profile-summary__item-title">${escapeHtml(
            row.title
          )}</span>`
        : "";
      const metaHtml = row.meta
        ? `<span class="profile-summary__item-meta">${escapeHtml(
            row.meta
          )}</span>`
        : "";
      const bodyHtml = row.body
        ? `<span class="profile-summary__item-meta">${escapeHtml(
            row.body
          )}</span>`
        : "";
      return `<div class="profile-summary__item">${titleHtml}${metaHtml}${bodyHtml}</div>`;
    })
    .join("");
  return `
    <div class="profile-summary__section">
      <div class="profile-summary__section-title">
        <span>${escapeHtml(title)}</span>
        ${pillHtml}
      </div>
      <div class="profile-summary__list">${itemsHtml}</div>
    </div>
  `;
};

export class ProfileManager {
  constructor(elements, statusBadge) {
    this.summaryEl = elements.summary;
    this.statusBadge = statusBadge;
    this.profile = null;
  }

  setProfile(profile) {
    this.profile = profile ? JSON.parse(JSON.stringify(profile)) : null;
    this.render();
  }

  getProfile() {
    return this.profile;
  }

  hasProfileData() {
    const profile = this.profile;
    if (!profile) return false;
    const header = profile.header || {};
    const hasBasics = Boolean(
      (header.fullName && header.fullName.trim()) ||
        (header.headline && header.headline.trim()) ||
        formatContactSummary(header)
    );
    const hasSummary = Boolean(profile.summary && profile.summary.trim());
    const hasExperience =
      Array.isArray(profile.experience) && profile.experience.length > 0;
    const hasProjects =
      Array.isArray(profile.projects) && profile.projects.length > 0;
    const hasEducation =
      Array.isArray(profile.education) && profile.education.length > 0;
    const hasSkills =
      Array.isArray(profile.skills) && profile.skills.length > 0;
    const hasCerts =
      Array.isArray(profile.certifications) &&
      profile.certifications.length > 0;
    return (
      hasBasics ||
      hasSummary ||
      hasExperience ||
      hasProjects ||
      hasEducation ||
      hasSkills ||
      hasCerts
    );
  }

  render() {
    if (!this.summaryEl) return;
    const profile = this.profile;
    if (!profile || !this.hasProfileData()) {
      this.summaryEl.innerHTML = '<p class="profile-summary__empty">No profile details saved yet.</p>';
      this.statusBadge?.set('Add your profile details to begin.', 'info');
      return;
    }

    // Minimal profile card rendering
    const header = profile.header || {};
    const name = (header.fullName || '').trim();
    const role = (header.headline || '').trim();
    const firstExp = Array.isArray(profile.experience) && profile.experience.length ? profile.experience[0] : null;
    const companyLine = firstExp ? [firstExp.title || firstExp.role || '', firstExp.company || ''].filter(Boolean).join(' @ ') : '';

    const parts = [];
    parts.push(`<div class="profile-summary__card">`);
    parts.push(name ? `<div class="profile-summary__name">${name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>` : `<div class="profile-summary__name">Profile</div>`);
    if (role) parts.push(`<div class="profile-summary__role">${role.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>`);
    if (companyLine) parts.push(`<div class="profile-summary__meta">${companyLine.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>`);
    parts.push('</div>');
    this.summaryEl.innerHTML = parts.join('');

  }
}

const cloneProfile = (profile) =>
  JSON.parse(JSON.stringify(profile ?? DEFAULT_PROFILE));

export class ProfileOverlay {
  constructor(elements) {
    this.layer = elements.layer;
    this.overlay = elements.overlay;
    this.formHost = elements.form;
    this.active = false;
    this.pendingResolve = null;
    this.profile = cloneProfile(DEFAULT_PROFILE);

    this.boundOnOverlayClick = this.onOverlayClick.bind(this);
    this.boundOnLayerClick = this.onLayerClick.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);

    this.overlay?.addEventListener("click", this.boundOnOverlayClick);
    this.layer?.addEventListener("click", this.boundOnLayerClick);
  }

  async open(profile) {
    if (!this.layer || !this.overlay || !this.formHost) {
      throw new Error("Profile overlay unavailable.");
    }
    this.profile = cloneProfile(profile);
    this.renderForm();
    this.layer.hidden = false;
    this.overlay.hidden = false;
    document.addEventListener("keydown", this.boundOnKeyDown, true);
    this.active = true;
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
    });
  }

  close(result = null) {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener("keydown", this.boundOnKeyDown, true);
    this.layer.hidden = true;
    this.overlay.hidden = true;
    this.formHost.innerHTML = "";
    if (this.pendingResolve) {
      this.pendingResolve(result);
      this.pendingResolve = null;
    }
  }

  onLayerClick(event) {
    const scrim = event.target.closest('[data-action="close-profile"]');
    if (scrim) {
      event.preventDefault();
      this.close(null);
    }
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close(null);
    }
  }

  onOverlayClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    switch (action) {
      case "cancel-profile":
        event.preventDefault();
        this.close(null);
        break;
      case "save-profile":
        event.preventDefault();
        this.close(this.collectProfileFromForm());
        break;
      case "add-experience":
      case "add-project":
      case "add-education":
        event.preventDefault();
        this.handleAddItem(action);
        break;
      case "toggle-entry": {
        event.preventDefault();
        const entry = actionEl.closest('.profile-entry');
        if (entry) {
          const collapsed = entry.getAttribute('data-collapsed') === 'true';
          entry.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
          const header = entry.querySelector('.profile-entry__header');
          if (header) header.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
        }
        break;
      }
      case "remove-experience":
      case "remove-project":
      case "remove-education":
        event.preventDefault();
        this.handleRemoveItem(actionEl.closest("[data-section]"));
        break;
      default:
        break;
    }
  }

  handleAddItem(action) {
    const current = this.collectProfileFromForm();
    if (action === "add-experience") {
      const newId = randomId("exp");
      current.experience.push({
        id: newId,
        title: "",
        company: "",
        location: "",
        dates: "",
        highlights: [],
      });
      this.__lastAddedId = newId;
    } else if (action === "add-project") {
      const newId = randomId("proj");
      current.projects.push({
        id: newId,
        title: "",
        role: "",
        dates: "",
        description: "",
        impact: [],
        link: "",
      });
      this.__lastAddedId = newId;
    } else if (action === "add-education") {
      const newId = randomId("edu");
      current.education.push({
        id: newId,
        degree: "",
        institution: "",
        location: "",
        dates: "",
        highlights: [],
      });
      this.__lastAddedId = newId;
    }
    this.profile = current;
    this.renderForm();
  }

  handleRemoveItem(entry) {
    if (!entry) return;
    const section = entry.dataset.section;
    const id = entry.dataset.id;
    const current = this.collectProfileFromForm();
    if (section === "experience") {
      current.experience = current.experience.filter((item) => item.id !== id);
    } else if (section === "project") {
      current.projects = current.projects.filter((item) => item.id !== id);
    } else if (section === "education") {
      current.education = current.education.filter((item) => item.id !== id);
    }
    this.profile = current;
    this.renderForm();
  }

  collectProfileFromForm() {
    const form = this.formHost.querySelector("form");
    if (!form) return cloneProfile(this.profile);
    const result = cloneProfile(DEFAULT_PROFILE);

    const getInputValue = (selector) =>
      form.querySelector(selector)?.value.trim() ?? "";

    result.header.fullName = getInputValue('[data-field="header.fullName"]');
    result.header.headline = getInputValue('[data-field="header.headline"]');
    result.header.email = getInputValue('[data-field="header.email"]');
    result.header.phone = getInputValue('[data-field="header.phone"]');
    result.header.location = getInputValue('[data-field="header.location"]');
    result.header.website = getInputValue('[data-field="header.website"]');
    result.header.linkedin = getInputValue('[data-field="header.linkedin"]');
    result.summary = getInputValue('[data-field="summary"]');

    result.experience = Array.from(
      form.querySelectorAll('[data-section="experience"]')
    )
      .map((node) => {
        const id = node.dataset.id || randomId("exp");
        const title =
          node.querySelector('[data-field="title"]')?.value.trim() ?? "";
        const company =
          node.querySelector('[data-field="company"]')?.value.trim() ?? "";
        const location =
          node.querySelector('[data-field="location"]')?.value.trim() ?? "";
        const dates =
          node.querySelector('[data-field="dates"]')?.value.trim() ?? "";
        const highlights = parseMultiline(
          node.querySelector('[data-field="highlights"]')?.value ?? ""
        );
        const description =
          node.querySelector('[data-field="description"]')?.value.trim() ?? "";
        if (
          !(
            title ||
            company ||
            location ||
            dates ||
            highlights.length ||
            description
          )
        ) {
          return null;
        }
        return { id, title, company, location, dates, highlights, description };
      })
      .filter(Boolean);

    result.projects = Array.from(
      form.querySelectorAll('[data-section="project"]')
    )
      .map((node) => {
        const id = node.dataset.id || randomId("proj");
        const title =
          node.querySelector('[data-field="title"]')?.value.trim() ?? "";
        const role =
          node.querySelector('[data-field="role"]')?.value.trim() ?? "";
        const dates =
          node.querySelector('[data-field="dates"]')?.value.trim() ?? "";
        const description =
          node.querySelector('[data-field="description"]')?.value.trim() ?? "";
        const impact = parseMultiline(
          node.querySelector('[data-field="impact"]')?.value ?? ""
        );
        const link =
          node.querySelector('[data-field="link"]')?.value.trim() ?? "";
        if (!(title || role || dates || description || impact.length || link)) {
          return null;
        }
        return { id, title, role, dates, description, impact, link };
      })
      .filter(Boolean);

    result.education = Array.from(
      form.querySelectorAll('[data-section="education"]')
    )
      .map((node) => {
        const id = node.dataset.id || randomId("edu");
        const degree =
          node.querySelector('[data-field="degree"]')?.value.trim() ?? "";
        const institution =
          node.querySelector('[data-field="institution"]')?.value.trim() ?? "";
        const location =
          node.querySelector('[data-field="location"]')?.value.trim() ?? "";
        const dates =
          node.querySelector('[data-field="dates"]')?.value.trim() ?? "";
        const highlights = parseMultiline(
          node.querySelector('[data-field="highlights"]')?.value ?? ""
        );
        if (
          !(degree || institution || location || dates || highlights.length)
        ) {
          return null;
        }
        return { id, degree, institution, location, dates, highlights };
      })
      .filter(Boolean);

    const skillsValue =
      form.querySelector('[data-field="skills"]')?.value ?? "";
    result.skills = parseMultiline(skillsValue);

    const certValue =
      form.querySelector('[data-field="certifications"]')?.value ?? "";
    result.certifications = parseMultiline(certValue);

    return result;
  }

  renderForm() {
    const profile = this.profile || cloneProfile(DEFAULT_PROFILE);
    const experiences = Array.isArray(profile.experience)
      ? profile.experience
      : [];
    const projects = Array.isArray(profile.projects) ? profile.projects : [];
    const education = Array.isArray(profile.education) ? profile.education : [];

    const experienceHtml =
      experiences.map((exp) => this.renderExperienceEntry(exp)).join("") ||
      '<p class="profile-summary__empty">No experience entries yet.</p>';

    const projectHtml =
      projects.map((proj) => this.renderProjectEntry(proj)).join("") ||
      '<p class="profile-summary__empty">No project entries yet.</p>';

    const educationHtml =
      education.map((edu) => this.renderEducationEntry(edu)).join("") ||
      '<p class="profile-summary__empty">No education entries yet.</p>';

    const skillsText = (
      Array.isArray(profile.skills) ? profile.skills : []
    ).join("\n");
    const certText = (
      Array.isArray(profile.certifications) ? profile.certifications : []
    ).join("\n");

    this.formHost.innerHTML = `
      <form class="profile-form" autocomplete="off">
        <section class="profile-form__group" data-group="basics">
          <header>
            <h3 class="profile-form__group-title">Basics</h3>
          </header>
          <div class="profile-form__grid">
            <div class="profile-form__field">
              <label>Full name</label>
              <input type="text" data-field="header.fullName" value="${escapeHtml(
                profile.header?.fullName ?? ""
              )}">
            </div>
            <div class="profile-form__field">
              <label>Headline / Role</label>
              <input type="text" data-field="header.headline" value="${escapeHtml(
                profile.header?.headline ?? ""
              )}">
            </div>
            <div class="profile-form__field">
              <label>Email</label>
              <input type="text" data-field="header.email" value="${escapeHtml(
                profile.header?.email ?? ""
              )}">
            </div>
            <div class="profile-form__field">
              <label>Phone</label>
              <input type="text" data-field="header.phone" value="${escapeHtml(
                profile.header?.phone ?? ""
              )}">
            </div>
            <div class="profile-form__field">
              <label>Location</label>
              <input type="text" data-field="header.location" value="${escapeHtml(
                profile.header?.location ?? ""
              )}">
            </div>
            <div class="profile-form__field">
              <label>Website</label>
              <input type="text" data-field="header.website" value="${escapeHtml(
                profile.header?.website ?? ""
              )}">
            </div>
            <div class="profile-form__field">
              <label>LinkedIn</label>
              <input type="text" data-field="header.linkedin" value="${escapeHtml(
                profile.header?.linkedin ?? ""
              )}">
            </div>
          </div>
        </section>

        <section class="profile-form__group" data-group="summary">
          <header>
            <h3 class="profile-form__group-title">Summary</h3>
          </header>
          <div class="profile-form__field">
            <label>Professional summary (2 sentences recommended)</label>
            <textarea data-field="summary">${escapeHtml(
              profile.summary ?? ""
            )}</textarea>
          </div>
        </section>

        <section class="profile-form__group" data-group="experience">
          <header>
            <h3 class="profile-form__group-title">Experience</h3>
            <div class="profile-form__group-actions">
              <button type="button" class="profile-form__icon-button" data-action="add-experience" aria-label="Add experience">+</button>
            </div>
          </header>
          ${experienceHtml}
        </section>

        <section class="profile-form__group" data-group="projects">
          <header>
            <h3 class="profile-form__group-title">Projects</h3>
            <div class="profile-form__group-actions">
              <button type="button" class="profile-form__icon-button" data-action="add-project" aria-label="Add project">+</button>
            </div>
          </header>
          ${projectHtml}
        </section>

        <section class="profile-form__group" data-group="education">
          <header>
            <h3 class="profile-form__group-title">Education</h3>
            <div class="profile-form__group-actions">
              <button type="button" class="profile-form__icon-button" data-action="add-education" aria-label="Add education">+</button>
            </div>
          </header>
          ${educationHtml}
        </section>

        <section class="profile-form__group" data-group="skills">
          <header>
            <h3 class="profile-form__group-title">Skills</h3>
          </header>
          <div class="profile-form__field">
            <label>List skills (one per line or comma separated)</label>
            <textarea data-field="skills">${escapeHtml(skillsText)}</textarea>
          </div>
        </section>

        <section class="profile-form__group" data-group="certifications">
          <header>
            <h3 class="profile-form__group-title">Certifications &amp; Awards</h3>
          </header>
          <div class="profile-form__field">
            <label>Certifications (one per line)</label>
            <textarea data-field="certifications">${escapeHtml(
              certText
            )}</textarea>
          </div>
        </section>
      </form>
    `;

    // Auto-open the last added entry for smoother UX
    if (this.__lastAddedId) {
      const el = this.formHost.querySelector(`[data-id="${CSS.escape(this.__lastAddedId)}"]`);
      if (el) {
        el.setAttribute('data-collapsed', 'false');
        const header = el.querySelector('.profile-entry__header');
        if (header) header.setAttribute('aria-expanded', 'true');
        // Focus first input inside newly opened entry
        const firstInput = el.querySelector('input, textarea, select');
        firstInput?.focus?.({ preventScroll: true });
      }
      this.__lastAddedId = null;
    }
  }

  renderExperienceEntry(exp = {}) {
    const id = exp.id || randomId("exp");
    const title = exp.title || exp.role || "";
    return `
      <div class="profile-entry" data-section="experience" data-id="${escapeHtml(
        id
      )}" data-collapsed="true">
        <div class="profile-entry__header" data-action="toggle-entry" role="button" aria-expanded="false" tabindex="0">
          <h4 class="profile-entry__title">${escapeHtml(
            title || "Experience"
          )}</h4>
          <div class="profile-entry__actions">
            <span class="profile-entry__chevron" aria-hidden="true"></span>
            <button type="button" class="profile-entry__button profile-entry__button--danger" data-action="remove-experience">Remove</button>
          </div>
        </div>
        <div class="profile-entry__body">
          <div class="profile-form__field">
            <label>Job title</label>
            <input type="text" data-field="title" value="${escapeHtml(
              exp.title ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Company</label>
            <input type="text" data-field="company" value="${escapeHtml(
              exp.company ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Location</label>
            <input type="text" data-field="location" value="${escapeHtml(
              exp.location ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Dates</label>
            <input type="text" data-field="dates" value="${escapeHtml(
              exp.dates ?? ""
            )}">
          </div>
          <div class="profile-entry__list">
            <label>Highlights (one per line)</label>
            <textarea data-field="highlights">${escapeHtml(
              (Array.isArray(exp.highlights) ? exp.highlights : []).join("\n")
            )}</textarea>
          </div>
          <div class="profile-entry__notes">
            <label>Description (optional)</label>
            <textarea data-field="description">${escapeHtml(
              exp.description ?? ""
            )}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  renderProjectEntry(proj = {}) {
    const id = proj.id || randomId("proj");
    return `
      <div class="profile-entry" data-section="project" data-id="${escapeHtml(
        id
      )}" data-collapsed="true">
        <div class="profile-entry__header" data-action="toggle-entry" role="button" aria-expanded="false" tabindex="0">
          <h4 class="profile-entry__title">${escapeHtml(
            proj.title || proj.name || "Project"
          )}</h4>
          <div class="profile-entry__actions">
            <span class="profile-entry__chevron" aria-hidden="true"></span>
            <button type="button" class="profile-entry__button profile-entry__button--danger" data-action="remove-project">Remove</button>
          </div>
        </div>
        <div class="profile-entry__body">
          <div class="profile-form__field">
            <label>Project title</label>
            <input type="text" data-field="title" value="${escapeHtml(
              proj.title ?? proj.name ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Role / Subtitle</label>
            <input type="text" data-field="role" value="${escapeHtml(
              proj.role ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Dates</label>
            <input type="text" data-field="dates" value="${escapeHtml(
              proj.dates ?? proj.timeline ?? ""
            )}">
          </div>
          <div class="profile-entry__notes">
            <label>Description</label>
            <textarea data-field="description">${escapeHtml(
              proj.description ?? ""
            )}</textarea>
          </div>
          <div class="profile-entry__list">
            <label>Impact (one per line)</label>
            <textarea data-field="impact">${escapeHtml(
              (Array.isArray(proj.impact) ? proj.impact : []).join("\n")
            )}</textarea>
          </div>
          <div class="profile-form__field">
            <label>Link</label>
            <input type="text" data-field="link" value="${escapeHtml(
              proj.link ?? proj.url ?? ""
            )}">
          </div>
        </div>
      </div>
    `;
  }

  renderEducationEntry(edu = {}) {
    const id = edu.id || randomId("edu");
    return `
      <div class="profile-entry" data-section="education" data-id="${escapeHtml(
        id
      )}" data-collapsed="true">
        <div class="profile-entry__header" data-action="toggle-entry" role="button" aria-expanded="false" tabindex="0">
          <h4 class="profile-entry__title">${escapeHtml(
            edu.degree || "Education"
          )}</h4>
          <div class="profile-entry__actions">
            <span class="profile-entry__chevron" aria-hidden="true"></span>
            <button type="button" class="profile-entry__button profile-entry__button--danger" data-action="remove-education">Remove</button>
          </div>
        </div>
        <div class="profile-entry__body">
          <div class="profile-form__field">
            <label>Degree / Program</label>
            <input type="text" data-field="degree" value="${escapeHtml(
              edu.degree ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Institution</label>
            <input type="text" data-field="institution" value="${escapeHtml(
              edu.institution ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Location</label>
            <input type="text" data-field="location" value="${escapeHtml(
              edu.location ?? ""
            )}">
          </div>
          <div class="profile-form__field">
            <label>Dates</label>
            <input type="text" data-field="dates" value="${escapeHtml(
              edu.dates ?? ""
            )}">
          </div>
          <div class="profile-entry__list">
            <label>Highlights (one per line)</label>
            <textarea data-field="highlights">${escapeHtml(
              (Array.isArray(edu.highlights) ? edu.highlights : []).join("\n")
            )}</textarea>
          </div>
        </div>
      </div>
    `;
  }
}

export class JobController {
  constructor(elements, statusBadge) {
    this.summaryEl = elements.summary;
    this.textarea = elements.textarea;
    this.selectionHintEl = elements.selectionHint;
    this.statusBadge = statusBadge;
    this.currentJob = null;
  }

  hydrate(job) {
    this.currentJob = job;
    this.setSummary(job?.text);
    if (typeof job?.text === "string" && this.textarea) {
      this.textarea.value = job.text;
    }
    if (job?.text) {
      this.updateSelectionHint(job.text, job.source ?? "captured");
    }
  }

  setSummary(jobText) {
    if (!this.summaryEl) return;
    if (!jobText) {
      this.summaryEl.textContent = "No job description captured yet.";
      return;
    }
    const normalized = jobText.replace(/\s+/g, " ").trim();
    const clipped =
      normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
    this.summaryEl.textContent = `Stored job description (${normalized.length} chars): ${clipped}`;
  }

  updateSelectionHint(text, source = "selection") {
    if (!this.selectionHintEl) return;
    if (!text) {
      this.selectionHintEl.textContent =
        "Highlight text on the page or paste it below.";
      return;
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    const clipped =
      normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
    const originLabel =
      source === "selection"
        ? "Highlighted"
        : source === "pasted"
        ? "Pasted"
        : "Captured";
    this.selectionHintEl.textContent = `${originLabel} (${normalized.length} chars): ${clipped}`;
  }

  getTextareaValue() {
    return (this.textarea?.value ?? "").trim();
  }

  setTextareaValue(value) {
    if (this.textarea) {
      this.textarea.value = value ?? "";
    }
  }

  focusTextarea() {
    this.textarea?.focus({ preventScroll: true });
  }
}

export class PreviewOverlay {
  constructor(elements, statusBadge) {
    this.layer = elements.layer;
    this.overlay = elements.overlay;
    this.titleEl = elements.title;
    this.metaEl = elements.meta;
    this.contentEl = elements.content;
    this.editorContainer = elements.editor;
    this.loaderEl = elements.loader;
    this.loaderSpinnerEl = elements.loaderSpinner;
    this.loaderMessageEl = elements.loaderMessage;
    this.statusBadge = statusBadge;
    this.currentEntry = null;
    this.editing = false;
    this.editorInstance = null;
    this.editorModule = null;
  }

  async ensureEditorModule() {
    if (this.editorModule) return this.editorModule;
    const cssUrl = chrome.runtime.getURL("content/lib/simple-editor.css");
    if (!document.querySelector('link[data-rise-editor="css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssUrl;
      link.dataset.riseEditor = "css";
      document.head.appendChild(link);
    }
    this.editorModule = await import(
      chrome.runtime.getURL("content/lib/simple-editor.js")
    );
    return this.editorModule;
  }

  open(entry) {
    this.currentEntry = entry;
    if (!this.overlay || !this.titleEl || !this.metaEl || !this.contentEl)
      return;
    if (this.layer) {
      this.layer.hidden = false;
    }
    this.overlay.hidden = false;
    if (this.loaderEl) {
      this.loaderEl.hidden = true;
    }
    this.titleEl.textContent = entry.title ?? "Resume Preview";
    this.metaEl.textContent = entry.updatedAt
      ? `Updated ${entry.updatedAt}`
      : entry.createdAt
      ? `Generated ${entry.createdAt}`
      : "";
    this.contentEl.innerHTML = buildResumeSectionsHtml(entry.resume);
    this.contentEl.style.display = "";
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    this.editing = false;
  }

  close() {
    if (!this.overlay) return;
    this.overlay.hidden = true;
    if (this.layer) {
      this.layer.hidden = true;
    }
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    if (this.contentEl) {
      this.contentEl.style.display = "";
    }
    if (this.loaderEl) {
      this.loaderEl.hidden = true;
    }
    this.editing = false;
    this.editorInstance = null;
    this.currentEntry = null;
  }

  async toggleEditing() {
    if (!this.currentEntry || !this.editorContainer) return this.currentEntry;
    if (!this.editing) {
      const { SimpleEditor } = await this.ensureEditorModule();
      this.editorContainer.hidden = false;
      this.editorContainer.innerHTML = "";
      if (this.contentEl) {
        this.contentEl.style.display = "none";
      }
      this.editorInstance = new SimpleEditor({
        root: this.editorContainer,
        initialHtml:
          this.currentEntry.editedHtml ||
          buildResumeSectionsHtml(this.currentEntry.resume),
      });
      this.editorInstance.focus();
      this.editing = true;
      this.statusBadge.set("Editing mode enabled.", "info");
      return this.currentEntry;
    }

    const html = this.editorInstance?.getHtml?.() ?? "";
    this.currentEntry.editedHtml =
      html ||
      this.currentEntry.editedHtml ||
      buildResumeSectionsHtml(this.currentEntry.resume);
    this.currentEntry.updatedAtMs = Date.now();
    this.currentEntry.updatedAt = new Date(
      this.currentEntry.updatedAtMs
    ).toLocaleString();
    const summary = this.extractSummaryTitle(this.currentEntry);
    if (summary) this.currentEntry.title = summary;
    if (this.contentEl) {
      this.contentEl.innerHTML = this.currentEntry.editedHtml;
      this.contentEl.style.display = "";
    }
    this.editorContainer.hidden = true;
    this.editorContainer.innerHTML = "";
    this.editorInstance = null;
    this.editing = false;
    this.statusBadge.set("Changes applied to preview.", "success");
    return this.currentEntry;
  }

  showLoading(message = "Preparing your tailored resume...") {
    if (this.layer) this.layer.hidden = false;
    if (this.overlay) this.overlay.hidden = false;
    if (this.loaderEl) {
      this.loaderEl.hidden = false;
    }
    if (this.loaderSpinnerEl) {
      this.loaderSpinnerEl.hidden = false;
    }
    if (this.loaderMessageEl) {
      this.loaderMessageEl.textContent = message;
    }
    if (this.contentEl) {
      this.contentEl.style.display = "none";
      this.contentEl.innerHTML = "";
    }
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    this.currentEntry = null;
    this.editing = false;
  }

  showMessage({ title = "Rise AI", body = "", tone = "info" } = {}) {
    if (this.layer) this.layer.hidden = false;
    if (this.overlay) this.overlay.hidden = false;
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.metaEl) this.metaEl.textContent = "";
    if (this.loaderEl) {
      this.loaderEl.hidden = false;
    }
    if (this.loaderSpinnerEl) {
      this.loaderSpinnerEl.hidden = true;
    }
    if (this.loaderMessageEl) {
      this.loaderMessageEl.textContent = body;
    }
    if (this.contentEl) {
      this.contentEl.style.display = "none";
      this.contentEl.innerHTML = "";
    }
    if (this.editorContainer) {
      this.editorContainer.hidden = true;
      this.editorContainer.innerHTML = "";
    }
    this.statusBadge.set(body, tone);
  }

  extractSummaryTitle(entry) {
    if (!entry) return "";
    const temp = document.createElement("div");
    temp.innerHTML = entry.editedHtml || buildResumeSectionsHtml(entry.resume);
    const candidate = temp.querySelector(".preview-section__paragraph");
    if (!candidate) return "";
    const text = candidate.textContent.trim();
    return text ? `${text.slice(0, 64)}${text.length > 64 ? "..." : ""}` : "";
  }

  downloadJson(entry) {
    if (!entry?.resume) {
      this.statusBadge.set("No resume to download yet.", "error");
      return;
    }
    const blob = new Blob([JSON.stringify(entry.resume, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entry.id || "resume"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.statusBadge.set("Resume JSON downloaded.", "success");
  }

  exportPdf(entry) {
    if (!entry?.resume) {
      this.statusBadge.set("No resume to export yet.", "error");
      return;
    }
    const sectionsHtml =
      entry.editedHtml || buildResumeSectionsHtml(entry.resume);
    const docHtml = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(
      entry.title ?? "Resume"
    )}</title><style>
      body{font-family:'Inter','Segoe UI',system-ui,sans-serif;margin:40px;color:#111214;}
      h1{margin:0 0 12px;font-size:22px;}
      h2{margin:4px 0 24px;font-size:13px;color:#5b5c5f;}
      .preview-section{border-bottom:1px solid rgba(17,17,18,0.12);padding-bottom:16px;margin-bottom:20px;}
      .preview-section:last-of-type{border-bottom:none;margin-bottom:0;}
      .preview-section__title{margin:0 0 12px;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;}
      .preview-section__paragraph{margin:0 0 10px;font-size:13px;line-height:1.6;}
      .preview-experience__item{margin-bottom:14px;}
      .preview-experience__header{font-weight:600;font-size:13px;display:flex;gap:8px;flex-wrap:wrap;}
      .preview-experience__meta{font-size:12px;color:#5b5c5f;display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;}
      .preview-experience__bullets{margin:8px 0 0 18px;font-size:13px;}
      .preview-skill-list{display:flex;flex-wrap:wrap;gap:8px;}
      .preview-skill{padding:6px 10px;border-radius:999px;background:#f3f4f6;font-size:12px;}
      .preview-education__item{margin-bottom:16px;font-size:13px;}
      .preview-education__degree{font-weight:600;}
      .preview-education__institution{color:#5b5c5f;margin-top:2px;}
      .preview-education__dates{color:#5b5c5f;font-size:12px;margin-top:4px;}
      .preview-education__highlights{margin:8px 0 0 18px;font-size:13px;}
    </style></head><body><h1>${escapeHtml(entry.title ?? "Resume")}</h1><h2>${
      entry.updatedAt
        ? `Updated ${escapeHtml(entry.updatedAt)}`
        : entry.createdAt
        ? `Generated ${escapeHtml(entry.createdAt)}`
        : ""
    }</h2>${sectionsHtml}</body></html>`;
    const printWindow = window.open(
      "",
      "_blank",
      "noopener=yes,width=900,height=1120"
    );
    if (!printWindow) {
      this.statusBadge.set(
        "Pop-up blocked. Allow pop-ups to export PDF.",
        "error"
      );
      return;
    }
    printWindow.document.open();
    printWindow.document.write(docHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
        this.statusBadge.set("Print dialog opened for PDF export.", "success");
      } catch (error) {
        console.error("[RiseAI] PDF export failed", error);
        this.statusBadge.set("Unable to export to PDF.", "error");
      }
    }, 250);
  }
}
export class ResumeHistory {
  constructor(listEl, previewOverlay, statusBadge) {
    this.listEl = listEl;
    this.previewOverlay = previewOverlay;
    this.statusBadge = statusBadge;
    this.entries = [];
    this.entryIndex = new Map();
  }

  async hydrate() {
    const stored = await HistoryRepository.fetch();
    this.entries = stored;
    this.entryIndex.clear();
    stored.forEach((entry) => this.entryIndex.set(entry.id, entry));
    this.render();
    return stored;
  }

  render() {
    if (!this.listEl) return;
    if (!this.entries.length) {
      this.listEl.innerHTML = `<p class="history-empty">No resumes yet. Generate your first one to see it here.</p>`;
      return;
    }
    this.listEl.innerHTML = this.entries
      .map((entry) => {
        const meta = entry.updatedAt || entry.createdAt || "";
        return `<article class="history-item" data-resume-id="${entry.id}">
          <span class="history-item__title">${escapeHtml(
            entry.title ?? "Resume"
          )}</span>
          <span class="history-item__meta">${escapeHtml(meta)}</span>
        </article>`;
      })
      .join("");
  }

  async add(entry) {
    const saved = await HistoryRepository.save(entry);
    this.entryIndex.set(saved.id, saved);
    const existingIndex = this.entries.findIndex(
      (item) => item.id === saved.id
    );
    if (existingIndex !== -1) {
      this.entries.splice(existingIndex, 1, saved);
    } else {
      this.entries.unshift(saved);
    }
    this.entries = this.entries.slice(0, 20);
    this.render();
    return saved;
  }

  async update(entry) {
    const saved = await HistoryRepository.save(entry);
    this.entryIndex.set(saved.id, saved);
    const index = this.entries.findIndex((item) => item.id === saved.id);
    if (index !== -1) {
      this.entries.splice(index, 1, saved);
    } else {
      this.entries.unshift(saved);
    }
    this.entries = this.entries.slice(0, 20);
    this.render();
    return saved;
  }

  getById(id) {
    return this.entryIndex.get(id) || null;
  }
}
