/* TexPlant Studio — aplicación principal */
'use strict';
const $ = id => document.getElementById(id);
const MAP_DEFS = [
  ['basecolor', 'Base Color', 'BaseColor', 'sRGB'],
  ['normal', 'Normal', 'Normal', 'Non-Color · OpenGL'],
  ['height', 'Height', 'Height', 'Non-Color'],
  ['bump', 'Bump', 'Bump', 'Non-Color'],
  ['displacement', 'Displacement', 'Displacement', 'Non-Color'],
  ['roughness', 'Roughness', 'Roughness', 'Non-Color'],
  ['metallic', 'Metallic', 'Metallic', 'Non-Color'],
  ['ao', 'Ambient Occlusion', 'AO', 'Non-Color'],
  ['opacity', 'Opacity', 'Opacity', 'Non-Color · Alpha'],
];
const state = { source: null, sourceCanvas: null, maps: {}, active: 'basecolor', view: '2d', preview: null, zoom: 1, panX: 0, panY: 0, channel: 'all', displayCache: {} };
const mapCanvases = {};
MAP_DEFS.forEach(([k]) => mapCanvases[k] = document.createElement('canvas'));

/* ---------- parámetros ---------- */
const num = id => parseFloat($(id).value);
function readParams() {
  return {
    imgExposure: num('imgExposure') / 50, imgContrast: num('imgContrast') / 100, imgTemp: num('imgTemp') / 100,
    denoise: num('denoise'), sharpen: num('sharpen') / 100, hDetail: num('hDetail') / 100,
    seamless: $('seamless').checked, seamBlend: num('seamBlend'), tilingMode: $('tilingMode').value, delight: num('delight') / 100, saturation: num('saturation') / 100,
    hContrast: num('hContrast') / 100, hBrightness: num('hBrightness') / 100, hBlur: num('hBlur'), hMid: num('hMid') / 100, hRange: num('hRange') / 100, hInvert: $('hInvert').checked,
    nStrength: num('nStrength'), nDetail: num('nDetail') / 100, nFormat: $('nFormat').value,
    rBase: num('rBase') / 100, rVar: num('rVar') / 100, rInvert: $('rInvert').checked,
    mBase: num('mBase') / 100, mThresh: num('mThresh') / 100,
    aoStrength: num('aoStrength') / 100, aoRadius: num('aoRadius'),
    oThresh: num('oThresh') / 100, oSoft: num('oSoft') / 100, oInvert: $('oInvert').checked,
  };
}
const PRESETS = {
  piedra: { hContrast: 140, nStrength: 4, rBase: 85, rVar: 35, mBase: 0, aoStrength: 130 },
  madera: { hContrast: 90, nStrength: 2, rBase: 65, rVar: 30, mBase: 0, aoStrength: 80 },
  metal: { hContrast: 110, nStrength: 2.5, rBase: 35, rVar: 40, mBase: 90, mThresh: 35, aoStrength: 90 },
  tela: { hContrast: 70, hRange: 60, nStrength: 1.4, nDetail: 85, rBase: 95, rVar: 15, mBase: 0, aoStrength: 60 },
  suave: { hContrast: 55, hRange: 65, hBlur: 3, nStrength: 0.9, nDetail: 35, rBase: 55, rVar: 20, mBase: 0, aoStrength: 45 },
};
function applyPreset(name) {
  for (const [k, v] of Object.entries(PRESETS[name])) if ($(k)) { $(k).value = v; syncVals(); }
  regenerate();
}

/* ---------- generación ---------- */
let regenTimer = null;
function regenerate() {
  if (!state.source) return;
  clearTimeout(regenTimer);
  regenTimer = setTimeout(() => {
    $('status').textContent = 'Generando mapas…';
    setTimeout(() => { // deja pintar el estado
      const t0 = performance.now();
      state.maps = generateMaps(state.source, readParams());
      for (const [k] of MAP_DEFS) {
        const c = mapCanvases[k]; c.width = state.maps[k].width; c.height = state.maps[k].height;
        c.getContext('2d').putImageData(state.maps[k], 0, 0);
      }
      state.preview?.setMaps(mapCanvases);
      state.displayCache = {};
      buildStrip(); drawView(); drawHistogram();
      $('status').textContent = `✓ ${MAP_DEFS.length} mapas generados en ${Math.round(performance.now() - t0)} ms — clic en un mapa para verlo / descargarlo.`;
      $('dims').textContent = `${state.maps.basecolor.width} × ${state.maps.basecolor.height} px`;
    }, 20);
  }, 90);
}

