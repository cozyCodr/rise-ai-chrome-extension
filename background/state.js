export const STORAGE_KEYS = {
  context: "riseai:context",
  job: "riseai:jobDescription",
};

const safeRead = (key, fallback = null) =>
  new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => {
      if (chrome.runtime.lastError) {
        console.warn("[RiseAI] storage.get error", chrome.runtime.lastError.message);
        resolve(fallback);
        return;
      }
      resolve(data[key] ?? fallback);
    });
  });

const safeWrite = (key, value) =>
  new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[RiseAI] storage.set error", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });

export const getContextState = () => safeRead(STORAGE_KEYS.context);
export const setContextState = (context) => safeWrite(STORAGE_KEYS.context, context);

export const getJobState = () => safeRead(STORAGE_KEYS.job);
export const setJobState = (job) => safeWrite(STORAGE_KEYS.job, job);
