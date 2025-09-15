import React from "react";

export default function RenderProgressBar({
  progress,
  label = "Rendering...",
  run,
}) {
  console.log("RenderProgressBar progress:", progress);
  return (
    <div className={!run ? "save-bar" : "save-bar-run"}>
      <div className="progress">
        <div
          className="progress-done"
          style={{
            width: `${progress}%`,
            opacity: 1,
          }}
        >
          {progress < 100 ? `${label} ${progress}%` : "Render Complete!"}
        </div>
      </div>
    </div>
  );
}
