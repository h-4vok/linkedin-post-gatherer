import { describe, expect, it } from "vitest";
import { hasCacheableAuthorSignals, isEmptyAuthorCacheEntry } from "../src/shared/author-cache.js";

describe("author cache policy", () => {
  it("does not cache entries without useful role or follower signals", () => {
    expect(hasCacheableAuthorSignals({ role: null, followers: null })).toBe(false);
    expect(hasCacheableAuthorSignals({ role: "", followers: null })).toBe(false);
  });

  it("caches entries with a useful role", () => {
    expect(hasCacheableAuthorSignals({ role: "CTO", followers: null })).toBe(true);
  });

  it("caches entries with parseable followers greater than zero", () => {
    expect(hasCacheableAuthorSignals({ role: null, followers: "1.2k followers" })).toBe(true);
  });

  it("does not treat zero followers as cacheable without a role", () => {
    expect(hasCacheableAuthorSignals({ role: null, followers: 0 })).toBe(false);
    expect(hasCacheableAuthorSignals({ role: null, followers: "0 followers" })).toBe(false);
  });

  it("detects persisted empty cache entries", () => {
    expect(isEmptyAuthorCacheEntry({ role: null, followers: null })).toBe(true);
    expect(isEmptyAuthorCacheEntry({ author_role: null, author_followers: null })).toBe(true);
  });

  it("does not treat partially useful cache entries as empty", () => {
    expect(isEmptyAuthorCacheEntry({ role: "Founder", followers: null })).toBe(false);
    expect(isEmptyAuthorCacheEntry({ role: null, followers: 25 })).toBe(false);
  });
});
