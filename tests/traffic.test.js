import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getTrafficPhase, createTrafficSignals, TRAFFIC_CYCLE_SECONDS } from '../src/traffic.js';
import { STREET } from '../src/scale.js';

test('traffic has amber and all-red clearance between the two green phases', () => {
  assert.deepEqual(getTrafficPhase(0), { boulevard: 'green', crossStreet: 'red', pedestrian: 'red' });
  assert.equal(getTrafficPhase(16.999).boulevard, 'green');
  assert.equal(getTrafficPhase(17).boulevard, 'amber');
  assert.deepEqual(getTrafficPhase(20), { boulevard: 'red', crossStreet: 'red', pedestrian: 'red' });
  assert.deepEqual(getTrafficPhase(22), { boulevard: 'red', crossStreet: 'green', pedestrian: 'green' });
  assert.equal(getTrafficPhase(36.999).crossStreet, 'green');
  assert.equal(getTrafficPhase(37).crossStreet, 'amber');
  assert.equal(getTrafficPhase(37).pedestrian, 'red');
  assert.deepEqual(getTrafficPhase(40), { boulevard: 'red', crossStreet: 'red', pedestrian: 'red' });
});

test('traffic cycles wrap continuously and intersection offsets select the same timeline', () => {
  for (const t of [0, 16.999, 17, 20, 22, 36.999, 37, 40, 43.999]) {
    assert.deepEqual(getTrafficPhase(t), getTrafficPhase(t + TRAFFIC_CYCLE_SECONDS));
    assert.deepEqual(getTrafficPhase(t), getTrafficPhase(t - TRAFFIC_CYCLE_SECONDS));
    assert.deepEqual(getTrafficPhase(t, 11), getTrafficPhase(t + 11));
  }
});

test('conflicting traffic never receives green and crossing pedestrians always have a red boulevard', () => {
  for (let t = -50; t < 100; t += .125) {
    const phase = getTrafficPhase(t, 8.5);
    assert.ok(!(phase.boulevard === 'green' && phase.crossStreet === 'green'));
    if (phase.pedestrian === 'green') assert.equal(phase.boulevard, 'red');
  }
});

test('signal geometry stays finite and only narrow pole colliders occupy pavements', () => {
  const scene = new THREE.Scene(), boxes = [], colliders = [];
  const mat = new THREE.MeshStandardMaterial();
  const signals = createTrafficSignals(scene, {
    box: (...args) => boxes.push(args),
    solid: (...args) => colliders.push(args),
    mats: { metal: mat, dark: mat, trim: mat, rubber: mat, roadmark: mat },
    intersections: [{ z: 39, offset: 0 }, { z: -10, offset: 12 }],
  });
  assert.equal(colliders.length, 8);
  for (const crossing of [39, -10]) for (const x of [-STREET.signalPoleX, STREET.signalPoleX]) for (const direction of [-1, 1]) {
    assert.ok(colliders.some(p => p[0] === x && Math.abs(p[2] - (crossing + direction * 5.8)) < 1e-6), 'each crosswalk needs a signal at both ends');
  }
  for (const [x, , , w, , d, climbable] of colliders) {
    assert.equal(Math.abs(x), STREET.signalPoleX);
    assert.ok(Math.abs(x) - w / 2 > STREET.curbX, 'signal poles sit beyond the curb');
    assert.ok(w <= .3 && d <= .3);
    assert.equal(climbable, false);
  }
  const boulevardHeads = boxes.filter(p => p[1] === 5.6 && p[4] === .91 * .75);
  assert.equal(boulevardHeads.length, 4);
  for (const [x, , , width] of boulevardHeads) {
    assert.equal(Math.abs(x), STREET.signalHeadX);
    assert.ok(Math.abs(x) + width / 2 < STREET.roadHalfWidth, 'overhead signal heads stay above the roadway');
    assert.equal(width, 2.42 * .75);
  }
  const pedestrianHeads = boxes.filter(p => p[1] === 2.9 && p[4] === 1.63 * .82);
  assert.equal(pedestrianHeads.length, 8);
  assert.ok(colliders.filter(p => p[4] === 3.65).length === 4);
  for (const args of boxes) assert.ok(args.slice(0, 6).every(Number.isFinite));
  for (const mesh of scene.children) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
  }
  signals.update(22);
  signals.update(37);
  signals.update(44);
});