/* ---------- vistas ---------- */
/* Canvas a mostrar según el canal aislado elegido (RGB/R/G/B/luminancia) */
function displayCanvas(key) {
  const src = mapCanvases[key];
  if (!src.width || state.channel === 'all') return src;
  const cacheKey = key + ':' + state.channel;
  if (state.displayCache[cacheKey]) return state.displayCache[cacheKey];
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'), img = x.createImageData(src.width, src.height), s = src.getContext('2d').getImageData(0, 0, src.width, src.height);
  for (let i = 0; i < s.data.length; i += 4) {
    const r = s.data[i], g = s.data[i + 1], b = s.data[i + 2];
    let v = [r, g, b];
    if (state.channel === 'r') v = [r, 0, 0]; else if (state.channel === 'g') v = [0, g, 0];
    else if (state.channel === 'b') v = [0, 0, b]; else { const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b); v = [l, l, l]; }
    img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  state.displayCache[cacheKey] = c; return c;
}
function viewTransform(canvas) {
  const dw = canvas.width * state.zoom, dh = canvas.height * state.zoom;
  return { dx: (canvas.width - dw) / 2 + state.panX, dy: (canvas.height - dh) / 2 + state.panY, dw, dh };
}
function drawView() {
  const canvas = $('view2d'), ctx = canvas.getContext('2d'), src = displayCanvas(state.active);
  if (!src.width) return;
  const { dx, dy, dw, dh } = viewTransform(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.view === 'tile') {
    const reps = num('tiling'), s = dw / reps;
    for (let y = 0; y < reps; y++) for (let x = 0; x < reps; x++) ctx.drawImage(src, dx + x * s, dy + y * s, s, s);
  } else if (state.view === 'compare' && state.sourceCanvas) {
    // Antes (foto tratada, izda.) | Después (mapa activo, dcha.)
    const cut = canvas.width * (num('comparePos') / 100);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cut, canvas.height); ctx.clip();
    ctx.drawImage(state.sourceCanvas, dx, dy, dw, dh); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(cut, 0, canvas.width - cut, canvas.height); ctx.clip();
    ctx.drawImage(src, dx, dy, dw, dh); ctx.restore();
    ctx.fillStyle = '#2dd4bf'; ctx.fillRect(cut - 1, 0, 2, canvas.height);
    ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#a5f3fc';
    ctx.fillText('ANTES · foto', 12, 22); ctx.fillText('DESPUÉS · ' + state.active.toUpperCase(), Math.min(cut + 12, canvas.width - 150), 22);
  } else ctx.drawImage(src, dx, dy, dw, dh);
  $('zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
}
function setView(v) {
  state.view = v;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $('view2d').hidden = v === '3d'; $('view3d').hidden = v !== '3d';
  $('compareCtl').hidden = v !== 'compare';
  if (v !== '3d') drawView();
}
/* Histograma RGB del mapa activo + estadísticas (útil para Blender:
   Normal debe centrarse en ~(128,128,255); Roughness no debe saturar). */
