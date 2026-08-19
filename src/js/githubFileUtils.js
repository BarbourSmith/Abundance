import GlobalVariables from "./globalvariables.js";
import { decodeProjectContentFromGitHub } from "./projectContentCodec.js";

/**
 * Appends a timestamp query parameter so a request bypasses CDN-level caches.
 *
 * @param {string} url
 * @returns {string}
 */
function withCacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
}

/**
 * Fetches a file's body through the GitHub contents API using the `raw` media
 * type.  This is the preferred path for files too large to be inlined: it works
 * up to 100 MB and authenticates with the caller's OAuth token.
 *
 * The alternative -- following `download_url` -- relies on the short-lived
 * token GitHub bakes into that URL for private repositories.  Once that token
 * expires raw.githubusercontent answers 404 (it hides private content rather
 * than returning 401), which is what made large private projects fail to open.
 *
 * @param {object} octokit - An Octokit instance.
 * @param {object} responseData - The `data` of a contents API response.
 * @param {boolean} bustCache
 * @returns {Promise<string>}
 */
async function fetchRawThroughApi(octokit, responseData, bustCache) {
  // `responseData.url` is the contents API URL for this exact file, including
  // the `?ref=` it was originally fetched at.
  const url = bustCache ? withCacheBust(responseData.url) : responseData.url;
  const rawResponse = await octokit.request(`GET ${url}`, {
    mediaType: { format: "raw" },
  });
  // Octokit parses the body by content-type, so a JSON file can come back as an
  // already-parsed object.  Every caller re-parses the text anyway, so handing
  // back a re-stringified version is lossless here.
  return typeof rawResponse.data === "string"
    ? rawResponse.data
    : JSON.stringify(rawResponse.data);
}

/**
 * Fetches a file's body by following `download_url`.  Used when no Octokit
 * instance is available; only reliable for public repositories.
 *
 * @param {object} responseData - The `data` of a contents API response.
 * @param {boolean} bustCache
 * @returns {Promise<string>}
 */
async function fetchThroughDownloadUrl(responseData, bustCache) {
  const baseUrl = responseData.download_url;
  // `bustCache` appends a timestamp to bypass CDN-level caches (server-side).
  // `cache: "no-store"` prevents the browser from serving a stale local copy.
  // Both layers are needed: the CDN may serve a cached version even when the
  // browser re-fetches, and the browser may serve a cached version even with
  // a fresh CDN response.
  const url = bustCache ? withCacheBust(baseUrl) : baseUrl;
  const fileResponse = await fetch(url, { cache: "no-store" });
  if (!fileResponse.ok) {
    throw new Error(
      `download_url returned ${fileResponse.status} ${fileResponse.statusText}`,
    );
  }
  return fileResponse.text();
}

/**
 * Fetches the text content of a file from a GitHub contents API response.
 *
 * GitHub inlines file content as base64 only for files under ~1 MB.  For
 * larger files the `content` field is empty, and this helper re-requests the
 * body -- through the authenticated API when an Octokit instance is available,
 * falling back to `download_url` otherwise.  Callers don't need to duplicate
 * that logic.
 *
 * @param {object} responseData - The `data` property of an octokit contents
 *   API response (i.e. `response.data`).
 * @param {object} [options]
 * @param {boolean} [options.bustCache=false] - When true, appends a
 *   timestamp query parameter to bypass caches.
 * @param {object} [options.octokit=null] - The Octokit instance the contents
 *   response came from.  Pass it whenever one is available: without it,
 *   large files in private repositories cannot be fetched.
 * @returns {Promise<string>} The decoded text content of the file.
 */
export async function fetchGitHubFileContent(
  responseData,
  { bustCache = false, octokit = null } = {},
) {
  // GitHub inlines content as base64 only for files under ~1 MB.  For larger
  // files the API returns an empty `content` field with `encoding: "base64"`
  // still set, so we must check both.  The `encoding !== "base64"` guard is
  // purely defensive for any unexpected encoding values.
  const contentIsInlined =
    responseData.encoding === "base64" &&
    responseData.content &&
    responseData.content.length > 0;

  if (contentIsInlined) {
    const decodedText = GlobalVariables.fromBinaryStr(
      atob(responseData.content),
    );
    if (responseData.path === "project.abundance") {
      return decodeProjectContentFromGitHub(decodedText);
    }
    return decodedText;
  }

  let textContent;
  if (octokit && responseData.url) {
    try {
      textContent = await fetchRawThroughApi(octokit, responseData, bustCache);
    } catch (apiError) {
      if (!responseData.download_url) {
        throw apiError;
      }
      // A public repo can still be readable through download_url even if the
      // API request failed (rate limiting, for instance), so it's worth a try.
      console.warn(
        "Raw contents API request failed, falling back to download_url:",
        apiError?.message || apiError,
      );
      try {
        textContent = await fetchThroughDownloadUrl(responseData, bustCache);
      } catch {
        throw apiError;
      }
    }
  } else {
    textContent = await fetchThroughDownloadUrl(responseData, bustCache);
  }

  if (responseData.path === "project.abundance") {
    return decodeProjectContentFromGitHub(textContent);
  }
  return textContent;
}
