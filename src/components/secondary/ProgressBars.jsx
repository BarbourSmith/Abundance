import RenderProgressBar from "./RenderProgressBar.jsx";

/**
 * Component to display both render and build progress bars
 * Handles vertical stacking when both are visible
 * @prop {number} renderProgress - Render progress percentage (0-100)
 * @prop {boolean} renderBarVisible - Whether to show render progress bar
 * @prop {number} buildProgress - Build progress percentage (0-100)
 * @prop {boolean} buildBarVisible - Whether to show build progress bar
 * @prop {boolean} run - Whether this is run mode (affects positioning)
 */
export default function ProgressBars({
  renderProgress,
  renderBarVisible,
  buildProgress,
  buildBarVisible,
  run,
}) {
  // Vertical spacing between bars when both are visible (in pixels)
  const barSpacing = 60;

  return (
    <>
      {renderBarVisible && (
        <RenderProgressBar 
          progress={renderProgress} 
          label="Rendering" 
          run={run}
          offsetTop={0}
        />
      )}
      {buildBarVisible && (
        <RenderProgressBar 
          progress={buildProgress} 
          label="Building" 
          run={run}
          offsetTop={renderBarVisible ? barSpacing : 0}
        />
      )}
    </>
  );
}
