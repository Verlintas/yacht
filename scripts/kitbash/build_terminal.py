"""Custom hero port terminal / warehouse / control tower (1:1 foreground).
K039 is deliberately not used here; K014/K034 dressing is added by build_greebles.
"""
import bpy, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_kb3d import *
from build_architecture import hangar_door

def hero_terminal(coll, light_coll, M_METAL, M_IRON, M_PANEL_W, M_PANEL_B, M_PANEL_BR,
                  M_PANEL_2, M_PANEL_LB, M_GLASS, M_TECH, M_LIGHTS, M_WHITE, M_YELLOW,
                  M_DARK, M_ORANGE, M_HAZARD, M_EDGE, M_EDGE_WARM, M_NEON_RED,
                  M_NEON_WARM, M_SIGN, M_SIGN_WARM, FONT):
    cx, cy = 10.0, 112.0
    # plinth + main volumes
    box("Terminal_Plinth", (104, 56, 1.2), (cx, cy, 0.6), M_PANEL_B, coll=coll, bevel=0.08)
    box("Terminal_Main", (64, 44, 28), (cx, cy, 15.2), M_PANEL_W, coll=coll, bevel=0.1)
    box("Terminal_WingL", (18, 40, 22), (-33, 114, 12.2), M_PANEL_2, coll=coll, bevel=0.08)
    box("Terminal_WingR", (18, 40, 22), (53, 114, 12.2), M_PANEL_2, coll=coll, bevel=0.08)
    box("Terminal_Upper", (36, 24, 9), (cx, 116, 33.7), M_PANEL_W, coll=coll, bevel=0.08)
    # roof parapets
    for nm,size,pos in [("TermRoofPar1",(64,1,0.9),(cx,90,29.6)),
                        ("TermRoofPar2",(64,1,0.9),(cx,134,29.6)),
                        ("TermRoofPar3",(1,44,0.9),(42,112,29.6)),
                        ("TermRoofPar4",(1,44,0.9),(-22,112,29.6)),
                        ("UpperRoofPar",(36,1,0.8),(cx,104,38.6))]:
        box(nm,size,pos,M_IRON,coll=coll,bevel=0.04)
    # structural facade grid
    for i, x in enumerate((-18, -2, 14, 30, 40)):
        box(f"TermPilaster_{i}", (1.0, 1.2, 28), (x, 89.2, 15.2), M_IRON, coll=coll, bevel=0.04)
    for i, z in enumerate((5, 10, 15, 20, 25, 28.7)):
        box(f"TermBeam_{i}", (63, 0.9, 0.8), (cx, 89.2, z), M_IRON, coll=coll, bevel=0.04)
    # colored panel fills
    for i, (x, z, mat) in enumerate([(-14,8,M_PANEL_LB),(-14,18,M_PANEL_2),(4,8,M_PANEL_BR),
                                     (4,18,M_PANEL_LB),(26,8,M_PANEL_2),(38,18,M_PANEL_B),
                                     (-14,24,M_PANEL_B),(26,23,M_PANEL_BR)]):
        box(f"TermPanel_{i}", (13, 0.35, 4.4), (x, 89.55, z), mat, coll=coll, bevel=0.05)
    # glass clerestory band
    box("TermGlassBand", (58, 0.5, 3.2), (cx, 89.4, 25.9), M_GLASS, coll=coll, bevel=0.02)
    for i in range(15):
        x=-18 + i*4
        box(f"TermGlassMullion_{i}", (0.18, 0.6, 3.2), (x, 89.15, 25.9), M_IRON, coll=coll, bevel=0.01)
    box("TermGlassGlow", (56, 0.2, 0.25), (cx, 89.15, 24.5), M_EDGE_WARM, coll=coll, uv=False)
    # entrance canopy + door (reuse detailed hangar door)
    box("TermCanopy", (64, 8, 1.0), (cx, 85.8, 17.5), M_METAL, coll=coll, bevel=0.06)
    for sx in (-1,1):
        for sy in (-1,1):
            cyl(f"TermCanopyStrut_{sx}_{sy}", 0.18, 6.0, (cx+sx*28, 85.8+sy*2.5, 14.6), M_IRON, coll=coll, verts=8)
    # door on the main block front
    class BB:
        def __init__(self, mn, mx): self.mn=mn; self.mx=mx
    tmn=Vector((-22,90,0)); tmx=Vector((42,134,29.2))
    hangar_door(coll, (tmn,tmx), M_PANEL_2, M_DARK, M_EDGE, M_EDGE_WARM,
                light_coll, "TerminalHangarDoor")
    # big terminal sign
    box("TerminalSignBack", (58, 0.45, 5.8), (cx, 89.1, 21.6), M_DARK, coll=coll, bevel=0.04)
    text_mesh("TerminalSignMain", "ANVIL LANDING", 2.65, (cx, 88.7, 22.4),
              M_SIGN, rot=(math.radians(90),0,0), font=FONT, coll=coll, extrude=0.02, spacing=0.9)
    text_mesh("TerminalSignSub", "PORT 07   //   TLOF-01   //   SECTOR 07", 0.9, (cx, 88.7, 19.4),
              M_SIGN_WARM, rot=(math.radians(90),0,0), font=FONT, coll=coll, extrude=0.012, spacing=0.95)
    for sx in (-1,1):
        box(f"TermSignFrameV_{sx}", (0.12,0.08,5.4),(cx+sx*29,88.8,21.6),M_EDGE,coll=coll,uv=False)
    for sz in (-1,1):
        box(f"TermSignFrameH_{sz}", (58,0.08,0.12),(cx,88.8,21.6+sz*2.8),M_EDGE,coll=coll,uv=False)
    # upper control room glass + roof gear base
    box("TermControlGlass", (30, 0.4, 5), (cx, 103.9, 33.8), M_GLASS, coll=coll, bevel=0.02)
    for i in range(9):
        box(f"TermControlMull_{i}", (0.16,0.5,5), (cx-14+i*3.5, 103.7, 33.8), M_IRON, coll=coll, bevel=0.01)
    box("TermControlWarm", (28,0.2,0.25), (cx,103.6,32.4),M_EDGE_WARM,coll=coll,uv=False)
    box("UpperRoof", (38,26,0.5), (cx,116,38.4), M_DARK, coll=coll, bevel=0.03)
    # side service pipes and utility spines
    for i, x in enumerate((44, 47.2)):
        cyl(f"TermPipe_{i}", 0.45, 28, (x, 98, 15.2), M_METAL, coll=coll, verts=14)
        cyl(f"TermPipeElbow_{i}", 0.45, 5, (x, 94.5, 28.2), M_METAL, rot=(math.radians(90),0,0), coll=coll, verts=12)
        for z in (6,12,18,24):
            box(f"TermPipeClamp_{i}_{z}", (1.2,1.2,0.4), (x, 98, z), M_IRON, coll=coll, bevel=0.02)
    box("TermTrace", (0.06,0.06,26), (43.0,97.0,15.0), M_EDGE, coll=coll, uv=False)
    # loading dock left
    box("TermDock", (30, 12, 1.6), (-30, 83, 0.8), M_PAD if 'M_PAD' in globals() else M_PANEL_B, coll=coll, bevel=0.06)
    for i, x in enumerate((-40,-30,-20)):
        box(f"TermDockDoor_{i}", (7,0.4,6), (x, 88.8, 4.6), M_DARK, coll=coll, bevel=0.03)
        box(f"TermDockLamp_{i}", (6,0.1,0.2), (x, 88.5, 7.9), M_EDGE_WARM, coll=coll, uv=False)
    for i, x in enumerate((-40,-30,-20)):
        box(f"TermDockStep_{i}", (9,2,0.4), (x, 80.5, 0.3), M_DARK, coll=coll, bevel=0.03)
    # side personnel doors / signage / roof vents
    for i, x in enumerate((-46, 66)):
        box(f"TermPersonDoor_{i}", (2.4,0.3,3.1), (x, 93.8, 2.8), M_DARK, coll=coll, bevel=0.02)
        box(f"TermPersonGlow_{i}", (2.0,0.06,0.2), (x, 93.6, 4.2), M_EDGE_WARM, coll=coll, uv=False)
    # area lights
    ld = bpy.data.lights.new("Terminal_DoorLight",'AREA'); ld.energy=9000; ld.color=(1.0,0.75,0.45)
    ld.size=26; ld.size_y=8
    lo=bpy.data.objects.new("Terminal_DoorLight",ld); lo.location=(cx,80,9); lo.rotation_euler=(math.radians(90),0,0)
    link(lo,light_coll)
    ld2 = bpy.data.lights.new("Terminal_FacadeLight",'AREA'); ld2.energy=16000; ld2.color=(0.72,0.82,1.0)
    ld2.size=70; ld2.size_y=30
    lo2=bpy.data.objects.new("Terminal_FacadeLight",ld2); lo2.location=(cx,60,22); point_at(lo2,(cx,110,17)); link(lo2,light_coll)

    # ---- hero warehouse at left
    wx, wy = -100, 128
    box("Warehouse_Plinth", (66,40,1.0), (wx,wy,0.5), M_PANEL_B, coll=coll, bevel=0.06)
    box("Warehouse_Main", (60,34,20), (wx,wy,11.0), M_PANEL_2, coll=coll, bevel=0.1)
    box("Warehouse_Roof", (62,36,1.0), (wx,wy,21.5), M_IRON, coll=coll, bevel=0.04)
    for i, x in enumerate((-118,-100,-82)):
        box(f"WarehouseDoor_{i}", (9,0.6,7), (x, 110.8, 4.8), M_DARK, coll=coll, bevel=0.04)
        box(f"WarehouseLamp_{i}", (8,0.12,0.22), (x, 110.4, 8.3), M_EDGE_WARM, coll=coll, uv=False)
    box("WarehouseSign", (32,0.4,3.2), (wx,110.3,17.0), M_DARK, coll=coll, bevel=0.04)
    text_mesh("WarehouseSignText", "WAREHOUSE 02", 1.5, (wx,110.0,17.0), M_SIGN_WARM,
              rot=(math.radians(90),0,0), font=FONT, coll=coll, extrude=0.015)
    for i in range(3):
        box(f"WarehouseGlass_{i}", (14,0.3,1.8), (wx-18+i*18, 111.0, 14.0), M_GLASS, coll=coll, bevel=0.02)
    for i, (x,z) in enumerate([(-92,22),(-108,22)]):
        box(f"WarehouseACBase_{i}", (5,3,1.2), (x,wy,z), M_IRON, coll=coll, bevel=0.05)
    # ---- control tower at right
    tx, ty = 96, 132
    box("Tower_Base", (18,18,12), (tx,ty,6.0), M_PANEL_B, coll=coll, bevel=0.08)
    box("Tower_Shaft", (8,8,28), (tx,ty,26.0), M_PANEL_2, coll=coll, bevel=0.06)
    box("Tower_Cab", (18,18,6), (tx,ty,43.0), M_GLASS, coll=coll, bevel=0.05)
    for i in range(9):
        box(f"TowerMull_{i}", (0.16,0.2,6), (tx-8+i*2, ty-9.0, 43.0), M_IRON, coll=coll, bevel=0.01)
    box("Tower_Roof", (21,21,1.2), (tx,ty,46.6), M_IRON, coll=coll, bevel=0.05)
    cyl("Tower_Mast", 0.12, 15, (tx,ty,54.0), M_METAL, coll=coll, verts=8)
    sphere("Tower_Beacon", 0.22, (tx,ty,61.7), M_NEON_RED, segs=10, rings=6, coll=coll)
    for i, x in enumerate((-120, -100, -80)):
        pass
    # return bounds for greeble dressing
    term_bb = (Vector((-42,90,0)), Vector((62,134,38.4)))
    wh_bb = (Vector((-130,111,0)), Vector((-70,145,22.5)))
    tw_bb = (Vector((87,123,0)), Vector((105,141,62)))
    return term_bb, wh_bb, tw_bb
