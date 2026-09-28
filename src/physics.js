// Feet-based collision volume. The main loop advances at a fixed 120 Hz.
import { WORLD_BOUNDS } from './layout.js';
export const SPAWN = Object.freeze({ x: 0, y: 0, z: 65 });
export const PLAYER_HEIGHT = 2.65;
export const EYE_HEIGHT = 2.4;
export const PLAYER_RADIUS = 0.36;
export const MOVEMENT = Object.freeze({
  walk: 9.5, sprint: 18, jump: 10.2, gravity: 24,
  climb: 10, climbSprint: 15, descend: 8, shimmy: 6,
  wallJumpUp: 11.5, wallJumpAway: 11,
  airDash: 32, dashDuration: 0.19, wallRun: 17.5, wallRunDuration: 2.1,
});
const WALL_DISTANCE = 0.85;
const WALL_REACH = 1.5;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.15;

export class Player {
  constructor(colliders) {
    this.colliders = colliders;
    this.position = { ...SPAWN };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.reset();
  }

  reset() {
    Object.assign(this.position, SPAWN);
    Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    this.stamina = 100;
    this.grounded = true;
    this.climbing = false;
    this.mantle = null;
    this.nearWall = null;
    this.attachedWall = null;
    this.jumpWasDown = false;
    this.reattachDelay = 0;
    this.wallJumpIntent = 0;
    this.jumpBuffer = 0;
    this.coyoteTime = 0;
    this.walkDistance = 0;
    this.dashWasDown = false;
    this.dashBuffer = 0;
    this.dashTime = 0;
    this.dashDirection = { x: 0, z: -1 };
    this.airDashAvailable = true;
    this.wallRunning = false;
    this.runningWall = null;
    this.wallRunTime = 0;
  }

  wallFaces(box) {
    const p = this.position;
    return [
      { d: box.minX - p.x, nx: -1, nz: 0, within: p.z >= box.minZ - PLAYER_RADIUS && p.z <= box.maxZ + PLAYER_RADIUS },
      { d: p.x - box.maxX, nx: 1, nz: 0, within: p.z >= box.minZ - PLAYER_RADIUS && p.z <= box.maxZ + PLAYER_RADIUS },
      { d: box.minZ - p.z, nx: 0, nz: -1, within: p.x >= box.minX - PLAYER_RADIUS && p.x <= box.maxX + PLAYER_RADIUS },
      { d: p.z - box.maxZ, nx: 0, nz: 1, within: p.x >= box.minX - PLAYER_RADIUS && p.x <= box.maxX + PLAYER_RADIUS },
    ];
  }

  findWall(yaw = null) {
    const p = this.position;
    let nearest = null, bestScore = Infinity;
    for (const box of this.colliders) {
      if (box.climbable === false || p.y >= box.maxY - 0.03 || p.y + PLAYER_HEIGHT < box.minY + 0.2) continue;
      for (const face of this.wallFaces(box)) {
        if (!face.within || face.d < PLAYER_RADIUS - 0.05 || face.d > WALL_REACH) continue;
        const facing = yaw === null ? 1 : Math.sin(yaw) * face.nx + Math.cos(yaw) * face.nz;
        if (facing < 0.08) continue;
        // Prefer the wall in front over a tiny prop beside the player.
        const score = face.d - facing * 0.65;
        if (score < bestScore) { bestScore = score; nearest = { ...face, box }; }
      }
    }
    return nearest;
  }

  detach(delay = 0.3) {
    this.attachedWall = null;
    this.climbing = false;
    this.reattachDelay = delay;
    this.wallJumpIntent = 0;
    this.coyoteTime = 0;
    this.wallRunning = false;
    this.runningWall = null;
    this.wallRunTime = 0;
  }

  canOccupy(p, ignoredBox = null) {
    return !this.colliders.some(b => b !== ignoredBox && p.y < b.maxY - 0.025 && p.y + PLAYER_HEIGHT > b.minY + 0.025 && p.x + PLAYER_RADIUS > b.minX && p.x - PLAYER_RADIUS < b.maxX && p.z + PLAYER_RADIUS > b.minZ && p.z - PLAYER_RADIUS < b.maxZ);
  }

