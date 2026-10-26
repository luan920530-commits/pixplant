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
const state = { source: null, maps: {}, active: 'basecolor', view: '2d', preview: null };
const mapCanvases = {};
MAP_DEFS.forEach(([k]) => mapCanvases[k] = document.createElement('canvas'));

/* ---------- parámetros ---------- */
const num = id => parseFloat($(id).value);
function readParams() {
  return {
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
      buildStrip(); drawView();
      $('status').textContent = `✓ ${MAP_DEFS.length} mapas generados en ${Math.round(performance.now() - t0)} ms — clic en un mapa para verlo / descargarlo.`;
      $('dims').textContent = `${state.maps.basecolor.width} × ${state.maps.basecolor.height} px`;
    }, 20);
  }, 90);
}

/* ---------- vistas ---------- */
function drawView() {
  const canvas = $('view2d'), ctx = canvas.getContext('2d'), src = mapCanvases[state.active];
  if (!src.width) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.view === 'tile') {
    const reps = num('tiling'), s = canvas.width / reps;
    for (let y = 0; y < reps; y++) for (let x = 0; x < reps; x++) ctx.drawImage(src, x * s, y * s, s, s);
  } else ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
}
function setView(v) {
  state.view = v;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $('view2d').hidden = v === '3d'; $('view3d').hidden = v !== '3d';
  if (v !== '3d') drawView();
}
/* Seleccionar un mapa NO regenera, NO reconstruye la tira y NO toca los
   parámetros: solo cambia el resaltado y redibuja la vista actual. */
function selectMap(key) {
  if (!MAP_DEFS.some(([k]) => k === key)) return;
  state.active = key;
  document.querySelectorAll('.map-card').forEach(c => c.classList.toggle('active', c.dataset.key === key));
  if (state.view === '3d') setView('2d'); else drawView();
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
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '⬇ PNG';
      btn.addEventListener('click', async e => {
        e.stopPropagation(); e.preventDefault();
        download(await canvasBlob(mapCanvases[key]), `${materialName()}_${suffix}.png`);
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
$('sampleBtn').onclick = () => $('sampleMenu').hidden = !$('sampleMenu').hidden;
document.querySelectorAll('#sampleMenu button').forEach(b => b.onclick = () => { $('sampleMenu').hidden = true; makeSample(b.dataset.sample); });
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => applyPreset(b.dataset.preset));
document.querySelectorAll('.tab').forEach(t => t.onclick = () => setView(t.dataset.view));
$('tiling').addEventListener('input', () => { if (state.view === 'tile') drawView(); });
$('shape3d').addEventListener('change', e => state.preview?.buildGeometry(e.target.value));
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
  for (const [key, , suffix] of MAP_DEFS) files.push({ name: `${name}/${name}_${suffix}.png`, blob: await canvasBlob(mapCanvases[key]) });
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
