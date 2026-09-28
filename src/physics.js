// Feet-based capsule approximation. Fixed timesteps keep walls solid at low FPS.
export const SPAWN = Object.freeze({ x: 0, y: 0, z: 65 });
export const PLAYER_HEIGHT = 1.72;
export const PLAYER_RADIUS = 0.36;

export class Player {
  constructor(colliders) {
    this.colliders = colliders;
    this.position = { ...SPAWN };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.stamina = 100;
    this.grounded = true;
    this.climbing = false;
    this.mantle = null;
    this.jumpWasDown = false;
    this.reattachDelay = 0;
    this.wallJumpIntent = 0;
    this.attachedWall = null;
    this.nearWall = null;
    this.walkDistance = 0;
  }

  reset() {
    Object.assign(this.position, SPAWN);
    Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    this.stamina = 100;
    this.grounded = true;
    this.climbing = false;
    this.mantle = null;
    this.nearWall = null;
    this.reattachDelay = 0;
    this.wallJumpIntent = 0;
    this.attachedWall = null;
  }

  findWall() {
    const p = this.position;
    let nearest = null;
    let distance = PLAYER_RADIUS + 0.65;
    for (const box of this.colliders) {
      if (box.climbable === false || p.y > box.maxY - 0.1 || p.y + PLAYER_HEIGHT < box.minY + 0.2) continue;
      const faces = [
        { d: box.minX - p.x, nx: -1, nz: 0, within: p.z >= box.minZ - 0.1 && p.z <= box.maxZ + 0.1 },
        { d: p.x - box.maxX, nx: 1, nz: 0, within: p.z >= box.minZ - 0.1 && p.z <= box.maxZ + 0.1 },
        { d: box.minZ - p.z, nx: 0, nz: -1, within: p.x >= box.minX - 0.1 && p.x <= box.maxX + 0.1 },
        { d: p.z - box.maxZ, nx: 0, nz: 1, within: p.x >= box.minX - 0.1 && p.x <= box.maxX + 0.1 },
      ];
      for (const face of faces) {
        if (face.within && face.d >= 0 && face.d < distance) {
          distance = face.d;
          nearest = { ...face, box };
        }
      }
    }
    return nearest;
  }

