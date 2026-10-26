import React, {
  useImperativeHandle,
  useLayoutEffect,
  useEffect,
  useMemo,
  useState,
  forwardRef,
} from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { BufferGeometry, DoubleSide } from "three";
import {
  Scene,
  Mesh,
  MeshBasicMaterial,
  LineBasicMaterial,
  PerspectiveCamera,
  Vector3,
  Box3,
} from "three";
import { syncFaces, syncLines } from "replicad-threejs-helper";
import {
  buildDisplayGeometries,
  transformMatrix,
  transformProps,
} from "../../js/displayMeshGeometry.js";
import { Wireframe } from "@react-three/drei";
import { useRendering } from "../../contexts/index.js";

// Pixel-space tolerance for edge-select clicks (see edge onPointerDown below).
// Kept as a module constant so the raycaster's Line.threshold (which must be
// generous enough to generate an intersection in the first place) and the
// precise per-click distance filter agree on the same target tolerance.
const EDGE_SELECT_PX_TOLERANCE = 5;

export default React.memo(
  forwardRef(function ShapeMeshes({ isSolid, cameraZoom, setProcessing }, ref) {
    const { mesh, setOutdatedMesh, plane, selectionModeAtom, selectionVersion } = useRendering();
    const { invalidate, raycaster, camera } = useThree();

    // Keep the raycaster's line-picking threshold in sync with the current
    // orthographic zoom so a ~5px click tolerance is generated consistently
    // regardless of zoom level. Without this, a fixed world-unit threshold
    // would make edge-selection far too strict when zoomed out and/or overly
    // loose when zoomed in.
    useFrame(() => {
      if (raycaster?.params?.Line && camera?.zoom) {
        raycaster.params.Line.threshold =
          EDGE_SELECT_PX_TOLERANCE / camera.zoom;
      }
    });

    const [fullMesh, setFullMesh] = useState([]);

    useLayoutEffect(() => {
      const { parts, dispose } = makeMeshes(mesh);
      setFullMesh(parts);
      // We have configured the canvas to only refresh when there is a change,
      // the invalidate function is here to tell it to recompute
      invalidate();
      // Free the GPU buffers of the previous mesh once it is replaced. They
      // were never released before, so every displayed atom leaked them.
      return dispose;
    }, [mesh, invalidate]);

    // Per-element geometries for face/edge selection mode. Built once per
    // per-element result instead of on every render (each selection toggle
    // re-renders), and disposed when replaced.
    const selectionType = selectionModeAtom?.type;
    const perElementSource = selectionModeAtom?._perElementMeshes;
    const perElementGeoms = useMemo(() => {
      if (
        !perElementSource ||
        (selectionType !== "faceselect" && selectionType !== "edgeselect")
      ) {
        return null;
      }
      const byLeaf = {};
      Object.entries(perElementSource).forEach(([leafIndex, entries]) => {
        if (!Array.isArray(entries)) return;
        byLeaf[leafIndex] = entries.map((entry) => {
          const g = new BufferGeometry();
          if (selectionType === "faceselect") {
            syncFaces(g, entry.faces);
          } else {
            syncLines(g, entry.edges);
          }
          return { index: entry.index, geom: g };
        });
      });
      return byLeaf;
    }, [perElementSource, selectionType]);

    useEffect(() => {
      invalidate();
      return () => {
        if (!perElementGeoms) return;
        Object.values(perElementGeoms).forEach((list) =>
          list.forEach(({ geom }) => geom.dispose()),
        );
      };
    }, [perElementGeoms, invalidate]);

    // Selection changes alter materials only; request a frame for them.
    useEffect(() => {
      invalidate();
    }, [selectionVersion, selectionModeAtom, isSolid, invalidate]);

    /**
     * Geometry for each part of the worker's mesh array. Moved copies of a
     * shape share one geometry; each part's `transform` places its group.
     * Returns `{ parts, dispose }`.
     */
    function makeMeshes(meshes) {
      const { parts, dispose } = buildDisplayGeometries(meshes);
      return {
        parts: parts.map((m) => ({
          ...m,
          pointPosition: m.point,
          // Keep out and glass are always transparent
          solid:
            !m.point && m.color != "#D9544D" && m.color != "#E6F3FF"
              ? isSolid
              : false,
        })),
        dispose,
      };
    }

    /**
     * Calculates a camera zoom level to fit a 3D object within the view, based on its bounding box dimensions.
     *
     * @param {number} width - The width of the bounding box.
     * @param {number} height - The height of the bounding box.
     * @param {number} depth - The depth of the bounding box.
     * @param {number} [marginFactor=0.9] - Optional. A factor that helps adjust the size of the svg in the frame.
     * @returns {number} The computed zoom level for the camera.
     *
     * Example usage:
     *   const zoom = calculateZoom(box.width, box.height, box.depth, 0.9);
     */
    function calculateZoom(width, height, depth, marginFactor = 0.9) {
      try {
        // Given example bounding box and zoom level
        const exampleBoundingBox = {
          width: 312.0005000624958,
          height: 312.00074999364347,
          depth: 432.0009977339615,
        };
        const exampleZoom = 0.5;

        // Calculate the diagonal length of the given example bounding box
        const exampleDiagonal = Math.sqrt(
          Math.pow(exampleBoundingBox.width, 2) +
            Math.pow(exampleBoundingBox.height, 2) +
            Math.pow(exampleBoundingBox.depth, 2),
        );

        // Calculate the diagonal length of the input bounding box
        const diagonal = Math.sqrt(
          Math.pow(width, 2) + Math.pow(height, 2) + Math.pow(depth, 2),
        );

        // Calculate the zoom level based on the proportional relationship
        const zoom = (exampleZoom * exampleDiagonal * marginFactor) / diagonal;
        return zoom;
      } catch (e) {
        throw new Error("Error calculating zoom level");
      }
    }

    useImperativeHandle(ref, () => ({
      buildThumbnail: async (m) => {
        const { parts, dispose } = makeMeshes(m);
        try {
          return await meshArrayToSVG2(parts);
        } finally {
          dispose();
        }
      },
    }));

    /**
     * A part's edge-line points as [start, end] pairs of Vector3, placed with
     * the part's transform. The SVG thumbnail reads the points itself rather
     * than drawing three.js objects, so it has to apply the transform.
     */
    function placedLinePoints(m) {
      const positions = m.lines?.attributes?.position?.array;
      if (!positions) return [];
      const matrix = transformMatrix(m.transform);
      const point = (i) => {
        const v = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
        return matrix ? v.applyMatrix4(matrix) : v;
      };
      const segments = [];
      for (let i = 0; i + 5 < positions.length; i += 6) {
        segments.push([point(i), point(i + 3)]);
      }
      return segments;
    }
    /**
     * Converts an array of mesh objects to an SVG string for 2D preview or thumbnail generation.
     *
     * @param {Array} meshArray - Array of mesh objects, each with .lines (BufferGeometry) and .color.
     * @param {number} [width=800] - Width of the SVG output in pixels.
     * @param {number} [height=800] - Height of the SVG output in pixels.
     * @returns {string} SVG markup as a string.
     *
     *   const svg = meshArrayToSVG2(meshArray, 400, 400);
     */
    function meshArrayToSVG2(meshArray, width = 800, height = 800) {
      const partSegments = meshArray
        .filter((m) => m.lines)
        .map((m) => placedLinePoints(m));

      // 1. Calculate bounding box of all geometry
      const boundingBox = new Box3();
      partSegments.forEach((segments) =>
        segments.forEach(([start, end]) => {
          boundingBox.expandByPoint(start);
          boundingBox.expandByPoint(end);
        }),
      );

      // Calculate bounding box dimensions
      const boxSize = new Vector3();
      boundingBox.getSize(boxSize);

      const zoomFromBounds = calculateZoom(boxSize.x, boxSize.y, boxSize.z, 9);

      // 2. Setup camera with dynamic positioning
      const camera = new PerspectiveCamera(25, width / height, 0.1, 10000);
      camera.position.set(3000, 3000, 3000);

      // Apply calculated zoom
      camera.zoom = zoomFromBounds;
      /* Camera set up mimicks the ThreeContext camera for consistent thumbnails */
      camera.far = 9000;
      camera.pov = 1000;

      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      // 3. Project all points to 2D
      const toScreen = (v) => {
        const p = v.clone().project(camera);
        return [(p.x * 0.5 + 0.5) * width, (1 - (p.y * 0.5 + 0.5)) * height];
      };
      const projected = partSegments.map((segments) =>
        segments.map(([start, end]) => [toScreen(start), toScreen(end)]),
      );
      const allProjectedPoints = projected.flat(2);

      // 4. Compute bounding box and center
      if (allProjectedPoints.length === 0) {
        return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
      }
      const xs = allProjectedPoints.map((p) => p[0]);
      const ys = allProjectedPoints.map((p) => p[1]);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

      // 5. Shift all paths by center
      const centeredPaths = projected.map((segments) => {
        const shift = ([x, y]) =>
          `${x - centerX + width / 2},${y - centerY + height / 2}`;
        const path = segments
          .map(([a, b]) => `M${shift(a)} L${shift(b)}`)
          .join(" ");
        return `<path d="${path}" stroke="black"  stroke-width="4"  fill="red"/>`;
      });

      // 6. SVG viewBox centered at 0,0
      return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${centeredPaths.join("\n")}</svg>`;
    }

    function downloadSVG(svgString, filename = "drawing.svg") {
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    }

    useEffect(
      () => () => {
        //body.current.dispose();
        //lines.current.dispose();
        setOutdatedMesh(false);
        invalidate();
      },
      [invalidate],
    );

    const wireframeProps = {
      // Other props
      simplify: false, // Remove some edges from wireframes
      //fill: m.color, // Color of the inside of the wireframe
      fillMix: 0, // Mix between the base color and the Wireframe 'fill'. 0 = base; 1 = wireframe
      fillOpacity: 0.5, // Opacity of the inner fill
      stroke: "#ff0000", // Color of the stroke
      strokeOpacity: 1, // Opacity of the stroke
      thickness: 0.05, // Thickness of the lines
      colorBackfaces: false, // Whether to draw lines that are facing away from the camera
      backfaceStroke: "#0000ff", // Color of the lines that are facing away from the camera
      dashInvert: true, // Invert the dashes
      dash: false, // Whether to draw lines as dashes
      dashRepeats: 4, // Number of dashes in one segment
      dashLength: 0.5, // Length of each dash
      squeeze: false, // Narrow the centers of each line segment
      squeezeMin: 0.2, // Smallest width to squeeze to
      squeezeMax: 1, // Largest width to squeeze from
    };

    return (
      <>
        {fullMesh.map((m, index) => {
          const isInSelectionMode = selectionModeAtom != null;
          const selectionType = selectionModeAtom?.type;

          // Part selection: dim unselected, full opacity for selected
          const isPartMode = isInSelectionMode && selectionType === "partselect";
          const isPartSelected =
            isPartMode &&
            selectionVersion >= 0 &&
            selectionModeAtom.selectedLeafIndexes.includes(index);
          const partOpacity = isPartMode ? (isPartSelected ? 1.0 : 0.2) : 1.0;

          // Edge/face modes read selected IDs for this leaf
          const isEdgeMode = isInSelectionMode && selectionType === "edgeselect";
          const isFaceMode = isInSelectionMode && selectionType === "faceselect";
          const selectedEdgeIds =
            isEdgeMode && selectionVersion >= 0
              ? selectionModeAtom.selectedEdgeData?.[index] || []
              : [];
          const selectedFaceIds =
            isFaceMode && selectionVersion >= 0
              ? selectionModeAtom.selectedFaceData?.[index] || []
              : [];

          // Per-element meshes loaded asynchronously by enterSelectionMode.
          // When ready, render one mesh per topological face / edge so
          // clicks map directly to shape.faces[i] / shape.edges[i].
          const perElement = perElementGeoms?.[index] || null;
          const perFaceGeoms = isFaceMode ? perElement : null;
          const perEdgeGeoms = isEdgeMode ? perElement : null;

          return (
            <group key={index} {...transformProps(m.transform)}>
              {m.pointPosition ? (
                // Point3D — render as a fixed screen-space sprite point
                <points key={"point" + JSON.stringify(m.pointPosition) + index}>
                  <bufferGeometry>
                    <bufferAttribute
                      attach="attributes-position"
                      count={1}
                      array={new Float32Array(m.pointPosition)}
                      itemSize={3}
                    />
                  </bufferGeometry>
                  <pointsMaterial
                    color={m.color}
                    size={5}
                    sizeAttenuation={false}
                  />
                </points>
              ) : m.isWire ? (
                // Wire — render as lines only, no body mesh
                <>
                  <lineSegments key={"wirelines" + index} geometry={m.lines} />
                  <lineSegments key={"wirelinesdark" + index} geometry={m.lines}>
                    <lineBasicMaterial
                      color={"#3c5a6e"}
                      opacity={"1"}
                      linewidth={8}
                    />
                  </lineSegments>
                </>
              
              ) : (
                // Normal solid / 2D geometry
                <>
                  {isFaceMode && perFaceGeoms ? (
                    // Face select mode with per-element meshes loaded:
                    // Render one mesh per topological face. Selected → opaque,
                    // unselected → translucent. Two-sided so back-faces are visible.
                    <>
                      {perFaceGeoms.map(({ index: faceIdx, geom }) => {
                        const sel = selectedFaceIds.includes(faceIdx);
                        return (
                          <mesh
                            key={"face" + index + "-" + faceIdx}
                            geometry={geom}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              selectionModeAtom.toggleFaceForLeaf(index, faceIdx);
                            }}
                          >
                            <meshMatcapMaterial
                              color={sel ? "#ffdd00" : m.color}
                              side={DoubleSide}
                              transparent={true}
                              opacity={sel ? 1.0 : 0.25}
                              polygonOffset
                              polygonOffsetFactor={2.0}
                              polygonOffsetUnits={1.0}
                            />
                          </mesh>
                        );
                      })}
                      {/* Show edge wireframe for topology reference */}
                      <lineSegments key={"lines-facemode" + index} geometry={m.lines}>
                        <lineBasicMaterial color={"#3c5a6e"} />
                      </lineSegments>
                    </>
                  ) : isEdgeMode && perEdgeGeoms ? (
                    // Edge select mode: wireframe only, each edge is its own
                    // <lineSegments>, selected → yellow, else black.
                    // On click, toggle ALL edges within pointer tolerance so
                    // overlapping edges (shared between adjacent leaves) both flip.
                    <>
                      {perEdgeGeoms.map(({ index: edgeIdx, geom }) => {
                        const sel = selectedEdgeIds.includes(edgeIdx);
                        return (
                          <lineSegments
                            key={"edge" + index + "-" + edgeIdx}
                            geometry={geom}
                            userData={{
                              abundanceEdge: true,
                              leafIndex: index,
                              edgeIdx,
                            }}
                            onPointerDown={(e) => {
                              // Three.js's Line raycast already rejects hits
                              // farther than raycaster.params.Line.threshold
                              // (perpendicular ray-to-segment distance), and
                              // that threshold is kept in sync with a ~5px
                              // screen tolerance every frame (see useFrame
                              // above). So any lineSegments intersection that
                              // shows up here already passed that check —
                              // Line intersections don't expose a distance
                              // field we could re-filter by anyway (unlike
                              // Points, `distanceToRay` isn't populated for
                              // Line/LineSegments raycasts).
                              const hits = (e.intersections || []).filter(
                                (i) => i.object?.userData?.abundanceEdge === true,
                              );
                              if (hits.length === 0) return;
                              e.stopPropagation();
                              const seen = new Set();
                              hits.forEach((int) => {
                                const meta = int.object.userData;
                                const key = meta.leafIndex + ":" + meta.edgeIdx;
                                if (seen.has(key)) return;
                                seen.add(key);
                                selectionModeAtom.toggleEdgeForLeaf(
                                  meta.leafIndex,
                                  meta.edgeIdx,
                                );
                              });
                            }}
                          >
                            <lineBasicMaterial
                              color={sel ? "#ffdd00" : "#000000"}
                              linewidth={sel ? 3 : 1}
                            />
                          </lineSegments>
                        );
                      })}
                    </>
                  ) : isPartMode ? (
                    // Part select mode: mirrors face-select's rendering —
                    // unselected parts at moderate opacity + original color,
                    // selected parts fully opaque + yellow highlight.
                    <mesh
                      geometry={m.body}
                      key={"mesh-part" + index}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        selectionModeAtom.toggleLeafIndex(index);
                      }}
                    >
                      <meshMatcapMaterial
                        key={"material-part" + index}
                        color={isPartSelected ? "#ffdd00" : m.color}
                        side={DoubleSide}
                        transparent={true}
                        opacity={isPartSelected ? 1.0 : 0.25}
                        polygonOffset
                        polygonOffsetFactor={2.0}
                        polygonOffsetUnits={1.0}
                      />
                    </mesh>
                  ) : !isSolid ? (
                    <mesh geometry={m.body} key={"mesh" + index}>
                      {/*the offsets are here to avoid z fighting between the mesh and the lines*/}
                      {m.hasVertexColors ? (
                        <meshBasicMaterial
                          key={"material-heatmap" + index}
                          vertexColors
                          side={DoubleSide}
                          polygonOffset
                          polygonOffsetFactor={2.0}
                          polygonOffsetUnits={1.0}
                        />
                      ) : m.color != "#D9544D" && m.color != "#E6F3FF" ? (
                        <meshMatcapMaterial
                          color={m.color}
                          key={"material" + index}
                          polygonOffset
                          polygonOffsetFactor={2.0}
                          polygonOffsetUnits={1.0}
                        />
                      ) : m.color == "#E6F3FF" ? (
                        <meshPhysicalMaterial
                          color={m.color}
                          transparent={true}
                          opacity={0.5}
                          transmission={0.6}
                          roughness={0}
                          metalness={0}
                          clearcoat={1}
                          clearcoatRoughness={0}
                          ior={1.5}
                        />
                      ) : (
                        <meshBasicMaterial
                          geometry={m.body}
                          transparent={true}
                          opacity={0.3}
                          color={m.color}
                        >
                          <Wireframe geometry={m.body} {...wireframeProps} />
                        </meshBasicMaterial>
                      )}
                    </mesh>
                  ) : (
                    <meshBasicMaterial
                      geometry={m.body}
                      transparent={true}
                      opacity={0.7}
                      color={m.color}
                    >
                      <Wireframe geometry={m.body} {...wireframeProps} />
                    </meshBasicMaterial>
                  )}
                  {/* Normal edge lines when not in face/edge select modes */}
                  {!isFaceMode && !isEdgeMode && (
                    <>
                      <lineSegments key={"lines" + index} geometry={m.lines} />
                      <lineSegments key={"linesmesh" + index} geometry={m.lines}>
                        <lineBasicMaterial color={"#3c5a6e"} opacity={"1"} linewidth={8} />
                      </lineSegments>
                    </>
                  )}
                </>
              )}
            </group>
          );
        })}
      </>
    );
  }),
);
