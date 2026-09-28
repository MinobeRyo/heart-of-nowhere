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
test('back alleys retain their full walking width through every turn',()=>{
  const {footprints,lanes}=createAlleyLayout();
  assert.ok(lanes.some(l=>l.kind==='back-alley'&&l.width<4));
  for(const lane of lanes){
    const alongX=lane.from.x!==lane.to.x,half=lane.width/2;
    const x0=Math.min(lane.from.x,lane.to.x)-(alongX?0:half);
    const x1=Math.max(lane.from.x,lane.to.x)+(alongX?0:half);
    const z0=Math.min(lane.from.z,lane.to.z)-(alongX?half:0);
    const z1=Math.max(lane.from.z,lane.to.z)+(alongX?half:0);
    const blocker=footprints.find(b=>b.x+b.w/2>x0&&b.x-b.w/2<x1&&b.z+b.d/2>z0&&b.z-b.d/2<z1);
    assert.equal(blocker,undefined,`Lane width obstructed: ${JSON.stringify(lane)}`);
  }
});
test('every alley connects to the other districts on its side of the boulevard',()=>{
  const {lanes}=createAlleyLayout();
  const overlaps=(a,b)=>Math.max(Math.min(a.from.x,a.to.x),Math.min(b.from.x,b.to.x))<=Math.min(Math.max(a.from.x,a.to.x),Math.max(b.from.x,b.to.x))
    &&Math.max(Math.min(a.from.z,a.to.z),Math.min(b.from.z,b.to.z))<=Math.min(Math.max(a.from.z,a.to.z),Math.max(b.from.z,b.to.z));
  for(const side of [-1,1]){
    const district=lanes.filter(l=>l.side===side),reached=new Set([district[0]]),queue=[district[0]];
    while(queue.length){
      const current=queue.pop();
      for(const next of district) if(!reached.has(next)&&overlaps(current,next)){
        reached.add(next);queue.push(next);
      }
    }
    assert.equal(reached.size,district.length,`Disconnected alley on side ${side}`);
  }
});
test('overhead passage anchors flank an unobstructed ground-level corridor',()=>{
  const {footprints,passages}=createAlleyLayout();
  for(const p of passages){
    const spansDepth=b=>b.z-b.d/2<=p.z-p.depth/2&&b.z+b.d/2>=p.z+p.depth/2;
    const left=footprints.find(b=>spansDepth(b)&&Math.abs(b.x+b.w/2-(p.x-p.width/2))<.001);
    const right=footprints.find(b=>spansDepth(b)&&Math.abs(b.x-b.w/2-(p.x+p.width/2))<.001);
    assert.ok(left&&right,`Passage lacks adjoining buildings: ${p.x}, ${p.z}`);
    assert.ok(!footprints.some(b=>b.x+b.w/2>p.x-p.width/2+.001&&b.x-b.w/2<p.x+p.width/2-.001
      &&b.z+b.d/2>p.z-p.depth/2&&b.z-b.d/2<p.z+p.depth/2));
  }
});
test('all new buildings fit inside the playable city bounds',()=>{
  for(const b of createAlleyLayout().footprints){
    assert.ok(b.x-b.w/2>WORLD_BOUNDS.minX&&b.x+b.w/2<WORLD_BOUNDS.maxX);
    assert.ok(b.z-b.d/2>WORLD_BOUNDS.minZ&&b.z+b.d/2<WORLD_BOUNDS.maxZ);
  }
});
