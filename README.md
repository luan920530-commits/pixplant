# 🌿 TexPlant Studio — Generador de texturas PBR para Blender

Aplicación **multiplataforma** (Windows · macOS · Linux · móvil) estilo
**PixPlant / Materialize / AwesomeBump**: convierte **una foto** en un set
completo de texturas PBR *seamless* listas para Blender.

![flujo](https://img.shields.io/badge/foto-%3E%20material%20PBR-%3E%20Blender-8fd14f)

## ✨ Qué genera (los 8 mapas que pide Blender)

| Mapa | Archivo | En Blender |
|---|---|---|
| Base Color (con *delight*) | `*_BaseColor.png` | Principled → Base Color · **sRGB** |
| Normal (OpenGL/DirectX) | `*_Normal.png` | Normal Map → Normal · Non-Color |
| Height | `*_Height.png` | Bump / Displacement · Non-Color |
| Bump | `*_Bump.png` | Bump · Non-Color |
| Displacement | `*_Displacement.png` | Displacement (Cycles) · Non-Color |
| Roughness | `*_Roughness.png` | Roughness · Non-Color |
| Metallic | `*_Metallic.png` | Metallic · Non-Color |
| Ambient Occlusion | `*_AO.png` | Multiply sobre Base Color · Non-Color |

Además: **seamless sin costuras**, vista **2D / mosaico tiling / 3D en tiempo
real** (esfera, plano, cubo, con desplazamiento), presets (piedra, madera,
metal, tela…), muestras procedurales integradas y **exportación ZIP** con un
**script de Blender** que crea el material con todos los nodos conectados.

## 💻 App nativa de escritorio (macOS Intel · Windows · Linux)

La app también es una **aplicación nativa instalable** (Electron, un solo
código para las tres plataformas):

| Plataforma | Instalador |
|---|---|
| **Mac con Intel (x64)** | `.dmg` / `.zip` — *TexPlant-Studio-…-mac-intel* |
| **Windows (x64)** | `.exe` instalador NSIS + portable |
| **Linux (x64)** | `.AppImage` + `.deb` |

**Descargarlos:** en GitHub → *Actions* → **Build native apps** (o al publicar
un tag `v*`) se compila cada instalador en una máquina real de su sistema
(`.github/workflows/build-native.yml`: `macos-13` = Intel, `windows-latest`,
`ubuntu-latest`) y quedan como artefactos descargables.

**Ejecutarla / compilarla en tu equipo:**

```bash
npm ci
npm run desktop        # abre la app nativa sin empaquetar
npm run dist:mac-intel # macOS Intel  (hacerlo en un Mac Intel)
npm run dist:win       # Windows      (hacerlo en Windows)
npm run dist:linux     # Linux        (.AppImage / .deb)
```

La versión nativa añade menú **Archivo → Abrir imagen… (Ctrl/Cmd+O)**
y funciona sin servidor ni internet.

## 🚀 Versión web / PWA

Sin instalar nada (solo un navegador moderno):

```bash
# en la carpeta del proyecto
python3 -m http.server 8000
# abre http://localhost:8000
```

O sirve la carpeta con cualquier servidor estático / ábrela desde un hosting.
Es una **PWA**: tras la primera visita funciona **offline** y se puede
"instalar" desde el navegador. Todo el procesamiento es **local**: tus fotos
nunca salen de tu equipo.

1. Carga una foto (clic, arrastrar y soltar, o pegar) o usa una muestra 🎨.
2. Ajusta los parámetros (o un preset) — los mapas se regeneran al instante.
3. Comprueba el *tiling* y la vista 3D.
4. **⬇ Exportar todo (.zip)** → descomprime junto a tu `.blend`.
5. En Blender: *Scripting → Open → `*_Blender.py` → Run Script* con el objeto
   seleccionado. ¡Material creado y asignado!

## 🧠 Análisis R.E.A.

Los requisitos, la arquitectura y los algoritmos/parámetros se determinaron
con el método **R.E.A. (Requisitos · Entorno · Algoritmos)** a partir de
PixPlant, Materialize, AwesomeBump y el flujo Metallic-Roughness de Blender:
ver **[docs/ANALISIS_REA.md](docs/ANALISIS_REA.md)**.

## 📁 Estructura

```
index.html · css/styles.css
js/processing.js   motor seamless/delight/height/normal/AO/roughness/metallic
js/preview3d.js    vista 3D WebGL sin librerías
js/export.js       PNG, ZIP sin dependencias y generador del script Blender
js/app.js          interfaz, presets y muestras procedurales
desktop/           app nativa Electron (main + preload seguro)
package.json       electron-builder: mac Intel .dmg · Windows .exe · Linux .AppImage/.deb
.github/workflows/build-native.yml   compila los 3 instaladores
blender/material_builder.py   plantilla para usar dentro de Blender
```

## Licencia

GPL-3.0 (ver `LICENSE`).
