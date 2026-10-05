import { useState } from "react";
import { submitBugReport } from "../../js/bugReport.js";

function BugReportDialog({ onClose, octokit, reason, details }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(details || "");
  const [submitting, setSubmitting] = useState(false);
  const [issueUrl, setIssueUrl] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Please add a short title.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      setIssueUrl(
        await submitBugReport(octokit, { title, description, reason }),
      );
    } catch (err) {
      console.error("Bug report failed:", err);
      setError(`Could not file the report: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const buttonStyle = { padding: "8px 16px", cursor: "pointer" };

  return (
    <dialog
      open
      className="share-dialog"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "20px",
        minWidth: "450px",
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <h3 style={{ margin: "0 0 15px 0" }}>Report a Bug</h3>

      {issueUrl ? (
        <>
          <p>Thanks! Your report was filed:</p>
          <a href={issueUrl} target="_blank" rel="noreferrer">
            {issueUrl}
          </a>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "15px" }}>
            <button onClick={onClose} style={buttonStyle}>
              Close
            </button>
          </div>
        </>
      ) : (
        <>
          <label style={{ marginBottom: "5px", fontWeight: "500" }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What went wrong?"
            autoFocus
            disabled={submitting}
            style={{ padding: "8px", marginBottom: "10px", fontSize: "14px" }}
          />
          <label style={{ marginBottom: "5px", fontWeight: "500" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What were you doing, and what did you expect to happen?"
            rows={6}
            disabled={submitting}
            style={{ padding: "8px", fontSize: "14px", resize: "vertical" }}
          />
          <p style={{ fontSize: "12px", opacity: 0.8 }}>
            This opens a public issue on BarbourSmith/Abundance under your
            GitHub account. A snapshot of this project and diagnostic logs
            (with credentials and email addresses removed) will be pushed to a
            new <code>bug-report/…</code> branch in this project&apos;s repo.
          </p>
          {error && (
            <div style={{ color: "#e74c3c", fontSize: "13px", marginBottom: "10px" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button onClick={onClose} disabled={submitting} style={buttonStyle}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                ...buttonStyle,
                backgroundColor: "var( --abundance-color-brightPurple)",
                color: "white",
                border: "none",
                borderRadius: "4px",
              }}
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </button>
          </div>
        </>
      )}

      <a className="closeButton" onClick={onClose} style={{ cursor: "pointer" }}>
        {"\u00D7"}
      </a>
    </dialog>
  );
}

export default BugReportDialog;
