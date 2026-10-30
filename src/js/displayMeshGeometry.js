/**
 * Three.js geometry for the mesh worker's display meshes.
 *
 * The worker meshes each stored shape once. Moved and rotated copies of it
 * arrive as parts that share the same `faces` / `edges` object and each carry
 * a `transform` ({position, quaternion} for an Object3D). Readers build one
 * geometry per shared mesh and place each part with its transform; a part
 * without one is already in place.
 */
import {
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

const asFloat32 = (values) =>
  values instanceof Float32Array ? values : new Float32Array(values);
const asUint32 = (values) =>
  values instanceof Uint32Array ? values : new Uint32Array(values);

/**
 * Geometry for worker faces. Typed arrays are used as they are, not copied;
 * plain arrays (atom meshOverrides) are converted.
 */
export function facesGeometry(faces) {
  const geometry = new BufferGeometry();
  geometry.setIndex(new BufferAttribute(asUint32(faces.triangles), 1));
  geometry.setAttribute(
    "position",
    new BufferAttribute(asFloat32(faces.vertices), 3),
  );
  if (faces.faceGroups) {
    geometry.userData.faceGroups = faces.faceGroups;
    faces.faceGroups.forEach(({ start, count }) =>
      geometry.addGroup(start, count, 0),
    );
  } else {
    geometry.addGroup(0, faces.triangles.length, 0);
  }
  if (faces.normals && faces.normals.length) {
    geometry.setAttribute(
      "normal",
      new BufferAttribute(asFloat32(faces.normals), 3),
    );
  } else {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  return geometry;
}

/** Line-segment geometry for worker edges. */
export function edgesGeometry(edges) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(asFloat32(edges.lines), 3),
  );
  if (edges.edgeGroups) {
    geometry.userData.edgeGroups = edges.edgeGroups;
    edges.edgeGroups.forEach(({ start, count }) =>
      geometry.addGroup(start, count, 0),
    );
  } else {
    geometry.addGroup(0, edges.lines.length / 3, 0);
  }
  return geometry;
}

/**
 * Builds geometry for each part of a worker mesh array, sharing it between
 * parts that share a mesh.
 *
 * Returns `{ parts, dispose }`. Each part is
 * `{ source, color, point, body, lines, isWire, hasVertexColors, transform }`
 * where `source` is the worker's part, `body` and `lines` are geometries
 * (null when absent) and `transform` is the part's placement or undefined.
 * Call `dispose()` once to free every geometry built.
 */
export function buildDisplayGeometries(meshes) {
  const bodies = new Map();
  const lineSets = new Map();
  const built = [];
  const keep = (geometry) => {
    built.push(geometry);
    return geometry;
  };

  const parts = (Array.isArray(meshes) ? meshes : []).map((m) => {
    if (m.point) {
      return {
        source: m,
        color: m.color,
        point: m.point,
        body: null,
        lines: null,
        isWire: false,
        hasVertexColors: false,
        transform: undefined,
      };
    }

    let body = null;
    if (m.faces) {
      if (m.vertexColors) {
        // Colours belong to this part alone, so its geometry isn't shared.
        body = keep(facesGeometry(m.faces));
        body.setAttribute(
          "color",
          new BufferAttribute(new Float32Array(m.vertexColors), 3),
        );
      } else {
        body = bodies.get(m.faces);
        if (!body) {
          body = keep(facesGeometry(m.faces));
          bodies.set(m.faces, body);
        }
      }
    }

    let lines = null;
    const lineSource = m.edges || m.faces;
    if (lineSource) {
      lines = lineSets.get(lineSource);
      if (!lines) {
        lines = keep(
          m.edges
            ? edgesGeometry(m.edges)
            : new EdgesGeometry(body, 2),
        );
        lineSets.set(lineSource, lines);
      }
    }

    return {
      source: m,
      color: m.color,
      point: null,
      body,
      lines,
      // Wire: edges but no faces, drawn as lines only
      isWire: !m.faces && !!m.edges,
      hasVertexColors: !!m.vertexColors,
      transform: m.transform,
    };
  });

  return {
    parts,
    dispose: () => built.forEach((geometry) => geometry.dispose()),
  };
}

/**
 * Props that place a part's three.js object, for spreading onto a
 * <group> / <mesh>: `{position, quaternion}`, or `{}` when it's in place.
 */
export function transformProps(transform) {
  return transform
    ? { position: transform.position, quaternion: transform.quaternion }
    : {};
}

/** Places an Object3D with a part's transform. Leaves it alone when absent. */
export function applyTransform(object, transform) {
  if (!transform) return object;
  object.position.fromArray(transform.position);
  object.quaternion.fromArray(transform.quaternion);
  return object;
}

/** A part's transform as a Matrix4, or null when it's already in place. */
export function transformMatrix(transform) {
  if (!transform) return null;
  return new Matrix4().compose(
    new Vector3().fromArray(transform.position),
    new Quaternion().fromArray(transform.quaternion),
    new Vector3(1, 1, 1),
  );
}
