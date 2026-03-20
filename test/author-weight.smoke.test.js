import { describe, expect, it } from "vitest";
import {
  AUTHOR_WEIGHT,
  buildAuthorCacheKey,
  buildAuthorSignalPatch,
  classifyAuthorWeight,
  normalizeProfileUrl,
  parseFollowerCount,
} from "../src/shared/author-weight.js";

describe("author weight helpers", () => {
  it("normalizes linkedin profile urls for cache keys", () => {
    expect(
      normalizeProfileUrl(
        "https://www.linkedin.com/in/charity-majors/?trk=feed-detail#about",
      ),
    ).toBe("https://www.linkedin.com/in/charity-majors");
  });

  it("builds cache keys preferring profile url", () => {
    expect(
      buildAuthorCacheKey({
        profileUrl: "https://www.linkedin.com/in/charity-majors/",
        author: "Charity Majors",
      }),
    ).toBe("profile:https://www.linkedin.com/in/charity-majors");
    expect(buildAuthorCacheKey({ author: "Charity Majors" })).toBe(
      "author:charity majors",
    );
  });

  it("parses follower counts with suffixes", () => {
    expect(parseFollowerCount("12.5k followers")).toBe(12500);
    expect(parseFollowerCount("980")).toBe(980);
    expect(parseFollowerCount(null)).toBeNull();
  });

  it("classifies high-weight authors from role or followers", () => {
    expect(classifyAuthorWeight({ role: "CEO at Example", followers: 500 })).toBe(
      AUTHOR_WEIGHT.high,
    );
    expect(classifyAuthorWeight({ role: "Engineer", followers: 20000 })).toBe(
      AUTHOR_WEIGHT.high,
    );
  });

  it("classifies medium and low-weight authors deterministically", () => {
    expect(
      classifyAuthorWeight({ role: "Engineering Director", followers: 900 }),
    ).toBe(AUTHOR_WEIGHT.medium);
    expect(classifyAuthorWeight({ role: "Software Engineer", followers: 400 })).toBe(
      AUTHOR_WEIGHT.low,
    );
  });

  it("builds a normalized signal patch for enriched posts", () => {
    expect(
      buildAuthorSignalPatch({
        role: "CTO",
        followers: "11k followers",
      }),
    ).toEqual({
      author_role: "CTO",
      author_followers: 11000,
      author_weight: AUTHOR_WEIGHT.high,
    });
  });
});
