// Upper floors recede inside their lot, leaving real, climbable roof terraces.
export function buildingVolumes(x, z, w, d, h, index, stepped = false) {
  if (!stepped || h < 18 || Math.min(w, d) < 9 || index % 4 === 0) {
    return [{ x, z, w, d, bottom: 0, top: h }];
  }
  const shoulder = Math.max(10, h * .64);
  const direction = index % 2 ? 1 : -1;
  const levels = Math.min(w, d) >= 14 ? [6.5, shoulder, h] : [shoulder, h];
  const result = [];
  let bottom = 0;
  for (const top of levels) {
    result.push({ x, z, w, d, bottom, top });
    // Mantling needs .92m in total for the landing inset and player's radius.
    // Even the narrow side of an offset tier keeps at least 1.05m of terrace.
    const insetX = Math.max(1.25, w * .07), insetZ = Math.max(1.25, d * .065);
    x += direction * .2; z -= .15;
    w -= insetX * 2; d -= insetZ * 2; bottom = top;
  }
  return result;
}

export function createArchitecture({ box, solid, mats }) {
  // Pieces stay above head height so a narrow lane remains easy to run through.
  function facadeDetails(x, z, w, d, h, index, simple = false) {
    const facing = x < 0 ? 1 : -1;
    const edge = x + facing * (w / 2);
    const project = (distance, y, along, width, height, depth, mat) =>
      box(edge + facing * distance, y, z + along, depth, height, width, mat);
    // Projecting window bays alternate with dark inset wall strips.
    if (d > 14 && h > 18) {
      const bayHeight = Math.min(h - 10, simple ? 8 : 15);
      for (const along of [-d * .27, d * .27]) {
        project(.38, 8 + bayHeight / 2, along, 2.4, bayHeight, .8, mats.dark);
        for (let y = 8.8; y < 8 + bayHeight - .3; y += 3.55) {
          project(.81, y, along, 1.92, 2.35, .06, (index + Math.round(y)) % 5 === 0 ? mats.warmDim : mats.glass);
          project(.86, y, along, .08, 2.4, .06, mats.trim);
          project(.6, y - 1.3, along, 2.7, .16, 1.05, mats.trim);
        }
        project(.38, 8 + bayHeight + .14, along, 2.8, .3, 1.2, mats.metal);
        solid(edge + facing * .38, 8 + bayHeight / 2, z + along, .8, bayHeight, 2.4);
      }
    }
    if (simple) return;
    // Shop shutters and deep lintels give the lower floors a different scale.
    if (index % 3 === 1 && d > 12) {
      for (let y = .35; y < 3.15; y += .18) project(.16, y, -4, 2.65, .09, .12, mats.metal);
      project(.42, 3.2, -4, 3.2, .26, .95, mats.trim);
    }
    for (const along of [-d / 2 + 1.2, d / 2 - 1.2]) {
      project(.2, h * .43, along, .12, h * .86, .15, mats.rust);
      for (let y = 1.5; y < h * .86; y += 5) project(.22, y, along, .3, .1, .26, mats.metal);
    }
    // Landings, railings and alternating open stair flights on rear facades.
    // The stairs start above the street; wall climbing leads onto the landings.
    if (index % 3 === 0 && w > 10 && h > 20) {
      const back = z - d / 2;
      const floors = Math.min(4, Math.floor((h - 4) / 4));
      for (let level = 0; level < floors; level++) {
        const y = 5 + level * 4;
        box(x, y, back - .8, 5.3, .17, 1.65, mats.metal);
        solid(x, y, back - .8, 5.3, .17, 1.65);
        box(x, y + 1.1, back - 1.59, 5.4, .06, .06, mats.trim);
        for (let rail = -2.5; rail <= 2.5; rail += .5) box(x + rail, y + .56, back - 1.59, .045, 1.05, .045, mats.metal);
        if (level === floors - 1) continue;
        for (let step = 0; step < 14; step++) {
          const sx = x + (level % 2 ? 1 : -1) * (-2.2 + step * .34);
          const sy = y + (step + 1) * 4 / 14;
          box(sx, sy, back - 2.18, .38, .09, 1.05, mats.trim);
          solid(sx, sy, back - 2.18, .38, .09, 1.05);
        }
      }
    }
  }

  function passage(p, index) {
    // Continue through the facade to meet the recessed upper floors on both banks.
    const across = p.width + 5, depth = p.depth;
    const width = p.axis === 'z' ? across : depth;
    const length = p.axis === 'z' ? depth : across;
    const bottom = 6.2 + index % 3 * 1.2;
    box(p.x, bottom + 1.9, p.z, width, 3.8, length, mats.stone2);
    solid(p.x, bottom + 1.9, p.z, width, 3.8, length);
    box(p.x, bottom, p.z, width + .2, .22, length + .2, mats.trim);
    box(p.x, bottom + 3.95, p.z, width + .4, .28, length + .4, mats.trim);
    // Repeating windows across the bridge make it read as an occupied structure.
    for (let a = -across / 2 + 1; a < across / 2 - .5; a += 1.5) {
      for (const side of [-1, 1]) {
        const wx = p.axis === 'z' ? p.x + a : p.x + side * (depth / 2 + .04);
        const wz = p.axis === 'z' ? p.z + side * (depth / 2 + .04) : p.z + a;
        box(wx, bottom + 1.9, wz, p.axis === 'z' ? 1 : .08, 2.3, p.axis === 'z' ? .08 : 1, Math.round(a + index) % 3 ? mats.glass : mats.warmDim);
      }
    }
    box(p.x, bottom - .13, p.z, p.axis === 'z' ? across - 1 : .08, .055, p.axis === 'z' ? .08 : across - 1, index % 2 ? mats.pink : mats.blue);
  }
  return { facadeDetails, passage };
}
