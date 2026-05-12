import GlobalVariables from "./globalvariables.js";

/**
 * Fetches the text content of a file from a GitHub contents API response.
 *
 * GitHub inlines file content as base64 only for files under ~1 MB.  For
 * larger files the `content` field is empty and a `download_url` is provided
 * instead.  This helper abstracts that distinction so callers don't need to
 * duplicate the logic.
 *
 * @param {object} responseData - The `data` property of an octokit contents
 *   API response (i.e. `response.data`).
 * @param {object} [options]
 * @param {boolean} [options.bustCache=false] - When true, appends a
 *   timestamp query parameter to the download URL to bypass CDN caches.
 * @returns {Promise<string>} The decoded text content of the file.
 */
export async function fetchGitHubFileContent(
  responseData,
  { bustCache = false } = {},
) {
  // GitHub inlines content as base64 only for files under ~1 MB.  For larger
  // files the API returns an empty `content` field with `encoding: "base64"`
  // still set, so we must check both.  The `encoding !== "base64"` guard is
  // purely defensive for any unexpected encoding values.
  const useDownloadUrl =
    responseData.encoding !== "base64" ||
    !responseData.content ||
    responseData.content.length === 0;

  if (useDownloadUrl) {
    const baseUrl = responseData.download_url;
    // `bustCache` appends a timestamp to bypass CDN-level caches (server-side).
    // `cache: "no-store"` prevents the browser from serving a stale local copy.
    // Both layers are needed: the CDN may serve a cached version even when the
    // browser re-fetches, and the browser may serve a cached version even with
    // a fresh CDN response.
    const url = bustCache
      ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_=${Date.now()}`
      : baseUrl;
    const fileResponse = await fetch(url, { cache: "no-store" });
    if (!fileResponse.ok) {
      throw new Error(
        `download_url returned ${fileResponse.status} ${fileResponse.statusText}`,
      );
    }
    return await fileResponse.text();
  }

  return GlobalVariables.fromBinaryStr(atob(responseData.content));
}
