# Ingeniería inversa de PixPlant (R.E.A. = Reverse Engineering Anything)

> **Aclaración del autor del proyecto:** “R.E.A.” significa
> *Reverse Engineering Anything*: analizar una aplicación existente para
> deducir su comportamiento, su flujo y sus parámetros, y recrearlos con
> una implementación propia.
>
> **Método y límites:** ingeniería inversa **de caja negra** sobre fuentes
> públicas — documentación oficial de PixPlant 5, su historial de versiones
> (5.0.35 → 5.0.49), FAQ, capturas y descripciones de herramientas. No se
> ha descompilado, parcheado ni copiado código, binarios, algoritmos
> internos ni recursos de PixPlant (software propietario de FaronStudio).
> Todo el código de TexPlant es una reimplementación original a partir del
> comportamiento observable.

Fuentes principales:
- Ayuda oficial: https://www.pixplant.com/help/
- Historial de versiones: https://www.pixplant.com/history.php
- FAQ: https://www.pixplant.com/faq.php

---

## 1 · Qué es PixPlant, según lo observable

- Convierte fotos en **materiales PBR que repiten sin costuras** y extrae
  mapas con parámetros ajustables, con preview 3D PBR (GGX en flujo
  Metallic-Roughness, Blinn-Phong en el tradicional).
- Dos flujos de trabajo conmutables: **PBR** (Base Color, Metallic,
  Roughness) y **Tradicional** (Diffuse, Specular); comunes a ambos:
  Displacement, Normal, AO y **Opacity**.
- Todo el procesamiento interno es a **16 bits** (parte en flotante);
  color en sRGB y el resto de mapas en espacio lineal.
- Formatos: abre/guarda PNG/TIFF 8 y 16 bits, EXR flotante, JPEG, BMP,
  TGA…; al guardar, su ajuste “Default Map Bits” usa **16 bits para
  Displacement y Normal** y 8 para el resto. Tamaño máx. 16384².
- Preview 3D con entorno HDRI (HDR/EXR), modelos propios
  (FBX/OBJ/3DS/glTF vía Assimp), desplazamiento con teselación 256
  (máx. 1024) y modelos pared/suelo/esfera/tela.
- Extras: plug-in de Photoshop, edición externa, DPI/tamaño físico,
  validación PBR (Ctrl+B), atajos por mapa (Ctrl+1…7 / Alt+1…7).

## 2 · Ingeniería inversa del flujo principal

```
foto “semilla”
  └─ Tiling Synth ─ Seed Wizard (enderezar: rotación/perspectiva/fisheye,
  │                  patrón: rejilla detectada, Snap Scale to Seed Pattern,
  │                  Seed Scale 25–250 %, Equalize Brightness)
  │               ─ generación sincronizada de todos los mapas ya tileables
  └─ Extract 3D Maps (automático, en secuencia, con tiling previo opcional
                      y delight posterior del Base Color en flujo PBR)
       ├─ Displacement ← foto (“From Shading”) o ← normales
       ├─ Normal       ← Displacement (las ediciones posteriores de
       │                  Displacement NO se propagan solas: hay que
       │                  re-extraer Normal/AO — dependencia en cadena)
       ├─ AO           ← Displacement/Normal (Ray Distance limitada)
       ├─ Roughness    ← foto (algoritmo mejorado en 5.0.48)
       ├─ Metallic     ← foto/selección
       └─ Opacity      ← foto/alfa
  └─ Editores por mapa (herramientas de superficie completa y de píxel:
     Adjust, Paint/Clone, Offset, Transform, Keying, Erode-Dilate…)
  └─ Exportación con presets por destino (Blender, Unreal, Unity,
     3ds Max, VRay, Maxwell, Corona…) y empaquetado de canales
```

**Tiling Mode global** (observable): Horizontal, Vertical o Ambos;
afecta a Tiling Synth, Offset y Paint (el trazo se envuelve al borde
opuesto solo si el modo lo permite).

## 3 · Parámetros observados → equivalentes en TexPlant

