import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { Octokit } from "octokit";
import { useAuth } from "../../contexts/index.js";

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
      try {
        setLoading(true);
        
        // Always fetch from the Abundance repository
        const repoOwner = "BarbourSmith";
        const repoNameToUse = "Abundance";

        // Create Octokit instance (authenticated if available, otherwise public)
        const octokit = authorizedUserOcto || new Octokit();

        // Fetch README content from GitHub API
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/readme",
          {
            owner: repoOwner,
            repo: repoNameToUse,
            mediaType: {
              format: "raw",
            },
          }
        );

        setReadmeContent(response.data);
        setError(null);
      } catch (err) {
        console.error("Error fetching User Guide:", err);
        setError(
          "Unable to load the User Guide. Please try again later."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchReadme();
  }, [authorizedUserOcto]);

  const handleBack = () => {
    navigate(-1);
  };

  // Convert heading text to GitHub-style ID
  const generateHeadingId = (children) => {
    if (!children) return "";
    
    // Extract text from children (handle both string and array)
    let text = "";
    if (typeof children === "string") {
      text = children;
    } else if (Array.isArray(children)) {
      text = children.map(child => 
        typeof child === "string" ? child : child?.props?.children || ""
      ).join("");
    } else if (children.props?.children) {
      text = children.props.children;
    }
    
    // Convert to lowercase and replace spaces with hyphens
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-")      // Replace spaces with hyphens
      .replace(/--+/g, "-")      // Replace multiple hyphens with single
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
    <div className="readme-page">
      <div className="readme-header">
        <button className="readme-back-button" onClick={handleBack}>
          ← Back
        </button>
        <h1 className="readme-title">
          Abundance User Guide
        </h1>
      </div>

      <div className="readme-content">
        {loading && (
          <div className="readme-loading">Loading User Guide...</div>
        )}
        
        {error && (
          <div className="readme-error">
            <p>{error}</p>
            <button onClick={handleBack}>Go Back</button>
          </div>
        )}
        
        {!loading && !error && (
          <ReactMarkdown
            rehypePlugins={[rehypeRaw]}
            components={{
              // Handle links with proper anchor navigation
              a: ({ node, ...props }) => (
                <a 
                  {...props} 
                  onClick={(e) => handleLinkClick(e, props.href)}
                />
              ),
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
