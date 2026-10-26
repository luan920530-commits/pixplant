# Análisis R.E.A. — TexPlant Studio

> **R.E.A. = Requisitos · Entorno/Arquitectura · Algoritmos.**
> Método usado para determinar los parámetros de la app a partir de la
> investigación de PixPlant, Materialize, AwesomeBump y del flujo PBR
> (Metallic-Roughness) que usa el Principled BSDF de Blender.

PixPlant convierte una foto en un material *seamless* y extrae mapas PBR
(Base Color con *delight*, Metallic, Roughness, Displacement, Normal,
Ambient Occlusion, Opacity) con editores por mapa y preview 3D
([pixplant.com](https://www.pixplant.com/)). Materialize y AwesomeBump
hacen Diffuse→Height, Height→Normal, Normal→AO y *tiling* seamless
([boundingboxsoftware.com](https://www.boundingboxsoftware.com/materialize/),
[github.com/kmkolasinski/awesomebump](https://github.com/kmkolasinski/AwesomeBump)).
En Blender, el Base Color va en **sRGB** y **todos los demás mapas en
Non-Color**; la normal pasa por un nodo *Normal Map* y la altura por
*Bump* o *Displacement*
([quickpoly.com](https://quickpoly.com/blog/principled-bsdf-material-setup-the-complete-texture-workflow-in-blender)).

---

## 1 · R — Requisitos

### Funcionales
| ID | Requisito | Estado |
|---|---|---|
| RF-01 | Importar foto (clic, arrastrar y soltar, pegar) PNG/JPG/WebP | ✅ |
| RF-02 | Hacer la textura **seamless** (sin costuras al repetir) | ✅ mezcla cruzada de bordes |
| RF-03 | **Base Color** sin iluminación incrustada (*delight*) | ✅ |
| RF-04 | **Normal** (Sobel) en formato OpenGL (Blender) o DirectX | ✅ |
| RF-05 | **Height**, **Bump** y **Displacement** desde la misma altura | ✅ |
| RF-06 | **Roughness** y **Metallic** ajustables (base + variación/umbral) | ✅ |
| RF-07 | **Ambient Occlusion** desde cavidades de la altura | ✅ |
| RF-08 | Vista previa 2D, mosaico *tiling* N×N y **3D en tiempo real** | ✅ WebGL |
| RF-09 | Exportar cada mapa en PNG y el set completo en ZIP | ✅ |
| RF-10 | Exportar **script de Blender** que crea el material conectado | ✅ |
| RF-11 | Presets por material (piedra, madera, metal, tela, suave) | ✅ |
| RF-12 | Muestras procedurales integradas para probar sin foto | ✅ |

### No funcionales
| ID | Requisito | Decisión |
|---|---|---|
| RNF-01 | **Multiplataforma** (Windows/macOS/Linux/móvil) | Web app + PWA, sin instalación |
| RNF-02 | Privacidad: las fotos no salen del equipo | Todo el cómputo es local (Canvas/WebGL) |
| RNF-03 | Sin dependencias ni build | HTML/CSS/JS puro, ZIP generado a mano |
| RNF-04 | Rendimiento interactivo | Pipeline en `Float32Array`, regeneración con *debounce*; gaussiano separable toroidal |
| RNF-05 | Offline | Service Worker (`sw.js`) |

## 2 · E — Entorno / Arquitectura

```
index.html ─┬─ js/processing.js  motor: seamless → delight → height → normal/AO/rough/metal/bump/disp
            ├─ js/preview3d.js   WebGL1: esfera/plano/cubo, normal-mapping por derivadas, displacement por vértice
            ├─ js/export.js      PNG · ZIP (STORE+CRC32) · generador del script de Blender
            └─ js/app.js         UI, presets, muestras procedurales, drag&drop/pegar
blender/material_builder.py      plantilla equivalente ejecutable dentro de Blender
```

Alternativa multiplataforma considerada: escritorio con Python+Qt/Pillow
(la ruta de AwesomeBump). Se eligió **web/PWA** porque cumple
Windows/macOS/Linux/Android con un solo código y cero instalación; el
procesamiento pesado queda en el navegador del usuario.

## 3 · A — Algoritmos y parámetros (el corazón del análisis)

Flujo (cada etapa alimenta a la siguiente, como en PixPlant):

1. **Seamless** — mezcla la imagen con su copia desplazada ½ textura;
   peso `smoothstep` creciente hacia los bordes (`Mezcla de bordes 5–49 %`).
2. **Delight (Base Color)** — estima la iluminación como la luminancia muy
   borrosa (σ ≈ ancho/12, gaussiano *wrap*) y divide:
   `color' = color · (sombra/media)^-delight` (`Quitar iluminación 0–100 %`).
3. **Height** — combina detalle (`lum − sombra`) y luminancia, con
   `Contraste 0–300 %`, `Brillo`, `Suavizado 0–12 px`, `Invertir`,
   `Punto medio` para displacement.
4. **Normal** — gradiente **Sobel toroidal** sobre la altura
   (`Intensidad 0–12`); `G` se invierte en formato DirectX.
   Blender = **OpenGL**.
5. **AO** — cavidad = `max(0, altura_borrosa − altura)` con radio
   `1–32 px` e `Intensidad 0–300 %` (las grietas se oscurecen).
6. **Roughness** — `base ± variación·luminancia` (invertible); Materialize
   lo deriva igual de Diffuse→Smoothness.
7. **Metallic** — `base` + zonas sobre el `umbral` de luminancia
   (el metal debe ser casi binario: negro o blanco).
8. **Bump / Displacement** — la misma altura recentrada / con punto medio.

> ⚠️ Todos los blur/gradientes son **toroidales (wrap)**: si la base es
> seamless, *ningún* mapa derivado introduce costuras nuevas.

### Parámetros expuestos en la UI (resumen)
| Grupo | Parámetros |
|---|---|
| Proyecto | nombre, tamaño 256–2048, repeticiones, presets |
| Base Color | seamless, mezcla de bordes, delight, saturación |
| Altura | contraste, brillo, suavizado, punto medio, invertir |
| Normal | intensidad, formato OpenGL/DirectX |
| Rough/Metal | base, variación, invertir, umbral |
| AO | intensidad, radio |
| Vista 3D | ángulo de luz, desplazamiento, forma, repeticiones |

## 4 · Uso en Blender (flujo destino)

1. Exporta el ZIP y descomprímelo junto a tu `.blend`.
2. Scripting → Open → `*_Blender.py` → ▶ Run Script (objeto seleccionado).
3. El script crea: TexCoord→Mapping→Image Textures, **BaseColor sRGB**,
   resto **Non-Color**, AO×BaseColor (Multiply 0.85), Normal Map→Bump→
   Principled, Metallic/Roughness directos; displacement real opcional
   (`USE_DISPLACEMENT=True`, Cycles + subdivisión).
