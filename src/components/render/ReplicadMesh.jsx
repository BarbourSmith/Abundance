import React, {
  useImperativeHandle,
  useLayoutEffect,
  useEffect,
  useState,
  forwardRef,
} from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { BufferGeometry, BufferAttribute, DoubleSide } from "three";
import {
  Scene,
  Mesh,
  MeshBasicMaterial,
  LineBasicMaterial,
  PerspectiveCamera,
  Vector3,
  Box3,
} from "three";
import {
  syncFaces,
  syncLines,
  syncLinesFromFaces,
} from "replicad-threejs-helper";
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
      let meshArray = makeMeshes(mesh);
      setFullMesh(meshArray);
      // We have configured the canvas to only refresh when there is a change,
      // the invalidate function is here to tell it to recompute
      invalidate();
    }, [mesh, invalidate]);

    function makeMeshes(meshes) {
      let meshArray = [];
      if (!Array.isArray(meshes)) return meshArray;
      meshes.map((m) => {
        // Point3D — no buffer geometry to build, just store the coordinate
        if (m.point) {
          meshArray.push({
            pointPosition: m.point,
            color: m.color,
            solid: false,
            isWire: false,
          });
          return;
        }

        const body = new BufferGeometry();
        const lines = new BufferGeometry();
        // We use the three helpers to synchronise the buffer geometry with the
        // new data from the parameters
        if (m.faces) syncFaces(body, m.faces);
        //if (faces) syncFaces(wire.current, faces);

        if (m.edges) syncLines(lines, m.edges);
        else if (m.faces) syncLinesFromFaces(lines, body);

        // Per-vertex colours from a meshOverride. The override travels as a
        // plain number[] so it round-trips through JSON cache; wrap into a
        // Float32Array here for the BufferAttribute.
        if (m.vertexColors && m.faces) {
          body.setAttribute(
            "color",
            new BufferAttribute(new Float32Array(m.vertexColors), 3),
          );
        }

        const thisBody = body;
        const thisLines = lines;
        const thisColor = m.color;
        // Wire has edges but no faces — render as lines only
        const isWireType = !m.faces && !!m.edges;
        // If the color is keep out or glass make it transparent
        if (thisColor == "#D9544D" || thisColor == "#E6F3FF") {
          meshArray.push({
            body: thisBody,
            lines: thisLines,
            color: thisColor,
            solid: false,
            isWire: isWireType,
            hasVertexColors: !!m.vertexColors,
            rawFaces: m.faces || null,
            rawEdges: m.edges || null,
          });
        } else {
          meshArray.push({
            body: thisBody,
            lines: thisLines,
            color: thisColor,
            solid: isSolid,
            isWire: isWireType,
            hasVertexColors: !!m.vertexColors,
            rawFaces: m.faces || null,
            rawEdges: m.edges || null,
          });
        }
      });
      return meshArray;
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
        const meshArray = makeMeshes(m);
        const svg = await meshArrayToSVG2(meshArray);
        return svg;
      },
    }));
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
      // 1. Calculate bounding box of all geometry
      const boundingBox = new Box3();
      meshArray.forEach((m) => {
        if (m.lines && m.lines.attributes && m.lines.attributes.position) {
          const positions = m.lines.attributes.position.array;
          for (let i = 0; i < positions.length; i += 3) {
            boundingBox.expandByPoint(
              new Vector3(positions[i], positions[i + 1], positions[i + 2]),
            );
          }
        }
      });

      // Calculate bounding box dimensions
      const boxSize = new Vector3();
      boundingBox.getSize(boxSize);
      const boundingBoxDimensions = {
        width: boxSize.x,
        height: boxSize.y,
        depth: boxSize.z,
      };

      const zoomFromBounds = calculateZoom(
        boundingBoxDimensions.width,
        boundingBoxDimensions.height,
        boundingBoxDimensions.depth,
        9,
      );

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

      // 3. Project all points to 2D and collect for bounding box
      let allProjectedPoints = [];
      let svgPaths = [];
      meshArray.forEach((m) => {
        if (!m.lines) return;
        const positions = m.lines.attributes.position.array;
        let path = "";
        for (let i = 0; i < positions.length; i += 6) {
          // Project first point
          const v1 = new Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2],
          );
          v1.project(camera);
          const x1 = (v1.x * 0.5 + 0.5) * width;
          const y1 = (1 - (v1.y * 0.5 + 0.5)) * height;
          allProjectedPoints.push([x1, y1]);

          // Project second point
          const v2 = new Vector3(
            positions[i + 3],
            positions[i + 4],
            positions[i + 5],
          );
          v2.project(camera);
          const x2 = (v2.x * 0.5 + 0.5) * width;
          const y2 = (1 - (v2.y * 0.5 + 0.5)) * height;
          allProjectedPoints.push([x2, y2]);

          path += `M${x1},${y1} L${x2},${y2} `;
        }
        svgPaths.push(
          `<path d="${path.trim()}" stroke="${m.color}" fill="none"/>`,
        );
      });

      // 4. Compute bounding box and center
      if (allProjectedPoints.length === 0) {
        return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
      }
      const xs = allProjectedPoints.map((p) => p[0]);
      const ys = allProjectedPoints.map((p) => p[1]);
      const minX = Math.min(...xs),
        maxX = Math.max(...xs);
      const minY = Math.min(...ys),
        maxY = Math.max(...ys);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // 5. Shift all paths by center
      let centeredPaths = [];
      meshArray.forEach((m, idx) => {
        if (!m.lines) return;
        const positions = m.lines.attributes.position.array;
        let path = "";
        for (let i = 0; i < positions.length; i += 6) {
          // Project first point
          const v1 = new Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2],
          );
          v1.project(camera);
          const x1 = (v1.x * 0.5 + 0.5) * width - centerX + width / 2;
          const y1 = (1 - (v1.y * 0.5 + 0.5)) * height - centerY + height / 2;

          // Project second point
          const v2 = new Vector3(
            positions[i + 3],
            positions[i + 4],
            positions[i + 5],
          );
          v2.project(camera);
          const x2 = (v2.x * 0.5 + 0.5) * width - centerX + width / 2;
          const y2 = (1 - (v2.y * 0.5 + 0.5)) * height - centerY + height / 2;

          path += `M${x1},${y1} L${x2},${y2} `;
        }
        centeredPaths.push(
          /*`<path d="${path.trim()}" stroke="${
            m.color
          }" stroke-width="4" fill="none"/>`*/
          `<path d="${path.trim()}" stroke="black"  stroke-width="4"  fill="red"/>`,
        );
      });

      // 6. SVG viewBox centered at 0,0
      const svgWidth = maxX - minX;
      const svgHeight = maxY - minY;
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
          const perElement = selectionModeAtom?._perElementMeshes?.[index];

          // Build per-face BufferGeometries when in face-select mode
          const perFaceGeoms =
            isFaceMode && Array.isArray(perElement)
              ? perElement.map((entry) => {
                  const g = new BufferGeometry();
                  syncFaces(g, entry.faces);
                  return { index: entry.index, geom: g };
                })
              : null;

          // Build per-edge BufferGeometries when in edge-select mode
          const perEdgeGeoms =
            isEdgeMode && Array.isArray(perElement)
              ? perElement.map((entry) => {
                  const g = new BufferGeometry();
                  syncLines(g, entry.edges);
                  return { index: entry.index, geom: g };
                })
              : null;

          return (
            <group key={index}>
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