function drawHistogram() {
  const hc = $('histogram'); if (!hc || !mapCanvases[state.active].width) return;
  const src = mapCanvases[state.active], sctx = src.getContext('2d');
  const step = Math.max(1, Math.floor(src.width / 128));
  const small = document.createElement('canvas'); small.width = small.height = 128;
  small.getContext('2d').drawImage(src, 0, 0, 128, 128);
  const d = small.getContext('2d').getImageData(0, 0, 128, 128).data;
  const bins = [new Float32Array(64), new Float32Array(64), new Float32Array(64)];
  let sum = [0, 0, 0], maxV = 0;
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { bins[c][Math.min(63, d[i + c] >> 2)]++; sum[c] += d[i + c]; }
  for (let c = 0; c < 3; c++) for (let b = 0; b < 64; b++) maxV = Math.max(maxV, bins[c][b]);
  const x = hc.getContext('2d'); x.clearRect(0, 0, hc.width, hc.height);
  x.fillStyle = 'rgba(3,8,20,.55)'; x.fillRect(0, 0, hc.width, hc.height);
  const cols = ['rgba(248,113,113,.75)', 'rgba(74,222,128,.75)', 'rgba(96,165,250,.8)'];
  x.globalCompositeOperation = 'lighter';
  for (let c = 0; c < 3; c++) { x.fillStyle = cols[c]; x.beginPath(); x.moveTo(0, hc.height);
    for (let b = 0; b < 64; b++) x.lineTo(b / 63 * hc.width, hc.height - (bins[c][b] / (maxV || 1)) * (hc.height - 6));
    x.lineTo(hc.width, hc.height); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  const npx = d.length / 4, mean = sum.map(v => Math.round(v / npx));
  $('histStats').textContent = `${state.active}: media R${mean[0]} · G${mean[1]} · B${mean[2]} — ${src.width}×${src.height}px`;
  void step;
}
/* Seleccionar un mapa NO regenera, NO reconstruye la tira y NO toca los
   parámetros: solo cambia el resaltado y redibuja la vista actual. */
function selectMap(key) {
  if (!MAP_DEFS.some(([k]) => k === key)) return;
  state.active = key;
  document.querySelectorAll('.map-card').forEach(c => c.classList.toggle('active', c.dataset.key === key));
  if (state.view === '3d') setView('2d'); else drawView();
  drawHistogram();
  saveSettings();
}
function buildStrip() {
  const strip = $('mapStrip');
  // Se crea una sola vez; en regeneraciones solo se actualizan las miniaturas
  // (antes se recreaba todo el DOM y se perdía la selección/foco al hacer clic).
  if (strip.children.length !== MAP_DEFS.length) {
    strip.innerHTML = '';
    for (const [key, label, suffix, cs] of MAP_DEFS) {
      const card = document.createElement('div');
      card.className = 'map-card'; card.dataset.key = key; card.title = `${label} — ${cs}`;
      const thumb = document.createElement('canvas'); thumb.width = thumb.height = 128; thumb.dataset.thumb = key;
      const span = document.createElement('span'); span.innerHTML = `<b>${label}</b><br><small>${cs}</small>`;
      const btn = document.createElement('button'); btn.type = 'button';
      btn.innerHTML = '<svg class="icon" style="width:13px;height:13px"><use href="#i-download"/></svg> PNG';
      btn.addEventListener('click', async e => {
        e.stopPropagation(); e.preventDefault();
        download(await exportMapBlob(key, mapCanvases[key], state.maps), `${materialName()}_${suffix}.png`);
      });
      card.append(thumb, span, btn);
      card.addEventListener('click', e => { e.stopPropagation(); selectMap(key); });
      strip.appendChild(card);
    }
  }
  for (const [key] of MAP_DEFS) {
    const thumb = strip.querySelector(`canvas[data-thumb="${key}"]`);
    if (thumb && mapCanvases[key].width) thumb.getContext('2d').drawImage(mapCanvases[key], 0, 0, 128, 128);
  }
  document.querySelectorAll('.map-card').forEach(c => c.classList.toggle('active', c.dataset.key === state.active));
}
const materialName = () => ($('matName').value.trim() || 'MiMaterial').replace(/[^\w\-]+/g, '_');

/* ---------- persistencia: nada se restablece al regenerar/reabrir ---------- */
function saveSettings() {
  try {
    const data = { active: state.active, view: state.view, fields: {} };
    document.querySelectorAll('.controls input, .controls select').forEach(el => {
      if (el.id) data.fields[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    localStorage.setItem('texplant-settings-v1', JSON.stringify(data));
  } catch (_) { /* almacenamiento no disponible (modo privado, etc.) */ }
}
function restoreSettings() {
  try {
    const data = JSON.parse(localStorage.getItem('texplant-settings-v1') || 'null');
    if (!data) return;
    for (const [id, v] of Object.entries(data.fields || {})) {
      const el = $(id); if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    }
    if (MAP_DEFS.some(([k]) => k === data.active)) state.active = data.active;
    syncVals();
  } catch (_) { /* sin ajustes guardados */ }
}

/* ---------- carga de imagen ---------- */
function setSource(canvas) {
  const size = num('workSize');
  const scale = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const w = Math.max(8, Math.round(canvas.width * scale)), h = Math.max(8, Math.round(canvas.height * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(canvas, 0, 0, w, h);
  state.source = c.getContext('2d').getImageData(0, 0, w, h);
  state.sourceCanvas = c;
  state.zoom = 1; state.panX = 0; state.panY = 0;
  $('dropZone').classList.add('ready'); regenerate();
}
function loadFile(file) {
  if (!file) return;
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); setSource(c); URL.revokeObjectURL(img.src); };
  img.src = URL.createObjectURL(file);
}
function loadDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); setSource(c); };
  img.src = dataUrl;
}

/* ---------- muestras procedurales (para probar sin foto) ---------- */
function noiseCanvas(size, alpha) {
  const small = document.createElement('canvas'); small.width = small.height = size;
  const x = small.getContext('2d'), img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = alpha; }
  x.putImageData(img, 0, 0);
  const big = document.createElement('canvas'); big.width = big.height = 512, bx = big.getContext('2d');
  bx.imageSmoothingEnabled = true; bx.drawImage(small, 0, 0, 512, 512); return big;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function makeSample(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 512, x = c.getContext('2d');
  if (kind === 'ladrillo') {
    x.fillStyle = '#8d8578'; x.fillRect(0, 0, 512, 512); const bh = 64, bw = 128;
    for (let row = 0; row * bh < 512; row++) for (let col = -1; col * bw < 512; col++) {
      const off = row % 2 ? bw / 2 : 0, r = rnd(120, 180), g = rnd(55, 85), b = rnd(40, 60);
      x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(col * bw + off + 4, row * bh + 4, bw - 8, bh - 8);
    }
  } else if (kind === 'piedra') {
    x.fillStyle = '#6f6e68'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) { const g = rnd(85, 165); x.fillStyle = `rgba(${g},${g * 0.98},${g * 0.9},.55)`; x.beginPath(); x.ellipse(rnd(0, 512), rnd(0, 512), rnd(12, 70), rnd(8, 44), rnd(0, 3), 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(40,38,34,.5)'; for (let i = 0; i < 26; i++) { x.beginPath(); let px = rnd(0, 512), py = rnd(0, 512); x.moveTo(px, py); for (let s = 0; s < 6; s++) x.lineTo(px += rnd(-50, 50), py += rnd(-50, 50)); x.stroke(); }
  } else if (kind === 'madera') {
    x.fillStyle = '#8a5c33'; x.fillRect(0, 0, 512, 512);
    for (let px = 0; px < 512; px += 3) { const v = Math.sin(px * 0.11) * 22 + Math.sin(px * 0.023 + 2) * 18; x.fillStyle = `rgba(${60 + v},${34 + v * 0.6},12,.35)`; x.fillRect(px, 0, 2, 512); }
    x.fillStyle = 'rgba(30,16,4,.8)'; [0, 170, 341].forEach(y => x.fillRect(0, y, 512, 4));
    for (let i = 0; i < 7; i++) { x.strokeStyle = 'rgba(52,28,8,.6)'; x.beginPath(); x.ellipse(rnd(0, 512), rnd(0, 512), rnd(6, 14), rnd(14, 30), 0, 0, 7); x.stroke(); }
  } else if (kind === 'metal') {
    x.fillStyle = '#7e868c'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) { const g = rnd(95, 175); x.fillStyle = `rgba(${g},${g},${g},.28)`; x.fillRect(0, rnd(0, 512), 512, rnd(1, 2)); }
    for (let i = 0; i < 46; i++) { x.fillStyle = `rgba(${rnd(130, 170)},${rnd(60, 85)},30,${rnd(0.25, 0.6)})`; x.beginPath(); x.ellipse(rnd(0, 512), rnd(0, 512), rnd(8, 46), rnd(5, 26), 0, 0, 7); x.fill(); }
  } else { // tela
    x.fillStyle = '#5d7086'; x.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 4) for (let xx = 0; xx < 512; xx += 4) { x.fillStyle = ((xx + y) / 4) % 2 ? 'rgba(255,255,255,.13)' : 'rgba(0,0,20,.16)'; x.fillRect(xx, y, 4, 4); }
  }
  x.globalAlpha = 0.34; x.drawImage(noiseCanvas(64, 90), 0, 0); x.globalAlpha = 0.16; x.drawImage(noiseCanvas(16, 120), 0, 0); x.globalAlpha = 1;
  setSource(c);
}

