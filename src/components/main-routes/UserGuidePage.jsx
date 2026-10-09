import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { Octokit } from "octokit";
import { useAuth } from "../../contexts/index.js";
import localReadme from "../../../README.md?raw";

const FORUMS_URL = "https://forums.maslowcnc.com/c/software-issues/abundance/41";
const REPO_URL = "https://github.com/BarbourSmith/Abundance";

const README_ONLY_BLOCK =
  /<!--\s*readme-only\s*-->[\s\S]*?<!--\s*\/readme-only\s*-->/g;
// The content sits inside the comment so GitHub hides it.
const GUIDE_ONLY_BLOCK = /<!--\s*guide-only\s*([\s\S]*?)-->/g;

const toGuide = (markdown) =>
  markdown.replace(README_ONLY_BLOCK, "").replace(GUIDE_ONLY_BLOCK, "$1");

function youtubeId(href) {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^(www\.|m\.)/, "");
    let id = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (host === "youtube.com") {
      id =
        url.searchParams.get("v") ||
        url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * UserGuidePage component displays the Abundance repository README.md
 * as a user guide, embedded within the application.
 * Accessible both when logged in and logged out.
 */
function UserGuidePage() {
  const navigate = useNavigate();
  const { authorizedUserOcto } = useAuth();
  const [readmeContent, setReadmeContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReadme = async () => {
      if (import.meta.env.DEV) {
        setReadmeContent(toGuide(localReadme));
        setLoading(false);
        return;
      }
      try {
        setLoading(true);

        // Always fetch from the Abundance repository
        const repoOwner = "BarbourSmith";
        const repoNameToUse = "Abundance";

        // Create Octokit instance (authenticated if available, otherwise public)
        const octokit =
          authorizedUserOcto ||
          new Octokit({ headers: { "X-GitHub-Api-Version": "2022-11-28" } });

        // Fetch README content from GitHub API
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/readme",
          {
            owner: repoOwner,
            repo: repoNameToUse,
            mediaType: {
              format: "raw",
            },
          },
        );

        setReadmeContent(toGuide(response.data));
        setError(null);
      } catch (err) {
        console.error("Error fetching User Guide:", err);
        setError("Unable to load the User Guide. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchReadme();
  }, [authorizedUserOcto]);

  const openProjects = () => {
    // fromRunMode makes LoginMode skip the login screen for guests
    navigate("/", { state: { fromRunMode: true, projectTab: "featured" } });
  };

  // Convert heading text to GitHub-style ID
  const generateHeadingId = (children) => {
    if (!children) return "";

    // Extract text from children (handle both string and array)
    let text = "";
    if (typeof children === "string") {
      text = children;
    } else if (Array.isArray(children)) {
      text = children
        .map((child) =>
          typeof child === "string" ? child : child?.props?.children || "",
        )
        .join("");
    } else if (children.props?.children) {
      text = children.props.children;
    }

    // Convert to lowercase and replace spaces with hyphens
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/--+/g, "-") // Replace multiple hyphens with single
      .trim();
  };

  // Handle link clicks for anchor navigation
  const handleLinkClick = (e, href) => {
    // Check if it's an anchor link (starts with #)
    if (href && href.startsWith("#")) {
      e.preventDefault();
      const targetId = href.substring(1);
      const targetElement = document.getElementById(targetId);

      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    // For external links, let them work normally (same tab)
  };

  return (
    <div className="login-popup readme-page">
      <div className="readme-header">
        <div
          id="welcome-logo"
          className="readme-home-link"
          onClick={() => navigate("/")}
        >
          <img
            src={
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/abundance_logo.png"
            }
            alt="logo"
            id="welcome-logo-img"
          />
          <img
            src={
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/abundance_lettering.png"
            }
            alt="Abundance"
            id="welcome-logo-lettering"
            style={{ height: "20px", padding: "10px" }}
          />
        </div>
        <nav className="readme-nav">
          <a href={FORUMS_URL} target="_blank" rel="noopener noreferrer">
            Forums
          </a>
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              openProjects();
            }}
          >
            Projects
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Contribute
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
          <a
            href="#/"
            className="readme-nav-launch"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            Launch
          </a>
        </nav>
      </div>

      <div className="readme-content">
        {loading && <div className="readme-loading">Loading User Guide...</div>}

        {error && (
          <div className="readme-error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <ReactMarkdown
            rehypePlugins={[rehypeRaw]}
            components={{
              // A YouTube link wrapping a thumbnail image becomes an embedded player
              a: ({ node, ...props }) => {
                const videoId = youtubeId(props.href);
                const wrapsImage = node?.children?.some(
                  (child) => child.tagName === "img",
                );
                if (videoId && wrapsImage) {
                  return (
                    <span className="readme-video">
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                        title="YouTube video"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </span>
                  );
                }
                return (
                  <a
                    {...props}
                    onClick={(e) => handleLinkClick(e, props.href)}
                  />
                );
              },
              // Add styling classes and IDs to headers for anchor navigation
              h1: ({ node, children, ...props }) => (
                <h1
                  className="readme-h1"
                  id={generateHeadingId(children)}
                  {...props}
                >
                  {children}
                </h1>
              ),
              h2: ({ node, children, ...props }) => (
                <h2
                  className="readme-h2"
                  id={generateHeadingId(children)}
                  {...props}
                >
                  {children}
                </h2>
              ),
              h3: ({ node, children, ...props }) => (
                <h3
                  className="readme-h3"
                  id={generateHeadingId(children)}
                  {...props}
                >
                  {children}
                </h3>
              ),
              // Style images to be responsive
              img: ({ node, ...props }) => (
                <img
                  {...props}
                  style={{ maxWidth: "100%", height: "auto" }}
                  alt={props.alt || ""}
                />
              ),
              // Style code blocks
              code: ({ node, inline, ...props }) =>
                inline ? (
                  <code className="readme-inline-code" {...props} />
                ) : (
                  <code className="readme-code-block" {...props} />
                ),
              pre: ({ node, ...props }) => (
                <pre className="readme-pre" {...props} />
              ),
            }}
          >
            {readmeContent}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export default UserGuidePage;
