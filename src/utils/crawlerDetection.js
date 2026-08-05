/**
 * Detect if the request is from a web crawler/bot
 * Returns true for search engines, social media crawlers, etc.
 */
export function isCrawler(userAgent) {
  if (!userAgent) return false;

  const crawlerPatterns = [
    // Search engines
    /googlebot/i,
    /bingbot/i,
    /slurp/i,
    /duckduckgo/i,
    /baiduspider/i,
    /yandexbot/i,

    // Social media crawlers
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /whatsapp/i,
    /slackbot/i,
    /pinterestbot/i,
    /telegrambot/i,

    // Other bots
    /curl/i,
    /wget/i,
    /scrapy/i,
    /headlesschrome/i,
    /phantom/i,
  ];

  return crawlerPatterns.some((pattern) => pattern.test(userAgent));
}

/**
 * Extract owner and repoName from URL path
 * Handles paths like: /run/owner/repoName
 */
export function parseProjectPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "run" && parts.length >= 3) {
    return {
      isProjectPath: true,
      owner: parts[1],
      repoName: parts[2],
    };
  }

  return { isProjectPath: false };
}

/**
 * Fetch preview.html from project GitHub repo
 */
export async function fetchProjectPreview(owner, repoName) {
  const url = `https://raw.githubusercontent.com/${owner}/${repoName}/main/preview.html`;

  try {
    const response = await fetch(url);

    if (response.status === 404) {
      // File doesn't exist, return fallback preview
      return generateFallbackPreview(owner, repoName);
    }

    if (!response.ok) {
      return generateFallbackPreview(owner, repoName);
    }

    return await response.text();
  } catch (error) {
    console.error("Error fetching preview:", error);
    return generateFallbackPreview(owner, repoName);
  }
}

/**
 * Generate fallback preview when preview.html doesn't exist
 */
function generateFallbackPreview(owner, repoName) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta property="og:title" content="${repoName}" />
  <meta property="og:description" content="A project by ${owner} in Abundance" />
  <meta property="og:image" content="https://abundance.maslowcnc.com/imgs/abundance_logo.png" />
  <meta property="og:url" content="https://abundance.maslowcnc.com/run/${owner}/${repoName}" />
  <meta name="twitter:card" content="summary" />
  <title>${repoName}</title>
</head>
<body>
  <p>Loading project...</p>
</body>
</html>`;
}