| Parámetro PixPlant (observado) | Evidencia | Interpretación | Equivalente TexPlant | Estado |
|---|---|---|---|---|
| Tiling Mode H/V/Ambos | Ayuda §4 | Envolver solo en los ejes elegidos | `Modo de tiling` (makeSeamless por ejes) | ✅ implementado |
| Equalize Brightness (slider) | Historial 5.0.42 | Quitar luz/sombra de la semilla | `Quitar iluminación (delight)` | ✅ |
| Seed Scale 25–250 % + Snap to Pattern | Ayuda Texture/FAQ | Tamaño de elementos que “se encuentran” en el borde | Tamaño de trabajo + repeticiones del mosaico | 🟡 parcial (sin detección de patrón) |
| Seed Wizard: enderezar/perspectiva/fisheye, puntos de control | Historial 5.0.40–42 | Corrección geométrica previa | — | ❌ pendiente |
| Extract Displacement: From Shading, **Surface Scale**, **Fine Detail**, **Range** | Historial 5.0.36–39 | Escala global del relieve, detalle fino vs. suavizado, compresión de rango (telas) | `Contraste`/`Intensidad (Surface Scale)`, `Detalle fino (Fine Detail)`, `Rango (Range)` | ✅ implementado |
| Extract Normal: Surface Scale / Fine Detail / formato OpenGL-DirectX | Historial + FAQ | Gradiente de la altura; G invertido en DirectX | `Intensidad`, `Detalle fino`, `Formato` | ✅ |
| AO: **Ray Distance** (máx. almacenada) | Historial 5.0.40 | Radio de oclusión | `Radio (Ray Distance)` | ✅ |
| Roughness Extract (mejorado 5.0.48) | Historial | Rugosidad desde luminancia/color | `Roughness base/variación/invertir` | ✅ (estimación propia) |
| Metallic Extract con selección de origen | Historial 5.0.44 | Metal casi binario por zonas | `Metallic base/umbral` | 🟡 parcial (sin keying por color) |
| Opacity Extract (desde 5.0.44, corte 0.5 en preview) | Historial | Umbral de opacidad | `Opacity: Umbral/Suavidad/Invertir` → Alpha en Blender | ✅ nuevo |
| Delight del Base Color | Ayuda §5 + 5.0.42 | Dividir por iluminación estimada | `delight` | ✅ |
| Tiling Preview + Tiling Borders | Historial 5.0.46 | Ver repetición y bordes para cazar artefactos | Vista `Mosaico` N×N | ✅ |
| Displacement teselación 256–1024, modelos, HDRI | Historial | Preview con desplazamiento real | Vista 3D WebGL GGX: esfera/plano/cubo, TBN por vértice, desplazamiento, entorno de estudio, ACES, zoom | 🟡 parcial (sin HDRI/modelos externos) |
| 16 bits interno; Normal/Displacement a 16 bits al guardar | Ayuda §1 y §10 | Precisión para relieves suaves | PNG de 8 bits (Canvas) | ❌ pendiente (ver §5) |
| Ajustes Adjust/Keying/Erode-Dilate/Paint/Offset/Transform | Historial | Edición por mapa tras extraer | Sliders globales por mapa | 🟡 parcial (sin edición por píxel) |
| Export presets (Blender/Unreal/Unity/Corona…), empaquetado | Historial 5.0.48–49 | Nombres/canales según destino | ZIP + script Blender | 🟡 parcial (solo Blender) |
| PBR Validate (Ctrl+B) | Historial 5.0.37 | Avisar valores inválidos de Base/Metallic | — | ❌ pendiente |
| DPI / tamaño físico | Historial 5.0.46, Ayuda §9 | Preservar escala real (cm/in) | — | ❌ pendiente |

## 4 · Conclusiones de la ingeniería inversa

1. **La altura manda**: Normal y AO se derivan de Displacement; por eso
   TexPlant deriva Normal/AO/Bump desde una única altura (misma cadena).
2. **El tiling se hace ANTES de extraer** y de forma sincronizada para
   todos los mapas; TexPlant tilea la fuente y deriva todo de ella, con
   filtros toroidales para no reintroducir costuras.
3. **Los nombres de parámetros son la especificación**: `Surface Scale`,
   `Fine Detail`, `Range` y `Ray Distance` aparecen tal cual en el
   historial; se adoptaron como etiquetas equivalentes en la UI.
4. **Opacity es un mapa de primera clase** (no un extra): se añadió con
   conexión al `Alpha` del Principled BSDF en el script de Blender.

## 5 · Brechas conocidas y plan

| Brecha | Plan |
|---|---|
| Precisión 16 bits (Canvas es 8 bits) | Exportar Displacement/Normal en PNG de 16 bits codificando a mano, o pipeline en `Float32Array` + codificador PNG propio (los datos internos ya son flotantes) |
| Seed Wizard (enderezar, patrón, escala 25–250 %) | Editor de 4 puntos con homografía en canvas + selector de celda de patrón y “snap” de escala |
| Edición por píxel (Paint/Clone/Offset) | Pincel toroidal sobre el mapa activo |
| Preview con HDRI y modelos OBJ | Cargar `.hdr`/`.obj` en el visor WebGL |
| Presets de exportación Unreal/Unity (ORM empaquetado) | Generar `*_ORM.png` (R=AO, G=Roughness, B=Metallic) en el ZIP |
| PBR Validate | Avisos si Metallic tiene grises o Base Color sale del rango sRGB válido |
