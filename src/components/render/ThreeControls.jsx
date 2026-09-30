import React from "react";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useRendering } from "../../contexts";
import { useRef, useEffect, useState } from "react";

// How close (in screen pixels) a double-click must land to the origin marker
// or to an edge/point to pick it. The origin sphere is far too small to hit
// directly at millimeter scale, so it is matched in screen space instead.
const PIVOT_PICK_PX = 10;
const PIVOT_ANIMATION_MS = 250;

function isShown(object) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}

// Helpers drawn in the scene that should never become the pivot.
function isPivotCandidate(object) {
  if (object.name === "grid" || object.name === "workplane") return false;
  if (object.type === "AxesHelper") return false;
  return object.isMesh || object.isLine || object.isPoints;
}

/**
 * Double-clicking the model moves the orbit pivot to the clicked point, and
 * double-clicking the origin marker moves it back to the origin. OrbitControls
 * always looks at its pivot, so the camera slides by the same offset and the
 * picked point glides to the center of the view without changing the viewing
 * angle or zoom.
 */
function useDoubleClickPivot(orbitRef) {
  const { gl, camera, scene, invalidate } = useThree();

  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const origin = new THREE.Vector3();
    const originOnScreen = new THREE.Vector3();
    let animationFrame = null;

    const stopAnimation = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
    };

    const pickPoint = (event) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      originOnScreen.copy(origin).project(camera);
      const originX = (originOnScreen.x * 0.5 + 0.5) * rect.width;
      const originY = (1 - (originOnScreen.y * 0.5 + 0.5)) * rect.height;
      if (Math.hypot(originX - x, originY - y) <= PIVOT_PICK_PX) {
        return origin.clone();
      }

      pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      // The orthographic camera maps one screen pixel to 1/zoom world units.
      const tolerance = PIVOT_PICK_PX / (camera.zoom || 1);
      raycaster.params.Line.threshold = tolerance;
      raycaster.params.Points.threshold = tolerance;

      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find((i) => isPivotCandidate(i.object) && isShown(i.object));
      return hit ? hit.point.clone() : null;
    };

    const onDoubleClick = (event) => {
      const controls = orbitRef.current;
      if (!controls) return;
      const point = pickPoint(event);
      if (!point) return;

      stopAnimation();
      const startTarget = controls.target.clone();
      const startPosition = camera.position.clone();
      const endPosition = startPosition.clone().add(point).sub(startTarget);
      const startTime = performance.now();

      const step = (now) => {
        const t = Math.min((now - startTime) / PIVOT_ANIMATION_MS, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        controls.target.lerpVectors(startTarget, point, eased);
        camera.position.lerpVectors(startPosition, endPosition, eased);
        controls.update();
        invalidate();
        animationFrame = t < 1 ? requestAnimationFrame(step) : null;
      };
      animationFrame = requestAnimationFrame(step);
    };

    // Grabbing the view mid-animation hands control straight back to the user.
    const controls = orbitRef.current;
    controls?.addEventListener("start", stopAnimation);
    element.addEventListener("dblclick", onDoubleClick);
    return () => {
      stopAnimation();
      controls?.removeEventListener("start", stopAnimation);
      element.removeEventListener("dblclick", onDoubleClick);
    };
  }, [gl, camera, scene, invalidate, orbitRef]);
}

const Controls = React.memo(
  React.forwardRef(function Controls(
    { axesParam, enableDamping },
    controlsRef,
  ) {
    const { plane, geometryType } = useRendering();
    const [extraPlane, setExtraPlane] = useState(false);

    // Example plane definition (replace with your actual plane)
    const examplePlane = {
      origin: [0, 0, 0],
      xDir: [1, 0, 0],
      normal: [0, 0, 1],
    };
    const planeDef = plane || examplePlane;
    // Compare plane and examplePlane, set extraPlane if different
    useEffect(() => {
      function arraysEqual(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (Math.abs(a[i] - b[i]) > 1e-8) return false;
        }
        return true;
      }
      const isSame =
        arraysEqual(plane?.origin, examplePlane.origin) &&
        arraysEqual(plane?.xDir, examplePlane.xDir) &&
        arraysEqual(plane?.normal, examplePlane.normal);
      setExtraPlane(!isSame);
    }, [plane]);

    const planeRef = useRef();
    const axesRef = useRef();
    const orbitRef = useRef();
    useDoubleClickPivot(orbitRef);

    useEffect(() => {
      if (planeRef.current && axesRef.current) {
        // Set position
        planeRef.current.position.set(...planeDef.origin);
        axesRef.current.position.set(...planeDef.origin);

        // Compute yDir as normal.cross(xDir)
        const x = new THREE.Vector3(...planeDef.xDir).normalize();
        const n = new THREE.Vector3(...planeDef.normal).normalize();
        const y = new THREE.Vector3().crossVectors(n, x).normalize();

        // Create a basis matrix
        const basis = new THREE.Matrix4();
        basis.makeBasis(x, y, n);

        // Set rotation from basis
        planeRef.current.setRotationFromMatrix(basis);
        axesRef.current.setRotationFromMatrix(basis);
      }
    }, [planeDef, extraPlane]);

    return (
      <>
        <OrbitControls
          ref={orbitRef}
          makeDefault
          panSpeed={1.5}
          zoomSpeed={0.5}
          enableDamping={enableDamping}
        />

        {/* Mark the origin with a small sphere */}
        <mesh name="origin" position={[0, 0, 0]}>
          <sphereGeometry args={[0.1, 32, 32]} />
          <meshBasicMaterial color="gray" />
        </mesh>

        {/* Add a visible ground plane under the origin */}
        {plane && extraPlane && geometryType == "2D" ? (
          <mesh ref={planeRef} name="workplane">
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial
              color="#38341b"
              transparent={true}
              opacity={0.07}
              side={THREE.DoubleSide}
            />
          </mesh>
        ) : null}

        {axesParam && (
          <>
            <GizmoHelper
              name="gizmo"
              alignment="bottom-right"
              margin={[70, 100]}
            >
              <GizmoViewport
                axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]}
                labelColor="white"
              />
            </GizmoHelper>

            <primitive ref={axesRef} object={new THREE.AxesHelper(300)} />
          </>
        )}
      </>
    );
  }),
);

export default Controls;
