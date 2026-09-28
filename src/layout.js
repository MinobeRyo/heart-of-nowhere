// Carve connected, dog-legged lanes out of city blocks. Both districts have
// multiple boulevard entrances, courtyards, loops and a few short dead ends.
export const WORLD_BOUNDS = Object.freeze({ minX: -258, maxX: 258, minZ: -398, maxZ: 130 });

export function createAlleyLayout() {
  const footprints = [], lanes = [], courtyards = [], propSpots = [];
  function subtract(rect, cut) {
    const x0 = Math.max(rect.x0, cut.x0), x1 = Math.min(rect.x1, cut.x1);
    const z0 = Math.max(rect.z0, cut.z0), z1 = Math.min(rect.z1, cut.z1);
    if (x0 >= x1 || z0 >= z1) return [rect];
    return [
      { x0: rect.x0, x1: x0, z0: rect.z0, z1: rect.z1 },
      { x0: x1, x1: rect.x1, z0: rect.z0, z1: rect.z1 },
      { x0, x1, z0: rect.z0, z1: z0 },
      { x0, x1, z0: z1, z1: rect.z1 },
    ].filter(r => r.x1 - r.x0 > 0.1 && r.z1 - r.z0 > 0.1);
  }
  const routes = [
    [[40,39],[56,39],[56,75],[80,75],[80,99],[115,99],[115,66],[100,66],[100,20],[72,20],[72,-17],[118,-17],[118,-47],[91,-47],[91,-84],[126,-84],[126,-111]],
    [[40,-9],[56,-9],[56,-42],[73,-42],[73,-69],[91,-69]],
    [[40,-60],[54,-60],[54,-111],[81,-111],[81,-84],[91,-84]],
    [[40,88],[56,88],[56,105],[80,105],[80,99]],
    [[115,66],[133,66],[133,47]],
    [[118,-47],[133,-47],[133,-63]],
    [[126,-111],[126,-132]],
    [[80,99],[80,119]],
    [[133,66],[143,66]],
  ];
  for (const side of [-1, 1]) {
    let blocks = [{ x0: 43, x1: 143, z0: -132, z1: 119 }];
    const cuts = [];
    for (const route of routes) for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const halfWidth = side < 0 ? 3.0 : 3.6;
      const cut = { x0: Math.min(a[0],b[0])-halfWidth, x1: Math.max(a[0],b[0])+halfWidth, z0: Math.min(a[1],b[1])-halfWidth, z1: Math.max(a[1],b[1])+halfWidth };
      cuts.push(cut);
      lanes.push({ side, from: { x: side*a[0], z:a[1] }, to: { x:side*b[0], z:b[1] }, width:halfWidth*2 });
    }
    for (const [x,z,w,d] of [[100,20,18,18],[91,-69,15,17]]) {
      cuts.push({ x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2 });
      courtyards.push({x:side*x,z,w,d});
    }
    for (const cut of cuts) blocks = blocks.flatMap(r => subtract(r, cut));
    function subdivide(r, depth=0) {
      const w=r.x1-r.x0, d=r.z1-r.z0;
      if (w < 7 || d < 7) return;
      if (depth < 3 && (w > 35 || d > 40)) {
        if (w/35 > d/40) {
          const mid=r.x0+w*.5;
          subdivide({...r,x1:mid-1.6},depth+1); subdivide({...r,x0:mid+1.6},depth+1);
        } else {
          const mid=r.z0+d*.47;
          subdivide({...r,z1:mid-1.6},depth+1); subdivide({...r,z0:mid+1.6},depth+1);
        }
        return;
      }
      footprints.push({x:side*(r.x0+r.x1)/2,z:(r.z0+r.z1)/2,w:w-.55,d:d-.55,side});
    }
    blocks.forEach(r=>subdivide(r));
    for (const [x,z] of [[132,47],[132,-63],[102,23],[89,-72],[57,106],[126,-112],[58,54]]) propSpots.push({x:side*x,z,side});
  }
  const original = {
    footprints: [...footprints], lanes: [...lanes], courtyards: [...courtyards], propSpots: [...propSpots],
  };
  for (const extension of [{ east: 0, north: -260 }, { east: 110, north: 0 }]) {
    const move = p => ({...p,x:p.x + Math.sign(p.x)*extension.east,z:p.z+extension.north});
    footprints.push(...original.footprints.map(p=>({...move(p),simple:true})));
    lanes.push(...original.lanes.map(l=>({...l,from:move(l.from),to:move(l.to)})));
    courtyards.push(...original.courtyards.map(move));
    propSpots.push(...original.propSpots.map(move));
  }
  for (const side of [-1,1]) {
    lanes.push({side,from:{x:side*126,z:-137},to:{x:side*80,z:-137},width:6});
    lanes.push({side,from:{x:side*80,z:-137},to:{x:side*80,z:-141},width:6});
    lanes.push({side,from:{x:side*148,z:39},to:{x:side*148,z:66},width:6});
    // The north boulevard has alternating obstructions and narrow crossings.
    for (const [x,z,w,d] of [[19,-173,24,23],[26,-222,23,32],[16,-274,18,22],[28,-328,18,28]]) {
      footprints.push({x:side*x,z,w,d,side,simple:true});
    }
  }
  return { footprints, lanes, courtyards, propSpots };
}
