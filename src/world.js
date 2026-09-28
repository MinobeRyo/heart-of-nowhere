import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function createWorld(scene) {
  let seed = 317;
  const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + rand() * (b - a);
  const colliders = [], buildings = [], echoes = [], animated = [], batches = new Map();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const material = (color, roughness = 0.75, metalness = 0.1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
  const mats = {
    stone: material('#263247'), stone2: material('#303850'), stone3: material('#252b43'), trim: material('#485369', .52, .35),
    dark: material('#111c2b', .44, .5), roof: material('#263746', .83), glass: material('#101e2d', .2, .7),
    warm: glow('#eccf82', 1.8), warmDim: glow('#958769', .8), ice: glow('#9ec9d3', 1.2), blue: glow('#72d6e2', 2.8),
    pink: glow('#ca599d', 2.4), purple: glow('#7465d9', 2.1), red: glow('#b93855', 1.7), white: glow('#d4e6db', 1.8),
    metal: material('#344153', .45, .65), rubber: material('#101218'), paint: material('#7c8190', .4, .6),
    roadmark: material('#707e85', .8), sidewalk: material('#303c4a', .8), paper: material('#a9aea8'), rust: material('#635059'),
  };

  function box(x, y, z, w, h, d, mat, ry = 0, rz = 0) {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push({ x, y, z, w, h, d, ry, rz });
  }
  function solid(x, y, z, w, h, d, climbable = true) {
    const b = { minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2, climbable };
    colliders.push(b); return b;
  }
  function line(points, color, opacity = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    scene.add(l); return l;
  }

  scene.background = new THREE.Color('#080e20');
  scene.fog = new THREE.FogExp2('#111e34', 0.0047);
  scene.add(new THREE.HemisphereLight('#a9b9ed', '#344252', 2.2));
  const moonlight = new THREE.DirectionalLight('#b5c7eb', 2.1);
  moonlight.position.set(-50, 120, -120); scene.add(moonlight);
  const fill = new THREE.DirectionalLight('#747bab', .8); fill.position.set(30, 35, 70); scene.add(fill);

  // Wet asphalt: a dim planar reflection under a noisy, partially opaque surface.
  const groundTextureCanvas = document.createElement('canvas');
  groundTextureCanvas.width = groundTextureCanvas.height = 512;
  const gtx = groundTextureCanvas.getContext('2d');
  const pixels = gtx.createImageData(512, 512);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = 85 + rand() * 70;
    pixels.data[i] = v; pixels.data[i + 1] = v; pixels.data[i + 2] = v; pixels.data[i + 3] = 255;
  }
  gtx.putImageData(pixels, 0, 0);
  gtx.globalAlpha = .45; gtx.fillStyle = '#e4e4e4';
  for (let i = 0; i < 80; i++) { gtx.beginPath(); gtx.ellipse(range(0, 512), range(0, 512), range(20, 100), range(3, 25), 0, 0, Math.PI * 2); gtx.fill(); }
  const asphalt = new THREE.CanvasTexture(groundTextureCanvas); asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping; asphalt.repeat.set(34, 34);
  const mirror = new Reflector(new THREE.PlaneGeometry(600, 600), { clipBias: .003, textureWidth: 1024, textureHeight: 1024, color: 0x303943 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -.065; scene.add(mirror);
  const groundMat = new THREE.MeshStandardMaterial({ color: '#101b2b', roughness: .45, metalness: .3, transparent: true, opacity: .81, map: asphalt });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.055; scene.add(ground);

  // Road paint, expansion joints, drainage grates and crossing stripes.
  for (let z = -140; z < 120; z += 11) {
    if ([39, -9, -59, 88].some(c => Math.abs(c - z) < 7)) continue;
    box(-.15, -.035, z, .085, .015, 4.3, mats.roadmark);
    box(.15, -.035, z, .085, .015, 4.3, mats.roadmark);
  }
  for (const z of [39, -9, -59, 88]) {
    for (let x = -9; x <= 9; x += 2) { box(x, -.026, z, 1, .02, 4.2, mats.roadmark); }
    box(0, -.028, z + 5, 20, .02, .2, mats.roadmark);
  }
  for (const side of [-1, 1]) {
    box(side * 12, -.02, -5, .11, .018, 244, mats.roadmark);
    for (let z = -128; z < 125; z += 4) box(side * 14.1, -.005, z, 2.7, .07, 3.94, mats.sidewalk);
    for (const z of [55, 9, -41, -91]) {
      for (let i = 0; i < 9; i++) box(side * 12.2, .015, z + i * .13, .7, .025, .05, mats.dark);
    }
  }

  function sign(text, sub, x, y, z, w, h, color = '#a7eee8', rotation = 0, vertical = false) {
    const canvas = document.createElement('canvas'); canvas.width = vertical ? 256 : 1024; canvas.height = vertical ? 1024 : 384;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101d30'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.strokeStyle = color + '66'; ctx.lineWidth = 2; ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 14; ctx.shadowColor = color;
    if (vertical) {
      ctx.font = '600 110px sans-serif';
      [...text].forEach((c, i) => ctx.fillText(c, 128, 140 + i * 168));
    } else {
      ctx.font = `500 ${text.length > 12 ? 76 : 110}px sans-serif`;
      ctx.fillText(text, 512, sub ? 155 : 190);
      if (sub) { ctx.font = '26px sans-serif'; ctx.shadowBlur = 0; ctx.fillText(sub, 512, 273); }
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: color, emissiveIntensity: 1.2, roughness: .4 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.position.set(x, y, z); mesh.rotation.y = rotation; scene.add(mesh);
    return mesh;
  }

  function building(x, z, w, d, h, index, options = {}) {
    const base = options.material || [mats.stone, mats.stone2, mats.stone3][index % 3];
    const b = solid(x, h / 2, z, w, h, d); buildings.push(b);
    box(x, h / 2, z, w, h, d, base);
    box(x, .45, z, w + .65, .9, d + .65, mats.dark);
    box(x, 4.1, z, w + .4, .3, d + .4, mats.trim);
    box(x, h - .4, z, w + .4, .7, d + .4, mats.trim);
    box(x, h + .12, z, w - .3, .24, d - .3, mats.roof);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(x + sx * (w / 2 - .4), h / 2, z + sz * (d / 2 - .4), .72, h, .72, mats.trim);
    const floors = Math.floor((h - 6) / 3.55);
    const frontCols = Math.floor((w - 3) / 2.9), sideCols = Math.floor((d - 3) / 2.9);
    for (let row = 0; row < floors; row++) {
      const y = 6.1 + row * 3.55;
      for (const side of [-1, 1]) {
        for (let c = 0; c < frontCols; c++) {
          const wx = x + (c - (frontCols - 1) / 2) * 2.9;
          const wz = z + side * (d / 2 + .035);
          box(wx, y, wz, 1.42, 2.3, .08, mats.dark);
          const lit = rand();
          const wm = lit < .16 ? mats.warm : lit < .2 ? mats.ice : lit < .26 ? mats.warmDim : mats.glass;
          box(wx, y, wz + side * .049, 1.1, 1.92, .055, wm);
          box(wx, y, wz + side * .085, .07, 2, .045, mats.trim);
          box(wx, y - .2, wz + side * .085, 1.15, .08, .045, mats.trim);
          box(wx, y - 1.19, wz, 1.66, .15, .38, mats.trim);
        }
        for (let c = 0; c < sideCols; c++) {
          const wz = z + (c - (sideCols - 1) / 2) * 2.9;
          const wx = x + side * (w / 2 + .035);
          box(wx, y, wz, .08, 2.3, 1.42, mats.dark);
          const lit = rand();
          const wm = lit < .15 ? mats.warm : lit < .2 ? mats.ice : lit < .24 ? mats.warmDim : mats.glass;
          box(wx + side * .049, y, wz, .055, 1.92, 1.1, wm);
          box(wx + side * .085, y, wz, .045, 2, .07, mats.trim);
          box(wx + side * .085, y - .2, wz, .045, .08, 1.15, mats.trim);
        }
      }
    }
    // Vertical art-deco pilasters break up the silhouette and catch the moonlight.
    for (let i = 0; i <= frontCols; i++) {
      const px = x + (i - frontCols / 2) * 2.9;
      for (const side of [-1, 1]) box(px, (h + 4.5) / 2, z + side * (d / 2 + .1), .25, h - 5, .3, mats.trim);
    }
    const facing = x < 0 ? 1 : -1;
    const fx = x + facing * (w / 2 + .12);
    // Dark shop windows and a few warm doors imply lives that have disappeared.
    for (let i = -1; i <= 1; i++) {
      box(fx, 1.9, z + i * 4, .07, 2.8, 2.8, i === 0 && index % 3 === 0 ? mats.warmDim : mats.glass);
      box(fx + facing * .1, 1.9, z + i * 4, .06, 2.8, .07, mats.metal);
    }
    box(fx + facing * .5, 3.8, z, 1.4, .16, Math.min(d - 3, 16), mats.dark);
    const accent = index % 4 === 0 ? mats.pink : index % 4 === 1 ? mats.blue : mats.purple;
    if (index % 3 !== 2) {
      box(fx + facing * 1.1, 3.78, z, .055, .09, Math.min(d - 3, 16), accent);
      box(fx + facing * .05, h - 1.1, z, .06, .085, d - 1, accent);
    }
    // Roof equipment remains collidable, so jumping on it is possible.
    const rw = w * .2;
    box(x + w * .22, h + 1.1, z - d * .2, rw, 2.2, d * .2, mats.metal);
    solid(x + w * .22, h + 1.1, z - d * .2, rw, 2.2, d * .2);
    for (let q = 0; q < 6; q++) box(x + w * .22, h + 1.1, z - d * .3 - .03 + q * .04, rw - .3, .055, .02, mats.dark);
    box(x - w * .25, h + 3, z - d * .24, .09, 6, .09, mats.metal);
    box(x - w * .25, h + 4.2, z - d * .24, 3.2, .065, .065, mats.metal);
    box(x - w * .25, h + 5.3, z - d * .24, 1.8, .065, .065, mats.metal);
    if (options.spire) {
      box(x, h + 3.7, z, w * .55, 7.4, d * .5, base); solid(x, h + 3.7, z, w * .55, 7.4, d * .5);
      box(x, h + 7.5, z, w * .6, .2, d * .55, mats.trim);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(w * .29, 9, 4), mats.dark);
      spire.position.set(x, h + 12, z); spire.rotation.y = Math.PI / 4; scene.add(spire);
      box(x, h + 19, z, .1, 8, .1, mats.trim); box(x, h + 23, z, .16, .4, .16, mats.warm);
    }
    return { x, z, w, d, h, box: b };
  }

  const rows = [62, 13, -36, -85];
  let index = 0;
  for (const z of rows) {
    for (const side of [-1, 1]) {
      const height = side < 0 ? [29, 43, 34, 54][rows.indexOf(z)] : [35, 28, 48, 38][rows.indexOf(z)];
      building(side * 28, z, 24, 32, height, index, { spire: index === 2 || index === 5 });
      index++;
      building(side * 66, z + range(-3, 3), 27, 34, range(35, 65), index++);
      building(side * 106, z, 25, 32, range(28, 68), index++, { spire: index % 4 === 0 });
    }
  }
  // Lower stepping roofs offer approachable routes before the taller towers.
  building(-24, 101, 16, 14, 11, 31);
  building(26, 101, 20, 15, 16, 32);
  building(67, 106, 25, 15, 23, 33);

  // The Meridian: a layered, monumental tower at the end of the boulevard.
  const landmark = building(0, -127, 30, 27, 55, 34);
  box(0, 59, -127, 24, 8, 22, mats.stone2); solid(0, 59, -127, 24, 8, 22);
  box(0, 67, -127, 17, 8, 17, mats.stone2); solid(0, 67, -127, 17, 8, 17);
  box(0, 74, -127, 10, 6, 12, mats.dark);
  box(0, 82, -127, .22, 12, .22, mats.trim);
  box(0, 88.3, -127, .3, .6, .3, mats.blue);
  for (const x of [-13.4, -11, 11, 13.4]) box(x, 28, -113.34, .1, 49, .08, x === -11 || x === 11 ? mats.blue : mats.warmDim);
  sign('MERIDIAN', 'THE LAST LIGHT PICTURE HOUSE', 0, 8.5, -113.25, 23, 5.3, '#afe9dc');
  sign('03 : 17', 'THE NIGHT IS STILL YOUNG', 0, 47, -113.23, 18, 9, '#a6bbe9');
  sign('月 の む こ う', '', 0, 60, -115.92, 19, 6, '#e2dfb4');
  for (let i = 0; i < 5; i++) box(0, .18 + i * .15, -110 - i * .9, 22 - i * 1.1, .3, 1.2, mats.trim);
  const archPoints = [];
  for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI; archPoints.push([Math.cos(a) * 9, 12 + Math.sin(a) * 6, -113.2]); }
  line(archPoints, '#eccca0');
  for (let i = 0; i < 3; i++) box((i - 1) * 3.8, 2.4, -113.1, 2.8, 4.2, .1, mats.warm);

  // Distant skyline, kept deliberately less detailed in the fog.
  for (let i = 0; i < 56; i++) {
    const a = i / 56 * Math.PI * 2;
    const x = Math.sin(a) * range(175, 240), z = Math.cos(a) * range(175, 240) - 20;
    const h = range(36, 104), w = range(12, 23), d = range(13, 24);
    box(x, h / 2, z, w, h, d, mats.stone3);
    for (let j = 0; j < 20; j++) box(x + range(-w * .4, w * .4), range(8, h - 3), z + d / 2 + .01, .8, 1.5, .02, rand() > .5 ? mats.warmDim : mats.ice);
    if (i % 4 === 0) box(x, h + 8, z, .15, 16, .15, mats.dark);
  }

  // Street-facing signs, each with a unique texture and fictional identity.
  sign('喫茶 月影', 'OPEN UNTIL THE END OF THE NIGHT', -15.83, 5.7, 65, 12, 2.5, '#c0e6d8', Math.PI / 2);
  sign('HOTEL', 'NO VACANCY · NO GUESTS', 15.83, 9, 61, 12, 3, '#d77eb6', -Math.PI / 2);
  sign('月影', '', -14.7, 15, 48, 2.9, 9, '#8cceec', 0, true);
  sign('HOTEL', '', 15.4, 18, 48.6, 2.5, 12, '#d47fac', 0, true);
  sign('LAUNDROMAT', '24 HOURS / 7 DAYS / FOREVER', -15.83, 5.7, 13, 15, 2.6, '#77cedd', Math.PI / 2);
  sign('MEMORY', 'RECORDS & THINGS LEFT BEHIND', 15.83, 6.2, 13, 15, 2.5, '#b9a2e4', -Math.PI / 2);
  sign('CINEMA', '', -15.3, 18, -2.9, 2.7, 11, '#e0b8a0', 0, true);
  sign('ECHO', 'ANOTHER NIGHT / ANOTHER LIFE', 15.8, 15, -52.2, 12, 5.2, '#8fdbe3');
  sign('夜行', '', -15.2, 24, -52.4, 3.8, 10, '#cca0d2', 0, true);
  sign('STAY A LITTLE LONGER', 'THE CITY REMEMBERS', -28, 25, 29.2, 17, 5, '#9fa7e3');
  sign('LATE CHECKOUT', 'ROOMS WITH A VIEW OF THE MOON', 28, 25, -2.8, 18, 4.5, '#dba4c4');

  function pointLight(x, y, z, color, intensity = 20, distance = 12) {
    const light = new THREE.PointLight(color, intensity, distance, 2); light.position.set(x, y, z); scene.add(light); return light;
  }
  // Limit real lights; emissive geometry carries the rest of the city.
  pointLight(-14, 4, 54, '#69e4df', 48, 20);
  pointLight(14, 5, 49, '#e76baf', 65, 23);
  pointLight(-14, 4, 14, '#53c6df', 52, 21);
  pointLight(12, 5, -16, '#ae76e5', 46, 20);
  pointLight(0, 4, -108, '#ffdd9c', 65, 28);

  function streetlamp(x, z, flip = 1) {
    box(x, 3.65, z, .15, 7.3, .15, mats.dark);
    box(x, .25, z, .5, .5, .5, mats.metal);
    box(x + flip * .7, 7.22, z, 1.55, .1, .1, mats.metal);
    box(x + flip * 1.35, 7.12, z, .9, .17, .58, mats.dark);
    box(x + flip * 1.35, 7.02, z, .7, .03, .4, mats.warm);
    // A soft pool of light on the asphalt costs no additional real light.
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const cx = c.getContext('2d'); const gradient = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#baa37b45'); gradient.addColorStop(1, '#baa37b00'); cx.fillStyle = gradient; cx.fillRect(0, 0, 64, 64);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 10), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .48 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x + flip * 1.4, -.02, z); scene.add(pool);
  }
  for (const z of [81, 32, -17, -66, -106]) for (const side of [-1, 1]) streetlamp(side * 13.1, z, -side);

  // A broken signal continues to run over the empty crossing.
  for (const side of [-1, 1]) {
    box(side * 11.7, 3.2, 40, .14, 6.4, .14, mats.metal);
    box(side * 8.2, 6.35, 40, 7, .12, .12, mats.metal);
    box(side * 5.2, 5.95, 40, .6, 1.15, .45, mats.dark);
    box(side * 5.2, 6.28, 40.24, .25, .25, .04, mats.red);
    box(side * 5.2, 5.65, 40.24, .25, .25, .04, mats.glass);
  }

  function car(x, z, rotation, overturned = false, color = '#677584') {
    const group = new THREE.Group(); const paint = material(color, .35, .65);
    const add = (geo, mat, px, py, pz, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.z = rz; group.add(m); return m; };
    add(new THREE.BoxGeometry(2.05, .65, 4.45), paint, 0, .77, 0);
    add(new THREE.BoxGeometry(1.77, .75, 2.3), mats.glass, 0, 1.4, -.25);
    add(new THREE.BoxGeometry(1.84, .09, 2.38), paint, 0, 1.82, -.25);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(.095, .83, 2.38), paint, sx * .9, 1.4, -.25);
      add(new THREE.BoxGeometry(.05, .74, .1), mats.metal, sx * .915, 1.4, -.35);
      for (const sz of [-1, 1]) {
        add(new THREE.CylinderGeometry(.43, .43, .25, 12), mats.rubber, sx * 1.03, .51, sz * 1.45, Math.PI / 2);
        add(new THREE.CylinderGeometry(.22, .22, .27, 10), mats.metal, sx * 1.05, .51, sz * 1.45, Math.PI / 2);
      }
      add(new THREE.BoxGeometry(.48, .2, .04), overturned ? mats.dark : mats.warmDim, sx * .66, .9, 2.24);
      add(new THREE.BoxGeometry(.48, .17, .04), mats.red, sx * .66, .88, -2.24);
    }
    add(new THREE.BoxGeometry(1.9, .18, .1), mats.metal, 0, .58, 2.25);
    add(new THREE.BoxGeometry(1.9, .18, .1), mats.metal, 0, .58, -2.25);
    if (overturned) { group.rotation.z = Math.PI * .57; group.position.y = 1.24; }
    group.rotation.y = rotation; group.position.x = x; group.position.z = z; scene.add(group);
    // Conservative AABB includes the rotated body and wheels.
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    colliders.push({ minX: bounds.min.x, maxX: bounds.max.x, minY: 0, maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z, climbable: true });
  }
  car(6.1, 48, -.48, true, '#69758a');
  car(-8.5, 5, .18, false, '#343c4e');
  car(9.2, -40, .04, false, '#61697d');
  car(-7, -88, -.55, true, '#5e4b61');

  // Small traces of everyday life: bus shelter, vending machines, benches, bins.
  function vending(x, z, rotation = 0) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.5, .86), mats.dark); body.position.y = 1.25; group.add(body);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(.85, 1.15, .03), mats.ice); panel.position.set(-.07, 1.65, .45); group.add(panel);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(.057, .057, .16, 6), [mats.pink, mats.blue, mats.warmDim][col % 3]);
      can.position.set(-.36 + col * .2, 1.25 + row * .33, .48); group.add(can);
    }
    const slot = new THREE.Mesh(new THREE.BoxGeometry(.6, .23, .04), mats.glass); slot.position.set(0, .55, .45); group.add(slot);
    group.rotation.y = rotation; group.position.set(x, 0, z); scene.add(group);
    solid(x, 1.25, z, 1.45, 2.5, 1.05);
  }
  vending(-14.6, 44, Math.PI / 2); vending(15, 31, -Math.PI / 2); vending(-14.8, -50, Math.PI / 2);
  for (const [x, z] of [[-13.8, 27], [14, 76], [-14, -21]]) {
    box(x, .65, z, 1, .16, 3.1, mats.metal);
    box(x + .4, 1.05, z, .14, .9, 3.1, mats.dark);
    box(x, .31, z - 1.15, .65, .62, .15, mats.dark); box(x, .31, z + 1.15, .65, .62, .15, mats.dark);
    solid(x, .6, z, 1, 1.2, 3.1);
  }
  for (const z of [21, 27]) box(-14.7, 1.65, z, .1, 3.3, .1, mats.metal);
  box(-14.3, 3.3, 24, 2.8, .15, 6.6, mats.metal);
  sign('終点 / LAST STOP', 'SERVICE ENDED AT 03:17', -13.98, 2.8, 24, 4.8, .75, '#a8c9d4', Math.PI / 2);
  for (let i = 0; i < 55; i++) {
    const x = range(-12, 12), z = range(-100, 100);
    box(x, .025, z, range(.12, .4), .009, range(.13, .35), i % 5 === 0 ? mats.rust : mats.paper, range(0, 6.28));
  }
  // Cables arc between buildings above the abandoned avenue.
  for (const z of [34, -14, -63]) {
    for (const offset of [0, .28]) {
      const points = [];
      for (let i = 0; i <= 24; i++) { const u = i / 24; points.push([-16 + u * 32, 15 - Math.sin(u * Math.PI) * 2.1 + offset, z]); }
      line(points, '#26344a');
    }
  }

  // A procedural heart-shaped moon, rather than a flat icon or borrowed image.
  const heart = new THREE.Shape();
  for (let i = 0; i <= 160; i++) {
    const t = i / 160 * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    if (i === 0) heart.moveTo(x, y); else heart.lineTo(x, y);
  }
  const heartGeometry = new THREE.ShapeGeometry(heart);
  const moonMaterial = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vP; void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vP;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=noise(p)*a;p=p*2.03+5.7;a*=.5;}return v;}
      void main(){vec2 uv=vP*.13;float n=fbm(uv)*.72+fbm(uv*3.8)*.28;float crater=smoothstep(.35,.67,n);vec3 c=mix(vec3(.27,.31,.27),vec3(1.05,.97,.64),crater);float rim=1.-clamp(length(vP*vec2(.045,.037)),0.,1.);c*=.85+rim*.21;gl_FragColor=vec4(c*1.25,1.);}`,
    side: THREE.DoubleSide, fog: false,
  });
  const moon = new THREE.Mesh(heartGeometry, moonMaterial); moon.scale.setScalar(3.7); moon.position.set(-9, 201, -244); scene.add(moon);
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 256;
  const glowCtx = glowCanvas.getContext('2d'); const gradient = glowCtx.createRadialGradient(128, 128, 24, 128, 128, 128);
  gradient.addColorStop(0, '#c7d4a936'); gradient.addColorStop(.4, '#9cb0ba18'); gradient.addColorStop(1, '#6c85bc00');
  glowCtx.fillStyle = gradient; glowCtx.fillRect(0, 0, 256, 256);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .8 }));
  halo.position.set(-9, 201, -246); halo.scale.set(190, 190, 1); scene.add(halo);

  const starsGeo = new THREE.BufferGeometry(); const starsPositions = [];
  for (let i = 0; i < 600; i++) {
    const a = range(0, Math.PI * 2), y = range(.15, 1), r = Math.sqrt(1 - y * y);
    starsPositions.push(Math.cos(a) * r * 450, y * 450, Math.sin(a) * r * 450);
  }
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starsPositions, 3));
  scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: '#a1bed4', size: .3, transparent: true, opacity: .48, fog: false, depthWrite: false })));

  // Five discoverable memories create a gentle route from street level to rooftops.
  const echoData = [
    { x: -11, y: 1.5, z: 27, title: '01 / 待ち合わせ', text: '「いつもの場所で。」それが最後のメッセージだった。' },
    { x: -24, y: 12.5, z: 102, title: '02 / 帰り道', text: '誰かが灯した明かりは、まだ帰りを待っている。' },
    { x: 27, y: 29.5, z: 17, title: '03 / 窓の向こう', text: '名前を忘れても、この夜の色は覚えている。' },
    { x: -27, y: 35.5, z: -31, title: '04 / 雨の記憶', text: '降り続く雨だけが、街の時間を知っている。' },
    { x: 0, y: 56.5, z: -116, title: '05 / 月が残したもの', text: '誰もいない世界にも、あなたが来た記憶が残る。' },
  ];
  for (const data of echoData) {
    const group = new THREE.Group(); group.position.set(data.x, data.y, data.z);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.38, 0), glow('#d4ebcb', 3.5)); group.add(crystal);
    const cage = new THREE.Mesh(new THREE.OctahedronGeometry(.65, 0), new THREE.MeshBasicMaterial({ color: '#cbe4d1', wireframe: true, transparent: true, opacity: .45 })); group.add(cage);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), color: '#c0ffd5', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); aura.scale.set(4, 4, 1); group.add(aura);
    scene.add(group); echoes.push({ ...data, group, crystal, cage, found: false });
  }

  // Rain is one draw call and follows the player so the whole city stays wet.
  const rainCount = 2100, rainArray = new Float32Array(rainCount * 6);
  const rainSeeds = [];
  for (let i = 0; i < rainCount; i++) rainSeeds.push({ x: range(-45, 45), y: range(0, 45), z: range(-45, 45), speed: range(15, 24) });
  const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainArray, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#809fb7', transparent: true, opacity: .19, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);

  // Instance the thousands of windows and architectural pieces by material.
  for (const [mat, list] of batches) {
    const mesh = new THREE.InstancedMesh(boxGeometry, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      const o = list[i]; dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(0, o.ry, o.rz); dummy.scale.set(o.w, o.h, o.d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.computeBoundingSphere(); scene.add(mesh);
  }

  function update(time, dt, cameraPosition) {
    for (const e of echoes) if (!e.found) {
      e.group.position.y = e.y + Math.sin(time * 1.4 + e.x) * .15;
      e.crystal.rotation.y = time * .7; e.cage.rotation.y = -time * .3;
    }
    if (rain.visible) {
      for (let i = 0; i < rainCount; i++) {
        const r = rainSeeds[i]; r.y -= r.speed * dt; if (r.y < 0) r.y += 45;
        const offset = i * 6;
        rainArray[offset] = cameraPosition.x + r.x; rainArray[offset + 1] = cameraPosition.y - 8 + r.y; rainArray[offset + 2] = cameraPosition.z + r.z;
        rainArray[offset + 3] = rainArray[offset] + .07; rainArray[offset + 4] = rainArray[offset + 1] + .65; rainArray[offset + 5] = rainArray[offset + 2] + .02;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
  }
  function setQuality(high) { mirror.visible = high; groundMat.opacity = high ? .81 : 1; rainGeometry.setDrawRange(0, high ? rainCount * 2 : 1500); }
  return { colliders, buildings, echoes, rain, update, setQuality, landmark };
}
