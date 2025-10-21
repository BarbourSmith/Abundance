export default function RenderProgressBar({
  progress,
  label = "Rendering...",
  run,
  offsetTop = 0,
}) {
  return (
    <div 
      className={!run ? "save-bar" : "save-bar-run"}
      style={offsetTop > 0 ? { top: `calc(${run ? '45%' : '40%'} + ${offsetTop}px)` } : {}}
    >
      <div className="progress">
        <p className="save-bar-label">
          {progress < 100 ? `${label} ${progress}%` : `${label === "Rendering" ? "Render" : label === "Building" ? "Build" : label} Complete!`}
        </p>
        <div
          className="progress-done"
          style={{
            width: `${progress}%`,
            opacity: 1,
          }}
        ></div>
      </div>
    </div>
  );
}
