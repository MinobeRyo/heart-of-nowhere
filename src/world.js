import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createAlleyLayout } from './layout.js';
import { buildingVolumes, createArchitecture } from './architecture.js';
import { createTrafficSignals } from './traffic.js';
import { createStreetDetails } from './streets.js';
import { STREET } from './scale.js';

export function createWorld(scene) {
  let seed = 317;
  const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + rand() * (b - a);
  const colliders = [], buildings = [], echoes = [], animated = [], batches = new Map();
  const alleyLayout = createAlleyLayout();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const material = (color, roughness = 0.75, metalness = 0.1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
  const mats = {
    stone: material('#263247'), stone2: material('#303850'), stone3: material('#252b43'), trim: material('#485369', .52, .35),
    dark: material('#111c2b', .44, .5), roof: material('#263746', .83), glass: material('#101e2d', .2, .7),
    warm: glow('#eccf82', 1.8), warmDim: glow('#958769', .8), ice: glow('#9ec9d3', 1.2), blue: glow('#72d6e2', 2.8),
    pink: glow('#e456b7', 3.7), purple: glow('#8e68ed', 3.1), red: glow('#c63b63', 2.8), white: glow('#d4e6db', 1.8),
    metal: material('#344153', .45, .65), rubber: material('#101218'), paint: material('#7c8190', .4, .6),
    roadmark: material('#707e85', .8), sidewalk: material('#303c4a', .8), tactile: material('#777152', .92), paper: material('#a9aea8'), rust: material('#635059'),
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
  const mirror = new Reflector(new THREE.PlaneGeometry(1100, 1100), { clipBias: .003, textureWidth: 1024, textureHeight: 1024, color: 0x303943 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -.065; scene.add(mirror);
  const groundMat = new THREE.MeshStandardMaterial({ color: '#101b2b', roughness: .45, metalness: .3, transparent: true, opacity: .81, map: asphalt });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.055; scene.add(ground);

  const intersections = [{ z:39,offset:0 },{ z:-9,offset:13 },{ z:-59,offset:27 },{ z:88,offset:8 }];
  // Paired crossings frame each junction; curb cuts line up with the alleys.
  for (let z = -140; z < 120; z += 11) {
    if (intersections.some(c => Math.abs(c.z - z) < 11)) continue;
    box(-.15, -.035, z, .085, .015, 4.3, mats.roadmark);
    box(.15, -.035, z, .085, .015, 4.3, mats.roadmark);
  }
  for (const {z} of intersections) {
    for (const side of [-1,1]) {
      for (let x = -9.5; x <= 9.5; x += 1.58) box(x,-.026,z+side*5.8,.88,.02,2.6,mats.roadmark);
      box(side*5.2,-.028,z+side*8.1,9.5,.02,.24,mats.roadmark);
      // Tactile paving at the mouths, with small separated curb blocks.
      for (const approach of [-1,1]) {
        const crossingX=side*(STREET.curbX+1.18);
        box(crossingX,.014,z+approach*5.8,2.25,.035,1.3,mats.tactile);
        for (let n=0;n<9;n++) box(crossingX-1+n*.25,.04,z+approach*5.8,.055,.025,1.12,mats.trim);
      }
    }
  }
  for (const side of [-1, 1]) {
    for (let z = -128; z < 125; z += 2) {
      if (intersections.some(c=>Math.abs(z-c.z)<8)) continue;
      box(side*STREET.sidewalkCenter,-.005,z,STREET.sidewalkWidth,.07,1.94,mats.sidewalk);
      box(side*STREET.curbX,.065,z,.24,.2,1.88,mats.trim);
      box(side*STREET.roadHalfWidth,-.02,z,.11,.018,1.94,mats.roadmark);
      // Longitudinal paving seams make the wider sidewalk read at walking scale.
      box(side*13.35,.034,z,.035,.008,1.94,mats.dark);
    }
    for (const z of [-92,-34,60,66]) {
      box(side*9,-.023,z,2.45,.019,.09,mats.roadmark);
      box(side*7.8,-.023,z+2.5,.09,.019,5,mats.roadmark);
    }
    for (const z of [55, 9, -41, -91]) {
      for (let i = 0; i < 9; i++) box(side * (STREET.curbX-.38), .015, z + i * .13, .7, .025, .05, mats.dark);
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
      [...text].forEach((c, i) => ctx.fillText(c, 128, 60 + (canvas.height - 120) / text.length * (i + .5)));
    } else {
      ctx.font = `500 ${text.length > 12 ? 76 : 110}px sans-serif`;
      ctx.fillText(text, 512, sub ? 155 : 190);
      if (sub) { ctx.font = '26px sans-serif'; ctx.shadowBlur = 0; ctx.fillText(sub, 512, 273); }
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: color, emissiveIntensity: 2.6, roughness: .4 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.position.set(x, y, z); mesh.rotation.y = rotation; scene.add(mesh);
    const phase = rand()*19;
    animated.push({ mesh, mat, phase, period: range(9,18), broken: animated.length%3 === 0, base: range(2.2,3.3), w, h });
    return mesh;
  }

  const architecture = createArchitecture({ box, solid, mats });
  function building(x, z, w, d, h, index, options = {}) {
    const base = options.material || [mats.stone, mats.stone2, mats.stone3][index % 3];
    const volumes = buildingVolumes(x, z, w, d, h, index, options.stepped);
    const b = { minX:x-w/2,maxX:x+w/2,minY:0,maxY:h,minZ:z-d/2,maxZ:z+d/2 };
    buildings.push(b);
    for (const v of volumes) {
      const height = v.top - v.bottom;
      solid(v.x, v.bottom + height / 2, v.z, v.w, height, v.d);
      box(v.x, v.bottom + height / 2, v.z, v.w, height, v.d, base);
      box(v.x, v.top - .25, v.z, v.w + .4, .5, v.d + .4, mats.trim);
      box(v.x, v.top + .1, v.z, v.w - .3, .2, v.d - .3, mats.roof);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(v.x + sx * (v.w / 2 - .4), v.bottom + height / 2, v.z + sz * (v.d / 2 - .4), .72, height, .72, mats.trim);
      }
      const frontCols = Math.floor((v.w - 3) / 2.9), sideCols = Math.floor((v.d - 3) / 2.9);
      // Every floor's windows follow its actual volume, including recessed tiers.
      for (let y = Math.max(6.1, v.bottom + 1.7); y < v.top - 1.2; y += options.simple ? 7.1 : 3.55) {
        for (const side of [-1, 1]) {
          for (let c = 0; c < frontCols; c++) {
            const wx = v.x + (c - (frontCols - 1) / 2) * 2.9;
            const wz = v.z + side * (v.d / 2 + .035);
            if (!options.simple) box(wx, y, wz, 1.42, 2.3, .08, mats.dark);
            const lit = rand();
            const wm = lit < .16 ? mats.warm : lit < .2 ? mats.ice : lit < .26 ? mats.warmDim : mats.glass;
            box(wx, y, wz + side * .049, 1.1, 1.92, .055, wm);
            if (!options.simple) {
              box(wx, y, wz + side * .085, .07, 2, .045, mats.trim);
              box(wx, y - .2, wz + side * .085, 1.15, .08, .045, mats.trim);
              box(wx, y - 1.19, wz, 1.66, .15, .38, mats.trim);
            }
          }
          for (let c = 0; c < sideCols; c++) {
            const wz = v.z + (c - (sideCols - 1) / 2) * 2.9;
            const wx = v.x + side * (v.w / 2 + .035);
            if (!options.simple) box(wx, y, wz, .08, 2.3, 1.42, mats.dark);
            const lit = rand();
            const wm = lit < .15 ? mats.warm : lit < .2 ? mats.ice : lit < .24 ? mats.warmDim : mats.glass;
            box(wx + side * .049, y, wz, .055, 1.92, 1.1, wm);
            if (!options.simple) {
              box(wx + side * .085, y, wz, .045, 2, .07, mats.trim);
              box(wx + side * .085, y - .2, wz, .045, .08, 1.15, mats.trim);
            }
          }
        }
      }
      // Raised buttresses, belt courses and ledges catch light from different angles.
      for (let i = 0; i <= frontCols; i += options.simple ? 2 : 1) {
        const px = v.x + (i - frontCols / 2) * 2.9;
        const lower = Math.max(4.5, v.bottom);
        if (v.top > lower) for (const side of [-1, 1]) box(px, (v.top + lower) / 2, v.z + side * (v.d / 2 + .1), .25, v.top - lower, .3, mats.trim);
      }
      if (!options.simple) for (let y = Math.max(10, v.bottom + 4); y < v.top - 2; y += 10.65) {
        box(v.x,y,v.z,v.w+.65,.17,v.d+.65,mats.metal);
      }
    }
    box(x, .45, z, w + .4, .9, d + .4, mats.dark);
    box(x, 4.1, z, w + .4, .3, d + .4, mats.trim);
    const facing = x < 0 ? 1 : -1, fx = x + facing * (w / 2 + .12);
    for (let i = -1; i <= 1; i++) {
      if (Math.abs(i * 4) + 1.4 > d / 2 - .2) continue;
      if (i === 0) {
        // A ground-level door and handle give the street a consistent human scale.
        box(fx,1.46,z,.08,2.82,1.46,mats.dark);
        box(fx+facing*.055,1.6,z,.05,2.32,1.13,index%3===0?mats.warmDim:mats.glass);
        for(const edge of [-.76,.76])box(fx+facing*.08,1.5,z+edge,.12,2.96,.09,mats.trim);
        box(fx+facing*.08,2.96,z,.12,.1,1.61,mats.trim);
        box(fx+facing*.15,1.38,z+.45,.11,.44,.055,mats.paint);
        box(fx+facing*.19,.065,z,.42,.1,1.66,mats.metal);
      } else {
        box(fx,1.9,z+i*4,.07,2.8,2.8,mats.glass);
        box(fx+facing*.1,1.9,z+i*4,.06,2.8,.07,mats.metal);
      }
    }
    box(fx + facing * .5, 3.8, z, 1.4, .16, Math.min(d - 3, 16), mats.dark);
    const accent = index % 4 === 0 ? mats.pink : index % 4 === 1 ? mats.blue : mats.purple;
    const top = volumes.at(-1);
    if (index % 3 !== 2) {
      box(fx + facing * 1.1, 3.78, z, .055, .09, Math.min(d - 3, 16), accent);
      box(top.x + facing * (top.w / 2 + .08), h - 1.1, top.z, .06, .085, top.d - 1, accent);
    }
    if (volumes.length === 1) architecture.facadeDetails(x, z, w, d, h, index, options.simple);
    // Small rooftop service cores leave terraces around the uppermost floor.
    const rw = top.w * .2;
    box(top.x + top.w * .22, h + 1.1, top.z - top.d * .2, rw, 2.2, top.d * .2, mats.metal);
    solid(top.x + top.w * .22, h + 1.1, top.z - top.d * .2, rw, 2.2, top.d * .2);
    box(top.x - top.w * .25, h + 3, top.z - top.d * .24, .09, 6, .09, mats.metal);
    box(top.x - top.w * .25, h + 4.2, top.z - top.d * .24, 3.2, .065, .065, mats.metal);
    if (index < 8 && index % 2 === 0) {
      const cx=x + Math.sign(x)*w*.12, cz=z-d*.22;
      box(cx,h+4,cz,w*.56,8,d*.46,base); solid(cx,h+4,cz,w*.56,8,d*.46);
      box(cx,h+8.2,cz,w*.6,.4,d*.5,mats.trim);
      for(const side of [-1,1])for(let q=-1;q<=1;q++)box(cx+q*3,h+4.4,cz+side*(d*.23+.03),1.4,4.5,.06,q===0?mats.warmDim:mats.glass);
    }
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
  const avenueBuildings = [];
  let index = 0;
  for (const z of rows) {
    for (const side of [-1, 1]) {
      const height = side < 0 ? [34, 50, 40, 62][rows.indexOf(z)] : [41, 33, 56, 45][rows.indexOf(z)];
      avenueBuildings.push(building(side * 28, z, 24, 32, height, index, { spire: index === 2 || index === 5 }));
      index++;
    }
  }
  // Lower stepping roofs offer approachable routes before the taller towers.
  const entryRoof = building(-24, 101, 16, 14, 13, 31);
  building(26, 101, 20, 15, 18, 32);
  for (const lot of alleyLayout.footprints) {
    // Add one or two storeys, retaining the existing floor/window dimensions.
    const height = range(14, 39) + (lot.w * lot.d > 320 ? 7.1 : 3.55);
    building(lot.x, lot.z, lot.w, lot.d, height, index++, { simple: lot.simple, stepped: true });
    // Roof-edge tubes and projecting neon panels pull the eye around corners.
    if (index % (lot.simple ? 6 : 3) === 0) {
      const front = lot.z + lot.d / 2 + .14;
      box(lot.x, 5.7, front, Math.min(7, lot.w-.8), .075, .075, index%2 ? mats.blue : mats.pink);
      box(lot.x-lot.w/2+.3, 4.1, front, .075, 3.2, .075, mats.purple);
      sign(index%2 ? '24H' : 'OPEN', '', lot.x, 4.5, front+.03, Math.min(4,lot.w*.55), 1.3, index%2 ? '#54def4' : '#f16bbc');
    }
  }
  // Narrow entrances turn before joining the winding service streets.
  for (const side of [-1,1]) {
    for (const [x,z,w,d,h] of [[28,38.5,13,5,13],[24,-10,10,4.5,9],[31,-59.5,12,4.8,17]]) {
      building(side*x,z,w,d,h,index++);
    }
    sign('↳', '', side*41.9, 4.6, 42.3, 2.2, 1.3, side<0 ? '#83dfed' : '#ed81c8');
  }
  for (const lane of alleyLayout.lanes) {
    const dx=lane.to.x-lane.from.x, dz=lane.to.z-lane.from.z;
    const length=Math.hypot(dx,dz), cx=(lane.from.x+lane.to.x)/2, cz=(lane.from.z+lane.to.z)/2;
    // Interrupted utility seams, damp curb edges and overhead pipes.
    box(cx,.015,cz,dx ? length : .2,.025,dz ? length : .2,mats.dark);
    if (length>16) {
      const rotation=dx ? 0 : Math.PI/2;
      box(cx,7.4,cz,length,.12,.12,mats.rust,rotation);
      box(cx,7.25,cz+.2,Math.min(length,9),.045,.045,lane.side<0 ? mats.purple : mats.blue,rotation);
      if (length>21) {
        const px=cx+(dz ? lane.width/2-.85 : 0), pz=cz+(dx ? lane.width/2-.85 : 0);
        const panel=sign(lane.side<0 ? '◇' : '24', '', px,4.7,pz,1.35,3.5,lane.side<0 ? '#f165c2' : '#51dded',dx ? Math.PI/2 : 0,true);
        panel.material.side=THREE.DoubleSide;
      }
    }
  }
  for (const court of alleyLayout.courtyards) {
    box(court.x,.015,court.z,court.w-1,.025,court.d-1,mats.sidewalk);
    box(court.x, .038,court.z,court.w-2,.012,.08,mats.purple);
  }
  alleyLayout.passages.forEach((passage,index)=>architecture.passage(passage,index));

  // The Meridian: a layered, monumental tower at the end of the boulevard.
  const landmark = building(0, -127, 30, 27, 64, 34);
  box(0, landmark.h+4, -127, 24, 8, 22, mats.stone2); solid(0, landmark.h+4, -127, 24, 8, 22);
  box(0, landmark.h+12, -127, 17, 8, 17, mats.stone2); solid(0, landmark.h+12, -127, 17, 8, 17);
  box(0, landmark.h+19, -127, 10, 6, 12, mats.dark);
  box(0, landmark.h+27, -127, .22, 12, .22, mats.trim);
  box(0, landmark.h+33.3, -127, .3, .6, .3, mats.blue);
  for (const x of [-13.4, -11, 11, 13.4]) box(x, (landmark.h+1)/2, -113.34, .1, landmark.h-6, .08, x === -11 || x === 11 ? mats.blue : mats.warmDim);
  sign('MERIDIAN', 'THE LAST LIGHT PICTURE HOUSE', 0, 8.5, -113.25, 23, 5.3, '#afe9dc');
  sign('03 : 17', 'THE NIGHT IS STILL YOUNG', 0, landmark.h-8, -113.23, 18, 9, '#a6bbe9');
  sign('月 の む こ う', '', 0, landmark.h+5, -115.92, 19, 6, '#e2dfb4');
  for (let i = 0; i < 5; i++) box(0, .18 + i * .15, -110 - i * .9, 22 - i * 1.1, .3, 1.2, mats.trim);
  const archPoints = [];
  for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI; archPoints.push([Math.cos(a) * 9, 12 + Math.sin(a) * 6, -113.2]); }
  line(archPoints, '#eccca0');
  for (let i = 0; i < 3; i++) box((i - 1) * 3.8, 2.4, -113.1, 2.8, 4.2, .1, mats.warm);

  // Distant skyline, kept deliberately less detailed in the fog.
  for (let i = 0; i < 56; i++) {
    const a = i / 56 * Math.PI * 2;
    const x = Math.sin(a) * range(440, 500), z = Math.cos(a) * range(440, 500) - 100;
    const h = range(42, 116), w = range(12, 23), d = range(13, 24);
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
  sign('＋', '', -12.8,5.8,55,1.4,2.8,'#6ee8ef',0,true);
  const featuredFault=animated[animated.length-1];featuredFault.broken=true;
  box(-14.3,7.25,55,3.6,.1,.1,mats.metal);
  line([[-16,6.8,55],[-15,6.2,55.1],[-13.5,6.3,55.1],[-12.3,5.2,55.16]],'#273c50');

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
  for (const z of [81, 32, -17, -66, -106]) for (const side of [-1, 1]) streetlamp(side * (STREET.curbX+.8), z, -side);

  const traffic = createTrafficSignals(scene, { box, solid, mats, intersections });
  createStreetDetails(scene, { box, solid, mats, intersections });

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
  const dumpsterPaint = material('#263f3e', .88, .2);
  const trashBagMaterial = material('#17252b', .72, .1);
  const propInstances = new Map();
  const bagGeometry = new THREE.IcosahedronGeometry(1, 1);
  const canGeometry = new THREE.CylinderGeometry(.085, .1, .3, 8);
  const wheelGeometry = new THREE.CylinderGeometry(.16, .16, .14, 8);
  // Dented can sides, with a slightly crushed rim.
  const canVertices = canGeometry.attributes.position;
  for (let i=0;i<canVertices.count;i++) {
    if (canVertices.getX(i)>.03 && canVertices.getY(i)>0) canVertices.setX(i,canVertices.getX(i)*.63);
  }
  canGeometry.computeVertexNormals();
  const canMaterials = [material('#954a58',.5,.5), material('#37717e',.5,.5), mats.paint];
  function instanceProp(geo,mat,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0) {
    let list=propInstances.get(geo);
    if(!list){list=new Map();propInstances.set(geo,list);}
    if(!list.has(mat))list.set(mat,[]);
    list.get(mat).push({x,y,z,sx,sy,sz,rx,ry,rz});
  }
  const trashLocations = [...alleyLayout.propSpots,{x:-13,z:58,side:-1},{x:13,z:32,side:1},{x:-13,z:-37,side:-1}];
  for (const spot of trashLocations) {
    const x=spot.x+spot.side*1.1, z=spot.z;
    if(buildings.some(b=>x+1.2>b.minX&&x-1.2<b.maxX&&z+.75>b.minZ&&z-.75<b.maxZ))continue;
    box(x,.94,z,2.15,1.45,1.28,dumpsterPaint);
    solid(x,.9,z,2.3,1.8,1.5);
    box(x,.27,z,2.25,.16,1.4,mats.rust);
    box(x+.16,1.82,z-.07,2.35,.11,1.49,mats.metal,0,range(-.2,.2));
    for(const offset of [-.82,-.3,.3,.82])box(x+offset,.97,z+.66,.05,1.16,.045,mats.rust);
    for(let i=0;i<12;i++)box(x+range(-.95,.95),range(.35,1.6),z+.66,range(.07,.3),range(.035,.13),.015,mats.rust,0,range(-.4,.4));
    box(x-.4,1.19,z+.677,.34,.26,.013,mats.paper,0,.19);
    for(const sx of [-.83,.83])for(const sz of [-.45,.45])instanceProp(wheelGeometry,mats.rubber,x+sx,.16,z+sz,1,1,1,0,0,Math.PI/2);
    for(let i=0;i<3;i++) {
      const bx=x+range(-1.5,1.5), bz=z+range(.85,1.4);
      instanceProp(bagGeometry,trashBagMaterial,bx,.38,bz,range(.28,.48),range(.35,.58),range(.26,.43),0,range(0,6.28));
      box(bx,.86,bz,.1,.19,.1,mats.dark,0,.35);
    }
    for(let i=0;i<10;i++) {
      const cx=x+range(-2.1,2.1), cz=z+range(.8,2.8), standing=i%4===0;
      instanceProp(canGeometry,canMaterials[i%3],cx,standing?.16:.105,cz,1,range(.75,1.1),1,standing?0:Math.PI/2,range(0,6.28),range(-.15,.15));
      if(i%3===0)box(cx+.2,.018,cz+.2,.26,.01,.19,mats.paper,range(0,6.28));
    }
  }
  // A handful of loose cans in the starting area makes the detail visible immediately.
  for(let i=0;i<22;i++)instanceProp(canGeometry,canMaterials[i%3],range(3.5,8.5),.11,range(53,64),1,1,1,Math.PI/2,range(0,6.28));
  for(const [geo,materials] of propInstances)for(const [mat,list]of materials){
    const mesh=new THREE.InstancedMesh(geo,mat,list.length);
    list.forEach((o,i)=>{dummy.position.set(o.x,o.y,o.z);dummy.rotation.set(o.rx,o.ry,o.rz);dummy.scale.set(o.sx,o.sy,o.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.computeBoundingSphere();scene.add(mesh);
  }

  // Faulty connectors emit brief local arcs and sparks, not full-screen flashes.
  const sparkSigns=animated.filter(s=>s.broken);
  const sparksPerSign=18, sparkPositions=new Float32Array(sparkSigns.length*sparksPerSign*3);
  const sparkTrailPositions=new Float32Array(sparkPositions.length*2);
  const sparkColors=new Float32Array(sparkPositions.length);
  for(let i=0;i<sparkColors.length;i+=3){sparkColors[i]=1.8;sparkColors[i+1]=range(.8,1.6);sparkColors[i+2]=range(.25,.65);}
  const sparkGeometry=new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position',new THREE.BufferAttribute(sparkPositions,3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute('color',new THREE.BufferAttribute(sparkColors,3));
  const sparkCanvas=document.createElement('canvas');sparkCanvas.width=sparkCanvas.height=32;
  const sparkCtx=sparkCanvas.getContext('2d'),sparkGradient=sparkCtx.createRadialGradient(16,16,0,16,16,16);
  sparkGradient.addColorStop(0,'#ffffffff');sparkGradient.addColorStop(.25,'#ffffffed');sparkGradient.addColorStop(1,'#ffffff00');
  sparkCtx.fillStyle=sparkGradient;sparkCtx.fillRect(0,0,32,32);
  const sparkMaterial=new THREE.PointsMaterial({map:new THREE.CanvasTexture(sparkCanvas),size:.085,vertexColors:true,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  const sparks=new THREE.Points(sparkGeometry,sparkMaterial);sparks.frustumCulled=false;scene.add(sparks);
  const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(sparkTrailPositions,3).setUsage(THREE.DynamicDrawUsage));
  const sparkTrails=new THREE.LineSegments(trailGeometry,new THREE.LineBasicMaterial({color:new THREE.Color(2.5,1.65,.65),transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));sparkTrails.frustumCulled=false;scene.add(sparkTrails);
  for(const s of sparkSigns){
    s.mesh.updateMatrixWorld();
    s.source=s.mesh.localToWorld(new THREE.Vector3(s.w*.4,-s.h*.37,.16));
    const arcGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(.11,-.12,.04),new THREE.Vector3(-.05,-.2,.03),new THREE.Vector3(.12,-.32,.06)]);
    s.arc=new THREE.Line(arcGeo,new THREE.LineBasicMaterial({color:new THREE.Color(2,2.9,3.2),transparent:true,opacity:.85}));
    s.arc.position.copy(s.source);s.arc.visible=false;scene.add(s.arc);
  }
  // Reuse four lights around the player instead of adding a light to every sign.
  const localNeonLights=Array.from({length:4},()=>pointLight(0,-20,0,'#6adbed',0,13));
  let lightRefresh=0;
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
    { x: -24, y: entryRoof.h+1.5, z: 102, title: '02 / 帰り道', text: '誰かが灯した明かりは、まだ帰りを待っている。' },
    { x: 27, y: avenueBuildings[3].h+1.5, z: 17, title: '03 / 窓の向こう', text: '名前を忘れても、この夜の色は覚えている。' },
    { x: -27, y: avenueBuildings[4].h+1.5, z: -31, title: '04 / 雨の記憶', text: '降り続く雨だけが、街の時間を知っている。' },
    { x: 0, y: landmark.h+1.5, z: -116, title: '05 / 月が残したもの', text: '誰もいない世界にも、あなたが来た記憶が残る。' },
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
    traffic.update(time);
    lightRefresh-=dt;
    if(lightRefresh<=0){
      lightRefresh=.2;
      const nearest=animated.map(s=>({s,d:s.mesh.position.distanceToSquared(cameraPosition)})).filter(o=>o.d<38*38).sort((a,b)=>a.d-b.d).slice(0,4);
      localNeonLights.forEach((light,i)=>{
        const sign=nearest[i]?.s;
        light.userData.sign=sign;
        light.intensity=sign?28:0;
        if(sign){light.color.copy(sign.mat.emissive);light.position.copy(sign.mesh.position).add(new THREE.Vector3(0,0,.8).applyQuaternion(sign.mesh.quaternion));light.position.y=Math.min(light.position.y,5.5);}
      });
    }
    for(const s of animated){
      const t=(time+s.phase)%s.period;
      const failing=s.broken&&t<.85;
      const pulse=Math.sin(t*83)+Math.sin(t*37);
      s.mat.emissiveIntensity=s.base*(failing?(pulse>.45?1.35:.035):(.96+Math.sin(time*1.4+s.phase)*.04));
    }
    for(const light of localNeonLights)if(light.userData.sign)light.intensity=light.userData.sign.mat.emissiveIntensity*10;
    for(let j=0;j<sparkSigns.length;j++){
      const s=sparkSigns[j], t=(time+s.phase)%s.period;
      const nearby=s.source.distanceToSquared(cameraPosition)<100*100;
      s.arc.visible=nearby&&t<.45&&Math.sin(t*83)>.3;
      for(let i=0;i<sparksPerSign;i++){
        const age=t-i*.012, offset=(j*sparksPerSign+i)*3;
        const trailOffset=offset*2;
        if(!nearby||age<0||age>.72){sparkPositions[offset]=s.source.x;sparkPositions[offset+1]=-1000;sparkPositions[offset+2]=s.source.z;sparkTrailPositions[trailOffset+1]=-1000;sparkTrailPositions[trailOffset+4]=-1000;continue;}
        const a=i*2.399+s.phase;
        sparkPositions[offset]=s.source.x+Math.cos(a)*age*(1.3+i%4);
        sparkPositions[offset+1]=s.source.y+age*(1.2+i%3)-7*age*age;
        sparkPositions[offset+2]=s.source.z+Math.sin(a)*age*(1+i%3);
        sparkTrailPositions[trailOffset]=sparkPositions[offset];sparkTrailPositions[trailOffset+1]=sparkPositions[offset+1];sparkTrailPositions[trailOffset+2]=sparkPositions[offset+2];
        const previousAge=Math.max(0,age-.035);
        sparkTrailPositions[trailOffset+3]=s.source.x+Math.cos(a)*previousAge*(1.3+i%4);
        sparkTrailPositions[trailOffset+4]=s.source.y+previousAge*(1.2+i%3)-7*previousAge*previousAge;
        sparkTrailPositions[trailOffset+5]=s.source.z+Math.sin(a)*previousAge*(1+i%3);
      }
    }
    sparkGeometry.attributes.position.needsUpdate=true;
    trailGeometry.attributes.position.needsUpdate=true;
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
  return { colliders, buildings, echoes, rain, update, setQuality, landmark, sparkSample:featuredFault };
}
