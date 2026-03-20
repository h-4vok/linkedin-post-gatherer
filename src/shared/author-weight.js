export const AUTHOR_WEIGHT = {
  high: "high",
  medium: "medium",
  low: "low",
};

const HIGH_ROLE_PATTERNS = [
  /\bceo\b/i,
  /\bchief\b/i,
  /\bcto\b/i,
  /\bcfo\b/i,
  /\bcoo\b/i,
  /\bcio\b/i,
  /\bcmo\b/i,
  /\bpresident\b/i,
  /\bfounder\b/i,
  /\bco-founder\b/i,
  /\bcofounder\b/i,
  /\bowner\b/i,
  /\bmanaging director\b/i,
  /\bgeneral partner\b/i,
  /\bpartner\b/i,
  /\bvice president\b/i,
  /\bvp\b/i,
  /\bsvp\b/i,
  /\bev(p|xecutive vice president)\b/i,
  /\bhead of\b/i,
];

const MEDIUM_ROLE_PATTERNS = [
  /\bdirector\b/i,
  /\bprincipal\b/i,
  /\bstaff\b/i,
  /\blead\b/i,
  /\bmanager\b/i,
  /\barchitect\b/i,
];

export function normalizeAuthorName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProfileUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function buildAuthorCacheKey({ profileUrl, author } = {}) {
  const normalizedProfileUrl = normalizeProfileUrl(profileUrl);

  if (normalizedProfileUrl) {
    return `profile:${normalizedProfileUrl}`;
  }

  const normalizedAuthor = normalizeAuthorName(author);
  return normalizedAuthor ? `author:${normalizedAuthor}` : null;
}

export function parseFollowerCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "");

  const match = text.match(/(\d+(?:\.\d+)?)\s*([km])?/i);

  if (!match) {
    return null;
  }

  const base = Number.parseFloat(match[1]);

  if (!Number.isFinite(base)) {
    return null;
  }

  const suffix = (match[2] || "").toLowerCase();
  const multiplier = suffix === "m" ? 1000000 : suffix === "k" ? 1000 : 1;
  return Math.round(base * multiplier);
}

export function classifyAuthorWeight({ role, followers } = {}) {
  const normalizedRole = String(role || "").trim();
  const normalizedFollowers = parseFollowerCount(followers);

  if (
    HIGH_ROLE_PATTERNS.some((pattern) => pattern.test(normalizedRole)) ||
    normalizedFollowers >= 10000
  ) {
    return AUTHOR_WEIGHT.high;
  }

  if (
    MEDIUM_ROLE_PATTERNS.some((pattern) => pattern.test(normalizedRole)) ||
    normalizedFollowers >= 2000
  ) {
    return AUTHOR_WEIGHT.medium;
  }

  return AUTHOR_WEIGHT.low;
}

export function buildAuthorSignalPatch(authorData = {}) {
  return {
    author_role: authorData.role || null,
    author_followers: parseFollowerCount(authorData.followers),
    author_weight: classifyAuthorWeight(authorData),
  };
}
