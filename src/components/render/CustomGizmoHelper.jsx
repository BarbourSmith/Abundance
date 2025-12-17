import * as React from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Object3D, Matrix4, Quaternion, CanvasTexture } from 'three';
import { OrthographicCamera, Hud } from '@react-three/drei';

const Context = React.createContext({});
export const useGizmoContext = () => {
  return React.useContext(Context);
};

// Axis component for GizmoViewport
function Axis({ scale = [0.8, 0.05, 0.05], color, rotation }) {
  return (
    <group rotation={rotation}>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={scale} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

// AxisHead component for GizmoViewport
function AxisHead({
  onClick,
  font = '18px Inter var, Arial, sans-serif',
  disabled,
  arcStyle,
  label,
  labelColor,
  axisHeadScale = 1,
  ...props
}) {
  const gl = useThree(state => state.gl);
  const texture = React.useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.beginPath();
    context.arc(32, 32, 16, 0, 2 * Math.PI);
    context.closePath();
    context.fillStyle = arcStyle;
    context.fill();
    if (label) {
      context.font = font;
      context.textAlign = 'center';
      context.fillStyle = labelColor;
      context.fillText(label, 32, 41);
    }
    return new CanvasTexture(canvas);
  }, [arcStyle, label, labelColor, font]);

  const [active, setActive] = React.useState(false);
  const scale = (label ? 1 : 0.75) * (active ? 1.2 : 1) * axisHeadScale;

  const handlePointerOver = e => {
    e.stopPropagation();
    setActive(true);
  };

  const handlePointerOut = e => {
    e.stopPropagation();
    setActive(false);
  };

  return (
    <sprite
      scale={scale}
      onPointerOver={!disabled ? handlePointerOver : undefined}
      onPointerOut={!disabled ? (onClick || handlePointerOut) : undefined}
      {...props}
    >
      <spriteMaterial
        map={texture}
        map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1}
        alphaTest={0.3}
        opacity={label ? 1 : 0.75}
        toneMapped={false}
      />
    </sprite>
  );
}

/**
 * Custom GizmoViewport component that uses our custom context
 */
export const CustomGizmoViewport = ({
  hideNegativeAxes,
  hideAxisHeads,
  disabled,
  font = '18px Inter var, Arial, sans-serif',
  axisColors = ['#ff2060', '#20df80', '#2080ff'],
  axisHeadScale = 1,
  axisScale,
  labels = ['X', 'Y', 'Z'],
  labelColor = '#000',
  onClick,
  ...props
}) => {
  const [colorX, colorY, colorZ] = axisColors;
  const { tweenCamera } = useGizmoContext();

  const axisHeadProps = {
    font,
    disabled,
    labelColor,
    onClick,
    axisHeadScale,
    onPointerDown: !disabled
      ? e => {
          tweenCamera(e.object.position);
          e.stopPropagation();
        }
      : undefined
  };

  return (
    <group scale={40} {...props}>
      <Axis color={colorX} rotation={[0, 0, 0]} scale={axisScale} />
      <Axis color={colorY} rotation={[0, 0, Math.PI / 2]} scale={axisScale} />
      <Axis color={colorZ} rotation={[0, -Math.PI / 2, 0]} scale={axisScale} />
      {!hideAxisHeads && (
        <>
          <AxisHead arcStyle={colorX} position={[1, 0, 0]} label={labels[0]} {...axisHeadProps} />
          <AxisHead arcStyle={colorY} position={[0, 1, 0]} label={labels[1]} {...axisHeadProps} />
          <AxisHead arcStyle={colorZ} position={[0, 0, 1]} label={labels[2]} {...axisHeadProps} />
          {!hideNegativeAxes && (
            <>
              <AxisHead arcStyle={colorX} position={[-1, 0, 0]} {...axisHeadProps} />
              <AxisHead arcStyle={colorY} position={[0, -1, 0]} {...axisHeadProps} />
              <AxisHead arcStyle={colorZ} position={[0, 0, -1]} {...axisHeadProps} />
            </>
          )}
        </>
      )}
    </group>
  );
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
  const targetDirection = React.useRef(new Vector3(0, 0, 0));

  React.useEffect(() => {
    defaultUp.current.copy(mainCamera.up);
    dummy.up.copy(mainCamera.up);
  }, [mainCamera]);

  const tweenCamera = React.useCallback(direction => {
    animating.current = true;
    // Store the target direction for use during animation
    targetDirection.current.copy(direction).normalize();
    if (defaultControls || onTarget) {
      focusPoint.current = (onTarget == null ? void 0 : onTarget()) || 
        (isCameraControls(defaultControls) ? defaultControls.getTarget(focusPoint.current) : 
         defaultControls == null ? void 0 : defaultControls.target);
    }
    radius.current = mainCamera.position.distanceTo(target);

    // Rotate from current camera orientation
    q1.copy(mainCamera.quaternion);

    // Set dummy's UP vector based on target direction for correct orientation
    const targetDir = targetDirection.current;
    const lookingDownZ = Math.abs(targetDir.z) > 0.9;
    if (lookingDownZ) {
      if (targetDir.z > 0) {
        // Looking down from above
        dummy.up.set(0, 1, 0);
      } else {
        // Looking up from below
        dummy.up.set(0, -1, 0);
      }
    } else {
      // For other orientations, use default Z-up
      dummy.up.set(0, 0, 1);
    }

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
          // However, don't reset if we're looking along Z-axis as we want to maintain the custom UP
          if (isOrbitControls(defaultControls)) {
            const finalDir = targetDirection.current;
            const lookingDownZ = Math.abs(finalDir.z) > 0.9;
            if (!lookingDownZ) {
              mainCamera.up.copy(defaultUp.current);
            }
          }
        } else {
          const step = delta * turnRate;
          // animate position by doing a slerp and then scaling the position on the unit sphere
          q1.rotateTowards(q2, step);
          // animate orientation
          mainCamera.position.set(0, 0, 1).applyQuaternion(q1).multiplyScalar(radius.current).add(focusPoint.current);
          
          // Custom UP vector logic for Z-up coordinate system
          // When looking down the Z-axis, we want X to point right and Y to point up on screen
          // Use the TARGET direction (where we're going) not the current direction
          // to ensure consistent orientation throughout the animation
          const targetDir = targetDirection.current;
          
          // Check if we're animating to look down or up the Z-axis
          const lookingDownZ = Math.abs(targetDir.z) > 0.9;
          
          if (lookingDownZ) {
            // When animating to look along the Z-axis, set UP perpendicular to Z to get correct orientation
            // For camera animating to [0, 0, +R] looking down at [0, 0, 0]:
            // - View direction (forward) is [0, 0, -1]
            // - We want screen right = +X, screen up = +Y
            // - Setting UP = [0, 1, 0] makes world +Y appear as "up" on screen
            // - Verification: This gives screen right = +X, screen up = +Y ✓
            if (targetDir.z > 0) {
              // Animating to look down from above
              mainCamera.up.set(0, 1, 0);
            } else {
              // Animating to look up from below (invert the up direction)
              mainCamera.up.set(0, -1, 0);
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
