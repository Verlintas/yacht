"""Authored city deck: 1200 x 1000 m flat platform, retaining wall,
roads/plaza, terrain ring outside. No terrain under the deck."""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, noise
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_kb3d import *

WORK = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port"
GEN = f"{WORK}/docs/kitbash-port/textures"

def _tex(name):
    return bpy.data.images.load(f"{GEN}/{name}", check_existing=True)

def deck(coll, M_TERRAIN, M_DARK, M_WHITE, M_YELLOW, M_HAZARD, M_EDGE, M_EDGE_WARM,
         M_METAL, M_PANEL_B, M_PANEL_W, FONT):
    # deck materials
    M_DECK = surface_mat("Deck_Concrete", _tex("concrete_albedo.jpg"), _tex("concrete_normal.png"),
                         _tex("concrete_roughness.jpg"), tint=(0.52,0.51,0.48),
                         rough_scale=1.05, normal_strength=1.1)
    M_PLAZA = surface_mat("Plaza_Concrete", _tex("concrete_albedo.jpg"), _tex("concrete_normal.png"),
                          _tex("concrete_roughness.jpg"), tint=(0.38,0.38,0.36),
                          rough_scale=1.05, normal_strength=1.0)
    M_WALL = surface_mat("Deck_RetainingWall", _tex("concrete_albedo.jpg"), _tex("concrete_normal.png"),
                         _tex("concrete_roughness.jpg"), tint=(0.28,0.28,0.27),
                         rough_scale=1.1, normal_strength=1.0)
    M_ASPHALT = solid_mat("Deck_Asphalt", (0.024,0.025,0.027), 0.88)
    M_JOINT = solid_mat("Deck_Joint", (0.045,0.045,0.047), 0.8)

    # ---- deck slab (chamfered rectangle, 1200 x 1000 m)
    C = 25.0
    pts = [(-600+C,-300),(600-C,-300),(600,-300+C),(600,900-C),(600-C,900),
           (-600+C,900),(-600,900-C),(-600,-300+C)]
    me = bpy.data.meshes.new("CityDeck")
    bm = bmesh.new()
    vs = [bm.verts.new((x,y,-0.06)) for x,y in pts]
    face = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in r['geom']:
        if isinstance(v, bmesh.types.BMVert):
            v.co.z = -16.0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    box_uv(me, 0.0125)
    deck = bpy.data.objects.new("CityDeck", me); link(deck, coll)
    deck.data.materials.append(M_DECK)

    # ---- plaza around the port
    box("Deck_Plaza", (440, 360, 0.04), (0, -40, -0.035), M_PLAZA, coll=coll, bevel=0.4)
    # plaza paver bands
    for i, x in enumerate(range(-210, 211, 30)):
        box(f"PlazaJointV_{i}", (0.18, 360, 0.006), (x, -40, -0.012), M_JOINT, coll=coll, uv=False)
    for i, y in enumerate(range(-210, 141, 30)):
        box(f"PlazaJointH_{i}", (440, 0.18, 0.006), (0, y, -0.012), M_JOINT, coll=coll, uv=False)

    # ---- global panel joints, on the deck top
    for i, x in enumerate(range(-580, 581, 40)):
        box(f"DeckJointX_{i}", (0.30, 1000, 0.008), (x, 200, -0.048), M_JOINT, coll=coll, uv=False)
    for i, y in enumerate(range(-280, 881, 40)):
        box(f"DeckJointY_{i}", (1200, 0.30, 0.008), (0, y, -0.048), M_JOINT, coll=coll, uv=False)

    # ---- roads
    def road(name, size, loc):
        box(name, (size[0], size[1], 0.06), (loc[0], loc[1], -0.018), M_ASPHALT, coll=coll, uv=False)
    road("Road_Approach", (34, 190), (0, -205))
    road("Road_Boulevard", (1180, 28), (0, 180))
    for i, x in enumerate((-450, 0, 450)):
        road(f"Road_North_{i}", (28, 500), (x, 400))
    # lane dashes and edge lines
    for i, y in enumerate(range(-290, -110, 10)):
        box(f"ApproachDash_{i}", (0.4, 5.2, 0.01), (0, y, 0.018), M_YELLOW, coll=coll, uv=False)
    for sx in (-1,1):
        box(f"ApproachEdge_{sx}", (0.22, 190, 0.01), (sx*15.5, -205, 0.018), M_WHITE, coll=coll, uv=False)
    for i, x in enumerate(range(-585, 586, 14)):
        box(f"BlvdDash_{i}", (7.0, 0.45, 0.01), (x, 180, 0.018), M_YELLOW, coll=coll, uv=False)
    for sy in (-1,1):
        box(f"BlvdEdge_{sy}", (1180, 0.22, 0.01), (0, 180+sy*13.0, 0.018), M_WHITE, coll=coll, uv=False)
    for i, x in enumerate((-450, 0, 450)):
        for j, y in enumerate(range(170, 651, 14)):
            box(f"NorthDash_{i}_{j}", (0.45, 7.0, 0.01), (x, y, 0.018), M_YELLOW, coll=coll, uv=False)
        for sx in (-1,1):
            box(f"NorthEdge_{i}_{sx}", (0.22, 500, 0.01), (x+sx*12.7, 400, 0.018), M_WHITE, coll=coll, uv=False)

    # ---- perimeter parapet + retaining wall + buttresses
    for nm, size, pos in [
        ("DeckParapet_S", (1200, 0.8, 1.32), (0, -299.6, 0.60)),
        ("DeckParapet_N", (1200, 0.8, 1.32), (0, 899.6, 0.60)),
        ("DeckParapet_E", (0.8, 1200, 1.32), (599.6, 300, 0.60)),
        ("DeckParapet_W", (0.8, 1200, 1.32), (-599.6, 300, 0.60))]:
        box(nm, size, pos, M_PANEL_B, coll=coll, bevel=0.05)
    for nm, size, pos in [
        ("DeckWall_S", (1224, 3.0, 40), (0, -301.5, -20.06)),
        ("DeckWall_N", (1224, 3.0, 40), (0, 901.5, -20.06)),
        ("DeckWall_E", (3.0, 1200, 40), (601.5, 300, -20.06)),
        ("DeckWall_W", (3.0, 1200, 40), (-601.5, 300, -20.06))]:
        box(nm, size, pos, M_WALL, coll=coll, bevel=0.2)
    # buttresses / bays on outer face
    for side, (x0,x1,y0,y1,n,axis) in enumerate([
        (-600,600,-303,-299,20,"s"), (-600,600,899,903,20,"n"),
        (-603,-599,-300,900,20,"w"), (599,603,-300,900,20,"e")]):
        for i in range(n):
            t = (i+0.5)/n
            if axis in ("s","n"):
                x = x0 + (x1-x0)*t; y = (y0+y1)/2
                box(f"DeckButtress_{side}_{i}", (7, 9, 40), (x, y, -20.06), M_WALL, coll=coll, bevel=0.2)
                box(f"DeckButtressCap_{side}_{i}", (9, 11, 1.2), (x, y, 0.55), M_PANEL_B, coll=coll, bevel=0.1)
                box(f"DeckButtressLight_{side}_{i}", (1.2, 0.3, 0.18), (x, y-3.2 if axis=="s" else y+3.2, 0.9), M_EDGE, coll=coll, uv=False)
            else:
                y = y0 + (y1-y0)*t; x = (x0+x1)/2
                box(f"DeckButtress_{side}_{i}", (9, 7, 40), (x, y, -20.06), M_WALL, coll=coll, bevel=0.2)
                box(f"DeckButtressCap_{side}_{i}", (11, 9, 1.2), (x, y, 0.55), M_PANEL_B, coll=coll, bevel=0.1)
                box(f"DeckButtressLight_{side}_{i}", (0.3, 1.2, 0.18), (x-3.2 if axis=="w" else x+3.2, y, 0.9), M_EDGE, coll=coll, uv=False)
    # edge light strips on the inner parapet face
    for nm, size, pos in [("EdgeStrip_S",(1198,0.08,0.12),(0,-299.1,1.05)),
                          ("EdgeStrip_N",(1198,0.08,0.12),(0,899.1,1.05)),
                          ("EdgeStrip_E",(0.08,1198,0.12),(599.1,300,1.05)),
                          ("EdgeStrip_W",(0.08,1198,0.12),(-599.1,300,1.05))]:
        box(nm, size, pos, M_EDGE, coll=coll, uv=False)

    # ---- approach road lights, low posts
    for i, y in enumerate(range(-290, -110, 40)):
        for sx in (-1,1):
            x=sx*21
            cyl(f"DeckPole_{i}_{sx}", 0.16, 11, (x,y,5.4), M_METAL, coll=coll, verts=10)
            box(f"DeckPoleArm_{i}_{sx}", (2.2,0.18,0.18), (x-1.1*sx,y,10.8), M_METAL, coll=coll, bevel=0.01)
            box(f"DeckPoleLamp_{i}_{sx}", (1.0,0.5,0.18), (x-2.1*sx,y,10.65), M_EDGE_WARM, coll=coll, bevel=0.01)
    for i, x in enumerate(range(-560, 561, 80)):
        for sy in (-1,1):
            y=180+sy*19
            cyl(f"BlvdPole_{i}_{sy}", 0.16, 11, (x,y,5.4), M_METAL, coll=coll, verts=10)
            box(f"BlvdPoleArm_{i}_{sy}", (2.2,0.18,0.18), (x-1.1*sy,y,10.8), M_METAL, coll=coll, bevel=0.01)
            box(f"BlvdPoleLamp_{i}_{sy}", (1.0,0.5,0.18), (x-2.1*sy,y,10.65), M_EDGE_WARM, coll=coll, bevel=0.01)

    # ---- deck labels
    text_mesh("DeckLabel1", "CITY DECK 01", 7.0, (-70, -125, 0.03), M_WHITE, font=FONT, coll=coll, extrude=0.005)
    text_mesh("DeckLabel2", "SECTOR 07   //   ANVIL LANDING", 3.0, (-70, -138, 0.03), M_WHITE, font=FONT, coll=coll, extrude=0.004)
    text_mesh("DeckLabel3", "AUTHORED PLATFORM  /  1200 x 1200 m", 2.2, (-70, -146, 0.03), M_YELLOW, font=FONT, coll=coll, extrude=0.004)

    # ---- terrain ring outside the deck (no terrain under the deck)
    SIZE=3200; SEG=230
    verts=[]; faces=[]
    def outside_h(x,y):
        dx=max(abs(x)-600,0); dy=max(abs(y-200)-500,0); e=max(dx,dy)
        if e < 1.0: return -40.0
        n1=noise.noise(Vector((x*0.006,y*0.006,0.4)))
        n2=noise.noise(Vector((x*0.022,y*0.022,2.7)))
        rise=smoothstep(0,320,e)*(8+22*(0.5+0.5*n1)+8*n2)
        mesa=smoothstep(500,900,e)*45*(0.6+0.4*noise.noise(Vector((x*0.003,y*0.003,7.1))))
        return -40.0+rise+mesa
    for j in range(SEG+1):
        y=-SIZE/2+SIZE*j/SEG
        for i in range(SEG+1):
            x=-SIZE/2+SIZE*i/SEG
            verts.append((x,y,outside_h(x,y)))
    for j in range(SEG):
        for i in range(SEG):
            x=-SIZE/2+SIZE*(i+0.5)/SEG; y=-SIZE/2+SIZE*(j+0.5)/SEG
            if -620 < x < 620 and -320 < y < 920:
                continue
            a=j*(SEG+1)+i
            faces.append((a,a+1,a+SEG+2,a+SEG+1))
    me=bpy.data.meshes.new("TerrainRing"); me.from_pydata(verts,[],faces); me.update()
    for p in me.polygons: p.use_smooth=True
    uv=me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v=me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv=(v.x/85.0+0.5,v.y/85.0+0.5)
    ter=bpy.data.objects.new("TerrainRing",me); link(ter,coll)
    ter.data.materials.append(M_TERRAIN)
    return deck

def smoothstep(a,b,x):
    t=max(0.0,min(1.0,(x-a)/(b-a)))
    return t*t*(3-2*t)
