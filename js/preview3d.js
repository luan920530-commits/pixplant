/* Vista 3D de materiales (WebGL1, sin librerías) — nivel "material editor":
   · Proyección perspectiva correcta y TBN real por vértice (tangente y
     bitangente calculadas por geometría): la normal ya no se reconstruye
     por derivadas, que era lo que la desfasaba respecto a la textura.
   · Iluminación GGX (difuso + especular con Fresnel Schlick), luz clave,
     relleno, contraluz y entorno hemisférico; tone mapping ACES + gamma.
   · Desplazamiento por vértice desde el mapa Height, suelo con sombra
     suave, auto-rotación, zoom con rueda y doble clic para reiniciar. */
'use strict';
class Preview3D {
  constructor(canvas) {
    this.canvas = canvas; this.gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    this.rotX = 0.45; this.rotY = 0.6; this.dist = 3.4; this.auto = true; this.mapsDirty = true; this.shape = 'sphere';
    if (!this.gl) { canvas.insertAdjacentHTML('afterend', '<p class="hint">Tu navegador no soporta WebGL.</p>'); return; }
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // texturas canvas ↔ UV estándar (v=1 arriba)
    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const link = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p; };

    this.prog = link(`
      attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aTan; attribute vec3 aBitan; attribute vec2 aUv;
      uniform mat4 uMVP, uMV; uniform sampler2D uHeight; uniform float uDisp;
      varying vec2 vUv; varying vec3 vT, vB, vN, vView;
      void main(){ vUv = aUv;
        vec3 p = aPos + aNorm * (texture2D(uHeight, aUv).r - 0.5) * uDisp;
        vec4 mv = uMV * vec4(p, 1.0);
        mat3 nm = mat3(uMV);
        vT = normalize(nm * aTan); vB = normalize(nm * aBitan); vN = normalize(nm * aNorm);
        vView = -mv.xyz; gl_Position = uMVP * vec4(p, 1.0); }`, `
      precision mediump float;
      varying vec2 vUv; varying vec3 vT, vB, vN, vView;
      uniform sampler2D uBase, uNormal, uRough, uMetal, uAO;
      uniform vec3 uLightDir; uniform float uRepeat, uExposure, uEnvInt;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      void main(){
        vec2 uv = vUv * uRepeat;
        vec3 albedo = texture2D(uBase, uv).rgb;
        float rough = clamp(texture2D(uRough, uv).r, 0.05, 1.0);
        float metal = texture2D(uMetal, uv).r;
        float ao = texture2D(uAO, uv).r;
        vec3 nTan = texture2D(uNormal, uv).rgb * 2.0 - 1.0;
        vec3 N = normalize(mat3(normalize(vT), normalize(vB), normalize(vN)) * normalize(nTan));
        vec3 V = normalize(vView);
        vec3 F0 = mix(vec3(0.04), albedo, metal);
        vec3 col = vec3(0.0);
        // entorno hemisférico (cielo/suelo) atenuado por AO
        vec3 hemi = mix(vec3(0.10,0.09,0.08), vec3(0.55,0.60,0.66), N.y*0.5+0.5);
        col += albedo * hemi * uEnvInt * ao * (1.0 - metal*0.85);
        // luces: clave, relleno y contraluz, cada una con GGX + Schlick
        vec3 dirs[3]; vec3 cols[3];
        dirs[0] = normalize(uLightDir);            cols[0] = vec3(1.25,1.18,1.05) * 2.6;
        dirs[1] = normalize(vec3(-0.7,0.25,-0.4)); cols[1] = vec3(0.45,0.55,0.75) * 1.1;
        dirs[2] = normalize(vec3(0.15,-0.35,-1.0));cols[2] = vec3(0.9,0.8,0.65) * 1.4;
        float a2 = pow(rough, 4.0);
        for (int i = 0; i < 3; i++) {
          vec3 L = dirs[i]; vec3 H = normalize(L + V);
          float NdL = max(dot(N,L), 0.0); if (NdL <= 0.0) continue;
          float NdH = max(dot(N,H), 0.0), NdV = max(dot(N,V), 0.0001), HdV = max(dot(H,V), 0.0);
          float D = a2 / (3.14159 * pow(NdH*NdH*(a2-1.0)+1.0, 2.0));
          float k = rough*rough/2.0;
          float G = (NdL/(NdL*(1.0-k)+k)) * (NdV/(NdV*(1.0-k)+k));
          vec3 F = F0 + (1.0-F0)*pow(1.0-HdV, 5.0);
          vec3 spec = D*G*F / max(4.0*NdV*NdL, 0.001);
          vec3 kd = (vec3(1.0)-F) * (1.0-metal);
          col += (kd*albedo/3.14159 + spec) * cols[i] * NdL * ao;
        }
        col = aces(col * uExposure);
        gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0); }`);
    this.shadowProg = link(`
      attribute vec3 aPos; attribute vec2 aUv; uniform mat4 uMVP; varying vec2 vUv;
      void main(){ vUv = aUv; gl_Position = uMVP * vec4(aPos, 1.0); }`, `
      precision mediump float; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.8) * 0.5;
        gl_FragColor = vec4(vec3(0.0), a); }`);

