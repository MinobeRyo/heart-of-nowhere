import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAlleyLayout, WORLD_BOUNDS } from '../src/layout.js';

test('winding lanes stay clear across all expanded districts',()=>{
  const {footprints,lanes}=createAlleyLayout();
  for(const lane of lanes){
    const dx=lane.to.x-lane.from.x,dz=lane.to.z-lane.from.z;
    const steps=Math.ceil(Math.hypot(dx,dz));
    for(let i=0;i<=steps;i++){
      const x=lane.from.x+dx*i/steps,z=lane.from.z+dz*i/steps;
      const blocker=footprints.find(b=>Math.abs(b.x-x)<b.w/2+.4&&Math.abs(b.z-z)<b.d/2+.4);
      assert.equal(blocker,undefined,`Lane blocked at ${x}, ${z}`);
    }
  }
});
test('all new buildings fit inside the playable city bounds',()=>{
  for(const b of createAlleyLayout().footprints){
    assert.ok(b.x-b.w/2>WORLD_BOUNDS.minX&&b.x+b.w/2<WORLD_BOUNDS.maxX);
    assert.ok(b.z-b.d/2>WORLD_BOUNDS.minZ&&b.z+b.d/2<WORLD_BOUNDS.maxZ);
  }
});
