/* Vista 3D en tiempo real (WebGL1, sin librerías): esfera/plano/cubo con
   BaseColor + Normal + Roughness + Metallic + AO + Displacement por vértice.
   La normal tangente se reconstruye con derivadas (cotangent frame). */
'use strict';
class Preview3D {
  constructor(canvas) {
    this.canvas = canvas; this.gl = canvas.getContext('webgl', { antialias: true });
    this.rotX = 0.5; this.rotY = 0.6; this.auto = true; this.mapsDirty = true; this.shape = 'sphere';
    if (!this.gl) return;
    const gl = this.gl;
    gl.getExtension('OES_standard_derivatives'); gl.getExtension('OES_texture_float');
    const vs = `attribute vec3 aPos; attribute vec3 aNorm; attribute vec2 aUv;
      uniform mat4 uMVP, uMV; uniform sampler2D uHeight; uniform float uDisp;
      varying vec2 vUv; varying vec3 vNorm, vView;
      void main(){ vUv=aUv; vec3 p=aPos + aNorm * (texture2D(uHeight,aUv).r-0.5) * uDisp;
        vec4 mv = uMV * vec4(p,1.0); vNorm = mat3(uMV[0].xyz,uMV[1].xyz,uMV[2].xyz) * aNorm; vView = -mv.xyz;
        gl_Position = uMVP * vec4(p,1.0); }`;
    const fs = `#extension GL_OES_standard_derivatives : enable
      precision mediump float; varying vec2 vUv; varying vec3 vNorm, vView;
      uniform sampler2D uBase,uNormal,uRough,uMetal,uAO; uniform vec3 uLight; uniform float uRepeat;
      vec3 perturb(vec3 N, vec3 pos, vec2 uv, vec3 mapN){
        vec3 q0=dFdx(pos), q1=dFdy(pos); vec2 st0=dFdx(uv), st1=dFdy(uv);
        vec3 S=normalize(q0*st1.t-q1*st0.t), T=normalize(-q0*st1.s+q1*st0.s);
        mapN.xy = mapN.xy * vec2(1.0); return normalize(mat3(S,T,N)*mapN); }
      void main(){ vec2 uv = vUv * uRepeat;
        vec3 albedo = texture2D(uBase,uv).rgb; float rough = texture2D(uRough,uv).r;
        float metal = texture2D(uMetal,uv).r; float ao = texture2D(uAO,uv).r;
        vec3 mapN = texture2D(uNormal,uv).rgb*2.0-1.0;
        vec3 N = perturb(normalize(vNorm), -vView, uv, normalize(mapN));
        vec3 V = normalize(vView); vec3 L = normalize(uLight); vec3 H = normalize(L+V);
        float diff = max(dot(N,L),0.0); float specPow = mix(160.0,6.0,rough);
        float spec = pow(max(dot(N,H),0.0),specPow) * mix(0.04,1.0,metal) * (1.0-rough*0.75);
        vec3 specCol = mix(vec3(1.0), albedo, metal);
        vec3 col = albedo*(0.24+0.95*diff)*ao + specCol*spec*diff;
        col = pow(col, vec3(0.4545)); gl_FragColor = vec4(col,1.0); }`;
    const compile = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog); gl.useProgram(prog); this.prog = prog;
    this.loc = {}; ['aPos','aNorm','aUv'].forEach(a => this.loc[a] = gl.getAttribLocation(prog, a));
    ['uMVP','uMV','uHeight','uDisp','uBase','uNormal','uRough','uMetal','uAO','uLight','uRepeat']
      .forEach(u => this.loc[u] = gl.getUniformLocation(prog, u));
    this.textures = {}; ['base','normal','rough','metal','ao','height'].forEach(k => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.textures[k] = t;
    });
    this.buildGeometry('sphere'); this.bindEvents(); this.loop();
  }
  buildGeometry(shape) {
    this.shape = shape; const gl = this.gl, pos = [], nor = [], uv = [], idx = [];
    const push = (p, n, u) => { pos.push(...p); nor.push(...n); uv.push(...u); return pos.length / 3 - 1; };
    if (shape === 'sphere') {
      const W = 96, H = 64;
      for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
        const th = x / W * Math.PI * 2, ph = y / H * Math.PI, sp = Math.sin(ph);
        const p = [sp * Math.cos(th), Math.cos(ph), sp * Math.sin(th)];
        push(p, p, [x / W, 1 - y / H]);
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = y * (W + 1) + x, b = a + W + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    } else if (shape === 'plane') {
      const S = 96;
      for (let y = 0; y <= S; y++) for (let x = 0; x <= S; x++) push([x / S * 2 - 1, 1 - y / S * 2, 0], [0, 0, 1], [x / S, 1 - y / S]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const a = y * (S + 1) + x, b = a + S + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    } else {
      const faces = [[[0,0,1],[1,0,0]],[[0,0,-1],[-1,0,0]],[[1,0,0],[0,0,-1]],[[-1,0,0],[0,0,1]],[[0,1,0],[1,0,0]],[[0,-1,0],[1,0,0]]];
      let base = 0; const S = 24;
      for (const [n, ] of faces) {
        const u = Math.abs(n[1]) === 1 ? [1,0,0] : [0,1,0], v = [n[1]* (u[2]||0) - n[2]*(u[1]||0), 0, 0];
        const t = [n[1]*0 - n[2]*1, n[2]*0 - n[0]*0, n[0]*1 - n[1]*0]; // tangente simple
        const up = Math.abs(n[1]) === 1 ? [0,0,1] : [0,1,0];
        const tan = [up[1]*n[2]-up[2]*n[1], up[2]*n[0]-up[0]*n[2], up[0]*n[1]-up[1]*n[0]];
        for (let y = 0; y <= S; y++) for (let x = 0; x <= S; x++) {
          const a = x / S - 0.5, b = y / S - 0.5;
          push([n[0]*0.5 + tan[0]*a + up[0]*b, n[1]*0.5 + tan[1]*a + up[1]*b, n[2]*0.5 + tan[2]*a + up[2]*b], n, [x / S, y / S]);
        }
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const a = base + y * (S + 1) + x, bq = a + S + 1; idx.push(a, a + 1, bq, bq, a + 1, bq + 1); }
        base += (S + 1) * (S + 1);
      }
    }
    const buf = (data, loc, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    buf(pos, this.loc.aPos, 3); buf(nor, this.loc.aNorm, 3); buf(uv, this.loc.aUv, 2);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.getExtension('OES_element_index_uint'); this.indexCount = idx.length;
  }
  setMaps(canvases) { this.pendingMaps = canvases; this.mapsDirty = true; }
  uploadMaps() {
    if (!this.pendingMaps) return; const gl = this.gl;
    const src = { base: 'basecolor', normal: 'normal', rough: 'roughness', metal: 'metallic', ao: 'ao', height: 'height' };
    for (const [key, mapKey] of Object.entries(src)) {
      const c = this.pendingMaps[mapKey]; if (!c) continue;
      gl.bindTexture(gl.TEXTURE_2D, this.textures[key]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
    }
    this.mapsDirty = false;
  }
  bindEvents() {
    let drag = false, lx = 0, ly = 0;
    this.canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; this.auto = false; });
    addEventListener('pointerup', () => drag = false);
    addEventListener('pointermove', e => { if (!drag) return; this.rotY += (e.clientX - lx) * 0.01; this.rotX += (e.clientY - ly) * 0.01; lx = e.clientX; ly = e.clientY; });
  }
  loop() {
    requestAnimationFrame(() => this.loop()); if (!this.gl || this.canvas.hidden) return;
    if (this.mapsDirty) this.uploadMaps();
    const gl = this.gl, c = this.canvas;
    if (c.width !== c.clientWidth * devicePixelRatio) { c.width = c.clientWidth * devicePixelRatio || 640; c.height = c.width; }
    gl.viewport(0, 0, c.width, c.height); gl.clearColor(0.05, 0.06, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    if (this.auto) this.rotY += 0.004;
    const f = 1 / Math.tan(0.6), asp = 1, P = [f,0,0,0, 0,f,0,0, 0,0,-1.2,-1, 0,0,-2.4,0];
    const cx = Math.cos(this.rotX), sx = Math.sin(this.rotX), cy = Math.cos(this.rotY), sy = Math.sin(this.rotY);
    const Rx = [1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1], Ry = [cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,-3.2,1];
    const mul = (A, B) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) for (let k = 0; k < 4; k++) o[col * 4 + r] += A[k * 4 + r] * B[col * 4 + k]; return o; };
    const MV = mul(Rx, Ry), MVP = mul(P, MV);
    gl.uniformMatrix4fv(this.loc.uMVP, false, MVP); gl.uniformMatrix4fv(this.loc.uMV, false, MV);
    const ang = (document.getElementById('lightAngle')?.value || 40) * Math.PI / 180;
    gl.uniform3f(this.loc.uLight, Math.cos(ang) * 1.5, 1.2, Math.sin(ang) * 1.5);
    gl.uniform1f(this.loc.uDisp, (document.getElementById('disp3d')?.value || 8) / 100);
    gl.uniform1f(this.loc.uRepeat, parseFloat(document.getElementById('tiling')?.value || 1));
    const bind = (key, unit, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.textures[key]); gl.uniform1i(loc, unit); };
    bind('base', 0, this.loc.uBase); bind('normal', 1, this.loc.uNormal); bind('rough', 2, this.loc.uRough);
    bind('metal', 3, this.loc.uMetal); bind('ao', 4, this.loc.uAO); bind('height', 5, this.loc.uHeight);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
  }
}
