# Mejoras posibles y estado de librerías — TexPlant Studio

## 1 · Auditoría de ramas (2026-10-26)

| Rama | Estado |
|---|---|
| `main` | En el merge del PR #2. Quedará al día al fusionar el PR #3. |
| `arena/936ee125-pixplant` (esta) | PR #3 abierto hacia `main`: ingeniería inversa, exportación macOS Monterey, diseño NEO y esta actualización de librerías. |
| `arena/6ab1ca7b-pixplant`, `arena/645509a5-pixplant` | Fusionadas (PR #1 y #2) y eliminadas del remoto. Nada pendiente en ellas. |

**Conclusión:** no hay ramas “mejorables” sueltas; la única acción de ramas
pendiente es fusionar el PR #3 para que `main` reciba todo.

## 2 · Librerías actualizadas en esta pasada (v1.4.0)

| Pieza | Antes | Ahora | Notas |
|---|---|---|---|
| Electron | 31.7.7 | **43.8.4** | Última línea compatible con **macOS 12 Monterey** (Electron 44+ exige macOS 13). Nuestro destino es `minimumSystemVersion: 12.0`. Sin módulos nativos ni APIs retiradas en uso (preload solo usa `ipcRenderer`). Se probó 45.1.0 y se descartó solo por el requisito de macOS 13. |
| electron-builder | 24.13.3 | **26.18.0** | Mejor soporte de runners actuales (Ubuntu reciente, macOS 15). |
| Node en CI | 20 | **22** | Electron 43 requiere Node ≥ 22.12 para su tooling. |
| actions/checkout | v4 | **v7** | Última mayor. |
| actions/setup-node | v4 | **v7** | Última mayor. |
| actions/upload-artifact | v4 | **v7** | Última mayor. |
| Dependabot | — | **nuevo** | PRs semanales de npm + GitHub Actions (`.github/dependabot.yml`). |

La app web en sí sigue **sin dependencias de runtime** (HTML/CSS/JS +
Canvas/WebGL puros): no hay nada que actualizar ahí, y es deliberado
(cero *supply chain* en el código que procesa las fotos).

## 3 · Mejoras propuestas, por impacto

> **Alcance (decisión del autor): TexPlant es solo para Blender.**
> Nada de presets Unreal/Unity ni ORM: todo el esfuerzo va al flujo
> Principled BSDF / Cycles / EEVEE.

### ✅ Hecho en la pasada “solo Blender” (v1.3.x)
- **Tratamiento de imagen**: exposición, contraste, temperatura,
  reducción de ruido, nitidez y detalle multiescala antes de derivar.
- **Exportación 16 bits** de Normal y Displacement (PNG codificado desde
  los `Float32Array` internos): desplazamiento en Cycles sin bandas.
- **Espacio de visualización PRO**: zoom/pan en 2D, comparación
  Antes/Después, aislamiento de canales RGB/luminancia, histograma con
  estadísticas, panel plegable y pantalla completa.

### 🔴 Alto impacto (función “de PixPlant” que aún falta)
1. **Seed Wizard**: enderezar la foto (homografía por 4 puntos),
   detección de rejilla de patrón y *Snap Scale to Seed Pattern* con
   Seed Scale 25–250 %. Es la herramienta insignia de PixPlant.
2. **Addon de Blender** (`.zip` instalable en Preferences → Add-ons)
   que haga lo mismo que el script suelto, con panel propio.
3. **Grupos de nodos reutilizables**: guardar el material como
   *node group* con controles (escala, fuerza de normal/bump,
   rotación) expuestos en el panel del material.

### 🟠 Impacto medio (flujo de trabajo)
4. **Edición toroidal por píxel**: Offset, Paint y Clone envolventes
   sobre el mapa activo (con el modo de tiling H/V/Ambos).
5. **Proyectos** `.texplant.json`: guardar foto, parámetros y mapa
   activo; reabrir y seguir donde ibas. **Deshacer/rehacer** (Ctrl+Z/Y).
6. **Procesado por lotes**: arrastrar una carpeta y generar todos los
   sets PBR de golpe con el mismo preset.
7. **PBR Validate**: avisos si el Metallic tiene grises “sucios” o el
   Base Color se sale del rango válido (equivalente al Ctrl+B).

### 🟡 Impacto visual / rendimiento
8. **Preview 3D con HDRI** (cargar `.hdr`) y modelos `.obj` propios;
   modo parallax además del desplazamiento.
9. **Web Worker / OffscreenCanvas** para no congelar la UI a 2048 px,
   y *debounce* ya aplicado; posible WASM para el Sobel/gaussiano.
10. **Snapshot del visor 3D** (guardar PNG de la vista) para enseñar el
    material sin salir de la app.

### 🔵 Distribución
11. **Firma y notarización** de macOS (Developer ID) y firma en Windows
    para eliminar los avisos de Gatekeeper/SmartScreen.
12. **Auto-actualización** con `electron-updater` + Releases de GitHub
    (los tags `v*` ya disparan la compilación).
13. **Tests**: unitarios del motor (ya hay banco de pruebas en Node) y
    capturas con Playwright en CI para cazar regresiones visuales.
