import React, { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { useRendering } from "../../contexts/index.js";
import { createReferenceObjects } from "../../js/referenceObjects.js";

/** Opacity of references from the open molecule's output, behind the displayed atom. */
const BACKGROUND_OPACITY = 0.35;

/** What decides how a reference looks; equal keys look the same. */
function itemKey(item) {
  return JSON.stringify([
    item.asset,
    item.page,
    item.resources,
    item.contentBounds,
    item.matrix,
    item.opacity,
  ]);
}

/**
 * Shows the references (images, PDF pages, 3D models) carried by the
 * displayed value, and, faded, those carried by the open molecule's output.
 * They are decoded on the main thread from the files Import atoms loaded (see
 * src/js/referenceObjects.js).
 */
export default function ReferenceMeshes() {
  const { referenceItems, backgroundReferenceItems } = useRendering();
  const { invalidate } = useThree();
  const [objects, setObjects] = useState([]);
  const shownRef = useRef(null);

  const foreground = referenceItems || [];
  const foregroundKeys = new Set(foreground.map(itemKey));
  // A reference in both is shown once, in front
  const background = (backgroundReferenceItems || []).filter(
    (item) => !foregroundKeys.has(itemKey(item)),
  );
  const key = JSON.stringify([
    foreground.map(itemKey),
    background.map(itemKey),
  ]);
  // Rebuilt only when what's shown changes, not on every display request
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => ({ foreground, background }), [key]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      createReferenceObjects(shown.foreground),
      createReferenceObjects(shown.background, {
        opacity: BACKGROUND_OPACITY,
      }),
    ]).then(([front, behind]) => {
      const release = () => {
        front.release();
        behind.release();
      };
      if (cancelled) {
        release();
        return;
      }
      // Free the objects being replaced only once the new ones are ready,
      // so the view doesn't flicker
      shownRef.current?.();
      shownRef.current = release;
      setObjects([...front.objects, ...behind.objects]);
      invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [shown, invalidate]);

  useEffect(() => () => shownRef.current?.(), []);

  const hasModel = shown.foreground
    .concat(shown.background)
    .some((item) => item.kind === "model");

  return (
    <group name="references">
      {hasModel ? (
        // Models have lit materials; CAD faces use matcaps, which ignore it
        <hemisphereLight args={["#ffffff", "#8d8d8d", 2]} />
      ) : null}
      {objects.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
    </group>
  );
}
