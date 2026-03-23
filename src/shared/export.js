function pickExportFields(item) {
  return {
    link: item?.link || null,
    author: item?.author || null,
    author_profile_url: item?.author_profile_url || null,
    reposted_by: item?.reposted_by || null,
    post_text: item?.post_text || null,
    posted_time: item?.posted_time || null,
    is_repost: Boolean(item?.is_repost),
    type: item?.type || "organic",
    extracted_at: item?.extracted_at || null,
    interest_validation: item?.interest_validation || null,
  };
}

export function toRawExportItem(item) {
  return pickExportFields(item);
}

export function toEnrichedExportItem(item) {
  return {
    ...pickExportFields(item),
    author_role: item?.author_role || null,
    author_followers:
      typeof item?.author_followers === "number" ? item.author_followers : null,
    author_weight: item?.author_weight || "low",
  };
}

export function serializeExportItems(items) {
  return JSON.stringify(items, null, 2);
}
