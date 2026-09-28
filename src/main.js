import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld } from './world.js';
import { Player, PLAYER_HEIGHT } from './physics.js';
import { CityAudio } from './audio.js';

const $ = id => document.getElementById(id);
const dom = Object.fromEntries(['intro','hud','location-card','start-button','start-label','crosshair','context-hint','altitude','motion-state','stamina-wrap','stamina-label','stamina-bar','area-en','area-name','echo-count','minimap','toast','pause-dialog','help-dialog','settings-dialog'].map(id => [id, $(id)]));

try { init(); } catch (error) {
  console.error(error);
  $('error-message').hidden = false;
  $('error-detail').textContent = error.message;
}

function init() {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .94;
  renderer.domElement.setAttribute('aria-label', '無人の夜の街。探索を始めるボタンでゲームを開始できます。');
  renderer.domElement.tabIndex = 0;
  $('game').appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .08, 750);
  camera.rotation.order = 'YXZ';
  const world = createWorld(scene);
  const player = new Player(world.colliders);
  const audio = new CityAudio();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .42, .68, 1.03);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  const keys = new Set();
  let started = false, playing = false, dragging = false, dragFallback = false, queuedJump = false;
  let yaw = 0, pitch = .19, sensitivity = 1, elapsed = 0, accumulator = 0, previousTime = performance.now();
  let mapVisible = true, foundCount = 0, toastTimeout, lastHud = 0, lastStepDistance = 0;
  let quality = 'high';
  const mapCtx = dom.minimap.getContext('2d');
  const input = {};
  const dialogs = ['pause-dialog','help-dialog','settings-dialog'].map($);
  let savedState = {};
  try { savedState = JSON.parse(localStorage.getItem('afterlight-settings') || '{}'); } catch { /* Storage is optional. */ }
  function saveSettings() {
    try { localStorage.setItem('afterlight-settings', JSON.stringify({ quality, sensitivity, rain: world.rain.visible })); } catch { /* Private browsing still works. */ }
  }
  function toast(message, duration = 5500) {
    clearTimeout(toastTimeout); dom.toast.textContent = message; dom.toast.classList.add('show');
    toastTimeout = setTimeout(() => dom.toast.classList.remove('show'), duration);
  }
  function applyQuality(value) {
    quality = value; const high = value === 'high';
    renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1));
    world.setQuality(high); bloom.enabled = high;
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
    $('quality').value = value;
  }
  if (savedState.quality === 'low') applyQuality('low');
  if (typeof savedState.sensitivity === 'number') { sensitivity = savedState.sensitivity; $('sensitivity').value = sensitivity; }
  if (savedState.rain === false) { world.rain.visible = false; $('rain-toggle').checked = false; }

  function releaseMouse() { if (document.pointerLockElement === renderer.domElement) document.exitPointerLock(); }
  function closeDialogs() { dialogs.forEach(d => { if (d.open) d.close(); }); }
  function pause() {
    if (!started || !playing) return;
    playing = false; keys.clear(); queuedJump = false; dragging = false; releaseMouse();
    closeDialogs(); dom['pause-dialog'].showModal();
  }
  function openPanel(id) {
    playing = false; keys.clear(); queuedJump = false; dragging = false; releaseMouse(); closeDialogs(); $(id).showModal();
  }
  function closePanel(id) {
    $(id).close();
    if (started) resume();
  }
  function lockMouse() {
    if (!renderer.domElement.requestPointerLock) { dragFallback = true; return; }
    try {
      const result = renderer.domElement.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {
        if (!playing) return;
        dragFallback = true;
        toast('画面をドラッグして見回せます。WASD で移動、壁に向かって Space で壁登り。');
      });
    } catch { dragFallback = true; }
  }
  function resume() {
    closeDialogs(); playing = true; keys.clear(); player.jumpWasDown = false;
    renderer.domElement.focus(); lockMouse();
  }
  function start() {
    if (started) return resume();
    started = true; document.body.classList.add('playing');
    dom.intro.classList.add('exiting'); dom['location-card'].style.opacity = 0;
    setTimeout(() => { dom.intro.hidden = true; dom['location-card'].hidden = true; }, 700);
    dom.hud.hidden = false; pitch = .14; yaw = 0;
    resume(); toast('WASD で歩く。壁に向かってジャンプすると、自動で壁につかまります。', 7000);
  }
  $('start-button').addEventListener('click', start);
  $('resume-button').addEventListener('click', resume);
  $('respawn-button').addEventListener('click', () => { player.reset(); yaw = 0; pitch = .14; resume(); toast('忘却の交差点に戻りました。'); });
  $('help-button').addEventListener('click', () => openPanel('help-dialog'));
  $('settings-button').addEventListener('click', () => openPanel('settings-dialog'));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closePanel(button.dataset.close)));
  for (const dialog of dialogs) {
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (started) resume(); else dialog.close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel(dialog.id); } });
  }
  $('quality').addEventListener('change', event => { applyQuality(event.target.value); saveSettings(); });
  $('sensitivity').addEventListener('input', event => { sensitivity = Number(event.target.value); saveSettings(); });
  $('rain-toggle').addEventListener('change', event => { world.rain.visible = event.target.checked; saveSettings(); });
  async function setSound(enabled) {
    try {
      await audio.setEnabled(enabled);
      $('sound-toggle').checked = enabled;
      $('sound-button').setAttribute('aria-label', `環境音を${enabled ? 'オフ' : 'オン'}にする`);
      $('sound-button').innerHTML = enabled ? '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5ZM16 9l5 6m0-6-5 6"/></svg>';
    } catch { toast('このブラウザでは環境音を開始できませんでした。'); $('sound-toggle').checked = false; }
  }
  $('sound-button').addEventListener('click', () => setSound(!audio.enabled));
  $('sound-toggle').addEventListener('change', event => setSound(event.target.checked));
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { toast('この表示環境では全画面にできません。通常のブラウザでお試しください。'); }
  });
  document.addEventListener('fullscreenchange', () => { $('fullscreen-button').textContent = document.fullscreenElement ? '全画面を解除する ↙' : '全画面にする ↗'; });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) dragFallback = false;
    else if (playing && !dragFallback) pause();
  });
  document.addEventListener('pointerlockerror', () => { dragFallback = true; });
  document.addEventListener('mousemove', event => {
    if (!playing || !(document.pointerLockElement === renderer.domElement || dragging)) return;
    const dx = event.movementX || 0, dy = event.movementY || 0;
    yaw -= dx * .0019 * sensitivity; pitch -= dy * .0019 * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch, -1.42, 1.42);
  });
  renderer.domElement.addEventListener('pointerdown', event => {
    if (!playing || event.button !== 0) return;
    if (document.pointerLockElement !== renderer.domElement) { dragging = true; dragFallback = true; renderer.domElement.setPointerCapture(event.pointerId); }
  });
  renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
  renderer.domElement.addEventListener('lostpointercapture', () => { dragging = false; });
  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
  const gameKeys = new Set(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyR','KeyM','KeyH','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
  document.addEventListener('keydown', event => {
    if (!playing) return;
    if (gameKeys.has(event.code)) event.preventDefault();
    if (event.code === 'Escape') { event.preventDefault(); pause(); return; }
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') queuedJump = true;
    if (event.code === 'KeyH') openPanel('help-dialog');
    if (event.code === 'KeyM') {
      mapVisible = !mapVisible; dom.minimap.hidden = !mapVisible;
      document.querySelector('.map-caption').hidden = !mapVisible;
    }
    if (event.code === 'KeyR') { player.reset(); yaw = 0; pitch = .14; toast('忘却の交差点に戻りました。'); }
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); if (playing) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  function updateMap() {
    const ctx = mapCtx, size = 300, scale = 2.1, cx = size / 2, cy = size / 2;
    ctx.clearRect(0, 0, size, size); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 148, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = '#6e8a9630'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(150, 300); ctx.moveTo(0, 150); ctx.lineTo(300, 150); ctx.stroke();
    const mapX = x => cx + (x - player.position.x) * scale;
    const mapY = z => cy + (z - player.position.z) * scale;
    for (const b of world.buildings) {
      const x = mapX(b.minX), z = mapY(b.minZ), w = (b.maxX - b.minX) * scale, d = (b.maxZ - b.minZ) * scale;
      ctx.fillStyle = '#8296ab25'; ctx.fillRect(x, z, w, d); ctx.strokeStyle = '#a6bfd445'; ctx.strokeRect(x, z, w, d);
    }
    for (const e of world.echoes) if (!e.found) {
      ctx.save(); ctx.translate(mapX(e.x), mapY(e.z)); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#d7eebc'; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-yaw);
    ctx.fillStyle = '#e6f2d1'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-5, 6); ctx.lineTo(0, 3); ctx.lineTo(5, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9dfcd16'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 61, -Math.PI / 2 - .5, -Math.PI / 2 + .5); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  function updateHUD() {
    const p = player.position;
    dom.altitude.innerHTML = `${p.y.toFixed(1)} <small>m</small>`;
    const roof = p.y > 7;
    dom['motion-state'].textContent = player.mantle ? 'OVER THE EDGE' : player.climbing ? 'CLIMBING' : !player.grounded ? 'IN THE AIR' : roof ? 'ABOVE THE CITY' : 'ON THE STREET';
    dom['stamina-wrap'].classList.toggle('active', player.climbing || player.mantle || player.stamina < 99);
    dom['stamina-wrap'].classList.toggle('low', player.stamina < 25);
    dom['stamina-bar'].style.width = `${player.stamina}%`; dom['stamina-label'].textContent = Math.ceil(player.stamina);
    dom.crosshair.classList.toggle('climb', !!player.nearWall);
    dom['context-hint'].innerHTML = player.climbing ? '<kbd>W / S</kbd> 上下へ &nbsp; <kbd>SPACE</kbd> 壁を蹴る &nbsp; <kbd>E</kbd> 離す' : player.nearWall && player.stamina > 5 ? '壁に向かって <kbd>W + SPACE</kbd> でつかまる' : '';
    const district = roof ? ['ABOVE THE SILENCE', '静寂の屋上'] : p.z < -75 ? ['THE MERIDIAN', '月待ちの劇場'] : p.z < 5 ? ['NEON ARCADE', '残光の路地'] : ['THE CROSSING', '忘却の交差点'];
    dom['area-en'].textContent = district[0]; dom['area-name'].textContent = district[1];
    if (mapVisible) updateMap();
  }

  // Only enabled explicitly for local regression tests; absent from normal play.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug')) {
    window.__AFTERLIGHT__ = {
      player, world, scene, camera, renderer,
      getState: () => ({ playing, started, yaw, pitch, foundCount, position: { ...player.position }, stamina: player.stamina, climbing: player.climbing, grounded: player.grounded, drawCalls: renderer.info.render.calls }),
      teleport: (x, y, z) => { player.position = { x, y, z }; player.velocity = { x: 0, y: 0, z: 0 }; },
    };
  }
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); toast('描画が中断しました。ページを再読み込みしてください。', 30000); });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });

  function frame(now) {
    const dt = Math.min((now - previousTime) / 1000, .06); previousTime = now;
    if (!document.hidden) elapsed += dt;
    if (playing) {
      input.forward = keys.has('KeyW') || keys.has('ArrowUp'); input.backward = keys.has('KeyS') || keys.has('ArrowDown');
      input.left = keys.has('KeyA') || keys.has('ArrowLeft'); input.right = keys.has('KeyD') || keys.has('ArrowRight');
      input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight'); input.jump = keys.has('Space') || queuedJump; input.release = keys.has('KeyE');
      accumulator += dt;
      while (accumulator >= 1 / 120) { player.step(1 / 120, input, yaw); queuedJump = false; input.jump = keys.has('Space'); accumulator -= 1 / 120; }
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const bob = player.grounded ? Math.sin(player.walkDistance * 2.4) * Math.min(speed / 6, 1) * .032 : 0;
      camera.position.set(player.position.x, player.position.y + PLAYER_HEIGHT + bob, player.position.z);
      camera.rotation.set(pitch, yaw, player.climbing ? Math.sin(elapsed * 8) * .006 : 0, 'YXZ');
      for (const e of world.echoes) if (!e.found && Math.hypot(player.position.x - e.x, player.position.y + 1 - e.y, player.position.z - e.z) < 2.2) {
        e.found = true; e.group.visible = false; foundCount++; dom['echo-count'].textContent = `${foundCount} / 5`; audio.chime();
        toast(foundCount === 5 ? '5つの光が集まりました。夜は続きます。どうぞ、この街を好きなだけ。' : `${e.title} — ${e.text}`, 8500);
      }
    } else if (!started) {
      camera.position.set(Math.sin(elapsed * .035) * .6, 2.5, 68);
      camera.rotation.set(.21 + Math.sin(elapsed * .07) * .003, -.018 + Math.sin(elapsed * .05) * .004, 0, 'YXZ');
    }
    world.update(elapsed, dt, camera.position);
    if (started && now - lastHud > 100) { updateHUD(); lastHud = now; }
    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  dom['start-button'].disabled = false; dom['start-label'].textContent = 'この街に入る';
}