/* ---------- eventos ---------- */
function syncVals() { document.querySelectorAll('.val').forEach(b => { const el = $(b.dataset.for); if (el) b.textContent = el.value; }); }
document.querySelectorAll('.controls input, .controls select').forEach(el => el.addEventListener('input', () => { syncVals(); saveSettings(); regenerate(); }));
$('workSize').addEventListener('change', () => { if (state.lastCanvas) setSource(state.lastCanvas); });
$('fileInput').addEventListener('change', e => loadFile(e.target.files[0]));
const _setSource = setSource; setSource = c => { state.lastCanvas = c; _setSource(c); };
$('sampleBtn').addEventListener('click', e => {
  e.stopPropagation();
  const menu = $('sampleMenu'), open = menu.hidden;
  menu.hidden = !open;
  $('sampleBtn').setAttribute('aria-expanded', String(open));
  $('sampleBtn').querySelector('.icon-chev').style.transform = open ? 'rotate(180deg)' : '';
});
document.addEventListener('click', e => {
  if (!$('sampleMenu').hidden && !e.target.closest('.menu-wrap')) {
    $('sampleMenu').hidden = true; $('sampleBtn').setAttribute('aria-expanded', 'false');
    $('sampleBtn').querySelector('.icon-chev').style.transform = '';
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('sampleMenu').hidden = true; $('sampleBtn').setAttribute('aria-expanded', 'false'); }
});
document.querySelectorAll('#sampleMenu button').forEach(b => b.onclick = () => { $('sampleMenu').hidden = true; makeSample(b.dataset.sample); });
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => applyPreset(b.dataset.preset));
document.querySelectorAll('.tab').forEach(t => t.onclick = () => setView(t.dataset.view));
$('tiling').addEventListener('input', () => { if (state.view === 'tile') drawView(); });
$('shape3d').addEventListener('change', e => state.preview?.buildGeometry(e.target.value));
$('btnResetView').addEventListener('click', () => state.preview?.resetView());
/* ── Espacio de visualización: zoom / pan / canales / comparar / panel ── */
function setZoom(z) { state.zoom = Math.max(0.5, Math.min(8, z)); if (state.view !== '3d') drawView(); }
$('zoomIn').addEventListener('click', () => setZoom(state.zoom * 1.25));
$('zoomOut').addEventListener('click', () => setZoom(state.zoom / 1.25));
$('zoomFit').addEventListener('click', () => { state.zoom = 1; state.panX = 0; state.panY = 0; drawView(); });
$('channelView').addEventListener('change', e => { state.channel = e.target.value; state.displayCache = {}; drawView(); });
$('comparePos').addEventListener('input', () => { if (state.view === 'compare') drawView(); });
$('btnCollapse').addEventListener('click', () => { document.querySelector('.layout').classList.toggle('panel-hidden'); setTimeout(drawView, 60); });
$('btnFullscreen').addEventListener('click', () => {
  const stage = document.querySelector('.stage');
  if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen?.();
  setTimeout(drawView, 350);
});
$('view2d').addEventListener('wheel', e => {
  if (state.view === '3d') return;
  e.preventDefault(); setZoom(state.zoom * (e.deltaY < 0 ? 1.12 : 0.89));
}, { passive: false });
(() => {
  const cv = $('view2d'); let drag = false, lx = 0, ly = 0;
  cv.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointerup', () => drag = false);
  cv.addEventListener('pointermove', e => {
    if (!drag || state.view === 'compare') return;
    state.panX += e.clientX - lx; state.panY += e.clientY - ly; lx = e.clientX; ly = e.clientY; drawView();
  });
  cv.addEventListener('dblclick', () => { state.zoom = 1; state.panX = 0; state.panY = 0; drawView(); });
})();
$('btnRegen').onclick = regenerate;
const dz = $('dropZone');
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); }));
dz.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) loadFile(f); });
$('btnBlender').onclick = () => download(new Blob([blenderScript(materialName())], { type: 'text/x-python' }), `${materialName()}_Blender.py`);
$('btnZip').onclick = async () => {
  if (!state.source) { $('status').textContent = 'Primero carga una foto o una muestra.'; return; }
  $('status').textContent = 'Empaquetando…';
  const name = materialName(), files = [];
  for (const [key, , suffix] of MAP_DEFS) files.push({ name: `${name}/${name}_${suffix}.png`, blob: await exportMapBlob(key, mapCanvases[key], state.maps) });
  files.push({ name: `${name}/${name}_Blender.py`, text: blenderScript(name) });
  files.push({ name: `${name}/LEEME.txt`, text: `Material ${name} — generado con TexPlant Studio\n\n1. En Blender: Scripting → Open → ${name}_Blender.py → Run Script (con el objeto seleccionado).\n2. Los mapas Non-Color ya quedan configurados; Base Color en sRGB.\n3. Para desplazamiento real: USE_DISPLACEMENT=True en el script + Cycles.\n` });
  download(await makeZip(files), `${name}_PBR.zip`);
  $('status').textContent = `✓ ZIP exportado con los ${MAP_DEFS.length} mapas + script de Blender.`;
};

/* ---------- arranque ---------- */
syncVals();
restoreSettings();
state.preview = new Preview3D($('view3d'));
// Puente con la app nativa de escritorio (Electron): menú Archivo → Abrir imagen…
if (window.texplantNative?.onOpenImage) window.texplantNative.onOpenImage(loadDataUrl);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
makeSample('ladrillo'); // arranca con algo visible