    const U = p => { const o = {}; ['uMVP','uMV','uHeight','uDisp','uBase','uNormal','uRough','uMetal','uAO','uLightDir','uRepeat','uExposure','uEnvInt'].forEach(u => o[u] = gl.getUniformLocation(p, u)); return o; };
    const A = p => ({ pos: gl.getAttribLocation(p, 'aPos'), norm: gl.getAttribLocation(p, 'aNorm'), tan: gl.getAttribLocation(p, 'aTan'), bitan: gl.getAttribLocation(p, 'aBitan'), uv: gl.getAttribLocation(p, 'aUv') });
    this.u = U(this.prog); this.a = A(this.prog);
    this.uS = U(this.shadowProg); this.aS = A(this.shadowProg);

    this.textures = {};
    ['base','normal','rough','metal','ao','height'].forEach(k => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.textures[k] = t;
    });
    gl.getExtension('OES_element_index_uint');
    this.shadow = this.makeMesh(this.discData());
    this.buildGeometry('sphere');
    this.bindEvents();
    this.loop();
  }

  /* ---------- geometrías con tangente/bitangente por vértice ---------- */
  discData() {
    const pos = [], uv = [], idx = [], S = 48;
    for (let i = 0; i <= S; i++) { const a = i / S * Math.PI * 2; pos.push(Math.cos(a) * 1.3, -1.06, Math.sin(a) * 1.3); uv.push(Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5); }
    pos.push(0, -1.06, 0); uv.push(0.5, 0.5); const c = S + 1;
    for (let i = 0; i < S; i++) idx.push(c, i, i + 1);
    return { pos, nor: pos.map(() => 0), tan: pos.map(() => 0), bitan: pos.map(() => 0), uv, idx };
  }
  buildGeometry(shape) {
    this.shape = shape; const pos = [], nor = [], tan = [], bitan = [], uv = [], idx = [];
    const push = (p, n, t, b, u) => { pos.push(...p); nor.push(...n); tan.push(...t); bitan.push(...b); uv.push(...u); };
    if (shape === 'sphere') {
      const W = 128, H = 80;
      for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
        const th = x / W * Math.PI * 2, ph = y / H * Math.PI, sp = Math.sin(ph), cp = Math.cos(ph);
        const p = [sp * Math.cos(th), cp, sp * Math.sin(th)];
        push(p, p, [-Math.sin(th), 0, Math.cos(th)], [-cp * Math.cos(th), sp, -cp * Math.sin(th)], [x / W, 1 - y / H]);
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = y * (W + 1) + x, b = a + W + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    } else if (shape === 'plane') {
      const S = 96;
      for (let y = 0; y <= S; y++) for (let x = 0; x <= S; x++)
        push([x / S * 2.4 - 1.2, 1.2 - y / S * 2.4, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], [x / S, 1 - y / S]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const a = y * (S + 1) + x, b = a + S + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    } else { // cubo: cada cara con sus ejes u/v tales que u × v = normal
      const F = [
        { n: [0,0,1],  u: [1,0,0],  v: [0,1,0] }, { n: [0,0,-1], u: [-1,0,0], v: [0,1,0] },
        { n: [1,0,0],  u: [0,0,-1], v: [0,1,0] }, { n: [-1,0,0], u: [0,0,1],  v: [0,1,0] },
        { n: [0,1,0],  u: [1,0,0],  v: [0,0,-1] }, { n: [0,-1,0], u: [1,0,0],  v: [0,0,1] },
      ];
      let base = 0; const S = 32;
      for (const f of F) {
        for (let y = 0; y <= S; y++) for (let x = 0; x <= S; x++) {
          const a = x / S - 0.5, b = y / S - 0.5;
          push([f.n[0]*0.75 + (f.u[0]*a + f.v[0]*b) * 1.5, f.n[1]*0.75 + (f.u[1]*a + f.v[1]*b) * 1.5, f.n[2]*0.75 + (f.u[2]*a + f.v[2]*b) * 1.5], f.n, f.u, f.v, [x / S, y / S]);
        }
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const q = base + y * (S + 1) + x, r = q + S + 1; idx.push(q, r, q + 1, r, r + 1, q + 1); }
        base += (S + 1) * (S + 1);
      }
    }
    this.mesh = this.makeMesh({ pos, nor, tan, bitan, uv, idx });
  }
  makeMesh(d) {
    const gl = this.gl, mk = arr => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return b; };
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(d.idx), gl.STATIC_DRAW);
    return { pos: mk(d.pos), nor: mk(d.nor), tan: mk(d.tan), bitan: mk(d.bitan), uv: mk(d.uv), idx: ib, count: d.idx.length };
  }
  drawMesh(mesh, att) {
    const gl = this.gl, bind = (buf, loc, size) => { if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    bind(mesh.pos, att.pos, 3); bind(mesh.nor, att.norm, 3); bind(mesh.tan, att.tan, 3); bind(mesh.bitan, att.bitan, 3); bind(mesh.uv, att.uv, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  setMaps(canvases) { this.pendingMaps = canvases; this.mapsDirty = true; }
  uploadMaps() {
    if (!this.pendingMaps) return; const gl = this.gl;
    const src = { base: 'basecolor', normal: 'normal', rough: 'roughness', metal: 'metallic', ao: 'ao', height: 'height' };
    for (const [key, mapKey] of Object.entries(src)) {
      const c = this.pendingMaps[mapKey]; if (!c) continue;
      gl.bindTexture(gl.TEXTURE_2D, this.textures[key]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
    }
    this.mapsDirty = false;
  }

  resetView() { this.rotX = 0.45; this.rotY = 0.6; this.dist = 3.4; }
  bindEvents() {
    let drag = false, lx = 0, ly = 0;
    this.canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; this.auto = false; const c = document.getElementById('autoRotate'); if (c) c.checked = false; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointerup', () => drag = false);
    this.canvas.addEventListener('pointermove', e => { if (!drag) return; this.rotY += (e.clientX - lx) * 0.008; this.rotX = Math.max(-1.5, Math.min(1.5, this.rotX + (e.clientY - ly) * 0.008)); lx = e.clientX; ly = e.clientY; });
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.dist = Math.max(2.1, Math.min(6.5, this.dist * (e.deltaY > 0 ? 1.09 : 0.92))); }, { passive: false });
    this.canvas.addEventListener('dblclick', () => this.resetView());
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.gl || this.canvas.hidden) return;
    if (this.mapsDirty) this.uploadMaps();
    const gl = this.gl, c = this.canvas, dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.round(c.clientWidth * dpr), ch = Math.round(c.clientHeight * dpr);
    if (cw > 0 && (c.width !== cw || c.height !== ch)) { c.width = cw; c.height = ch; }
    gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(0.055, 0.06, 0.055, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    /* matrices columna-mayor correctas: P · T(dist) · Rx · Ry */
    const asp = c.width / Math.max(1, c.height), f = 1 / Math.tan(0.42), near = 0.1, far = 30;
    const P = [f/asp,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0];
    const cx = Math.cos(this.rotX), sx = Math.sin(this.rotX), cy = Math.cos(this.rotY), sy = Math.sin(this.rotY);
    const Rx = [1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1], Ry = [cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
    const T = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-this.dist,1];
    const mul = (A, B) => { const o = new Array(16).fill(0); for (let col = 0; col < 4; col++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += A[k*4+r] * B[col*4+k]; o[col*4+r] = s; } return o; };
    if (document.getElementById('autoRotate')?.checked) this.rotY += 0.005;
    const MV = mul(T, mul(Rx, Ry)), MVP = mul(P, MV);

    /* sombra suave en el suelo (sin rotación del modelo) */
    gl.useProgram(this.shadowProg); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniformMatrix4fv(this.uS.uMVP, false, mul(P, T));
    this.drawMesh(this.shadow, this.aS);
    gl.depthMask(true); gl.disable(gl.BLEND);

    /* modelo con el material */
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uMVP, false, MVP); gl.uniformMatrix4fv(this.u.uMV, false, MV);
    const ang = (document.getElementById('lightAngle')?.value || 40) * Math.PI / 180;
    gl.uniform3f(this.u.uLightDir, Math.cos(ang) * 0.9, 1.1, Math.sin(ang) * 0.9 + 0.45);
    gl.uniform1f(this.u.uDisp, (document.getElementById('disp3d')?.value || 8) / 100 * 0.6);
    gl.uniform1f(this.u.uRepeat, parseFloat(document.getElementById('tiling')?.value || 1));
    gl.uniform1f(this.u.uExposure, (document.getElementById('exposure')?.value || 100) / 100);
    gl.uniform1f(this.u.uEnvInt, (document.getElementById('envInt')?.value || 90) / 100);
    const bind = (key, unit, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.textures[key]); gl.uniform1i(loc, unit); };
    bind('base', 0, this.u.uBase); bind('normal', 1, this.u.uNormal); bind('rough', 2, this.u.uRough);
    bind('metal', 3, this.u.uMetal); bind('ao', 4, this.u.uAO); bind('height', 5, this.u.uHeight);
    this.drawMesh(this.mesh, this.a);
  }
}
