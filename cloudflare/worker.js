/**
 * Cloudflare Worker for Abundance CAD Platform
 * Intercepts crawler requests and injects dynamic meta tags for social previews
 * Serves React app normally to regular users
 */

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
    // Construct GitHub raw image URL (always accessible)
    const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/project.png`;

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

    console.log(`[Worker] URL: ${url}`);
    console.log(`[Worker] User-Agent: ${userAgent}`);
    console.log(`[Worker] Is Crawler: ${isCrawler(userAgent)}`);

    // Check if this is a crawler request
    if (isCrawler(userAgent)) {
      // Parse project info from URL
      const project = parseProjectFromUrl(url);
      console.log(`[Worker] Parsed Project:`, project);

      if (project) {
        // Fetch the base HTML
        const baseResponse = await fetch(request.clone());
        console.log(`[Worker] Base Response OK: ${baseResponse.ok}`);

        if (baseResponse.ok) {
          let html = await baseResponse.text();
          console.log(`[Worker] HTML length: ${html.length}`);

          // Fetch project metadata from GitHub
          const projectData = await fetchProjectMetadata(
            project.owner,
            project.repo,
          );
          console.log(`[Worker] Project Data:`, projectData);

          // Inject meta tags into HTML
          if (projectData) {
            html = injectMetaTags(html, projectData);
            console.log(`[Worker] Meta tags injected`);
          }

          // Return modified response with cache headers
          return new Response(html, {
            status: 200,
            statusText: "OK",
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "public, max-age=3600, s-maxage=86400",
              "cf-cache-status": "HIT",
            },
          });
        }
      }
    }

    console.log(`[Worker] Passing through to origin`);
    // For non-crawlers or non-project URLs, pass through to origin
    return fetch(request);
  },
};
