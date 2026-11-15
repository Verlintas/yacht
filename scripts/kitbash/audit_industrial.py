"""Audit Kitbash3D Industrial factories FBX for port cranes/containers/warehouses."""
import bpy, re, json, os
from mathutils import Vector

SRC="/tmp/kb3d_ind/Kitbash3D-Industrial/Kitbash3d_Factories.FBX"
OUT="/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port/docs/kitbash-port/asset_audit_industrial.json"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
rows=[]
for o in [x for x in bpy.context.scene.objects if x.type=='MESH']:
    bb=[o.matrix_world@Vector(c) for c in o.bound_box]
    mins=[min(v[i] for v in bb) for i in range(3)]; maxs=[max(v[i] for v in bb) for i in range(3)]
    rows.append({"name":o.name,"tris":sum(len(p.vertices)-2 for p in o.data.polygons),
                 "dims":[round(maxs[i]-mins[i],2) for i in range(3)],
                 "min":[round(x,2) for x in mins],"max":[round(x,2) for x in maxs],
                 "mats":[m.name for m in o.data.materials if m]})
print("MESHES",len(rows),"TRIS",sum(r["tris"] for r in rows))
# group prefix
import collections
groups=collections.defaultdict(lambda:{"n":0,"tris":0,"min":[1e9]*3,"max":[-1e9]*3})
for r in rows:
    key=re.sub(r'[_.]?\d+$','',r["name"])
    g=groups[key];g["n"]+=1;g["tris"]+=r["tris"]
    for i in range(3):g["min"][i]=min(g["min"][i],r["min"][i]);g["max"][i]=max(g["max"][i],r["max"][i])
for k,v in sorted(groups.items(),key=lambda kv:-kv[1]["tris"])[:50]:
    print(f"{k:50s} n={v['n']:3d} tris={v['tris']:8d} dims={[round(v['max'][i]-v['min'][i],1) for i in range(3)]}")
print("NAMES SAMPLE")
for r in sorted(rows,key=lambda r:-r["tris"])[:40]: print(r["name"],r["tris"],r["dims"])
with open(OUT,"w") as f: json.dump(rows,f,indent=1)
