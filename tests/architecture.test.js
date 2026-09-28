import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingVolumes, createArchitecture } from '../src/architecture.js';
import { Player } from '../src/physics.js';

test('setbacks stay within the lot and form connected terraces at full building height', () => {
  for (let i = 0; i < 12; i++) {
    const tiers = buildingVolumes(28, 30, 24, 32, 39, i, true);
    assert.equal(tiers[0].bottom, 0);
    assert.equal(tiers.at(-1).top, 39);
    for (const [j, t] of tiers.entries()) {
      assert.ok(t.x - t.w / 2 >= 16 && t.x + t.w / 2 <= 40);
      assert.ok(t.z - t.d / 2 >= 14 && t.z + t.d / 2 <= 46);
      assert.ok(t.top > t.bottom);
      if (j) {
        const below = tiers[j - 1];
        assert.equal(t.bottom, below.top);
        assert.ok(Math.abs(t.x - below.x) + t.w / 2 <= below.w / 2);
        assert.ok(Math.abs(t.z - below.z) + t.d / 2 <= below.d / 2);
      }
    }
  }
});

test('a player can walk beneath the skybridge and land on its roof', () => {
  const colliders = [];
  const solid = (x, y, z, w, h, d) => colliders.push({minX:x-w/2,maxX:x+w/2,minY:y-h/2,maxY:y+h/2,minZ:z-d/2,maxZ:z+d/2,climbable:true});
  createArchitecture({box:()=>{},solid,mats:{}}).passage({x:0,z:0,axis:'z',width:6,depth:4},0);
  const p = new Player(colliders);
  p.position = {x:0,y:0,z:6};
  for (let i = 0; i < 120; i++) p.step(1/120,{forward:true},0);
  assert.ok(p.position.z < -2, 'bridge must not seal the lane at ground level');
  p.position = {x:0,y:14,z:0}; p.velocity = {x:0,y:0,z:0};
  for (let i = 0; i < 180; i++) p.step(1/120,{},0);
  assert.ok(p.grounded && Math.abs(p.position.y - 10) < .1, 'bridge rooftop should support the player');
});

test('every stepped facade leaves enough room to mantle onto its terraces', () => {
  // Include narrow lots: a decorative inset used to stop climbing below 6.5 m
  // because the next floor occupied the controller's entire landing space.
  for (const [w, d] of [[9, 9], [12, 20], [14, 14], [24, 32]]) {
    for (const index of [1, 2]) {
      const tiers = buildingVolumes(28, 30, w, d, 35, index, true);
      const colliders = tiers.map(t => ({
        minX:t.x-t.w/2,maxX:t.x+t.w/2,minY:t.bottom,maxY:t.top,
        minZ:t.z-t.d/2,maxZ:t.z+t.d/2,climbable:true,
      }));
      for (let level = 0; level < tiers.length - 1; level++) {
        const t = tiers[level], box = colliders[level];
        for (const [nx, nz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const p = new Player(colliders);
          p.position = {
            x:t.x+nx*(t.w/2+.85),y:t.top-2,z:t.z+nz*(t.d/2+.85),
          };
          const label = `${w}×${d}, variant ${index}, tier ${level}, face ${nx}/${nz}`;
          assert.ok(p.startMantle({box,nx,nz}), `Blocked terrace approach: ${label}`);
          for (let step = 0; step < 42; step++) p.step(1/120, {}, 0);
          assert.equal(p.mantle, null, `Mantle did not finish: ${label}`);
          assert.ok(Math.abs(p.position.y-t.top)<.05, `Player fell off terrace: ${label}`);
          assert.ok(p.canOccupy(p.position), `Player overlaps the next floor: ${label}`);
        }
      }
    }
  }
});