  step(dt, input, yaw) {
    const p = this.position;
    const v = this.velocity;
    this.reattachDelay = Math.max(0, this.reattachDelay - dt);
    this.wallJumpIntent = Math.max(0, this.wallJumpIntent - dt);
    const jump = !!input.jump && !this.jumpWasDown;
    this.jumpWasDown = !!input.jump;

    if (this.mantle) {
      this.mantle.t = Math.min(1, this.mantle.t + dt / 0.48);
      const { from, to, t } = this.mantle;
      // Rise first, then move inward, so the player never passes through the roof.
      const rise = Math.min(1, t * 2);
      const move = Math.max(0, (t - 0.4) / 0.6);
      p.y = from.y + (to.y - from.y) * (1 - (1 - rise) ** 3);
      p.x = from.x + (to.x - from.x) * move;
      p.z = from.z + (to.z - from.z) * move;
      if (t === 1) { this.mantle = null; this.grounded = true; this.climbing = false; this.attachedWall = null; }
      return;
    }

    this.nearWall = this.findWall();
    const alreadyAttached = !!this.attachedWall;
    if (jump && !this.attachedWall) this.wallJumpIntent = 1.05;
    const facingWall = this.nearWall && -Math.sin(yaw) * this.nearWall.nx - Math.cos(yaw) * this.nearWall.nz < -0.35;
    if (!this.attachedWall && this.nearWall && !this.grounded && this.wallJumpIntent > 0 && input.forward && facingWall && this.stamina > 0 && this.reattachDelay === 0) {
      this.attachedWall = this.nearWall;
      this.wallJumpIntent = 0;
    }
    if (this.attachedWall && (!this.nearWall || this.nearWall.box !== this.attachedWall.box || this.stamina <= 0 || input.release)) {
      this.attachedWall = null;
      this.reattachDelay = 0.5;
    }
    this.climbing = !!this.attachedWall;

    if (this.climbing) {
      const wall = this.attachedWall;
      this.grounded = false;
      const sideways = Number(!!input.right) - Number(!!input.left);
      v.x = wall.nx ? 0 : Math.cos(yaw) * sideways * 2.8;
      v.z = wall.nz ? 0 : -Math.sin(yaw) * sideways * 2.8;
      v.y = input.backward ? -4.0 : input.forward ? 6.2 : 0;
      this.stamina = Math.max(0, this.stamina - dt * (input.forward || input.backward ? 9 : 4));
      if (this.stamina === 0) this.reattachDelay = 1.2;
      if (wall.nx) p.x = (wall.nx < 0 ? wall.box.minX : wall.box.maxX) + wall.nx * (PLAYER_RADIUS + 0.02);
      if (wall.nz) p.z = (wall.nz < 0 ? wall.box.minZ : wall.box.maxZ) + wall.nz * (PLAYER_RADIUS + 0.02);
      if (jump && alreadyAttached) {
        v.x = wall.nx * 8;
        v.z = wall.nz * 8;
        v.y = 8.5;
        this.climbing = false;
        this.attachedWall = null;
        this.reattachDelay = 0.55;
      } else if (input.forward && p.y + PLAYER_HEIGHT * 0.8 >= wall.box.maxY) {
        const target = { x: p.x - wall.nx * 1.05, y: wall.box.maxY, z: p.z - wall.nz * 1.05 };
        // Reject a mantle if another solid occupies the standing space.
        const blocked = this.colliders.some(b => b !== wall.box && target.y < b.maxY - 0.03 && target.y + PLAYER_HEIGHT > b.minY + 0.03 && target.x + PLAYER_RADIUS > b.minX && target.x - PLAYER_RADIUS < b.maxX && target.z + PLAYER_RADIUS > b.minZ && target.z - PLAYER_RADIUS < b.maxZ);
        if (!blocked) {
          this.mantle = { from: { ...p }, to: target, t: 0 };
          v.y = 0;
          return;
        }
      }
    } else {
      let forward = Number(!!input.forward) - Number(!!input.backward);
      let right = Number(!!input.right) - Number(!!input.left);
      const length = Math.hypot(forward, right) || 1;
      forward /= length; right /= length;
      const speed = input.sprint ? 10.2 : 5.5;
      const targetX = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
      const targetZ = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
      const blend = 1 - Math.exp(-dt * (this.grounded ? 14 : (this.reattachDelay > 0 ? 1.7 : 4)));
      v.x += (targetX - v.x) * blend;
      v.z += (targetZ - v.z) * blend;
      if (jump && this.grounded) { v.y = 8.0; this.grounded = false; }
      v.y -= 21 * dt;
      if (this.grounded) this.stamina = Math.min(100, this.stamina + dt * 30);
    }

    const previous = { ...p };
    this.moveAxis('x', v.x * dt);
    this.moveAxis('z', v.z * dt);
    const previousY = p.y;
    p.y += v.y * dt;
    this.grounded = false;
    for (const b of this.colliders) {
      if (!(p.x + PLAYER_RADIUS > b.minX && p.x - PLAYER_RADIUS < b.maxX && p.z + PLAYER_RADIUS > b.minZ && p.z - PLAYER_RADIUS < b.maxZ)) continue;
      if (v.y <= 0 && previousY >= b.maxY - 0.04 && p.y <= b.maxY) {
        p.y = b.maxY; v.y = 0; this.grounded = true;
      } else if (v.y > 0 && previousY + PLAYER_HEIGHT <= b.minY + 0.01 && p.y + PLAYER_HEIGHT > b.minY) {
        p.y = b.minY - PLAYER_HEIGHT; v.y = 0;
      }
    }
    if (p.y <= 0) { p.y = 0; v.y = 0; this.grounded = true; this.attachedWall = null; this.climbing = false; }
    p.x = Math.max(-147, Math.min(147, p.x));
    p.z = Math.max(-147, Math.min(125, p.z));
    this.walkDistance += Math.hypot(p.x - previous.x, p.z - previous.z);
  }

  moveAxis(axis, distance) {
    const p = this.position;
    p[axis] += distance;
    const other = axis === 'x' ? 'z' : 'x';
    const low = axis === 'x' ? 'minX' : 'minZ';
    const high = axis === 'x' ? 'maxX' : 'maxZ';
    const otherLow = other === 'x' ? 'minX' : 'minZ';
    const otherHigh = other === 'x' ? 'maxX' : 'maxZ';
    for (const b of this.colliders) {
      if (p.y >= b.maxY - 0.025 || p.y + PLAYER_HEIGHT <= b.minY + 0.025) continue;
      if (p[other] + PLAYER_RADIUS <= b[otherLow] || p[other] - PLAYER_RADIUS >= b[otherHigh]) continue;
      if (p[axis] + PLAYER_RADIUS <= b[low] || p[axis] - PLAYER_RADIUS >= b[high]) continue;
      if (distance > 0) p[axis] = b[low] - PLAYER_RADIUS;
      else if (distance < 0) p[axis] = b[high] + PLAYER_RADIUS;
      this.velocity[axis] = 0;
    }
  }
}
