/* TexPlant Studio — motor de procesamiento de imágenes (Canvas + Float32Array)
   Pipeline tipo PixPlant/Materialize/AwesomeBump:
   foto → [seamless] → BaseColor(delight) → Height → Normal / AO / Roughness / Metallic / Bump / Displacement
   Todos los desenfoques y gradientes son "wrap" (toroidales): si la textura es
   seamless, también lo son TODOS los mapas derivados. */
'use strict';

/* ---------- utilidades ---------- */
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const wrap = (i, n) => ((i % n) + n) % n;

function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

/* Desenfoque gaussiano separable con borde toroidal (wrap):
   los mapas derivados heredan el seamless de la textura base. */
function blurGaussianWrap(src, w, h, radius) {
  if (radius <= 0) return new Float32Array(src);
  const sigma = Math.max(0.6, radius), rad = Math.ceil(sigma * 3), ker = [];
  let sum = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); ker.push(v); sum += v; }
  for (let i = 0; i < ker.length; i++) ker[i] /= sum;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -rad; k <= rad; k++) s += src[y * w + wrap(x + k, w)] * ker[k + rad];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -rad; k <= rad; k++) s += tmp[wrap(y + k, h) * w + x] * ker[k + rad];
    out[y * w + x] = s;
  }
  return out;
}

function floatToImageData(arr, w, h, rgb) {
  const img = new ImageData(w, h), d = img.data;
  for (let i = 0, p = 0; i < arr.length; i++, p += 4) {
    const v = Math.round(clamp01(arr[i]) * 255);
    if (rgb) { d[p] = Math.round(clamp01(rgb[i * 3]) * 255); d[p + 1] = Math.round(clamp01(rgb[i * 3 + 1]) * 255); d[p + 2] = Math.round(clamp01(rgb[i * 3 + 2]) * 255); }
    else { d[p] = d[p + 1] = d[p + 2] = v; }
    d[p + 3] = 255;
  }
  return img;
}

/* ---------- seamless: mezcla cruzada de bordes (offset-blend) ----------
   Mezcla la imagen con su copia desplazada media textura; el peso crece
   hacia los bordes, así la costura desaparece y la textura repite. */
function makeSeamless(img, w, h, blendPct, mode = 'both') {
  const d = img.data, out = new ImageData(w, h), o = out.data, bw = (blendPct / 100) * w, bh = (blendPct / 100) * h;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const doX = mode === 'both' || mode === 'horizontal', doY = mode === 'both' || mode === 'vertical';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
    const wx = doX ? 1 - smooth(dx / bw) : 0, wy = doY ? 1 - smooth(dy / bh) : 0, m = Math.max(wx, wy) * 0.92;
    const sx = doX ? wrap(x + (w >> 1), w) : x, sy = doY ? wrap(y + (h >> 1), h) : y, p = (y * w + x) * 4, q = (sy * w + sx) * 4;
    for (let c = 0; c < 4; c++) o[p + c] = d[p + c] * (1 - m) + d[q + c] * m;
  }
  return out;
}

/* Desenfoque toroidal por canal RGB (reducción de ruido / nitidez) */
function blurRGBWrap(rgb, w, h, radius) {
  if (radius <= 0) return rgb;
  const n = w * h, out = new Float32Array(rgb.length), ch = [[], [], []];
  for (let c = 0; c < 3; c++) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rgb[i * 3 + c]; ch[c] = blurGaussianWrap(a, w, h, radius); }
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = ch[c][i];
  return out;
}

