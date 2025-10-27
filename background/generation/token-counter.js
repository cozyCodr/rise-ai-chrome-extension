/**
 * Simple token estimation for Gemini Nano
 * Uses character-based approximation: ~4 chars per token for English
 * This is conservative and works well for prompts
 */

const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count for a text string
 * @param {string} text - Text to count tokens for
 * @returns {number} Estimated token count
 */
export const estimateTokens = (text) => {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
};

/**
 * Check if text fits within token budget
 * @param {string} text - Text to check
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {boolean} True if text fits
 */
export const fitsInBudget = (text, maxTokens) => {
  return estimateTokens(text) <= maxTokens;
};

/**
 * Truncate text to fit within token budget
 * @param {string} text - Text to truncate
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {string} Truncated text
 */
export const truncateToTokens = (text, maxTokens) => {
  if (!text) return "";
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
};

/**
 * Calculate total tokens for a prompt with system + user parts
 * @param {Object} params
 * @param {string} params.systemPrompt - System prompt text
 * @param {string} params.userPrompt - User prompt text
 * @returns {Object} Token breakdown
 */
export const calculatePromptTokens = ({ systemPrompt = "", userPrompt = "" }) => {
  const systemTokens = estimateTokens(systemPrompt);
  const userTokens = estimateTokens(userPrompt);
  const total = systemTokens + userTokens;

  return {
    systemTokens,
    userTokens,
    total,
    breakdown: {
      system: systemTokens,
      user: userTokens,
    },
  };
};

/**
 * Gemini Nano token limits
 */
export const GEMINI_NANO_LIMITS = {
  PER_PROMPT: 1024,
  SESSION_CONTEXT: 4096,
  MAX_CONTEXT: 6144,
};

/**
 * Calculate how many chunks can fit in remaining budget
 * @param {Object} params
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.jobDescription - Job description
 * @param {number} params.avgChunkSize - Average chunk size in chars
 * @param {number} params.overhead - Additional overhead (instructions, etc)
 * @returns {number} Max chunks that fit
 */
export const calculateMaxChunks = ({
  systemPrompt,
  jobDescription,
  avgChunkSize = 800,
  overhead = 200,
}) => {
  const systemTokens = estimateTokens(systemPrompt);
  const jobTokens = estimateTokens(jobDescription);
  const overheadTokens = estimateTokens(" ".repeat(overhead * CHARS_PER_TOKEN));

  const usedTokens = systemTokens + jobTokens + overheadTokens;
  const remainingTokens = GEMINI_NANO_LIMITS.PER_PROMPT - usedTokens;

  if (remainingTokens <= 0) return 0;

  const tokensPerChunk = estimateTokens(" ".repeat(avgChunkSize));
  const maxChunks = Math.floor(remainingTokens / tokensPerChunk);

  return Math.max(0, maxChunks);
};