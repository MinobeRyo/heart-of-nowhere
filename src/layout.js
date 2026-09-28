// Carve connected, dog-legged lanes out of city blocks. Both districts have
// multiple boulevard entrances, courtyards, loops and a few short dead ends.
export const WORLD_BOUNDS = Object.freeze({ minX: -258, maxX: 258, minZ: -398, maxZ: 130 });

export function createAlleyLayout() {
  const footprints = [], lanes = [], courtyards = [], propSpots = [], passages = [];
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
  // Smaller dog-legs leave the service streets, turn out of sight and rejoin
  // somewhere else. The narrower width makes these read as back alleys.
  const backRoutes = [
    { points: [[56,57],[72,57],[72,39],[86,39],[86,20]], width: 4.2 },
    { points: [[100,46],[118,46],[118,32],[133,32],[133,2],[118,2],[118,-17]], width: 4.4 },
    { points: [[72,2],[87,2],[87,-17]], width: 3.8 },
    { points: [[91,-84],[91,-103],[106,-103],[106,-121],[126,-121]], width: 4.2 },
  ];
  // Each district keeps the main connections but varies its secondary loops.
  // Generate its own lots rather than copying an identical skyline.
  const districts = [
    { east: 0, north: 0, loops: [0,1,2,3] },
    { east: 0, north: -260, loops: [0,2,3], simple: true },
    { east: 110, north: 0, loops: [0,1,3], simple: true },
  ];
  for (const district of districts) for (const side of [-1, 1]) {
    const move = ([x,z]) => ({ x: side * (x + district.east), z: z + district.north });
    let blocks = [{ x0: 43, x1: 143, z0: -132, z1: 119 }];
    const cuts = [];
    const districtRoutes = [
      ...routes.map(points => ({ points, width: side < 0 ? 6 : 7.2, kind: 'service' })),
      ...district.loops.map(i => ({ ...backRoutes[i], kind: 'back-alley' })),
    ];
    for (const { points: route, width, kind } of districtRoutes) for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const halfWidth = width / 2;
      const cut = { x0: Math.min(a[0],b[0])-halfWidth, x1: Math.max(a[0],b[0])+halfWidth, z0: Math.min(a[1],b[1])-halfWidth, z1: Math.max(a[1],b[1])+halfWidth };
      cuts.push(cut);
      lanes.push({ side, from: move(a), to: move(b), width, kind });
    }
    const courts = [[100,20,18,18],[91,-69,15,17],[86,39,8.5,8.5],[106,-103,9,9]];
    if (district.loops.includes(1)) courts.push([133,32,9,10]);
    for (const [x,z,w,d] of courts) {
      cuts.push({ x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2 });
      courtyards.push({ ...move([x,z]), w, d });
    }
    for (const cut of cuts) blocks = blocks.flatMap(r => subtract(r, cut));
    function subdivide(r, depth=0) {
      const w=r.x1-r.x0, d=r.z1-r.z0;
      // Keep slender buildings beside the new lanes instead of turning every
      // small remainder into an oversized plaza. Discard only unusable slivers.
      if (w < 5.5 || d < 5.5 || w * d < 58) return;
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
      footprints.push({ ...move([(r.x0+r.x1)/2,(r.z0+r.z1)/2]), w:w-.55, d:d-.55, side, simple:district.simple });
    }
    blocks.forEach(r=>subdivide(r));
    for (const [x,z] of [[132,47],[132,-63],[102,23],[89,-72],[57,106],[126,-112],[58,54]]) propSpots.push({ ...move([x,z]), side });
    // Buildings flank these stretches. Keep the ground corridor open when
    // adding an overhead room or bridge; width includes the facade setback.
    passages.push({ ...move([56,67]), axis:'z', width:(side < 0 ? 6 : 7.2)+.55, depth:4.4, side });
  }
  for (const side of [-1,1]) {
    lanes.push({side,from:{x:side*126,z:-132},to:{x:side*126,z:-137},width:6});
    lanes.push({side,from:{x:side*126,z:-137},to:{x:side*80,z:-137},width:6});
    lanes.push({side,from:{x:side*80,z:-137},to:{x:side*80,z:-141},width:6});
    lanes.push({side,from:{x:side*143,z:66},to:{x:side*148,z:66},width:6});
    lanes.push({side,from:{x:side*148,z:39},to:{x:side*148,z:66},width:6});
    lanes.push({side,from:{x:side*148,z:39},to:{x:side*150,z:39},width:6});
    // The north boulevard has alternating obstructions and narrow crossings.
    for (const [x,z,w,d] of [[19,-173,24,23],[26,-222,23,32],[16,-274,18,22],[28,-328,18,28]]) {
      footprints.push({x:side*x,z,w,d,side,simple:true});
    }
  }
  return { footprints, lanes, courtyards, propSpots, passages };
}
