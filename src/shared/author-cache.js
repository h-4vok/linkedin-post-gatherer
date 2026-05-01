import { parseFollowerCount } from "./author-weight.js";

export function hasCacheableAuthorSignals({ role, followers } = {}) {
  return hasUsefulRole(role) || hasUsefulFollowers(followers);
}

export function isEmptyAuthorCacheEntry(entry) {
  return !hasCacheableAuthorSignals({
    role: entry?.role ?? entry?.author_role,
    followers: entry?.followers ?? entry?.author_followers,
  });
}

function hasUsefulRole(role) {
  return String(role || "").trim().length > 0;
}

function hasUsefulFollowers(followers) {
  const parsedFollowers = parseFollowerCount(followers);
  return typeof parsedFollowers === "number" && parsedFollowers > 0;
}
