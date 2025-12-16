import * as React from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Object3D, Matrix4, Quaternion } from 'three';
import { OrthographicCamera, Hud } from '@react-three/drei';

const Context = React.createContext({});
export const useGizmoContext = () => {
  return React.useContext(Context);
};

const turnRate = 2 * Math.PI; // turn rate in angles per second
const dummy = new Object3D();
const matrix = new Matrix4();
const [q1, q2] = [new Quaternion(), new Quaternion()];
const target = new Vector3();
const targetPosition = new Vector3();

const isOrbitControls = controls => {
  return controls && 'minPolarAngle' in controls;
};

const isCameraControls = controls => {
  return controls && 'getTarget' in controls;
};

/**
 * Custom GizmoHelper that properly handles Z-up coordinate system
 * When looking down the Z-axis, ensures X points right and Y points up
 */
export const CustomGizmoHelper = ({
  alignment = 'bottom-right',
  margin = [80, 80],
  renderPriority = 1,
  onUpdate,
  onTarget,
  children
}) => {
  const size = useThree(state => state.size);
  const mainCamera = useThree(state => state.camera);
  const defaultControls = useThree(state => state.controls);
  const invalidate = useThree(state => state.invalidate);
  const gizmoRef = React.useRef(null);
  const virtualCam = React.useRef(null);
  const animating = React.useRef(false);
  const radius = React.useRef(0);
  const focusPoint = React.useRef(new Vector3(0, 0, 0));
  const defaultUp = React.useRef(new Vector3(0, 0, 0));

  React.useEffect(() => {
    defaultUp.current.copy(mainCamera.up);
    dummy.up.copy(mainCamera.up);
  }, [mainCamera]);

  const tweenCamera = React.useCallback(direction => {
    animating.current = true;
    if (defaultControls || onTarget) {
      focusPoint.current = (onTarget == null ? void 0 : onTarget()) || 
        (isCameraControls(defaultControls) ? defaultControls.getTarget(focusPoint.current) : 
         defaultControls == null ? void 0 : defaultControls.target);
    }
    radius.current = mainCamera.position.distanceTo(target);

    // Rotate from current camera orientation
    q1.copy(mainCamera.quaternion);

    // To new current camera orientation
    targetPosition.copy(direction).multiplyScalar(radius.current).add(target);
    dummy.lookAt(targetPosition);
    q2.copy(dummy.quaternion);
    invalidate();
  }, [defaultControls, mainCamera, onTarget, invalidate]);

  useFrame((_, delta) => {
    if (virtualCam.current && gizmoRef.current) {
      // Animate step
      if (animating.current) {
        if (q1.angleTo(q2) < 0.01) {
          animating.current = false;
          // Orbit controls uses UP vector as the orbit axes,
          // so we need to reset it after the animation is done
          if (isOrbitControls(defaultControls)) {
            mainCamera.up.copy(defaultUp.current);
          }
        } else {
          const step = delta * turnRate;
          // animate position by doing a slerp and then scaling the position on the unit sphere
          q1.rotateTowards(q2, step);
          // animate orientation
          mainCamera.position.set(0, 0, 1).applyQuaternion(q1).multiplyScalar(radius.current).add(focusPoint.current);
          
          // Custom UP vector logic for Z-up coordinate system
          // When looking down the Z-axis, we want X to point right and Y to point up on screen
          const cameraDir = new Vector3().copy(mainCamera.position).sub(focusPoint.current).normalize();
          
          // Check if we're looking down or up the Z-axis
          const lookingDownZ = Math.abs(cameraDir.z) > 0.9;
          
          if (lookingDownZ) {
            // When looking down/up the Z-axis, set UP to make X point right and Y point up
            // Current behavior: UP = [0, 1, 0] gives screen right = +Y, screen up = -X
            // Desired behavior: screen right = +X, screen up = +Y
            // Solution: UP = [0, -1, 0] gives screen right = +X, screen up = -Y (close but inverted)
            // Actually: UP = [-1, 0, 0] might work better
            // Let's try: For camera looking in -Z direction with Z-up system:
            // UP = [0, -1, 0] should give us the correct orientation
            if (cameraDir.z > 0) {
              // Looking down from above (camera at +Z looking at origin)
              // Camera -Z points toward origin (down)
              // We want screen right = +X, screen up = +Y
              mainCamera.up.set(0, -1, 0);
            } else {
              // Looking up from below
              mainCamera.up.set(0, 1, 0);
            }
          } else {
            // For other orientations, use the default Z-up
            mainCamera.up.set(0, 0, 1).applyQuaternion(q1).normalize();
          }
          
          mainCamera.quaternion.copy(q1);
          if (isCameraControls(defaultControls)) 
            defaultControls.setPosition(mainCamera.position.x, mainCamera.position.y, mainCamera.position.z);
          if (onUpdate) 
            onUpdate();
          else if (defaultControls) 
            defaultControls.update(delta);
          invalidate();
        }
      }

      // Sync Gizmo with main camera orientation
      matrix.copy(mainCamera.matrix).invert();
      if (gizmoRef.current) {
        gizmoRef.current.quaternion.setFromRotationMatrix(matrix);
      }
    }
  });

  const gizmoHelperContext = React.useMemo(() => ({
    tweenCamera
  }), [tweenCamera]);

  // Position gizmo component within scene
  const [marginX, marginY] = margin;
  const x = alignment.endsWith('-center') ? 0 : 
    alignment.endsWith('-left') ? -size.width / 2 + marginX : 
    size.width / 2 - marginX;
  const y = alignment.startsWith('center-') ? 0 : 
    alignment.startsWith('top-') ? size.height / 2 - marginY : 
    -size.height / 2 + marginY;

  return (
    <Hud renderPriority={renderPriority}>
      <Context.Provider value={gizmoHelperContext}>
        <OrthographicCamera
          makeDefault={true}
          ref={virtualCam}
          position={[0, 0, 200]}
        />
        <group ref={gizmoRef} position={[x, y, 0]}>
          {children}
        </group>
      </Context.Provider>
    </Hud>
  );
};
