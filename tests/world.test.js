import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { createWorld } from '../src/world.js';
import { Player, PLAYER_HEIGHT, PLAYER_RADIUS, SPAWN } from '../src/physics.js';

// Scene construction needs painted textures, but collider checks need no GPU.
// Only the canvas operations used to prepare those textures are stubbed.
function canvasForGeometryTests() {
  const noop = () => {};
  const context = {
    beginPath:noop, closePath:noop, moveTo:noop, lineTo:noop, arc:noop,
    ellipse:noop, fill:noop, stroke:noop, fillRect:noop, strokeRect:noop,
    fillText:noop, save:noop, restore:noop, translate:noop, putImageData:noop,
    createRadialGradient:() => ({ addColorStop:noop }),
    createImageData:(w,h) => ({ data:new Uint8ClampedArray(w*h*4) }),
  };
  return { width:1, height:1, getContext(type) { assert.equal(type, '2d'); return context; } };
}

let world;
before(() => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable:true, value:{ createElement(type) {
      assert.equal(type, 'canvas'); return canvasForGeometryTests();
    } },
  });
  try { world = createWorld(new Scene()); }
  finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('the assembled street keeps the spawn and its forward approach clear', () => {
  const p = new Player(world.colliders);
  assert.ok(p.canOccupy(SPAWN), 'spawn intersects city geometry');
  for (let step = 0; step < 120; step++) {
    p.step(1/120, {forward:true}, 0);
    assert.ok(p.canOccupy(p.position), 'starting walk intersects city geometry');
  }
  assert.ok(p.position.z < SPAWN.z-7, 'street furniture blocks the starting walk');
});

test('every memory is visible outside solid geometry and collectible from a supported position', () => {
  const p = new Player(world.colliders);
  assert.equal(world.echoes.length, 5);
  for (const e of world.echoes) {
    assert.ok(!world.colliders.some(b => e.x>b.minX && e.x<b.maxX
      && e.y>b.minY && e.y<b.maxY && e.z>b.minZ && e.z<b.maxZ), `Buried memory: ${e.title}`);
    let reachable = false;
    for (const dx of [-.9,0,.9]) for (const dz of [-.9,0,.9]) {
      const x=e.x+dx, z=e.z+dz;
      const surfaces = [0, ...world.colliders.filter(b => x-PLAYER_RADIUS>=b.minX && x+PLAYER_RADIUS<=b.maxX
        && z-PLAYER_RADIUS>=b.minZ && z+PLAYER_RADIUS<=b.maxZ).map(b=>b.maxY)];
      for (const y of surfaces) {
        if (e.y-y>PLAYER_HEIGHT || Math.hypot(dx,y+1-e.y,dz)>=2.2) continue;
        if (p.canOccupy({x,y,z})) reachable=true;
      }
    }
    assert.ok(reachable, `No standing collection position: ${e.title}`);
  }
});

test('the taller avenue roofs can still be climbed before stamina runs out', () => {
  const avenue = world.buildings.filter(b => Math.abs((b.minX+b.maxX)/2)===28
    && b.maxX-b.minX===24 && b.maxZ-b.minZ===32);
  assert.ok(avenue.length>=2, 'missing avenue climb targets');
  const targets = avenue.map(b => ({ box:b, x:(b.minX+b.maxX)/2 }));
  targets.push({ box:world.landmark.box, x:world.landmark.x+world.landmark.w/2-2 });
  for (const {box,x} of targets) {
    const p = new Player(world.colliders);
    p.position={x,y:0,z:box.maxZ+.85};
    assert.ok(p.canOccupy(p.position), 'climb approach intersects city geometry');
    let reached=false;
    for (let step=0;step<1440;step++) {
      p.step(1/120,{forward:true,jump:true},0);
      if (p.grounded && !p.mantle && p.position.y>=box.maxY-.01) { reached=true; break; }
      if (p.stamina<=0) break;
    }
    assert.ok(reached, `Could not climb ${box.maxY} m roof at x=${x}, z=${box.maxZ}`);
    assert.ok(p.stamina>0, 'roof requires more stamina than available');
    assert.ok(p.canOccupy(p.position), 'roof landing intersects a rooftop structure');
  }
});
