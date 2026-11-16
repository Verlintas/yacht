"""Audit Greebles + Props Rooftops for hero-terminal and tier dressing."""
import bpy, re, json, os
from mathutils import Vector

def audit(path, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    rows=[]
    for o in [x for x in bpy.context.scene.objects if x.type=='MESH']:
        bb=[o.matrix_world@Vector(c) for c in o.bound_box]
        mn=[min(v[i] for v in bb) for i in range(3)]; mx=[max(v[i] for v in bb) for i in range(3)]
        rows.append({"name":o.name,"tris":sum(len(p.vertices)-2 for p in o.data.polygons),
                     "dims":[round(mx[i]-mn[i],3) for i in range(3)],
                     "min":[round(x,2) for x in mn],"max":[round(x,2) for x in mx],
                     "mats":[m.name for m in o.data.materials if m]})
    with open(out,"w") as f: json.dump(rows,f,indent=1)
    print("AUDIT",os.path.basename(path),"meshes",len(rows),"tris",sum(r["tris"] for r in rows))
    # prefix grouping
    import collections
    groups=collections.defaultdict(lambda:{"n":0,"tris":0,"min":[1e9]*3,"max":[-1e9]*3})
    for r in rows:
        key=re.sub(r'[_.]?\d+$','',r["name"])
        g=groups[key];g["n"]+=1;g["tris"]+=r["tris"]
        for i in range(3):g["min"][i]=min(g["min"][i],r["min"][i]);g["max"][i]=max(g["max"][i],r["max"][i])
    print("TOP GROUPS")
    for k,v in sorted(groups.items(),key=lambda kv:-kv[1]["tris"])[:45]:
        print(f"{k:55s} n={v['n']:3d} tris={v['tris']:7d} dims={[round(v['max'][i]-v['min'][i],2) for i in range(3)]}")
    print("ALL NAMES")
    for r in sorted(rows,key=lambda r:-r["tris"])[:120]:
        print(f"{r['name']:60s} tris={r['tris']:7d} dims={r['dims']}")

audit('/tmp/kb3d_greebles/Kitbash3d_Greebles.FBX','/tmp/kb3d_greebles_audit.json')
audit('/tmp/kb3d_rooftops/Kitbash3D Props Rooftops.fbx','/tmp/kb3d_rooftops_audit.json')
