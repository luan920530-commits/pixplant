/* Exportación: PNG individuales, ZIP sin dependencias (formato STORE + CRC32)
   y script de Blender que crea el material con los nodos ya conectados. */
'use strict';

function canvasBlob(canvas) { return new Promise(r => canvas.toBlob(r, 'image/png')); }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

async function makeZip(files) { // files: [{name, blob|text}]
  const enc = new TextEncoder(), chunks = [], central = []; let offset = 0;
  for (const f of files) {
    const data = f.blob ? new Uint8Array(await f.blob.arrayBuffer()) : enc.encode(f.text);
    const name = enc.encode(f.name), crc = crc32(data), head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(8, 0, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(head.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name); offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* Script Python para Blender ≥ 3.x / 4.x: Principled BSDF correctamente cableado.
   BaseColor=sRGB; el resto Non-Color; Normal vía nodo Normal Map; AO multiplicado
   sobre el color; Height → Bump (y Displacement opcional comentado). */
function blenderScript(matName) {
  const n = (matName || 'MiMaterial').replace(/[^\w\- ]/g, '');
  return `# ─────────────────────────────────────────────────────────────
# Material "${n}" generado con TexPlant Studio
# Uso: descomprime el .zip, edita TEXTURE_DIR si hace falta y
# ejecuta este script en Blender (Scripting → Open → Run Script).
# Crea el material y lo asigna al objeto seleccionado.
# ─────────────────────────────────────────────────────────────
import bpy, os

TEXTURE_DIR = os.path.join(os.path.dirname(bpy.data.filepath) or os.path.expanduser("~"), "${n}")
USE_DISPLACEMENT = False   # True = desplazamiento real (Cycles + subdivision)

FILES = {  # clave: (archivo, espacio de color)
    "basecolor":    ("${n}_BaseColor.png",    "sRGB"),
    "normal":       ("${n}_Normal.png",       "Non-Color"),
    "roughness":    ("${n}_Roughness.png",    "Non-Color"),
    "metallic":     ("${n}_Metallic.png",     "Non-Color"),
    "ao":           ("${n}_AO.png",           "Non-Color"),
    "height":       ("${n}_Height.png",       "Non-Color"),
    "opacity":      ("${n}_Opacity.png",      "Non-Color"),
}

mat = bpy.data.materials.new("${n}")
mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (320, 0)
nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

def tex(key, x, y):
    fname, cs = FILES[key]
    img = bpy.data.images.load(os.path.join(TEXTURE_DIR, fname), check_existing=True)
    img.colorspace_settings.name = cs
    node = nt.nodes.new("ShaderNodeTexImage"); node.image = img; node.location = (x, y)
    return node

mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-620, 0)
coord = nt.nodes.new("ShaderNodeTexCoord"); coord.location = (-820, 0)
nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])

def place(key, y):
    t = tex(key, -380, y); nt.links.new(mapping.outputs["Vector"], t.inputs["Vector"]); return t

# Base Color × AO
base = place("basecolor", 320); ao = place("ao", 60)
mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 0.85; mix.location = (60, 300)
nt.links.new(base.outputs["Color"], mix.inputs[1]); nt.links.new(ao.outputs["Color"], mix.inputs[2])
nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])

nt.links.new(place("metallic", -120).outputs["Color"], bsdf.inputs["Metallic"])
nt.links.new(place("roughness", -300).outputs["Color"], bsdf.inputs["Roughness"])
if "Alpha" in bsdf.inputs:
    nt.links.new(place("opacity", -840).outputs["Color"], bsdf.inputs["Alpha"])

# Normal (siempre a través del nodo Normal Map)
nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (60, -480); nmap.inputs["Strength"].default_value = 1.0
nt.links.new(place("normal", -480).outputs["Color"], nmap.inputs["Color"])
height = place("height", -660)
bump = nt.nodes.new("ShaderNodeBump"); bump.location = (60, -680); bump.inputs["Strength"].default_value = 0.35; bump.inputs["Distance"].default_value = 0.08
nt.links.new(height.outputs["Color"], bump.inputs["Height"]); nt.links.new(nmap.outputs["Normal"], bump.inputs["Normal"])
nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

if USE_DISPLACEMENT:
    disp = nt.nodes.new("ShaderNodeDisplacement"); disp.location = (320, -300)
    disp.inputs["Scale"].default_value = 0.05; disp.inputs["Midlevel"].default_value = 0.5
    nt.links.new(height.outputs["Color"], disp.inputs["Height"])
    nt.links.new(disp.outputs["Displacement"], out.inputs["Displacement"])
    mat.cycles.displacement_method = 'BOTH'

obj = bpy.context.active_object
if obj and obj.type == 'MESH':
    obj.data.materials.clear(); obj.data.materials.append(mat)
print("Material '${n}' creado y asignado.")
`;
}
