import * as THREE from 'three';
import { STREET } from './scale.js';

// Quiet signs of an inhabited city. The repeated hardware shares instance pools;
// painted signs use one atlas rather than individual glowing sign materials.
export function createStreetDetails(scene, { box, solid, mats, intersections = [] }) {
  const signX = STREET.curbX + .95;
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const cylinderPools = new Map();
  const dummy = new THREE.Object3D();
  const fadedRed = new THREE.MeshStandardMaterial({ color: '#8d4c45', roughness: .86, metalness: .35 });
  const cabinetPaint = new THREE.MeshStandardMaterial({ color: '#627476', roughness: .79, metalness: .35 });
  const safetyPaint = new THREE.MeshStandardMaterial({ color: '#a29972', roughness: .86 });
  const glass = new THREE.MeshStandardMaterial({ color: '#6f919c', transparent: true, opacity: .23, roughness: .26, metalness: .1, depthWrite: false, side: THREE.DoubleSide });
  const cylinders = (x, y, z, radius, height, mat, rz = 0) => {
    if (!cylinderPools.has(mat)) cylinderPools.set(mat, []);
    cylinderPools.get(mat).push({ x, y, z, radius, height, rz });
  };

  const atlas = document.createElement('canvas');
  atlas.width = 1024; atlas.height = 256;
  const ctx = atlas.getContext('2d');
  const white = '#cbd1c9', blue = '#354d61';
  for (let tile = 0; tile < 4; tile++) {
    ctx.save(); ctx.translate(tile * 256, 0);
    ctx.fillStyle = '#1f2e3a'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#78868c'; ctx.lineWidth = 5; ctx.strokeRect(9, 9, 238, 238);
    if (tile === 0) {
      ctx.fillStyle = blue; ctx.fillRect(15, 15, 226, 226);
      ctx.fillStyle = white;
      ctx.beginPath(); ctx.moveTo(48, 105); ctx.lineTo(151, 105); ctx.lineTo(151, 66);
      ctx.lineTo(222, 128); ctx.lineTo(151, 190); ctx.lineTo(151, 151); ctx.lineTo(48, 151); ctx.closePath(); ctx.fill();
    } else if (tile === 1) {
      ctx.fillStyle = '#94534e'; ctx.beginPath(); ctx.arc(128, 128, 95, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = white; ctx.lineWidth = 8; ctx.stroke();
      ctx.fillStyle = white; ctx.fillRect(58, 111, 140, 34);
    } else if (tile === 2) {
      ctx.fillStyle = blue; ctx.fillRect(15, 15, 226, 226);
      ctx.fillStyle = white; ctx.font = 'bold 170px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('P', 128, 190);
    } else {
      ctx.fillStyle = '#b7beb4'; ctx.fillRect(18, 18, 220, 220);
      ctx.fillStyle = blue; ctx.fillRect(29, 28, 198, 47);
      ctx.fillStyle = '#d1d5c9'; ctx.fillRect(104, 34, 48, 28);
      ctx.fillStyle = blue; ctx.fillRect(109, 38, 15, 13); ctx.fillRect(131, 38, 15, 13);
      ctx.beginPath(); ctx.arc(114, 64, 5, 0, Math.PI * 2); ctx.arc(142, 64, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7b8b86';
      for (let row = 0; row < 7; row++) {
        ctx.fillRect(32, 92 + row * 17, 32, 5);
        for (let col = 0; col < 4; col++) ctx.fillRect(81 + col * 35, 92 + row * 17, 23, 3);
      }
      // A faded little route map beneath the bus pictogram.
      ctx.strokeStyle = '#8c6259'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(33, 221); ctx.lineTo(107, 221); ctx.lineTo(127, 209); ctx.lineTo(219, 209); ctx.stroke();
    }
    // Sun-bleached edge and small scratches survive under the street lights.
    ctx.fillStyle = '#ccd0bd33'; ctx.fillRect(21, 24, 46, 2); ctx.fillRect(176, 225, 35, 2);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(atlas); texture.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map: texture, roughness: .72, metalness: .12, side: THREE.DoubleSide });
  const signGeometries = Array.from({ length: 4 }, (_, tile) => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * .98 + tile + .01) / 4);
    return geometry;
  });
  const signPools = [[], [], [], []];
  const sign = (tile, x, y, z, width, height, rotation = 0) => {
    box(x, y, z, width + .08, height + .08, .075, mats.metal, rotation);
    signPools[tile].push({ x: x + Math.sin(rotation) * .043, y, z: z + Math.cos(rotation) * .043, width, height, rotation });
  };
  const post = (x, z, height) => {
    cylinders(x, height / 2, z, .055, height, mats.paint);
    box(x, .1, z, .27, .2, .27, mats.dark);
  };

  // The sign faces alternate with the travel direction of the avenue.
  intersections.forEach((crossing, i) => {
    const z = typeof crossing === 'number' ? crossing : crossing.z;
    for (const side of [-1, 1]) {
      const x = side * signX, signZ = z + side * 10.1;
      post(x, signZ, 3.5);
      sign(i % 3 === 1 ? 1 : 0, x, 3.07, signZ, .78, .78, side < 0 ? 0 : Math.PI);
      box(x, 2.45, signZ, .58, .22, .055, mats.paper, side < 0 ? 0 : Math.PI);
    }
  });

  // Short rails divide the walkways from parking, leaving both ends open.
  for (const [side, start, end] of [[-1, -82, -74], [-1, 4, 12], [1, -33, -25], [1, 99, 107]]) {
    const x = side * (STREET.curbX + .4);
    for (let z = start; z <= end; z += 2) {
      cylinders(x, .49, z, .055, .98, mats.paint);
      box(x, .07, z, .23, .13, .23, mats.dark);
    }
    box(x, .84, (start + end) / 2, .075, .095, end - start, mats.paint);
    box(x, .4, (start + end) / 2, .05, .06, end - start, mats.metal);
    for (const z of [start, end]) box(x - side * .05, .84, z, .025, .12, .25, safetyPaint);
    solid(x, .49, (start + end) / 2, .23, .98, end - start + .25, false);
  }

  for (const [side, z] of [[-1, 72], [1, -43], [-1, -100]]) {
    const x = side * (STREET.curbX + .5);
    cylinders(x, .14, z, .25, .28, mats.dark);
    cylinders(x, .58, z, .18, .8, fadedRed);
    cylinders(x, .98, z, .23, .13, fadedRed);
    cylinders(x, 1.07, z, .16, .08, mats.metal);
    cylinders(x, .69, z, .1, .67, fadedRed, Math.PI / 2);
    for (const end of [-1, 1]) cylinders(x + end * .35, .69, z, .13, .09, mats.metal, Math.PI / 2);
    box(x, .79, z + .184, .16, .08, .018, safetyPaint);
    solid(x, .555, z, .79, 1.11, .5, false);
  }

  // Service cabinets have separate doors, vents, handles and concrete plinths.
  for (const [side, z] of [[1, 8], [-1, -84], [1, 111]]) {
    const x = side * 15.03;
    box(x, .1, z, .82, .2, 1.2, mats.sidewalk);
    box(x, .79, z, .62, 1.38, 1.05, cabinetPaint);
    box(x, 1.51, z, .73, .12, 1.16, mats.metal);
    const front = x - side * .32;
    box(front, .81, z, .02, 1.13, .87, mats.metal);
    box(front - side * .015, .81, z, .02, 1.06, .8, cabinetPaint);
    for (let y = 1.01; y < 1.3; y += .065) box(front - side * .03, y, z, .022, .024, .58, mats.dark);
    box(front - side * .045, .74, z + .28, .045, .15, .055, mats.dark);
    box(front - side * .03, .51, z - .18, .025, .15, .18, safetyPaint);
    solid(x, .785, z, .82, 1.57, 1.2);
  }

  for (const [side, z] of [[1, 60], [1, 66], [-1, -28], [-1, -34], [1, -91]]) {
    const x = side * (STREET.curbX + .85);
    cylinders(x, .66, z, .048, 1.32, mats.paint);
    box(x, 1.36, z, .23, .42, .19, mats.metal);
    box(x, 1.47, z + .104, .16, .1, .025, mats.glass);
    box(x, 1.32, z + .107, .1, .03, .027, mats.dark);
    box(x, 1.19, z + .107, .11, .065, .025, mats.rust);
    box(x, .07, z, .23, .14, .23, mats.dark);
  }
  post(signX, 54, 3.13); sign(2, signX, 2.82, 54, .62, .69);
  post(-signX, -24, 3.13); sign(2, -signX, 2.82, -24, .62, .69, Math.PI);

  // The existing shelter gains a glass rear wall, a windscreen and a timetable.
  box(-15.32, 1.72, 24, .055, 2.84, 5.7, glass);
  box(-14.2, 1.72, 21.15, 2.25, 2.84, .055, glass);
  for (const z of [21.15, 24, 26.85]) box(-15.37, 1.72, z, .08, 3.02, .08, mats.metal);
  box(-15.28, 1.01, 24, .025, .08, 5.58, mats.paper);
  solid(-15.32, 1.72, 24, .055, 2.84, 5.7, false);
  solid(-14.2, 1.72, 21.15, 2.25, 2.84, .055, false);
  post(-12.95, 24, 2.75);
  sign(3, -12.95, 2.05, 24, .68, 1.13, Math.PI / 2);
  box(-12.95, .17, 24, .44, .33, .44, mats.dark);

  for (const [mat, items] of cylinderPools) {
    const mesh = new THREE.InstancedMesh(cylinderGeometry, mat, items.length);
    items.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z); dummy.rotation.set(0, 0, item.rz);
      dummy.scale.set(item.radius, item.height, item.radius); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingSphere(); scene.add(mesh);
  }
  signPools.forEach((items, tile) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(signGeometries[tile], signMat, items.length);
    items.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z); dummy.rotation.set(0, item.rotation, 0);
      dummy.scale.set(item.width, item.height, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingSphere(); scene.add(mesh);
  });
  return {};
}
