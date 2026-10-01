export const TOL_F64: number = 1e-9;
export const TOL_F32: number = 1e-4;

export const NFP_KEY_INDICES: Uint8Array = new Uint8Array([0, 10, 19, 23, 27, 32]);

export const NFP_INFO_START_INDEX: number = 2;

// sin and cos for whole-degree angles. The angles the genetic algorithm picks are
// whole degrees (Math.round(i * 360 / rotations)), and every one has to rotate by
// exactly that many degrees, because that is the rotation applied to the real part
// afterwards. This used to be filled per rotation split with the radian angle of the
// split step, so 330 degrees (claimed first by the 11-way split as 10 * 33) was
// stored as 327.3 degrees, and parts nested at 330 overlapped once laid out.
function getAngleCache() {
    const result = new Map<number, Float32Array>();
    let angle: number = 0;
    let radianAngle: number = 0;

    for (angle = 0; angle < 360; ++angle) {
        radianAngle = (angle * Math.PI) / 180;
        result.set(angle, new Float32Array([Math.sin(radianAngle), Math.cos(radianAngle)]));
    }

    return result;
}

export const ANGLE_CACHE: Map<number, Float32Array> = getAngleCache();
