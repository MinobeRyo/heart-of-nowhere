import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player, PLAYER_RADIUS, PLAYER_HEIGHT } from '../src/physics.js';

const building = { minX: -5, maxX: 5, minY: 0, maxY: 12, minZ: -12, maxZ: -2 };
const run = (p, seconds, input = {}, yaw = 0) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) p.step(1 / 120, input, yaw); };
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
  run(p, 2.5, { forward: true });
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
  const p = new Player([tall]); p.position = { x: 0, y: 3, z: -1.5 }; p.stamina = 1;
  p.grounded = false;
  run(p, 0.01, { forward: true, jump: true }); run(p, 0.2, { forward: true }); assert.equal(p.climbing, false); assert.equal(p.stamina, 0);
  run(p, 4); assert.ok(p.stamina > 20);
});
test('underside of an overhead object blocks jumping through it', () => {
  const roof = { minX: -3, maxX: 3, minZ: -3, maxZ: 3, minY: 2.4, maxY: 2.8 };
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
  run(p, .2, { forward: true, jump: true }); run(p, 2.4, { forward: true });
  assert.equal(p.position.y, 12); run(p, .15, { jump: true }); assert.ok(p.position.y > 12.7);
});
test('letting go of W hangs on the wall and E releases', () => {
  const p = new Player([building]); p.position = { x: 0, y: 0, z: -1.5 };
  run(p, .4, { forward: true, jump: true }); const y = p.position.y;
  run(p, .4); assert.equal(p.position.y, y); assert.ok(p.climbing);
  run(p, .2, { release: true }); assert.equal(p.climbing, false); assert.ok(p.position.y < y);
});
