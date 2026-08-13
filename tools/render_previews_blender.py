#!/usr/bin/env python3
# Bu dosya Blender'ın Python ortamında çalıştırılır:
# blender --background --python tools/render_previews_blender.py

import bpy
import json
import math
import os
from pathlib import Path
from mathutils import Vector

ROOT = Path.cwd()
CATALOG = ROOT / "data" / "catalog.json"
OUT_DIR = ROOT / "assets" / "previews"
OUT_DIR.mkdir(parents=True, exist_ok=True)

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

def world_bbox(objects):
    pts = []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            pts.append(obj.matrix_world @ Vector(corner))
    if not pts:
        return Vector((0,0,0)), Vector((1,1,1))
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return (mn+mx)/2, mx-mn

def add_area_light(name, location, energy, size, target):
    data = bpy.data.lights.new(name=name, type='AREA')
    data.energy = energy
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj

def render_model(model):
    clean_scene()

    glb_rel = model["glb"].split("?")[0]
    glb = ROOT / glb_rel
    if not glb.exists():
        print("ATLA: model yok:", glb)
        return False

    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        print("ATLA: mesh yok:", glb)
        return False

    center, size = world_bbox(meshes)
    max_dim = max(size.x, size.y, size.z, 0.001)

    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except:
        scene.render.engine = 'BLENDER_EEVEE'

    scene.render.resolution_x = 640
    scene.render.resolution_y = 420
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True

    # Renk yönetimi
    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'Medium High Contrast'
        scene.view_settings.exposure = 0
        scene.view_settings.gamma = 1
    except:
        pass

    # Kamera
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 52

    direction = Vector((1.25, -1.45, 0.95)).normalized()
    # Diyagonal boyuta göre güvenli kamera uzaklığı
    diagonal = max(size.length, max_dim)
    distance = max(diagonal * 1.65, max_dim * 2.15)
    cam.location = center + direction * distance
    look_at(cam, center)

    # Işık
    add_area_light("Key", center + Vector((max_dim*1.8, -max_dim*1.4, max_dim*2.0)),
                   900, max_dim*2.0, center)
    add_area_light("Fill", center + Vector((-max_dim*1.4, -max_dim*0.4, max_dim*1.0)),
                   500, max_dim*2.2, center)
    add_area_light("Rim", center + Vector((0, max_dim*1.8, max_dim*1.4)),
                   650, max_dim*1.8, center)

    # Dünya ışığı
    scene.world.color = (0.025, 0.035, 0.05)

    out = OUT_DIR / f'{model["id"]}.png'
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print("OK:", out)
    return True

catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
ok = 0
for model in catalog.get("models", []):
    try:
        if render_model(model):
            ok += 1
    except Exception as exc:
        print("HATA:", model.get("id"), repr(exc))

print(f"Poster üretimi tamamlandı: {ok}/{len(catalog.get('models', []))}")
if catalog.get("models") and ok == 0:
    raise SystemExit(1)
