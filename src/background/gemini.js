import {
  AI_DEFAULT_CONFIG,
  AI_RATE_LIMIT,
  AI_STATUS,
  STORAGE_KEYS,
} from "../shared/constants.js";

const GEMINI_API_ROOT =
  "https://generativelanguage.googleapis.com/v1beta/models";

export async function getAiConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.aiConfig);
  return normalizeAiConfig(stored[STORAGE_KEYS.aiConfig]);
}

export async function saveAiConfig(configPatch) {
  const nextConfig = normalizeAiConfig(configPatch);

  await chrome.storage.local.set({
    [STORAGE_KEYS.aiConfig]: nextConfig,
  });

  return nextConfig;
}

export function normalizeAiConfig(config) {
  return {
    enabled: Boolean(config?.enabled),
    apiKey: String(config?.apiKey || "").trim(),
    model: String(config?.model || AI_DEFAULT_CONFIG.model).trim(),
    systemInstruction: String(
      config?.systemInstruction || AI_DEFAULT_CONFIG.systemInstruction,
    ).trim(),
  };
}

export function getAiConfigError(config) {
  if (!config.enabled) {
    return "AI validation is disabled.";
  }

  if (!config.apiKey) {
    return "Gemini API key is missing.";
  }

  if (!config.model) {
    return "Gemini model is missing.";
  }

  if (!config.systemInstruction) {
    return "Gemini system instruction is missing.";
  }

  return null;
}

export async function validatePostInterest(item, config, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    `${GEMINI_API_ROOT}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiRequest(item, config.systemInstruction)),
    },
  );

  if (!response.ok) {
    throw await buildGeminiError(response);
  }

  const payload = await response.json();
  const decision = parseGeminiDecision(payload);

  return {
    status: decision,
    error: null,
    rawText: extractCandidateText(payload),
  };
}

export function buildValidationResult(status, attempts, error = null) {
  return {
    status,
    source: "gemini",
    attempts,
    validated_at: new Date().toISOString(),
    error,
  };
}

export function getRetryDelayMs(error, attemptNumber) {
  if (error?.kind === "quota-exhausted") {
    return AI_RATE_LIMIT.quotaCooldownMs;
  }

  if (error?.kind === "rate-limited") {
    const baseDelay = error.retryAfterMs || AI_RATE_LIMIT.defaultBackoffMs;
    return baseDelay * Math.max(1, attemptNumber);
  }

  if (error?.kind === "network-error") {
    return AI_RATE_LIMIT.defaultBackoffMs * Math.max(1, attemptNumber);
  }

  return 0;
}

export function shouldRetryGeminiError(error, attempts) {
  if (attempts >= AI_RATE_LIMIT.maxAttempts) {
    return false;
  }

  return [
    "rate-limited",
    "quota-exhausted",
    "network-error",
    "server-error",
  ].includes(error?.kind);
}

function buildGeminiRequest(item, systemInstruction) {
  return {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      temperature: 0,
      responseMimeType: "text/plain",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Decide if this LinkedIn post is interesting for our profile to comment on.",
              "Return only one token: interesa or no_interesa.",
              "",
              `author: ${item.author || ""}`,
              `reposted_by: ${item.reposted_by || ""}`,
              `posted_time: ${item.posted_time || ""}`,
              `type: ${item.type || ""}`,
              `post_text: ${item.post_text || ""}`,
            ].join("\n"),
          },
        ],
      },
    ],
  };
}

function parseGeminiDecision(payload) {
  const normalized = extractCandidateText(payload).trim().toLowerCase();

  if (normalized === AI_STATUS.interested) {
    return AI_STATUS.interested;
  }

  if (normalized === AI_STATUS.notInterested) {
    return AI_STATUS.notInterested;
  }

  const error = new Error(`Unexpected Gemini decision: ${normalized || "<empty>"}`);
  error.kind = "parse-error";
  throw error;
}

function extractCandidateText(payload) {
  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join(" ")
      .trim() || ""
  );
}

async function buildGeminiError(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const message =
    payload?.error?.message || `Gemini request failed with ${response.status}.`;
  const error = new Error(message);
  error.status = response.status;
  error.retryAfterMs = getRetryAfterMs(response);

  if (response.status === 429) {
    error.kind = "rate-limited";
    return error;
  }

  if (
    response.status === 403 &&
    /quota/i.test(payload?.error?.message || "")
  ) {
    error.kind = "quota-exhausted";
    return error;
  }

  if (response.status >= 500) {
    error.kind = "server-error";
    return error;
  }

  error.kind = "request-error";
  return error;
}

function getRetryAfterMs(response) {
  const retryAfter = response.headers.get("retry-after");

  if (!retryAfter) {
    return null;
  }

  const parsedSeconds = Number.parseInt(retryAfter, 10);

  if (!Number.isFinite(parsedSeconds)) {
    return null;
  }

  return parsedSeconds * 1000;
}
