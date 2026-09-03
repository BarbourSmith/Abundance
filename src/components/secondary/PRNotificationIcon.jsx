import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import GlobalVariables from "../../js/globalvariables.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

/**
 * PRNotificationIcon displays pull requests across user's projects
 * Shows notification count, dropdown with recent PRs, and modal for full list
 *
 * @param {Array} allProjects - All project nodes to scan for PRs
 */
function PRNotificationIcon({ allProjects = [] }) {
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  const { githubToken } = useAuth();

  // Collect all PRs from all projects
  const allPRs = (() => {
    const prs = [];
    allProjects.forEach((project) => {
      if (project.pullRequests && Array.isArray(project.pullRequests)) {
        project.pullRequests.forEach((pr) => {
          prs.push({
            ...pr,
            projectName: project.repoName,
            projectOwner: project.owner,
          });
        });
      }
    });
    return prs.sort((a, b) => b.id - a.id); // Most recent first (by ID as proxy)
  })();

  const totalCount = allPRs.length;
  const recentPRs = allPRs.slice(0, 3);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  const handlePRClick = (pr) => {
    // Navigate to PR comparison page
    // Format: /pull/{baseOwner}/{baseRepo}/{headOwner}/{headRepo}?owner={currentUser}
    // base = target project, head = source project with the PR
    // owner param grants merge permissions if user is the base project owner
    navigate(
      `/pull/${pr.projectOwner}/${pr.projectName}/${pr.owner}/${pr.repo}?owner=${pr.projectOwner}&pull_number=${pr.pullRequestNumber}`,
    );
    setShowDropdown(false);
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      // TODO: Call check-user-prs Lambda to refresh PRs for current user's projects
      console.log(
        "Refreshing pull requests for user:",
        GlobalVariables.currentUser,
      );

      const response = await fetch(
        "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/check-user-prs",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${githubToken}`,
          },
          body: JSON.stringify({ user: GlobalVariables.currentUser }),
        },
      );
      const data = await response.json();
      console.log("Refresh response data:", data);
      // Update allProjects or trigger parent component refresh

      // Simulate a small delay to show the loading state
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error("Error refreshing pull requests:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (totalCount === 0) {
    return null;
  }

  return (
    <>
      {/* Bell Icon Button */}
      <div style={{ position: "relative", marginLeft: "12px" }}>
        <button
          ref={buttonRef}
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            position: "relative",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            fontSize: "16px",
          }}
          title={`${totalCount} pull request${totalCount !== 1 ? "s" : ""}`}
        >
          {/* Bell Icon SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>

          {/* Count Badge */}
          {totalCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                backgroundColor: "#ff4444",
                color: "white",
                borderRadius: "50%",
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: "bold",
              }}
            >
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
        </button>

        {/* Dropdown Menu */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: "100%",
              right: "0",
              backgroundColor: "white",
              border: "1px solid #ddd",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
              zIndex: 1000,
              minWidth: "320px",
              maxWidth: "400px",
              marginTop: "4px",
            }}
          >
            {/* Dropdown Header */}
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #eee",
                fontSize: "12px",
                fontWeight: "600",
                color: "#666",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Recent Pull Requests ({totalCount} total)</span>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh pull requests"
                style={{
                  background: "none",
                  border: "none",
                  cursor: isRefreshing ? "not-allowed" : "pointer",
                  padding: "2px 4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isRefreshing ? "#ccc" : "#666",
                  fontSize: "14px",
                  transition: "color 0.2s",
                  opacity: isRefreshing ? 0.6 : 1,
                }}
                onMouseEnter={(e) =>
                  !isRefreshing && (e.target.style.color = "#333")
                }
                onMouseLeave={(e) => (e.target.style.color = "#666")}
              >
                {isRefreshing ? (
                  <span
                    style={{
                      animation: "spin 1s linear infinite",
                      display: "inline-block",
                    }}
                  >
                    ↻
                  </span>
                ) : (
                  "↻"
                )}
              </button>
            </div>

            {/* Recent PRs List */}
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {recentPRs.length > 0 ? (
                recentPRs.map((pr, idx) => (
                  <div
                    key={`${pr.owner}-${pr.repo}-${pr.branch}-${idx}`}
                    onClick={() => handlePRClick(pr)}
                    style={{
                      padding: "10px 12px",
                      borderBottom:
                        idx < recentPRs.length - 1
                          ? "1px solid #f0f0f0"
                          : "none",
                      cursor: "pointer",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "#f5f5f5")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#333",
                        marginBottom: "4px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {pr.projectName || pr.repo}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#999",
                        marginBottom: "2px",
                      }}
                    >
                      {pr.owner}/{pr.repo}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#666",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      Branch:{" "}
                      <span style={{ fontFamily: "monospace" }}>
                        {pr.branch}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: "10px 12px",
                    color: "#999",
                    fontSize: "12px",
                  }}
                >
                  No pull requests
                </div>
              )}
            </div>

            {/* Footer with "View All" Link */}
            {totalCount > 3 && (
              <div
                style={{
                  padding: "8px 12px",
                  borderTop: "1px solid #eee",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setShowModal(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0066cc",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: "600",
                    padding: "4px",
                  }}
                >
                  View All ({totalCount})
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full List Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
              maxWidth: "600px",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
                All Pull Requests ({totalCount})
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "#999",
                  padding: "0",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "0",
              }}
            >
              {allPRs.map((pr, idx) => (
                <div
                  key={`${pr.owner}-${pr.repo}-${pr.branch}-${idx}`}
                  onClick={() => handlePRClick(pr)}
                  style={{
                    padding: "12px 16px",
                    borderBottom:
                      idx < allPRs.length - 1 ? "1px solid #f0f0f0" : "none",
                    cursor: "pointer",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#f5f5f5")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#333",
                      marginBottom: "4px",
                    }}
                  >
                    {pr.projectName || pr.repo}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#999",
                      marginBottom: "4px",
                    }}
                  >
                    {pr.owner}/{pr.repo}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      Branch:{" "}
                      <span style={{ fontFamily: "monospace" }}>
                        {pr.branch}
                      </span>
                    </span>
                    {pr.url && (
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: "#0066cc",
                          textDecoration: "none",
                          fontSize: "11px",
                        }}
                      >
                        View on GitHub ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}

export default PRNotificationIcon;