  startMantle(wall) {
    const { box: b, nx, nz } = wall;
    const inset = PLAYER_RADIUS + 0.2;
    const to = {
      x: Math.max(b.minX + inset, Math.min(b.maxX - inset, this.position.x - nx * (WALL_DISTANCE + inset))),
      y: b.maxY,
      z: Math.max(b.minZ + inset, Math.min(b.maxZ - inset, this.position.z - nz * (WALL_DISTANCE + inset))),
    };
    if (b.maxX - b.minX < inset * 2 || b.maxZ - b.minZ < inset * 2) return false;
    // Check the entire lift and traverse, including thin overhangs, before moving.
    const lifted = { ...this.position, y: to.y };
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const up = { ...this.position, y: this.position.y + (to.y - this.position.y) * t };
      const across = { x: lifted.x + (to.x - lifted.x) * t, y: to.y, z: lifted.z + (to.z - lifted.z) * t };
      if (!this.canOccupy(up, b) || !this.canOccupy(across, b)) return false;
    }
    this.mantle = { from: { ...this.position }, to, t: 0 };
    Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    this.jumpBuffer = 0;
    return true;
  }

  step(dt, input, yaw) {
    const p = this.position, v = this.velocity;
    this.reattachDelay = Math.max(0, this.reattachDelay - dt);
    this.wallJumpIntent = Math.max(0, this.wallJumpIntent - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    const jump = !!input.jump && !this.jumpWasDown;
    this.jumpWasDown = !!input.jump;
    if (input.dash && !this.dashWasDown) this.dashBuffer = 0.12;
    this.dashWasDown = !!input.dash;
    if (jump) this.jumpBuffer = JUMP_BUFFER;
    if (this.grounded && !this.climbing && !this.wallRunning) this.airDashAvailable = true;
    if (this.grounded && !this.attachedWall) this.coyoteTime = COYOTE_TIME;
    else this.coyoteTime = Math.max(0, this.coyoteTime - dt);

    if (this.mantle) {
      this.mantle.t = Math.min(1, this.mantle.t + dt / 0.3);
      const { from, to, t } = this.mantle;
      const rise = Math.min(1, t / 0.55);
      const move = Math.max(0, (t - 0.55) / 0.45);
      const smooth = move * move * (3 - 2 * move);
      p.y = from.y + (to.y - from.y) * (1 - (1 - rise) ** 3);
      p.x = from.x + (to.x - from.x) * smooth;
      p.z = from.z + (to.z - from.z) * smooth;
      if (t === 1) {
        this.mantle = null;
        this.grounded = true;
        this.climbing = false;
        this.attachedWall = null;
        this.coyoteTime = COYOTE_TIME;
      }
      return;
    }

    this.nearWall = this.findWall(yaw);
    const alreadyAttached = !!this.attachedWall;
    const alreadyRunning = this.wallRunning;
    if (this.dashBuffer > 0 && this.airDashAvailable && !this.grounded) {
      const forward = Number(!!input.forward) - Number(!!input.backward);
      const right = Number(!!input.right) - Number(!!input.left);
      let dx = -Math.sin(yaw) * forward + Math.cos(yaw) * right;
      let dz = -Math.cos(yaw) * forward - Math.sin(yaw) * right;
      if (!forward && !right) { dx = -Math.sin(yaw); dz = -Math.cos(yaw); }
      const length = Math.hypot(dx, dz);
      this.dashDirection = { x: dx / length, z: dz / length };
      this.detach(0.3);
      this.dashTime = MOVEMENT.dashDuration;
      this.dashBuffer = 0;
      this.airDashAvailable = false;
    }
    if (jump && !this.attachedWall) this.wallJumpIntent = 1.4;
    if (this.attachedWall) {
      // Keep the current face even when another object is nearer or the view turns.
      const b = this.attachedWall.box;
      if (this.stamina <= 0 || input.release || p.y >= b.maxY || p.y + PLAYER_HEIGHT < b.minY) {
        this.detach(this.stamina <= 0 ? 0.8 : 0.3);
        v.y = Math.min(v.y, 0);
      }
    }
    const wantsWall = this.wallJumpIntent > 0 || (input.jump && input.forward);
    const facing = this.nearWall ? Math.sin(yaw) * this.nearWall.nx + Math.cos(yaw) * this.nearWall.nz : 0;
    const preferWallRun = input.sprint && input.forward && !this.grounded && facing < 0.65;
    if (!this.attachedWall && !alreadyRunning && !preferWallRun && this.dashTime <= 0 && this.nearWall && wantsWall && (input.forward || jump) && !input.release && this.stamina > 5 && this.reattachDelay === 0) {
      const wall = this.nearWall;
      const snap = { ...p };
      if (wall.nx) snap.x = (wall.nx < 0 ? wall.box.minX : wall.box.maxX) + wall.nx * WALL_DISTANCE;
      if (wall.nz) snap.z = (wall.nz < 0 ? wall.box.minZ : wall.box.maxZ) + wall.nz * WALL_DISTANCE;
      if (this.canOccupy(snap)) {
        this.attachedWall = wall;
        this.wallJumpIntent = 0;
        this.jumpBuffer = 0;
        this.coyoteTime = 0;
      }
    }
    this.climbing = !!this.attachedWall;

    if (!this.climbing && this.dashTime <= 0) {
      const sideWall = this.runningWall || this.findWall();
      const alignment = sideWall ? Math.abs(Math.sin(yaw) * sideWall.nx + Math.cos(yaw) * sideWall.nz) : 1;
      const sideFace = sideWall && this.wallFaces(sideWall.box).find(f => f.nx === sideWall.nx && f.nz === sideWall.nz);
      const closeToSide = sideFace && sideFace.within && sideFace.d >= PLAYER_RADIUS - 0.05 && sideFace.d <= WALL_REACH;
      if (!this.grounded && input.sprint && input.forward && !input.release && closeToSide && alignment < 0.65 && this.reattachDelay === 0 && this.stamina > 0 && p.y < sideWall.box.maxY) {
        if (!this.wallRunning) { this.wallRunTime = 0; v.y = Math.max(v.y, 3.3); }
        this.wallRunning = true;
        this.runningWall = sideWall;
      } else if (this.wallRunning) {
        this.detach(0.12);
      }
    }

    if (this.dashTime > 0) {
      this.dashTime = Math.max(0, this.dashTime - dt);
      v.x = this.dashDirection.x * MOVEMENT.airDash;
      v.z = this.dashDirection.z * MOVEMENT.airDash;
      v.y = 0;
    } else if (this.wallRunning) {
      const wall = this.runningWall;
      this.wallRunTime += dt;
      this.stamina = Math.max(0, this.stamina - dt * 8);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const dot = fx * wall.nx + fz * wall.nz;
      const tx = fx - dot * wall.nx, tz = fz - dot * wall.nz;
      const length = Math.hypot(tx, tz) || 1;
      v.x = tx / length * MOVEMENT.wallRun;
      v.z = tz / length * MOVEMENT.wallRun;
      v.y = Math.max(-2.4, v.y - 5 * dt);
      const stick = 1 - Math.exp(-dt * 18);
      if (wall.nx) p.x += ((wall.nx < 0 ? wall.box.minX : wall.box.maxX) + wall.nx * WALL_DISTANCE - p.x) * stick;
      if (wall.nz) p.z += ((wall.nz < 0 ? wall.box.minZ : wall.box.maxZ) + wall.nz * WALL_DISTANCE - p.z) * stick;
      if (jump && alreadyRunning) {
        v.x = tx / length * 7 + wall.nx * MOVEMENT.wallJumpAway;
        v.z = tz / length * 7 + wall.nz * MOVEMENT.wallJumpAway;
        v.y = MOVEMENT.wallJumpUp;
        this.detach(0.32);
        this.wallJumpIntent = 1.1;
        this.jumpBuffer = 0;
      } else if (this.wallRunTime >= MOVEMENT.wallRunDuration || this.stamina <= 0) {
        this.detach(0.55);
      }
    } else if (this.climbing) {
      const wall = this.attachedWall, b = wall.box;
      this.grounded = false;
      const sideways = Number(!!input.right) - Number(!!input.left);
      // Movement is relative to the grabbed wall, never reduced by camera angle.
      const factor = input.forward && sideways ? Math.SQRT1_2 : 1;
      v.x = wall.nz * sideways * MOVEMENT.shimmy * factor;
      v.z = -wall.nx * sideways * MOVEMENT.shimmy * factor;
      v.y = input.backward ? -MOVEMENT.descend : input.forward ? (input.sprint ? MOVEMENT.climbSprint : MOVEMENT.climb) * factor : 0;
      const moving = input.forward || input.backward || sideways;
      this.stamina = Math.max(0, this.stamina - dt * (moving ? (input.sprint ? 7.5 : 4.5) : 0.8));
      // Ease into a more comfortable gap instead of snapping the camera against stone.
      const stick = 1 - Math.exp(-dt * 24);
      if (wall.nx) p.x += ((wall.nx < 0 ? b.minX : b.maxX) + wall.nx * WALL_DISTANCE - p.x) * stick;
      if (wall.nz) p.z += ((wall.nz < 0 ? b.minZ : b.maxZ) + wall.nz * WALL_DISTANCE - p.z) * stick;
      // Retain the grip at an edge instead of falling because of a nearest-face swap.
      if (wall.nx) v.z = Math.max((b.minZ + PLAYER_RADIUS - p.z) / dt, Math.min((b.maxZ - PLAYER_RADIUS - p.z) / dt, v.z));
      if (wall.nz) v.x = Math.max((b.minX + PLAYER_RADIUS - p.x) / dt, Math.min((b.maxX - PLAYER_RADIUS - p.x) / dt, v.x));
      if (jump && alreadyAttached) {
        v.x += wall.nx * MOVEMENT.wallJumpAway;
        v.z += wall.nz * MOVEMENT.wallJumpAway;
        v.y = MOVEMENT.wallJumpUp;
        this.detach(0.32);
        // An intentional jump toward another wall may attach during this flight.
        this.wallJumpIntent = 1.1;
        this.jumpBuffer = 0;
      } else if (input.forward && p.y + PLAYER_HEIGHT * 0.9 >= b.maxY) {
        if (this.startMantle(wall)) return;
        v.y = 0;
      }
    } else {
      let forward = Number(!!input.forward) - Number(!!input.backward);
      let right = Number(!!input.right) - Number(!!input.left);
      const length = Math.hypot(forward, right) || 1;
      forward /= length; right /= length;
      const speed = input.sprint ? MOVEMENT.sprint : MOVEMENT.walk;
      const targetX = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
      const targetZ = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
      const blend = 1 - Math.exp(-dt * (this.grounded ? 24 : (this.reattachDelay > 0 ? 1.8 : 7)));
      v.x += (targetX - v.x) * blend;
      v.z += (targetZ - v.z) * blend;
      if (this.jumpBuffer > 0 && (this.grounded || this.coyoteTime > 0)) {
        v.y = MOVEMENT.jump;
        this.grounded = false;
        this.coyoteTime = 0;
        this.jumpBuffer = 0;
      }
      v.y -= MOVEMENT.gravity * dt;
      if (this.grounded) this.stamina = Math.min(100, this.stamina + dt * 45);
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
    if (p.y <= 0) {
      p.y = 0; v.y = 0; this.grounded = true;
      // A new grab starts at ground level and needs one step to lift off.
      if (!this.climbing || input.backward) { this.attachedWall = null; this.climbing = false; }
    }
    if (this.grounded && !this.climbing) {
      this.wallRunning = false; this.runningWall = null;
      this.dashTime = 0; this.airDashAvailable = true;
    }
    p.x = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, p.x));
    p.z = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, p.z));
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