/* ---------- pipeline principal ---------- */
/* p = parámetros (ver app.js: readParams). Devuelve {clave: ImageData} */
function generateMaps(sourceImg, p) {
  const w = sourceImg.width, h = sourceImg.height, n = w * h, d = sourceImg.data;
  let base = sourceImg;
  if (p.seamless) base = makeSeamless(base, w, h, p.seamBlend, p.tilingMode || 'both');
  const bd = base.data;

  /* ── Tratamiento de la imagen fuente (pensado para Blender) ──
     Exposición/contraste/temperatura → reducción de ruido → nitidez.
     Todo toroidal: no rompe el seamless. */
  let srcRGB = new Float32Array(n * 3);
  const ev = Math.pow(2, p.imgExposure ?? 0), iCon = p.imgContrast ?? 1, temp = p.imgTemp ?? 0;
  for (let i = 0, q = 0; i < n; i++, q += 4) {
    let r = bd[q] / 255 * ev, g = bd[q + 1] / 255 * ev, b = bd[q + 2] / 255 * ev;
    r = 0.5 + (r - 0.5) * iCon; g = 0.5 + (g - 0.5) * iCon; b = 0.5 + (b - 0.5) * iCon;
    srcRGB[i * 3] = clamp01(r + temp * 0.18); srcRGB[i * 3 + 1] = clamp01(g); srcRGB[i * 3 + 2] = clamp01(b - temp * 0.18);
  }
  if ((p.denoise ?? 0) > 0) srcRGB = blurRGBWrap(srcRGB, w, h, p.denoise);
  if ((p.sharpen ?? 0) > 0) {
    const soft = blurRGBWrap(srcRGB, w, h, 1.6);
    for (let i = 0; i < srcRGB.length; i++) srcRGB[i] = clamp01(srcRGB[i] + (srcRGB[i] - soft[i]) * p.sharpen);
  }

  // Luminancia ya tratada
  let lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = luminance(srcRGB[i * 3], srcRGB[i * 3 + 1], srcRGB[i * 3 + 2]);

  /* BaseColor: delight (divide por la iluminación borrosa estimada) + saturación */
  const shade = blurGaussianWrap(lum, w, h, Math.max(8, w / 12));
  let mean = 0; for (let i = 0; i < n; i++) mean += shade[i]; mean /= n;
  const rgb = new Float32Array(n * 3), s = p.delight, sat = p.saturation;
  for (let i = 0, q = 0; i < n; i++, q += 4) {
    let r = srcRGB[i * 3], g = srcRGB[i * 3 + 1], b = srcRGB[i * 3 + 2];
    const f = Math.pow(clamp01(shade[i] / Math.max(0.08, mean)), -s * 0.9); // aclara sombras, apaga brillos
    r = clamp01(r * f); g = clamp01(g * f); b = clamp01(b * f);
    const gray = luminance(r, g, b);
    rgb[i * 3] = clamp01(gray + (r - gray) * sat); rgb[i * 3 + 1] = clamp01(gray + (g - gray) * sat); rgb[i * 3 + 2] = clamp01(gray + (b - gray) * sat);
  }
  const baseColor = floatToImageData(lum, w, h, rgb);

  /* Height: contraste/brillo → suavizado.
     Detalle multiescala: se refuerza (o suaviza) la diferencia entre la
     luminancia y su versión borrosa a escala media antes de derivar. */
  const midBlur = blurGaussianWrap(lum, w, h, Math.max(2, w / 72));
  const detW = p.hDetail ?? 1;
  let lumH = lum;
  if (detW !== 1) { lumH = new Float32Array(n); for (let i = 0; i < n; i++) lumH[i] = clamp01(lum[i] + (lum[i] - midBlur[i]) * (detW - 1) * 1.6); }
  let height = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = (lumH[i] - shade[i]) * 0.65 + lumH[i] * 0.35;
    v = 0.5 + (v - 0.5) * p.hContrast + p.hBrightness;
    height[i] = p.hInvert ? 1 - clamp01(v) : clamp01(v);
  }
  if (p.hBlur > 0) height = blurGaussianWrap(height, w, h, p.hBlur);
  /* Range (observado en PixPlant: Extract de Displacement/Normal): comprime
     el relieve alrededor del punto medio; útil en relieves planos (telas). */
  const range = p.hRange ?? 1;
  if (range !== 1) for (let i = 0; i < n; i++) height[i] = clamp01(0.5 + (height[i] - 0.5) * range);

  /* Normal (Sobel toroidal). OpenGL: +Y arriba; DirectX invierte el canal G.
     Fine Detail (observado en PixPlant): mezcla altura nítida y suavizada. */
  const detailBlur = (1 - (p.nDetail ?? 0.7)) * 6;
  const heightSharp = detailBlur > 0.35 ? blurGaussianWrap(height, w, h, detailBlur) : height;
  const nRGB = new Float32Array(n * 3), st = p.nStrength, flipY = p.nFormat === 'directx' ? -1 : 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const dx = (heightSharp[y * w + wrap(x + 1, w)] - heightSharp[y * w + wrap(x - 1, w)]) * st;
    const dy = (heightSharp[wrap(y + 1, h) * w + x] - heightSharp[wrap(y - 1, h) * w + x]) * st * flipY;
    let nx = -dx, ny = dy, nz = 1; const len = Math.hypot(nx, ny, nz) || 1;
    nRGB[i * 3] = nx / len * 0.5 + 0.5; nRGB[i * 3 + 1] = ny / len * 0.5 + 0.5; nRGB[i * 3 + 2] = nz / len * 0.5 + 0.5;
  }
  const normal = floatToImageData(lum, w, h, nRGB);

  /* AO: cavidades = zonas más bajas que su entorno borroso (+ oclusión global suave) */
  const wide = blurGaussianWrap(height, w, h, p.aoRadius);
  const ao = new Float32Array(n);
  for (let i = 0; i < n; i++) ao[i] = clamp01(1 - Math.max(0, wide[i] - height[i]) * p.aoStrength - (1 - wide[i]) * 0.12 * (p.aoStrength / 1.1));

  /* Roughness: base ± variación por luminancia (zonas claras = más rugosas por defecto) */
  const rough = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = p.rInvert ? 1 - lum[i] : lum[i];
    rough[i] = clamp01(p.rBase + (t - 0.5) * p.rVar * 1.6);
  }
  /* Metallic: base + zonas que superan el umbral de luminancia */
  const metal = new Float32Array(n);
  for (let i = 0; i < n; i++) metal[i] = clamp01(p.mBase + Math.max(0, lum[i] - p.mThresh) * 2.2 + (p.mBase > 0.6 ? (lum[i] - 0.5) * 0.25 : 0));

  /* Bump = altura recentrada; Displacement = altura con punto medio ajustable */
  const bump = new Float32Array(n), disp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    bump[i] = clamp01(0.5 + (height[i] - 0.5) * 1.6);
    disp[i] = clamp01(height[i] + (0.5 - p.hMid));
  }
  /* Opacity (mapa común en PixPlant): umbral suave sobre luminancia.
     Por defecto todo opaco (umbral 0); súbelo para recortar fondos oscuros. */
  const opacity = new Float32Array(n), oT = p.oThresh ?? 0, oS = Math.max(0.01, p.oSoft ?? 0.1);
  for (let i = 0; i < n; i++) { const v = oT === 0 ? 1 : clamp01((lum[i] - oT) / oS); opacity[i] = p.oInvert ? 1 - v : v; }
  const maps = {
    basecolor: baseColor,
    normal,
    height: floatToImageData(height, w, h),
    bump: floatToImageData(bump, w, h),
    displacement: floatToImageData(disp, w, h),
    roughness: floatToImageData(blurGaussianWrap(rough, w, h, 1), w, h),
    metallic: floatToImageData(blurGaussianWrap(metal, w, h, 1), w, h),
    ao: floatToImageData(ao, w, h),
    opacity: floatToImageData(blurGaussianWrap(opacity, w, h, 0.7), w, h),
  };
  /* Datos flotantes para exportar a 16 bits (Blender: Displacement y
     Normal sin bandas). No son ImageData; la UI los ignora. */
  maps._float16 = { width: w, height: h, normal: nRGB, displacement: disp };
  return maps;
}
