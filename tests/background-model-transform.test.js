import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { prepareBackgroundModelScene } from '../src/components/render/backgroundModelTransform.js';

describe('prepareBackgroundModelScene', () => {
  it('preserves authored translation and composes authored rotation with Y-up to Z-up conversion', () => {
    const scene = new THREE.Group();
    scene.position.set(12.5, -7.25, 3.75);
    scene.rotation.set(0.31, -0.48, 0.22);

    const expected = scene.clone();
    expected.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);

    const prepared = prepareBackgroundModelScene(scene, undefined);

    expect(prepared.position.x).toBeCloseTo(12.5, 10);
    expect(prepared.position.y).toBeCloseTo(-7.25, 10);
    expect(prepared.position.z).toBeCloseTo(3.75, 10);

    expect(prepared.quaternion.x).toBeCloseTo(expected.quaternion.x, 10);
    expect(prepared.quaternion.y).toBeCloseTo(expected.quaternion.y, 10);
    expect(prepared.quaternion.z).toBeCloseTo(expected.quaternion.z, 10);
    expect(prepared.quaternion.w).toBeCloseTo(expected.quaternion.w, 10);

    expect(prepared.scale.x).toBeCloseTo(1, 10);
    expect(prepared.scale.y).toBeCloseTo(1, 10);
    expect(prepared.scale.z).toBeCloseTo(1, 10);
  });

  it('keeps unit scaling behavior intact for millimeters and inches', () => {
    const scene = new THREE.Group();

    const mmPrepared = prepareBackgroundModelScene(scene, 'MM');
    expect(mmPrepared.scale.x).toBeCloseTo(1000, 10);
    expect(mmPrepared.scale.y).toBeCloseTo(1000, 10);
    expect(mmPrepared.scale.z).toBeCloseTo(1000, 10);

    const inchPrepared = prepareBackgroundModelScene(scene, 'Inches');
    expect(inchPrepared.scale.x).toBeCloseTo(39.3701, 10);
    expect(inchPrepared.scale.y).toBeCloseTo(39.3701, 10);
    expect(inchPrepared.scale.z).toBeCloseTo(39.3701, 10);
  });
});
