# TexPlant Studio — plantilla para Blender (equivalente al script que exporta la app).
# Copia este archivo junto a la carpeta de texturas exportada, ajusta TEXTURE_DIR /
# MATERIAL_NAME y ejecútalo en Blender: Scripting → Open → Run Script.
import bpy, os

MATERIAL_NAME = "MiMaterial"
TEXTURE_DIR = os.path.join(os.path.dirname(bpy.data.filepath) or os.path.expanduser("~"), MATERIAL_NAME)
USE_DISPLACEMENT = False

FILES = {
    "basecolor": (f"{MATERIAL_NAME}_BaseColor.png", "sRGB"),
    "normal": (f"{MATERIAL_NAME}_Normal.png", "Non-Color"),
    "roughness": (f"{MATERIAL_NAME}_Roughness.png", "Non-Color"),
    "metallic": (f"{MATERIAL_NAME}_Metallic.png", "Non-Color"),
    "ao": (f"{MATERIAL_NAME}_AO.png", "Non-Color"),
    "height": (f"{MATERIAL_NAME}_Height.png", "Non-Color"),
}

mat = bpy.data.materials.new(MATERIAL_NAME)
mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (320, 0)
nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
coord = nt.nodes.new("ShaderNodeTexCoord"); coord.location = (-820, 0)
mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-620, 0)
nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])

def place(key, y):
    fname, cs = FILES[key]
    img = bpy.data.images.load(os.path.join(TEXTURE_DIR, fname), check_existing=True)
    img.colorspace_settings.name = cs
    node = nt.nodes.new("ShaderNodeTexImage"); node.image = img; node.location = (-380, y)
    nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"]); return node

base, ao = place("basecolor", 320), place("ao", 60)
mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = 'MULTIPLY'
mix.inputs[0].default_value = 0.85; mix.location = (60, 300)
nt.links.new(base.outputs["Color"], mix.inputs[1]); nt.links.new(ao.outputs["Color"], mix.inputs[2])
nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(place("metallic", -120).outputs["Color"], bsdf.inputs["Metallic"])
nt.links.new(place("roughness", -300).outputs["Color"], bsdf.inputs["Roughness"])
nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (60, -480)
nt.links.new(place("normal", -480).outputs["Color"], nmap.inputs["Color"])
height = place("height", -660)
bump = nt.nodes.new("ShaderNodeBump"); bump.location = (60, -680)
bump.inputs["Strength"].default_value = 0.35; bump.inputs["Distance"].default_value = 0.08
nt.links.new(height.outputs["Color"], bump.inputs["Height"]); nt.links.new(nmap.outputs["Normal"], bump.inputs["Normal"])
nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
if USE_DISPLACEMENT:
    disp = nt.nodes.new("ShaderNodeDisplacement"); disp.location = (320, -300)
    disp.inputs["Scale"].default_value = 0.05
    nt.links.new(height.outputs["Color"], disp.inputs["Height"])
    nt.links.new(disp.outputs["Displacement"], out.inputs["Displacement"])
    mat.cycles.displacement_method = 'BOTH'
obj = bpy.context.active_object
if obj and obj.type == 'MESH':
    obj.data.materials.clear(); obj.data.materials.append(mat)
print(f"Material '{MATERIAL_NAME}' creado.")
