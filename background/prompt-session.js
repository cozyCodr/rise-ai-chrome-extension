const waitForOffscreenReady = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await sendOffscreenMessage("offscreen:ping");
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw new Error("Offscreen document did not respond.");
};
const ensureOffscreenDocument = async () => {
  if (!chrome.offscreen?.createDocument) {
    throw new Error(
      "Offscreen documents are unavailable in this Chrome build."
    );
  }
  const hasDoc = (await chrome.offscreen.hasDocument?.()) || false;
  if (hasDoc) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("background/offscreen/index.html"),
    reasons: ["IFRAME_SCRIPTING"],
    justification: "Run Prompt API sessions for Rise AI",
  });
  await waitForOffscreenReady();
};

const sendOffscreenMessage = (type, payload, attempt = 0) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "";
        if (attempt < 10 && msg.includes("Receiving end does not exist")) {
          setTimeout(() => {
            sendOffscreenMessage(type, payload, attempt + 1)
              .then(resolve)
              .catch(reject);
          }, 150 * (attempt + 1));
          return;
        }
        reject(new Error(msg));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? "Offscreen request failed"));
        return;
      }
      resolve(response.result ?? null);
    });
  });

export const ensureOffscreen = () => ensureOffscreenDocument();

export const generateViaOffscreen = async (payload = {}) => {
  await ensureOffscreenDocument();
  return sendOffscreenMessage("offscreen:prompt:generate", payload);
};

export const resetOffscreenSession = async () => {
  await ensureOffscreenDocument();
  return sendOffscreenMessage("offscreen:prompt:reset");
};

export const availabilityViaOffscreen = async (payload) => {
  await ensureOffscreenDocument();
  return sendOffscreenMessage("offscreen:prompt:availability", payload);
};
