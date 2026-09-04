/**
 * Cloudflare Worker for Abundance CAD Platform
 * Intercepts crawler requests and injects dynamic meta tags for social previews
 * Serves React app normally to regular users
 */

// Reliable logging to observability
function logDebug(msg) {
  console.log(`[Worker] ${msg}`);
  // Also try to write to stderr for reliability
  if (typeof globalThis !== "undefined" && globalThis.DEBUG) {
    console.error(`[Worker] ${msg}`);
  }
}

// List of crawler user-agent patterns
const CRAWLER_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /slackbot/i,
  /discordbot/i,
  /telegrambot/i,
  /curl/i,
  /wget/i,
];

/**
 * Check if user-agent is a crawler
 */
function isCrawler(userAgent) {
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Parse project owner and repo from URL path
 * Handles: /run/owner/repo, /owner/repo, /preview/owner/repo
 */
function parseProjectFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const pathname = url.pathname;

    // Path-based routing: /run/owner/repo or /owner/repo or /preview/owner/repo
    const pathMatch = pathname.match(
      /^\/(?:run\/|preview\/)?([^/]+)\/([^/?#]+)/,
    );
    if (pathMatch) {
      return { owner: pathMatch[1], repo: pathMatch[2] };
    }
  } catch (e) {
    console.error("Error parsing URL:", e);
  }
  return null;
}

/**
 * Fetch project metadata from GitHub API (no auth required for public repos)
 * Returns: { title, description, owner, repo, imageUrl, projectUrl }
 */
async function fetchProjectMetadata(owner, repo) {
  try {
    // Construct GitHub raw image URL
    const projectImageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/project.png`;
    const defaultImageUrl =
      "https://abundance.maslowcnc.com/assets/abundance_logo-BkAK_rm1.png";

    // Try to fetch the project image to see if it exists
    let imageUrl = defaultImageUrl; // Default fallback
    try {
      const imageResponse = await fetch(projectImageUrl, { method: "HEAD" });
      if (imageResponse.ok) {
        imageUrl = projectImageUrl;
      }
    } catch (e) {
      // If check fails, use default
      logDebug(`IMAGE_CHECK_FAILED: using default`);
    }

    // Fetch repo metadata from GitHub API (public endpoint, no auth)
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Abundance-Crawler-Worker",
        },
        // Cache the API response at Cloudflare edge for 24 hours
        cf: { cacheTtl: 86400 },
      },
    );

    let description = "A web-based CAD project";

    if (repoResponse.ok) {
      const repoData = await repoResponse.json();
      description =
        repoData.description || "A collaborative CAD project in Abundance";
    }

    return {
      title: repo,
      description,
      owner,
      repo,
      imageUrl,
      projectUrl: `https://abundance.maslowcnc.com/#/run/${owner}/${repo}`,
    };
  } catch (error) {
    console.error("Error fetching project metadata:", error);
    return null;
  }
}

/**
 * Simple HTML escaping (no DOM in Cloudflare Workers)
 */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Inject meta tags into HTML head
 */
function injectMetaTags(html, project) {
  if (!project) {
    return html;
  }

  const { title, description, imageUrl, projectUrl } = project;

  // Remove old og: and twitter: meta tags from the HTML
  html = html.replace(
    /<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/gi,
    "",
  );
  html = html.replace(/<meta\s+name="description"[^>]*>/gi, "");

  // Meta tags to inject for social media crawlers
  const metaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${projectUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="description" content="${escapeHtml(description)}" />`;

  // Replace existing meta tags or inject before closing </head>
  if (html.includes("</head>")) {
    return html.replace("</head>", metaTags + "\n  </head>");
  }

  // Fallback: inject before <body>
  if (html.includes("<body")) {
    return html.replace("<body", metaTags + "\n  <body");
  }

  // Last resort: prepend to HTML
  return metaTags + "\n" + html;
}

/**
 * Main Cloudflare Worker fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    const userAgent = request.headers.get("user-agent") || "";
    const url = request.url;

    logDebug(`FETCH_START URL=${url} UA=${userAgent}`);

    // Parse project info from URL first (applies to ALL requests, not just crawlers)
    const project = parseProjectFromUrl(url);
    logDebug(`PROJECT_PARSED: ${JSON.stringify(project)}`);

    // If this is a project route, handle it specially
    if (project) {
      try {
        // Fetch index.html directly (GitHub Pages serves all routes from index.html)
        const indexUrl = new URL(request.url);
        indexUrl.pathname = "/index.html";
        const baseResponse = await fetch(indexUrl.toString());
        logDebug(`ORIGIN_RESPONSE: status=${baseResponse.status}`);

        if (baseResponse.ok) {
          let html = await baseResponse.text();
          logDebug(`HTML_FETCHED: length=${html.length}`);

          // For crawlers, inject meta tags
          if (isCrawler(userAgent)) {
            logDebug(`CRAWLER_DETECTED`);

            // Fetch project metadata from GitHub
            const projectData = await fetchProjectMetadata(
              project.owner,
              project.repo,
            );
            logDebug(
              `GITHUB_METADATA_FETCHED: ${projectData ? "success" : "failed"}`,
            );

            // Inject meta tags into HTML
            if (projectData) {
              html = injectMetaTags(html, projectData);
              logDebug(`META_TAGS_INJECTED`);
            }
          } else {
            logDebug(`NOT_A_CRAWLER`);
          }

          // Return response (with or without injected meta tags)
          logDebug(`RETURNING_RESPONSE: status=200`);
          return new Response(html, {
            status: 200,
            statusText: "OK",
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "public, max-age=3600, s-maxage=86400",
              "x-worker-processed": "true",
            },
          });
        } else {
          logDebug(`ORIGIN_NOT_OK: status=${baseResponse.status}`);
        }
      } catch (error) {
        logDebug(`ERROR_IN_PROJECT_PATH: ${error.message}`);
      }
    } else {
      logDebug(`NOT_A_PROJECT_URL`);
    }

    logDebug(`PASSTHROUGH_TO_ORIGIN`);
    // For non-project URLs, pass through to origin
    return fetch(request);
  },
};
