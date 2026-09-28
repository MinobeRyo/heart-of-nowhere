import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player, PLAYER_RADIUS, PLAYER_HEIGHT, EYE_HEIGHT } from '../src/physics.js';

const building = { minX: -5, maxX: 5, minY: 0, maxY: 12, minZ: -12, maxZ: -2 };
const run = (p, seconds, input = {}, yaw = 0) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) p.step(1 / 120, input, yaw); };
const until = (p, predicate, input={}, yaw=0, limit=600) => { for(let i=0;i<limit;i++){p.step(1/120,input,yaw);if(predicate())return;} assert.fail('Expected movement state was not reached'); };
function climbToRoof(p) {
  run(p,.1,{forward:true,jump:true});
  until(p,()=>!!p.mantle,{forward:true});
  until(p,()=>!p.mantle,{forward:true});
}
test('running into a building cannot cross its wall', () => {
  const p = new Player([building]); p.position = { x: 0, y: 0, z: 2 };
  run(p, 3, { forward: true, sprint: true });
  assert.ok(p.position.z >= building.maxZ + PLAYER_RADIUS - 0.001);
});
test('jump rises and lands on the ground', () => {
  const p = new Player([]); run(p, 0.15, { jump: true });
  assert.ok(p.position.y > 0.7); run(p, 2);
  assert.equal(p.position.y, 0); assert.ok(p.grounded);
});
test('jumping toward a wall attaches, climbs with W and mantles onto the roof', () => {
  const p = new Player([building]); p.position = { x: 0, y: 0, z: -1.5 };
  run(p, 0.5, { forward: true, jump: true });
  assert.ok(p.stamina < 100);
  until(p,()=>!!p.mantle,{forward:true});
  until(p,()=>!p.mantle,{forward:true});
  assert.equal(p.position.y, 12); assert.ok(p.position.z < -2);
  assert.ok(p.grounded);
});
test('falling onto a roof lands on it, then walking off falls to street', () => {
  const p = new Player([building]); p.position = { x: 0, y: 20, z: -6 };
  run(p, 1.5); assert.equal(p.position.y, 12); assert.ok(p.grounded);
  run(p, 2, { right: true }); run(p, 2);
  assert.equal(p.position.y, 0);
});
test('wall jump detaches and pushes away', () => {
  const p = new Player([building]); p.position = { x: 0, y: 3, z: -1.5 };
  p.grounded = false;
  run(p, 0.1, { forward: true, jump: true }); run(p, 0.05, { forward: true });
  run(p, 0.2, { forward: true, jump: true });
  assert.ok(p.position.z > -1); assert.ok(p.position.y > 4);
  assert.equal(p.climbing, false);
});
test('exhaustion detaches, and grip regenerates on a surface', () => {
  const tall = { ...building, maxY: 100 };
  const p = new Player([tall]); p.position = { x: 0, y: 3, z: -1.5 };
  p.grounded = false;
  run(p, 0.01, { forward: true, jump: true }); p.stamina=.4; run(p, 0.2, { forward: true }); assert.equal(p.climbing, false); assert.equal(p.stamina, 0);
  run(p, 4); assert.ok(p.stamina > 20);
});
test('underside of an overhead object blocks jumping through it', () => {
  const roof = { minX: -3, maxX: 3, minZ: -3, maxZ: 3, minY: 3.4, maxY: 3.8 };
  const p = new Player([roof]); p.position = { x: 0, y: 0, z: 0 };
  run(p, 0.2, { jump: true }); assert.ok(p.position.y + PLAYER_HEIGHT <= roof.minY + 0.001);
});
test('diagonal running is the same speed as forward running', () => {
  const a = new Player([]); const b = new Player([]);
  run(a, 2, { forward: true }); run(b, 2, { forward: true, right: true });
  assert.ok(Math.abs(a.walkDistance - b.walkDistance) < 0.01);
});
test('walking into a wall does not activate climbing without a jump', () => {
  const p = new Player([building]); p.position = { x: 0, y: 0, z: -1.5 };
  run(p, 2, { forward: true }); assert.equal(p.climbing, false); assert.equal(p.position.y, 0);
});
test('jumping while looking away from the wall never attaches', () => {
  const p = new Player([building]); p.position = { x: 0, y: 0, z: -1.5 };
  run(p, 0.4, { forward: true, jump: true }, Math.PI); assert.equal(p.climbing, false);
});
test('Shift sprint is faster than walking', () => {
  const walker = new Player([]), sprinter = new Player([]);
  run(walker, 2, { forward: true }); run(sprinter, 2, { forward: true, sprint: true });
  assert.ok(sprinter.walkDistance > walker.walkDistance * 1.7);
});
test('jumping from the roof works after a mantle', () => {
  const p = new Player([building]); p.position = { x: 0, y: 0, z: -1.5 };
  climbToRoof(p);
  assert.equal(p.position.y, 12); run(p, .15, { jump: true }); assert.ok(p.position.y > 12.7);
});
test('camera is raised while staying inside the collision body',()=>{
  assert.equal(EYE_HEIGHT,2.4);assert.ok(PLAYER_HEIGHT>EYE_HEIGHT);
});
test('a slightly early jump grabs the wall from a wider distance',()=>{
  const p=new Player([building]);p.position={x:0,y:0,z:-.6};
  run(p,.08,{forward:true,jump:true});assert.ok(p.climbing);assert.ok(p.position.y>0);
});
test('the grabbed wall is retained when looking toward a nearby prop',()=>{
  const prop={minX:.6,maxX:2,minY:0,maxY:8,minZ:-3,maxZ:-.8};
  const p=new Player([building,prop]);p.position={x:0,y:0,z:-1.5};
  run(p,.3,{forward:true,jump:true});run(p,.5,{},-Math.PI/2);
  assert.equal(p.attachedWall.box,building);assert.ok(p.climbing);
});
test('wall strafing remains responsive when the camera turns',()=>{
  const p=new Player([building]);p.position={x:0,y:0,z:-1.5};
  run(p,.3,{forward:true,jump:true});run(p,.3,{right:true},Math.PI/2);
  assert.ok(p.position.x>1.5);assert.ok(p.climbing);
});
test('Shift accelerates climbing',()=>{
  const b={...building,maxY:100}; const a=new Player([b]), c=new Player([b]);
  a.position={x:0,y:0,z:-1.5};c.position={...a.position};
  run(a,1,{forward:true,jump:true});run(c,1,{forward:true,jump:true,sprint:true});
  assert.ok(c.position.y>a.position.y*1.4);
});
test('a blocked roof cannot mantle through a low overhang',()=>{
  const roof={minX:-5,maxX:5,minZ:-4,maxZ:0,minY:12.4,maxY:13};
  const p=new Player([building,roof]);p.position={x:0,y:8,z:-1.5};p.grounded=false;
  run(p,1,{forward:true,jump:true});
  assert.equal(p.mantle,null);assert.ok(p.position.y+PLAYER_HEIGHT<=roof.minY+.01);
});
test('air dash gives one burst and is only replenished on landing',()=>{
  const p=new Player([]);p.position={x:0,y:8,z:0};p.grounded=false;
  run(p,.12,{dash:true,forward:true});assert.ok(p.position.z < -3.5);assert.equal(p.airDashAvailable,false);
  run(p,.25);run(p,.02,{dash:true});assert.equal(p.dashTime,0);
  run(p,3);assert.ok(p.grounded);assert.equal(p.airDashAvailable,true);
});
test('air dash stops at a building instead of crossing it',()=>{
  const p=new Player([building]);p.position={x:0,y:4,z:2};p.grounded=false;
  run(p,.2,{dash:true,forward:true});assert.ok(p.position.z>=building.maxZ+PLAYER_RADIUS-.001);
});
test('wall running carries forward along a wall and Space kicks away',()=>{
  const wall={minX:1,maxX:12,minY:0,maxY:30,minZ:-80,maxZ:20};
  const p=new Player([wall]);p.position={x:0,y:4,z:0};p.grounded=false;
  run(p,.6,{forward:true,sprint:true});assert.ok(p.wallRunning);assert.ok(p.position.z < -9);assert.ok(p.position.y>3);
  run(p,.1,{forward:true,sprint:true,jump:true});assert.ok(!p.wallRunning);assert.ok(p.position.x<-.6);assert.ok(p.velocity.y>8);
});
test('wall run is time-limited and never activates by walking on the ground',()=>{
  const wall={minX:1,maxX:12,minY:0,maxY:30,minZ:-100,maxZ:20};
  const p=new Player([wall]);p.position={x:0,y:0,z:0};
  run(p,.3,{forward:true,sprint:true});assert.equal(p.wallRunning,false);
  p.position.y=8;p.grounded=false;
  run(p,2.2,{forward:true,sprint:true});assert.equal(p.wallRunning,false);assert.ok(p.reattachDelay>0);
});
test('a jump pressed just before landing is buffered',()=>{
  const p=new Player([]);p.position={x:0,y:.12,z:0};p.velocity.y=-4;p.grounded=false;
  run(p,.01,{jump:true});run(p,.12);assert.ok(p.position.y>.4);assert.ok(p.velocity.y>0);
});
test('letting go of W hangs on the wall and E releases', () => {
  const p = new Player([building]); p.position = { x: 0, y: 0, z: -1.5 };
  run(p, .4, { forward: true, jump: true }); const y = p.position.y;
  run(p, .4); assert.equal(p.position.y, y); assert.ok(p.climbing);
  run(p, .2, { release: true }); assert.equal(p.climbing, false); assert.ok(p.position.y < y);
});
