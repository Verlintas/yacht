"""Audit Kitbash3D Sci-Fi Industrial FBX: hierarchy, dimensions, materials, tri counts."""
import bpy, json, os, re, sys
from mathutils import Vector

SRC = "/tmp/kb3d_fbx/asset_1.fbx"
OUT = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port/docs/kitbash-port/asset_audit.json"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)

objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
rows = []
for o in objs:
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    rows.append({
        "name": o.name,
        "parent": o.parent.name if o.parent else None,
        "verts": len(o.data.vertices),
        "tris": tris,
        "mats": [m.name if m else None for m in o.data.materials],
        "min": [round(min(xs),2), round(min(ys),2), round(min(zs),2)],
        "max": [round(max(xs),2), round(max(ys),2), round(max(zs),2)],
        "dims": [round(max(xs)-min(xs),2), round(max(ys)-min(ys),2), round(max(zs)-min(zs),2)],
    })

mats = {}
for m in bpy.data.materials:
    mats[m.name] = {"users": m.users, "use_nodes": m.use_nodes,
                    "nodes": [n.type for n in m.node_tree.nodes] if m.use_nodes and m.node_tree else []}

# cluster by base module name
groups = {}
for r in rows:
    base = re.sub(r'(_\d+|\.\d+|_Mat.*|_mat.*)$', '', r["name"])
    groups.setdefault(base, []).append(r)

summary = {
    "source": SRC,
    "mesh_count": len(objs),
    "total_tris": sum(r["tris"] for r in rows),
    "materials": mats,
    "objects": rows,
    "groups": {k: {"count": len(v), "tris": sum(x["tris"] for x in v),
                   "bbox_min": [min(x["min"][i] for x in v) for i in range(3)],
                   "bbox_max": [max(x["max"][i] for x in v) for i in range(3)],
                   "names": [x["name"] for x in v]} for k, v in sorted(groups.items())},
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(summary, f, indent=1)

print("MESHES", len(objs), "TRIS", summary["total_tris"], "MATS", len(mats))
for k, v in sorted(groups.items(), key=lambda kv: -sum(x["tris"] for x in kv[1]))[:40]:
    mn = [min(x["min"][i] for x in v) for i in range(3)]
    mx = [max(x["max"][i] for x in v) for i in range(3)]
    dims = [round(mx[i] - mn[i], 1) for i in range(3)]
    print(k, "n=", len(v), "tris=", sum(x["tris"] for x in v), "dims=", dims)
print("MATS:", sorted(mats.keys()))
