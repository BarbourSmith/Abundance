import React, {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import {
  Box3,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Sphere,
} from "three";

/** How long auto-rotation waits after the user lets go before resuming. */
const RESUME_AUTO_ROTATE_MS = 3000;
/** Camera field of view, in degrees. */
const FOV = 35;
/** Color of the edge lines, matching the editor's part outlines. */
const EDGE_COLOR = "#3b3a39";
/** Faces meeting at more than this angle, in degrees, get an edge line. */
const EDGE_ANGLE = 30;

/** Load a featured model without the Draco decoder, which these files don't use. */
export function preloadFeaturedModel(url) {
  useGLTF.preload(url, false);
}

/**
 * The exported models leave out normals and edge lines to stay small (see
 * src/js/exportGLB.js), so rebuild them. useGLTF caches the scene, so this
 * runs once per model.
 */
function addNormalsAndEdges(scene) {
  if (scene.userData.edgesAdded) return;
  scene.userData.edgesAdded = true;
  const edgeMaterial = new LineBasicMaterial({ color: EDGE_COLOR });
  const meshes = [];
  scene.traverse((object) => object.isMesh && meshes.push(object));
  meshes.forEach((mesh) => {
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    mesh.add(
      new LineSegments(
        new EdgesGeometry(mesh.geometry, EDGE_ANGLE),
        edgeMaterial,
      ),
    );
  });
}

/**
 * The model, centered on the origin, with the camera framed to fit it.
 * The GLB is Y-up as exported (see src/js/exportGLB.js).
 */
function FramedModel({ url, onReady }) {
  const { scene } = useGLTF(url, false);
  useMemo(() => addNormalsAndEdges(scene), [scene]);
  const { camera, controls, invalidate } = useThree();
  // Framing only depends on the model; a new callback mustn't re-frame it
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const sphere = useMemo(
    () => new Box3().setFromObject(scene).getBoundingSphere(new Sphere()),
    [scene],
  );

  useLayoutEffect(() => {
    // Far enough that the bounding sphere fits the view, from above and in front
    const distance = (sphere.radius / Math.sin((FOV * Math.PI) / 360)) * 1.05;
    camera.position.set(1, 0.7, 1).normalize().multiplyScalar(distance);
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
    controls?.target.set(0, 0, 0);
    controls?.update();
    invalidate();
    onReadyRef.current?.();
  }, [sphere, camera, controls, invalidate]);

  return (
    <group position={sphere.center.clone().negate()}>
      <primitive object={scene} />
    </group>
  );
}

/** Shows the fallback when the model fails to load. */
class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn("Featured model failed to load:", error);
    this.props.onError?.();
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * An orbitable 3D model that rotates slowly on its own. Dragging pauses the
 * rotation, which resumes a few seconds after the user lets go. Zoom is off so
 * scrolling the page isn't captured. While the model loads, or if it fails,
 * the fallback image is shown.
 *
 * @param {string} url - The GLB to show
 * @param {string} fallbackImage - Image shown while loading or on failure
 * @param {string} alt - Description of the model
 * @param {function} onInteractingChange - Called with true when the user starts
 *   orbiting and false once auto-rotation resumes
 */
export default function FeaturedModelViewer({
  url,
  fallbackImage,
  alt,
  onInteractingChange,
}) {
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [failedUrl, setFailedUrl] = useState(null);
  const [interacting, setInteracting] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const reduceMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Resume auto-rotation a while after the user lets go
  const resumeTimer = useRef(null);
  useEffect(() => () => clearTimeout(resumeTimer.current), []);
  const onStart = () => {
    clearTimeout(resumeTimer.current);
    setInteracting(true);
    onInteractingChange?.(true);
  };
  const onEnd = () => {
    resumeTimer.current = setTimeout(() => {
      setInteracting(false);
      onInteractingChange?.(false);
    }, RESUME_AUTO_ROTATE_MS);
  };

  const showModel = failedUrl !== url;
  const modelReady = loadedUrl === url;
  const autoRotate = !interacting && !reduceMotion;

  return (
    <div className="featured-model">
      {(!modelReady || !showModel) && (
        <img className="featured-image" src={fallbackImage} alt={alt} />
      )}
      {showModel && (
        <Canvas
          className="featured-model-canvas"
          style={{ opacity: modelReady ? 1 : 0 }}
          // Render continuously only while something moves on screen
          frameloop={pageVisible && autoRotate ? "always" : "demand"}
          dpr={[1, 2]}
          camera={{ fov: FOV, up: [0, 1, 0], position: [1, 1, 1] }}
          aria-label={alt}
        >
          <ambientLight intensity={1.6} />
          <directionalLight position={[3, 5, 4]} intensity={1.8} />
          <directionalLight position={[-4, 2, -3]} intensity={0.6} />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom={false}
            autoRotate={autoRotate}
            autoRotateSpeed={1.5}
            onStart={onStart}
            onEnd={onEnd}
          />
          <ModelErrorBoundary resetKey={url} onError={() => setFailedUrl(url)}>
            <Suspense fallback={null}>
              <FramedModel url={url} onReady={() => setLoadedUrl(url)} />
            </Suspense>
          </ModelErrorBoundary>
        </Canvas>
      )}
    </div>
  );
}
