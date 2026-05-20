function pickExportFields(item) {
  return {
    link: item?.link || null,
    author: item?.author || null,
    author_profile_url: item?.author_profile_url || null,
    author_network_proximity: item?.author_network_proximity || null,
    reposted_by: item?.reposted_by || null,
    post_text: item?.post_text || null,
    posted_time: item?.posted_time || null,
    is_repost: Boolean(item?.is_repost),
    type: item?.type || "organic",
    extracted_at: item?.extracted_at || null,
    comment_count: typeof item?.comment_count === "number" ? item.comment_count : null,
    comment_count_text: item?.comment_count_text || null,
    reaction_count: typeof item?.reaction_count === "number" ? item.reaction_count : null,
    reaction_count_text: item?.reaction_count_text || null,
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
    author_followers: typeof item?.author_followers === "number" ? item.author_followers : null,
    author_weight: item?.author_weight || "trivial",
  };
}

export function serializeExportItems(items) {
  return JSON.stringify(items, null, 2);
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

export function buildResultFilename(date = new Date()) {
  const timestamp = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("");
  const time = [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join("");

  return `linkedin_crawl_result_${timestamp}-${time}.json`;
}
