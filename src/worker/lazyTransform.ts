/**
 * Moves and rotations are cheap to compute but each one used to store a full
 * copy of the shape in the cache. Instead they are applied lazily: the
 * GeometryProvider returns an id naming the untransformed shape (the base) and
 * the rigid transform to apply to it, and nothing is stored. The transform is
 * applied when the shape is loaded (GeometryProvider.get), which is when an
 * operation, the mesher or an export actually needs it.
 *
 * A transformed id looks like
 *
 *   xf|<qw>,<qx>,<qy>,<qz>|<tx>,<ty>,<tz>|<base id>
 *
 * where q is a unit quaternion for the rotation, applied first and about the
 * origin, and t is the translation applied after it. The base id goes last so
 * it can contain any characters.
 *
 * Transforming an id that is already transformed composes the two transforms
 * onto the same base, so the base of a transformed id is never itself
 * transformed and loading one takes a single step. Composing also means
 * equivalent chains of moves and rotations share one id (and every result
 * computed from it), and a chain that cancels out gives back the base id.
 */

type Quaternion = [number, number, number, number];
type Vec3 = [number, number, number];

/** Rotate by `rotation` about the origin, then translate by `translation`. */
type RigidTransform = { rotation: Quaternion; translation: Vec3 };

type TransformedId = { base: string; transform: RigidTransform };

const PREFIX = "xf|";
const IDENTITY_ROTATION: Quaternion = [1, 0, 0, 0];

// Values that are float noise away from a round number are snapped to it, so
// that ids are stable: moving by 0.1 then 0.2 gives the same id as moving by
// 0.3, and four quarter turns give back the base id. Anything else is kept
// exactly. Rounding it would move the shape slightly, and replicad's 2D
// booleans fail ("Point ... not on curve") when edges that should coincide are
// even 1e-10 apart.
const ROTATION_DECIMALS = 1e12;
const TRANSLATION_DECIMALS = 1e9;
// A few units in the last place, relative to the value.
const NOISE = 8 * Number.EPSILON;

function round(value: number, decimals: number): number {
  const rounded = Math.round(value * decimals) / decimals;
  const snapped =
    Math.abs(value - rounded) <= NOISE * Math.max(1, Math.abs(value))
      ? rounded
      : value;
  return snapped === 0 ? 0 : snapped; // no "-0" in ids
}

function multiply(a: Quaternion, b: Quaternion): Quaternion {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function rotateVector(q: Quaternion, v: Vec3): Vec3 {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  // v + 2w(u × v) + 2u × (u × v), with u the vector part of q
  const cx = y * vz - z * vy;
  const cy = z * vx - x * vz;
  const cz = x * vy - y * vx;
  return [
    vx + 2 * (w * cx + y * cz - z * cy),
    vy + 2 * (w * cy + z * cx - x * cz),
    vz + 2 * (w * cz + x * cy - y * cx),
  ];
}

/** Normalizes and rounds a transform so equal transforms print the same. */
function canonical(transform: RigidTransform): RigidTransform {
  let [w, x, y, z] = transform.rotation;
  const length = Math.hypot(w, x, y, z);
  // q and -q are the same rotation; keep the one with w >= 0.
  const sign = w < 0 ? -1 / length : 1 / length;
  [w, x, y, z] = [w, x, y, z].map((c) => round(c * sign, ROTATION_DECIMALS));
  const translation = transform.translation.map((c) =>
    round(c, TRANSLATION_DECIMALS),
  ) as Vec3;
  return { rotation: [w, x, y, z], translation };
}

function isIdentity(transform: RigidTransform): boolean {
  const [w, x, y, z] = transform.rotation;
  const [tx, ty, tz] = transform.translation;
  return w === 1 && x === 0 && y === 0 && z === 0 && !tx && !ty && !tz;
}

/** The transform that applies `first` and then `second`. */
function compose(
  first: RigidTransform,
  second: RigidTransform,
): RigidTransform {
  const moved = rotateVector(second.rotation, first.translation);
  return {
    rotation: multiply(second.rotation, first.rotation),
    translation: [
      moved[0] + second.translation[0],
      moved[1] + second.translation[1],
      moved[2] + second.translation[2],
    ],
  };
}

function translation(dx: number, dy: number, dz: number): RigidTransform {
  return { rotation: IDENTITY_ROTATION, translation: [dx, dy, dz] };
}

/**
 * Rotation by x, y and z degrees about the X, Y and Z axes through the
 * origin, in that order, as GeometryProvider.rotate has always applied them.
 */
function rotationXYZ(x: number, y: number, z: number): RigidTransform {
  const about = (axis: 0 | 1 | 2, degrees: number): Quaternion => {
    const half = (degrees * Math.PI) / 360;
    const q: Quaternion = [Math.cos(half), 0, 0, 0];
    q[axis + 1] = Math.sin(half);
    return q;
  };
  const rotation = multiply(about(2, z), multiply(about(1, y), about(0, x)));
  return { rotation, translation: [0, 0, 0] };
}

/** The base and transform of a transformed id, or undefined for any other id. */
function parseTransformedId(id: string): TransformedId | undefined {
  if (!id.startsWith(PREFIX)) {
    return undefined;
  }
  const rotationEnd = id.indexOf("|", PREFIX.length);
  const translationEnd = id.indexOf("|", rotationEnd + 1);
  const rotation = id.slice(PREFIX.length, rotationEnd).split(",").map(Number);
  const translation = id
    .slice(rotationEnd + 1, translationEnd)
    .split(",")
    .map(Number);
  if (
    rotationEnd < 0 ||
    translationEnd < 0 ||
    rotation.length !== 4 ||
    translation.length !== 3 ||
    [...rotation, ...translation].some((c) => !Number.isFinite(c))
  ) {
    throw new Error("Malformed transformed geometry id: " + id);
  }
  return {
    base: id.slice(translationEnd + 1),
    transform: {
      rotation: rotation as Quaternion,
      translation: translation as Vec3,
    },
  };
}

/**
 * The id of the shape `id` names with `transform` applied after any transform
 * it already has. Returns the base id when the result is no transform at all.
 */
function transformId(id: string, transform: RigidTransform): string {
  const existing = parseTransformedId(id);
  const base = existing ? existing.base : id;
  const total = canonical(
    existing ? compose(existing.transform, transform) : transform,
  );
  if (isIdentity(total)) {
    return base;
  }
  return `${PREFIX}${total.rotation.join(",")}|${total.translation.join(",")}|${base}`;
}

/**
 * The shape ids that must be kept in the cache for `id` to load: the base of
 * a transformed id, or the id itself.
 */
function storedId(id: string): string {
  return parseTransformedId(id)?.base ?? id;
}

export {
  RigidTransform,
  TransformedId,
  parseTransformedId,
  rotationXYZ,
  storedId,
  transformId,
  translation,
};
