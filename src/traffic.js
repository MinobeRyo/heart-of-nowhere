import * as THREE from 'three';
import { STREET } from './scale.js';

export const TRAFFIC_CYCLE_SECONDS = 44;

// Deliberate clearance intervals make the empty junctions feel alive without
// ever showing green to the two intersecting streams at the same time.
export function getTrafficPhase(time, offset = 0) {
  const t = ((time + offset) % TRAFFIC_CYCLE_SECONDS + TRAFFIC_CYCLE_SECONDS) % TRAFFIC_CYCLE_SECONDS;
  if (t < 17) return { boulevard: 'green', crossStreet: 'red', pedestrian: 'red' };
  if (t < 20) return { boulevard: 'amber', crossStreet: 'red', pedestrian: 'red' };
  if (t < 22) return { boulevard: 'red', crossStreet: 'red', pedestrian: 'red' };
  if (t < 37) return { boulevard: 'red', crossStreet: 'green', pedestrian: 'green' };
  if (t < 40) return { boulevard: 'red', crossStreet: 'amber', pedestrian: 'red' };
  return { boulevard: 'red', crossStreet: 'red', pedestrian: 'red' };
}

export function createTrafficSignals(scene, { box, solid, mats, intersections }) {
  const groups = [];
  const instanceBatches = new Map();
  const dummy = new THREE.Object3D();
  const signalColors = { red: '#ff3a36', amber: '#ffc748', green: '#45f5bc' };
  const shell = new THREE.MeshStandardMaterial({ color: '#18212a', roughness: .58, metalness: .55, side: THREE.DoubleSide });
  const postGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  const lensGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
  const hoodGeometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, Math.PI / 2, Math.PI);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  function instance(geometry, material, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const key = `${geometry.id}:${material.id}`;
    if (!instanceBatches.has(key)) instanceBatches.set(key, { geometry, material, transforms: [] });
    instanceBatches.get(key).transforms.push({ x, y, z, sx, sy, sz, rx, ry, rz });
  }

  function lampMaterials() {
    return Object.fromEntries(Object.entries(signalColors).map(([name, color]) => [name,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .015, roughness: .24, metalness: .12 }),
    ]));
  }

  function setLamp(material, on) {
    material.color.setScalar(on ? .45 : .045);
    material.emissiveIntensity = on ? 4.8 : .025;
  }

  // Local x runs across a signal's face; local +z faces approaching traffic.
  function vehicleHead(x, y, z, rotation, lamps, scale = 1) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const point = (lx, ly, lz) => [x + cos * lx + sin * lz, y + ly, z - sin * lx + cos * lz];
    box(x, y, z, 2.42 * scale, .91 * scale, .37 * scale, mats.dark, rotation);
    box(...point(0, 0, -.025 * scale), 2.63 * scale, 1.07 * scale, .08 * scale, mats.metal, rotation);
    box(...point(0, -.5 * scale, 0), 2.42 * scale, .055 * scale, .38 * scale, mats.trim, rotation);
    for (const [index, name] of ['red', 'amber', 'green'].entries()) {
      const lx = (index - 1) * .76 * scale;
      instance(lensGeometry, shell, ...point(lx, 0, .213 * scale), .303 * scale, .07 * scale, .303 * scale, Math.PI / 2, 0, -rotation);
      instance(lensGeometry, lamps[name], ...point(lx, 0, .259 * scale), .239 * scale, .026 * scale, .239 * scale, Math.PI / 2, 0, -rotation);
      instance(hoodGeometry, shell, ...point(lx, .014 * scale, .39 * scale), .278 * scale, .34 * scale, .278 * scale, Math.PI / 2, 0, -rotation);
    }
  }

  function pedestrianHead(x, y, z, rotation, lamps, scale = .82) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const point = (lx, ly, lz) => [x + (cos * lx + sin * lz) * scale, y + ly * scale, z + (-sin * lx + cos * lz) * scale];
    box(x, y, z, .77 * scale, 1.63 * scale, .32 * scale, mats.dark, rotation);
    for (const height of [-.39, .39]) {
      box(...point(0, height, .172), .64 * scale, .69 * scale, .025 * scale, mats.rubber, rotation);
      box(...point(0, height + .36, .26), .78 * scale, .045 * scale, .38 * scale, mats.metal, rotation);
    }
    function bar(x1, y1, x2, y2, material, width = .068) {
      const dx = x2 - x1, dy = y2 - y1;
      const center = point((x1 + x2) / 2, (y1 + y2) / 2, .196);
      // Euler Y then Z follows the same face transform as the housing.
      instance(unitBox, material, ...center, width * scale, Math.hypot(dx, dy) * scale, .021 * scale, 0, rotation, -Math.atan2(dx, dy));
    }
    function head(lx, ly, material) {
      instance(lensGeometry, material, ...point(lx, ly, .2), .066 * scale, .023 * scale, .066 * scale, Math.PI / 2, 0, -rotation);
    }
    // Standing figure: head, torso, arms, and separated legs.
    head(0, .61, lamps.red);
    bar(0, .50, 0, .28, lamps.red, .095);
    bar(-.12, .47, -.12, .28, lamps.red, .055);
    bar(.12, .47, .12, .28, lamps.red, .055);
    bar(-.045, .29, -.06, .13, lamps.red);
    bar(.045, .29, .06, .13, lamps.red);
    // Walking figure with a diagonal torso and a clearly split stride.
    head(.045, -.17, lamps.green);
    bar(.025, -.27, -.035, -.45, lamps.green, .087);
    bar(.015, -.30, .16, -.37, lamps.green, .057);
    bar(-.015, -.30, -.15, -.41, lamps.green, .057);
    bar(-.035, -.43, .15, -.62, lamps.green);
    bar(-.035, -.43, -.19, -.61, lamps.green);
  }

  for (const { z, offset = 0 } of intersections) {
    const boulevard = lampMaterials(), crossStreet = lampMaterials(), pedestrian = lampMaterials();
    const state = { boulevard, crossStreet, pedestrian, offset, last: '' };
    groups.push(state);
    for (const side of [-1, 1]) {
      const poleX = side * STREET.signalPoleX, poleZ = z + side * 5.8;
      // Narrow cylindrical poles and small footings leave the pavement passable.
      instance(postGeometry, mats.metal, poleX, 3.35, poleZ, .115, 6.7, .115);
      instance(postGeometry, mats.dark, poleX, .15, poleZ, .235, .30, .235);
      box(poleX, .49, poleZ, .23, .18, .23, mats.roadmark);
      solid(poleX, 3.35, poleZ, .30, 6.7, .30, false);
      box(side * (STREET.signalPoleX + STREET.signalHeadX) / 2, 6.48, poleZ, STREET.signalPoleX - STREET.signalHeadX + .2, .16, .16, mats.metal);
      box(side * STREET.signalHeadX, 6.21, poleZ, .13, .55, .13, mats.metal);
      box(poleX, 5.18, poleZ, .20, .08, .20, mats.trim);
      vehicleHead(side * STREET.signalHeadX, 5.6, poleZ, side > 0 ? 0 : Math.PI, boulevard, .75);
      vehicleHead(poleX, 4.69, poleZ, side * Math.PI / 2, crossStreet, .72);
      pedestrianHead(poleX - side * .26, 2.9, poleZ, -side * Math.PI / 2, pedestrian);
      // The far end of each zebra crossing needs its own inward-facing head.
      const farPoleZ = z - side * 5.8;
      instance(postGeometry, mats.metal, poleX, 1.825, farPoleZ, .095, 3.65, .095);
      instance(postGeometry, mats.dark, poleX, .13, farPoleZ, .205, .26, .205);
      box(poleX, .49, farPoleZ, .20, .18, .20, mats.roadmark);
      solid(poleX, 1.825, farPoleZ, .26, 3.65, .26, false);
      pedestrianHead(poleX - side * .24, 2.9, farPoleZ, -side * Math.PI / 2, pedestrian);
      // A small weatherproof controller and conduits add recognizable infrastructure.
      box(poleX + side * .24, 1.27, poleZ, .26, .54, .36, mats.metal);
      box(poleX + side * .39, 1.27, poleZ, .014, .43, .25, mats.trim);
    }
  }

  for (const { geometry, material, transforms } of instanceBatches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.rx, t.ry, t.rz);
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  function update(time) {
    for (const group of groups) {
      const phase = getTrafficPhase(time, group.offset);
      const key = `${phase.boulevard}/${phase.crossStreet}/${phase.pedestrian}`;
      if (key === group.last) continue;
      group.last = key;
      for (const name of ['red', 'amber', 'green']) {
        setLamp(group.boulevard[name], phase.boulevard === name);
        setLamp(group.crossStreet[name], phase.crossStreet === name);
        setLamp(group.pedestrian[name], phase.pedestrian === name);
      }
    }
  }
  update(0);
  return { update };
}
