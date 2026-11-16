"""Custom 1:1 hero port: terminal, control tower, gantry, tank farm, pipes,
containers, landing gear and ground-support equipment.  Native detail first;
K039/K014/K034 are layered on top by the scene builder."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from lib_city import *


def beam(name,p1,p2,r,mat,coll,verts=8):
    p1=Vector(p1); p2=Vector(p2); d=p2-p1; ln=d.length
    if ln < 1e-4: return None
    ob=cyl(name,r,ln,(p1+p2)/2,mat,coll=coll,verts=verts,smooth=True)
    ob.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return ob

def beam_box(name,p1,p2,w,h,mat,coll,bevel=0.01):
    p1=Vector(p1); p2=Vector(p2); d=p2-p1; ln=d.length
    ob=box(name,(w,h,ln),(0,0,0),mat,coll=coll,bevel=bevel,uv=False)
    ob.location=(p1+p2)/2
    ob.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return ob

# --------------------------------------------------------------------------
def terminal(C, M, L):
    """Custom terminal hall, two wings, canopy, airlock, loading docks, roof."""
    cx,cy=-132,-455
    M_W=M['white_panel']; M_D=M['dark']; M_S=M['steel']; M_C=M['corrugated']
    M_G=M['glass']; M_HAZ=M['hazard']; M_EDGE=M['edge']; M_WARM=M['warm']
    M_RED=M['red']; M_ORG=M['orange']; M_CON=M['concrete']; M_ASPH=M['asphalt']
    M_LIGHT=M['light']
    # plinth / apron slab
    tp=box("Term_Plinth",(104,62,1.5),(cx,cy,0.75),M_CON,coll=C,bevel=0.12,uv=False); box_uv(tp.data,0.08)
    box("Term_PlinthLip",(106,64,0.35),(cx,cy,0.25),M_D,coll=C,bevel=0.05)
    # main hall and wings
    box("Term_Main",(72,46,22),(cx,cy,12.2),M_C,coll=C,bevel=0.12)
    box("Term_WingW",(20,42,18),(cx-46,cy,10.2),M_C,coll=C,bevel=0.08)
    box("Term_WingE",(20,42,18),(cx+46,cy,10.2),M_S,coll=C,bevel=0.08)
    box("Term_Upper",(44,26,7),(cx,cy-2,29.3),M_W,coll=C,bevel=0.10)
    # outer wing service faces: ribs, louvers, doors, pipes and painted stencils
    for sx,face_x in [(-1,cx-56.1),(1,cx+56.1)]:
        for i in range(10):
            box(f"Term_WingRib_{sx}_{i}",(0.35,0.7,17.2),(face_x,cy-17+i*3.8,10.0),M_S,coll=C,bevel=0.02)
        for i,z in enumerate((4.0,9.0,14.0)):
            box(f"Term_WingBeam_{sx}_{i}",(0.45,42,0.45),(face_x,cy,z),M_S,coll=C,bevel=0.02)
        box(f"Term_WingDoor_{sx}",(0.35,2.6,3.2),(face_x,cy+14,2.0),M_D,coll=C,bevel=0.02)
        box(f"Term_WingDoorLight_{sx}",(0.2,2.2,0.18),(face_x,cy+14,3.8),M_WARM,coll=C,uv=False)
        for i in range(3):
            box(f"Term_WingLouver_{sx}_{i}",(0.3,3.4,0.32),(face_x,cy-8+i*1.1,12.0),M_D,coll=C,uv=False)
        cyl(f"Term_WingPipe_{sx}",0.24,16.0,(face_x+0.4,cy-18.5,9.0),M_S,coll=C,verts=12)
        box(f"Term_WingTray_{sx}",(0.35,30,0.22),(face_x+0.5,cy+2,7.2),M_D,coll=C,uv=False)
    text_mesh("Term_WingStencil","07",7.0,(cx+56.5,cy-2,10.0),M_HAZ,
              rot=(0,math.radians(90),math.radians(90)),font=get_font(),coll=C,extrude=0.03)
    # south faces of both wings: the wide camera sees these at 1:1
    for sx in (-1,1):
        wy=cy-21.1; wx=cx+sx*46
        for i in range(10):
            box(f"Term_WingSF_Rib_{sx}_{i}",(0.35,0.3,17.0),(wx-10+i*2.05,wy,10.0),M_S,coll=C,bevel=0.02)
        for i,z in enumerate((4.0,9.0,14.0)):
            box(f"Term_WingSF_Beam_{sx}_{i}",(20,0.35,0.4),(wx,wy,z),M_S,coll=C,bevel=0.02)
        for i in range(3):
            box(f"Term_WingSF_Louver_{sx}_{i}",(4.4,0.28,1.5),(wx,wy-0.02,11.4+i*2.0),M_D,coll=C,uv=False)
            for k in range(5):
                box(f"Term_WingSF_Slat_{sx}_{i}_{k}",(4.2,0.32,0.12),(wx,wy-0.03,10.9+i*2.0+k*0.25),M_D,coll=C,uv=False)
        box(f"Term_WingSF_Door_{sx}",(2.6,0.3,3.3),(wx-6.3,wy,1.9),M_D,coll=C,bevel=0.02)
        box(f"Term_WingSF_DoorLight_{sx}",(2.2,0.18,0.16),(wx-6.3,wy-0.05,3.7),M_WARM,coll=C,uv=False)
        cyl(f"Term_WingSF_Pipe_{sx}",0.20,16.0,(wx+7.8,wy-0.45,9.0),M_S,coll=C,verts=12)
        box(f"Term_WingSF_Tray_{sx}",(0.35,0.35,12.0),(wx-8.3,wy-0.4,8.0),M_D,coll=C,uv=False)
    # perimeter edge light / roof rail
    for nm,size,pos in [("Term_EdgeS",(101,0.14,0.14),(cx,cy-29.6,26.8)),
                        ("Term_EdgeN",(101,0.14,0.14),(cx,cy+29.6,26.8)),
                        ("Term_EdgeW",(0.14,59,0.14),(cx-50.5,cy,26.8)),
                        ("Term_EdgeE",(0.14,59,0.14),(cx+50.5,cy,26.8))]:
        box(nm,size,pos,M_WARM,coll=C,uv=False)
    box("Term_RoofDeck",(72.2,46.2,0.45),(cx,cy,23.35),M_D,coll=C,bevel=0.04,uv=False)
    # main-hall side service faces (the camera sees the east side up close)
    for sx,face_x in [(-1,cx-36.1),(1,cx+36.1)]:
        for i in range(12):
            box(f"Term_SideRib_{sx}_{i}",(0.32,0.68,21.8),(face_x,cy-20+i*3.7,11.0),M_S,coll=C,bevel=0.02)
        for i,z in enumerate((4.4,9.8,15.2,20.4)):
            box(f"Term_SideBeam_{sx}_{i}",(0.45,46,0.42),(face_x,cy,z),M_S,coll=C,bevel=0.02)
        for i in range(3):
            box(f"Term_SideLouver_{sx}_{i}",(0.3,4.6,1.5),(face_x,cy-12+i*5.2,12.0),M_D,coll=C,uv=False)
            for k in range(6):
                box(f"Term_SideLouverSlat_{sx}_{i}_{k}",(0.34,4.3,0.12),(face_x+0.02,cy-12+i*5.2,11.4+k*0.24),M_D,coll=C,uv=False)
        box(f"Term_SideDoor_{sx}",(0.3,2.8,3.4),(face_x,cy+12,2.0),M_D,coll=C,bevel=0.02)
        box(f"Term_SideDoorLight_{sx}",(0.2,2.4,0.18),(face_x,cy+12,3.9),M_WARM,coll=C,uv=False)
        cyl(f"Term_SidePipe_{sx}",0.22,18.0,(face_x+0.45,cy+18.0,9.0),M_S,coll=C,verts=12)
        box(f"Term_SideTray_{sx}",(0.35,34,0.24),(face_x+0.5,cy,6.4),M_D,coll=C,uv=False)
    text_mesh("Term_SideStencil","A-30",4.0,(cx+36.6,cy+2,8.8),M_HAZ,
              rot=(0,math.radians(90),math.radians(90)),font=get_font(),coll=C,extrude=0.025)
    box("Term_UpperDeck",(44.2,26.2,0.35),(cx,cy-2,32.75),M_D,coll=C,bevel=0.03,uv=False)
    # horizontal structural bands
    for i,z in enumerate((3.6,9.0,15.5,21.8,25.6)):
        box(f"Term_Band_{i}",(101,0.5,0.55),(cx,cy-23.2,z),M_D,coll=C,bevel=0.03,uv=False)
    # deep glazed atrium with steel mullions, lit mezzanine and exposed structure
    box("Term_GlassHall",(64,0.24,10.2),(cx,cy-23.15,16.1),M_G,coll=C,bevel=0.01)
    for i in range(25):
        x=cx-30.5+i*2.55
        box(f"Term_Mullion_{i}",(0.16,0.75,10.4),(x,cy-23.2,16.1),M_D,coll=C,bevel=0.01,uv=False)
    for i,z in enumerate((11.2,15.8,20.6)):
        box(f"Term_GlassRail_{i}",(64,0.14,0.16),(cx,cy-23.45,z),M_S,coll=C,uv=False)
        box(f"Term_GlassLight_{i}",(60,0.10,0.10),(cx,cy-23.52,z+0.18),M["warm"],coll=C,uv=False)
    box("Term_InteriorGlow",(62,0.20,0.20),(cx,cy-18.0,20.4),M_LIGHT,coll=C,uv=False)
    box("Term_InteriorFloorGlow",(62,0.20,0.14),(cx,cy-18.0,11.4),M_WARM,coll=C,uv=False)
    box("Term_InteriorMezz",(62,0.2,0.3),(cx,cy-18.0,15.9),M_D,coll=C,uv=False)
    for i in range(9):
        box(f"Term_InteriorColumn_{i}",(0.5,0.5,9.4),(cx-28+i*7,cy-18,16.0),M_D,coll=C,bevel=0.02)
        box(f"Term_InteriorDesk_{i}",(5.2,1.4,1.0),(cx-27+i*7,cy-16.5,12.0),M_S,coll=C,bevel=0.04)
    # vertical ribs + horizontal beams + coloured accent panels
    for i,x in enumerate(range(int(cx-35),int(cx+36),5)):
        box(f"Term_FacadeRib_{i}",(0.34,0.8,26.0),(x,cy-24.0,13.2),M_S,coll=C,bevel=0.03)
    for i,z in enumerate((5.0,10.2,22.0,25.2)):
        box(f"Term_FacadeBeam_{i}",(72,0.7,0.45),(cx,cy-24.0,z),M_S,coll=C,bevel=0.03)
    for i,(x,z,mat) in enumerate([(-27,7.0,M['container_red']),(-10,7.0,M['container_blue']),
                                   (10,7.0,M['container_tan']),(27,7.0,M['container_blue']),
                                   (-27,23.4,M['container_blue']),(0,23.4,M['container_red']),
                                   (27,23.4,M['container_blue'])]):
        box(f"Term_AccentPanel_{i}",(7.0,0.24,3.1),(cx+x,cy-24.25,z),mat,coll=C,bevel=0.02,uv=False)
    # louver bank over the upper block
    for i in range(12):
        box(f"Term_Louver_{i}",(5.6,0.22,0.28),(cx-14+i*2.6,cy-15.5,30.4),M_D,coll=C,uv=False)
    # facade cable tray / downpipes
    for i,x in enumerate((cx-31,cx+31)):
        box(f"Term_FacadeTray_{i}",(0.45,0.3,20.0),(x,cy-25.0,14.0),M_S,coll=C,bevel=0.02)
        for k in range(5):
            box(f"Term_TrayBracket_{i}_{k}",(0.9,0.4,0.16),(x,cy-25.0,5.0+k*4.2),M_D,coll=C,uv=False)
    # entrance portal and airlock
    box("Term_PortalL",(2.2,3.2,10.4),(cx-8,cy-25.4,5.5),M_D,coll=C,bevel=0.05)
    box("Term_PortalR",(2.2,3.2,10.4),(cx+8,cy-25.4,5.5),M_D,coll=C,bevel=0.05)
    box("Term_PortalTop",(18.2,3.2,2.2),(cx,cy-25.4,11.0),M_D,coll=C,bevel=0.05)
    box("Term_DoorGlass",(13,0.28,7.5),(cx,cy-26.0,4.4),M_G,coll=C,bevel=0.01)
    for i in range(5):
        box(f"Term_DoorMull_{i}",(0.12,0.35,7.5),(cx-6+i*3,cy-26.2,4.4),M_D,coll=C,bevel=0.01,uv=False)
    af=box("Term_AirlockFrame",(16,2.6,1.2),(cx,cy-27.0,9.8),M_HAZ,coll=C,bevel=0.03,uv=False); box_uv(af.data,0.5)
    # canopy
    box("Term_Canopy",(52,11,0.9),(cx,cy-30.0,13.3),M_S,coll=C,bevel=0.05)
    for i,x in enumerate((cx-23,cx-8,cx+8,cx+23)):
        cyl(f"Term_CanopyCol_{i}",0.22,13.0,(x,cy-34.0,6.7),M_D,coll=C,verts=12)
        cyl(f"Term_CanopyFoot_{i}",0.42,0.35,(x,cy-34.0,0.18),M_D,coll=C,verts=12)
    for i in range(9):
        box(f"Term_CanopyRib_{i}",(0.18,11,0.16),(cx-24+i*6,cy-30.0,13.72),M_EDGE,coll=C,uv=False)
    # entrance steps / tactile strip
    for i in range(3):
        box(f"Term_Step_{i}",(22,2.0,0.2),(cx,cy-25.5-i*1.6,0.12+i*0.18),M_CON,coll=C,bevel=0.02,uv=False)
    hc=box("Term_HazardCurb",(24,0.6,0.18),(cx,cy-30.5,0.30),M_HAZ,coll=C,bevel=0.01,uv=False); box_uv(hc.data,0.6)
    # loading docks on the west wing (south face)
    for i,x in enumerate((cx-53,cx-44,cx-35)):
        box(f"Term_DockDoor_{i}",(7.6,0.4,6.6),(x,cy-22.9,3.5),M_D,coll=C,bevel=0.02)
        for j in range(9):
            box(f"Term_DockSlat_{i}_{j}",(7.4,0.12,0.55),(x,cy-23.2,0.7+j*0.72),M_C,coll=C,bevel=0.005)
        box(f"Term_DockLamp_{i}",(8.2,0.18,0.22),(x,cy-23.4,7.5),M_WARM,coll=C,uv=False)
        box(f"Term_DockBumper_{i}",(8.8,0.4,0.8),(x,cy-23.8,0.65),M_D,coll=C,bevel=0.04)
        box(f"Term_DockStep_{i}",(9,3.2,0.5),(x,cy-26.0,0.25),M_CON,coll=C,bevel=0.04)
    # west facade utility spines, cable trays, pipe drops
    for i,x in enumerate((cx-54,cx-49)):
        cyl(f"Term_ServicePipe_{i}",0.30,19.0,(x,cy+19,10.0),M_S,coll=C,verts=14)
        for z in (3.5,8.5,13.5,18.0):
            box(f"Term_PipeClamp_{i}_{z}",(1.0,1.0,0.35),(x,cy+19,z),M_D,coll=C,bevel=0.02)
    box("Term_CableTray",(0.45,26,0.18),(cx-57,cy+2,11.4),M_S,coll=C,bevel=0.02)
    for i in range(7):
        box(f"Term_CableDrop_{i}",(0.10,0.10,4.2),(cx-57,cy-10+i*4,9.1),M_D,coll=C,uv=False)
    # roof parapet, equipment and sign
    for nm,size,pos in [
        ("Term_RoofParS",(102,0.8,1.1),(cx,cy-23.2,26.3)),
        ("Term_RoofParN",(102,0.8,1.1),(cx,cy+23.2,26.3)),
        ("Term_RoofParW",(0.8,46,1.1),(cx-50,cy,26.3)),
        ("Term_RoofParE",(0.8,46,1.1),(cx+50,cy,26.3))]:
        box(nm,size,pos,M_D,coll=C,bevel=0.04)
    # roof AC plant: custom native detail with fans, coils, ducts
    for i,(x,y) in enumerate([(cx-26,cy+7),(cx+4,cy+8),(cx+27,cy+3)]):
        box(f"Term_AC{i}_Base",(8.5,5.0,0.7),(x,y,26.75),M_D,coll=C,bevel=0.03)
        box(f"Term_AC{i}_Body",(8.0,4.6,2.4),(x,y,28.3),M_S,coll=C,bevel=0.06)
        for k in range(3):
            cyl(f"Term_AC{i}_Fan{k}",1.45,0.25,(x-2.4+k*2.4,y-2.35,29.6),M_D,
                rot=(math.radians(90),0,0),coll=C,verts=20)
            for q in range(4):
                box(f"Term_AC{i}_Blade{k}_{q}",(1.25,0.12,0.16),
                    (x-2.4+k*2.4,y-2.5,29.6),M_D,rot=(0,0,math.radians(q*45)),coll=C,bevel=0.01,uv=False)
        box(f"Term_AC{i}_Grill",(7.4,0.15,1.7),(x,y-2.55,28.3),M_C,coll=C,bevel=0.01,uv=False)
        cyl(f"Term_AC{i}_Duct",0.55,2.1,(x+3.2,y+1.4,30.0),M_S,coll=C,verts=14)
    # roof vents and railing
    for i in range(12):
        x=cx-45+i*8.2
        box(f"Term_RoofRail_{i}",(0.08,0.08,1.0),(x,cy+22.8,27.2),M_D,coll=C,uv=False)
    box("Term_RoofRailTop",(100,0.08,0.08),(cx,cy+22.8,27.7),M_D,coll=C,uv=False)
    # sign
    box("Term_SignBack",(56,0.45,5.3),(cx,cy-24.0,22.7),M_D,coll=C,bevel=0.04)
    text_mesh("Term_SignMain","NAUTILUS REACH",2.55,(cx,cy-24.4,23.2),M_WARM,
              rot=(math.radians(90),0,0),font=get_font(),coll=C,extrude=0.025,spacing=0.92)
    text_mesh("Term_SignSub","PORT 07   //   TERMINAL A   //   APRON 01",0.80,(cx,cy-24.4,20.4),M_EDGE,
              rot=(math.radians(90),0,0),font=get_font(),coll=C,extrude=0.012,spacing=0.95)
    for sx in (-1,1):
        box(f"Term_SignFrameV_{sx}",(0.14,0.1,5.2),(cx+sx*28,cy-24.5,22.7),M_EDGE,coll=C,uv=False)
    # roof mast / beacon
    cyl("Term_Mast",0.16,12.0,(cx-38,cy+18,33.0),M_S,coll=C,verts=8)
    sphere("Term_Beacon",0.28,(cx-38,cy+18,39.1),M_RED,segs=10,rings=6,coll=C)
    # area light (physical)
    ld=bpy.data.lights.new("Terminal_Entrance_Area",'AREA'); ld.energy=11000; ld.color=(1.0,0.76,0.47)
    ld.size=30; ld.size_y=9
    lo=bpy.data.objects.new("Terminal_Entrance_Area",ld); lo.location=(cx,cy-37,10.5)
    lo.rotation_euler=(math.radians(90),0,0); link(lo,L)
    return (Vector((cx-53,cy-29,0)),Vector((cx+53,cy+29,37)))

def warehouse(C,M,L):
    cx,cy=-282,-470
    M_C=M['corrugated']; M_D=M['dark']; M_S=M['steel']; M_W=M['white_panel']; M_G=M['glass']
    M_HAZ=M['hazard']; M_WARM=M['warm']; M_EDGE=M['edge']; M_CON=M['concrete']
    wp=box("WH_Plinth",(98,54,1.0),(cx,cy,0.5),M_CON,coll=C,bevel=0.1,uv=False); box_uv(wp.data,0.08)
    box("WH_Main",(94,46,17),(cx,cy,9.5),M_C,coll=C,bevel=0.12)
    box("WH_Roof",(98,50,1.2),(cx,cy,18.4),M_S,coll=C,bevel=0.05)
    # vertical corrugation bands / pilasters
    for i in range(30):
        x=cx-45+i*3.1
        box(f"WH_Rib_{i}",(0.16,0.18,15.8),(x,cy-23.15,9.0),M_D,coll=C,bevel=0.01,uv=False)
    for i,x in enumerate((cx-44,cx-26,cx-8,cx+10,cx+28,cx+44)):
        box(f"WH_Pilaster_{i}",(1.0,0.8,17.0),(x,cy-23.3,9.4),M_S,coll=C,bevel=0.03)
    # high strip windows
    box("WH_WindowBand",(88,0.25,1.4),(cx,cy-23.3,15.0),M_G if 'glass' in M else M_D,coll=C,bevel=0.01)
    for i in range(24):
        box(f"WH_WindowMull_{i}",(0.09,0.35,1.5),(cx-44+i*3.8,cy-23.5,15.0),M_D,coll=C,uv=False)
    # roller doors
    for i,x in enumerate((cx-33,cx-11,cx+11,cx+33)):
        box(f"WH_Door_{i}",(10.5,0.4,8.0),(x,cy-23.2,4.4),M_D,coll=C,bevel=0.02)
        for j in range(12):
            box(f"WH_DoorSlat_{i}_{j}",(10.3,0.12,0.58),(x,cy-23.5,0.7+j*0.66),M_C,coll=C,bevel=0.005)
        box(f"WH_DoorLamp_{i}",(11,0.15,0.22),(x,cy-23.6,9.2),M_WARM,coll=C,uv=False)
        box(f"WH_DoorBumper_{i}",(11.2,0.35,0.8),(x,cy-24.0,0.65),M_D,coll=C,bevel=0.04)
        box(f"WH_DoorHaz_{i}",(10.8,0.25,0.35),(x,cy-23.7,1.35),M_HAZ,coll=C,uv=False)
    # signage / roof vents / skylights
    box("WH_SignBack",(30,0.4,3.0),(cx,cy-23.6,16.8),M_D,coll=C,bevel=0.03)
    text_mesh("WH_SignText","WAREHOUSE 02",1.3,(cx,cy-23.9,16.9),M_EDGE,
              rot=(math.radians(90),0,0),font=get_font(),coll=C,extrude=0.012)
    for i,(x,y) in enumerate([(cx-30,cy+8),(cx-8,cy+12),(cx+18,cy+7),(cx+35,cy+10)]):
        box(f"WH_Skylight{i}",(9,5,0.35),(x,y,19.25),M_G if 'glass' in M else M_D,coll=C,bevel=0.03)
    return (Vector((cx-49,cy-25,0)),Vector((cx+49,cy+25,19.5)))

def control_tower(C,M,L):
    cx,cy=-232,-512
    M_S=M['steel']; M_D=M['dark']; M_G=M['glass']; M_W=M['white_panel']
    M_EDGE=M['edge']; M_WARM=M['warm']; M_RED=M['red']; M_CON=M['concrete']
    box("CT_Base",(24,24,10),(cx,cy,5.0),M_CON,coll=C,bevel=0.08,uv=False)
    box("CT_BaseBand",(25,25,0.8),(cx,cy,10.2),M_D,coll=C,bevel=0.03)
    box("CT_Shaft",(10,10,34),(cx,cy,27.2),M_W,coll=C,bevel=0.08)
    for i in range(8):
        box(f"CT_ShaftRib_{i}",(0.22,0.22,34),(cx-4.8+i*1.37,cy-5.1,27.2),M_D,coll=C,uv=False)
    box("CT_CabBand",(21,21,1.2),(cx,cy,44.6),M_D,coll=C,bevel=0.04)
    box("CT_Cab",(19,19,6.0),(cx,cy,47.8),M_G,coll=C,bevel=0.05)
    for i in range(12):
        box(f"CT_Mull_{i}",(0.13,0.25,6.1),(cx-9+i*1.64,cy-9.2,47.8),M_D,coll=C,uv=False)
        box(f"CT_MullS_{i}",(0.25,0.13,6.1),(cx-9.2,cy-9+i*1.64,47.8),M_D,coll=C,uv=False)
    box("CT_CabFloor",(20,20,0.6),(cx,cy,44.8),M_D,coll=C,bevel=0.03)
    box("CT_CabCeil",(20,20,0.6),(cx,cy,50.9),M_D,coll=C,bevel=0.03)
    box("CT_Roof",(22,22,1.2),(cx,cy,51.8),M_D,coll=C,bevel=0.05)
    # roof equipment
    for i,(x,y) in enumerate([(cx-5,cy+4),(cx+5,cy+3),(cx+4,cy-4)]):
        box(f"CT_RoofBox{i}",(4.4,3.2,1.4),(x,y,53.1),M_S,coll=C,bevel=0.04)
        box(f"CT_RoofLight{i}",(0.55,0.55,0.15),(x,y,53.9),M_WARM,coll=C,uv=False)
    cyl("CT_Mast",0.18,15,(cx,cy+6,60.0),M_S,coll=C,verts=8)
    cyl("CT_Mast2",0.10,8,(cx,cy+6,70.5),M_S,coll=C,verts=6)
    sphere("CT_Beacon",0.30,(cx,cy+6,75.0),M_RED,segs=12,rings=8,coll=C)
    # exterior ladder / stairs
    for sx in (-1,1):
        beam(f"CT_LadderRail{sx}",(cx+5.6,cy-6.4,10.5),(cx+5.6,cy-6.4,45.0),0.045,M_S,C,6)
    for i in range(34):
        cyl(f"CT_LadderRung{i}",0.028,1.0,(cx+5.6,cy-6.4,11.2+i*1.0),M_S,rot=(math.radians(90),0,0),coll=C,verts=6)
    # red aviation lights on corners
    for sx in (-1,1):
        for sy in (-1,1):
            sphere(f"CT_CornerLight_{sx}_{sy}",0.18,(cx+sx*10,cy+sy*10,52.6),M_RED,segs=8,rings=5,coll=C)
    return (Vector((cx-12,cy-12,0)),Vector((cx+12,cy+12,75)))

def gantry(C,M,L,pad_y=-420):
    """80 m service gantry with truss towers, catwalk, hoists and floodlights."""
    M_S=M['steel']; M_D=M['dark']; M_I=M['iron']; M_W=M['white_panel']
    M_HAZ=M['hazard']; M_EDGE=M['edge']; M_WARM=M['warm']; M_RED=M['red']
    xL=-40; xR=40; y0=pad_y; ztop=36.0
    for sx,x in enumerate((xL,xR)):
        # 4-leg truss tower
        for ix in (-2.2,2.2):
            for iy in (-2.2,2.2):
                beam(f"GantTower{sx}_Leg{ix}_{iy}",(x+ix,y0+iy,0.2),(x+ix,y0+iy,ztop),0.18,M_S,C,10)
        for z in range(2,36,4):
            for ix in (-2.2,2.2):
                beam(f"GantTower{sx}_H{ix}_{z}",(x+ix,y0-2.2,z),(x+ix,y0+2.2,z),0.09,M_I,C,6)
            for iy in (-2.2,2.2):
                beam(f"GantTower{sx}_Hy{iy}_{z}",(x-2.2,y0+iy,z),(x+2.2,y0+iy,z),0.09,M_I,C,6)
            # X bracing on the outer faces
            beam(f"GantTower{sx}_Xa_{z}",(x-2.2,y0-2.2,z),(x+2.2,y0-2.2,z+4),0.07,M_I,C,6)
            beam(f"GantTower{sx}_Xb_{z}",(x+2.2,y0-2.2,z),(x-2.2,y0-2.2,z+4),0.07,M_I,C,6)
        # ladder + base pads
        box(f"GantTower{sx}_Base",(8,8,1.0),(x,y0,0.5),M_D,coll=C,bevel=0.05)
        for i in range(9):
            box(f"GantTower{sx}_Step{i}",(1.2,0.8,0.14),(x+4.2,y0-3.2,1.2+i*1.05),M_S,coll=C,bevel=0.02)
        box(f"GantTower{sx}_Haz",(8.4,8.4,0.35),(x,y0,1.08),M_HAZ,coll=C,uv=False)
        # red beacon
        sphere(f"GantTower{sx}_Beacon",0.22,(x,y0,ztop+0.3),M_RED,segs=8,rings=6,coll=C)
    # top truss: two chords, verticals, diagonals, catwalk
    for iy in (-3.0,3.0):
        box(f"GantChord_{iy}",(84,0.55,0.55),(0,y0+iy,ztop),M_S,coll=C,bevel=0.04)
    for i in range(21):
        x=-40+i*4
        box(f"GantVert_{i}",(0.22,6.5,0.22),(x,y0,ztop),M_I,coll=C,uv=False)
        if i<20:
            beam(f"GantDiag_{i}",(x,y0-3,ztop),(x+4,y0+3,ztop),0.08,M_I,C,6)
            beam(f"GantDiagB_{i}",(x,y0+3,ztop),(x+4,y0-3,ztop),0.08,M_I,C,6)
    box("GantCatwalk",(80,2.4,0.35),(0,y0+1.0,ztop-1.2),M_D,coll=C,bevel=0.03)
    for i in range(27):
        box(f"GantCatRail_{i}",(0.07,0.07,1.15),(-39+i*3,y0+2.1,ztop-0.55),M_S,coll=C,uv=False)
    box("GantCatRailTop",(80,0.07,0.07),(0,y0+2.1,ztop+0.05),M_S,coll=C,uv=False)
    for i in range(26):
        box(f"GantCatSlat_{i}",(2.9,2.3,0.05),(-39+i*3,y0+1.0,ztop-1.0),M_D,coll=C,uv=False)
    # hoist trolley and cable
    box("GantTrolley",(5,4,2.4),(6,y0+0.8,ztop-1.8),M_S,coll=C,bevel=0.05)
    cyl("GantHoistCable",0.06,20,(6,y0+0.8,ztop-12),M_D,coll=C,verts=6)
    box("GantHook",(1.4,1.0,1.8),(6,y0+0.8,ztop-22.3),M_I,coll=C,bevel=0.04)
    # floodlights on the underside of the catwalk
    for i,x in enumerate((-32,-20,-8,8,20,32)):
        box(f"GantFloodBase_{i}",(2.4,1.5,0.35),(x,y0-2.4,ztop-1.8),M_D,coll=C,bevel=0.02)
        box(f"GantFlood_{i}",(2.0,1.1,0.25),(x,y0-2.4,ztop-2.15),M_WARM,coll=C,bevel=0.01)
    # overhead hose / cable festoon
    for i in range(7):
        x=-30+i*10
        curve(f"GantHose_{i}",[(x,y0-1.5,ztop-2.4),(x,y0-1.5,ztop-14),(x+2,y0-1.0,ztop-24),(x,y0-0.5,6)],
              0.07,M_D,coll=C)
    # signage on top
    box("GantSignBack",(16,0.4,2.4),(0,y0-3.5,ztop+1.8),M_D,coll=C,bevel=0.03)
    text_mesh("GantSignText","SERVICE 07",1.1,(0,y0-3.8,ztop+1.9),M_WARM,
              rot=(math.radians(90),0,0),font=get_font(),coll=C,extrude=0.012)
    return (Vector((-42,y0-4,0)),Vector((42,y0+4,ztop+3)))

def tank_farm(C,M,L):
    M_S=M['steel']; M_T=M['tank']; M_P=M['pipe']; M_D=M['dark']; M_W=M['white_panel']
    M_HAZ=M['hazard']; M_ORG=M['orange']; M_RED=M['red']; M_WARM=M['warm']; M_CON=M['concrete']
    # bund / containment
    ts=box("TF_Slab",(100,64,0.8),(-320,-475,0.4),M_CON,coll=C,bevel=0.06,uv=False); box_uv(ts.data,0.08)
    for nm,size,pos in [("TF_BundS",(96,1.2,2.2),(-320,-506,1.1)),
                        ("TF_BundN",(96,1.2,2.2),(-320,-444,1.1)),
                        ("TF_BundW",(1.2,64,2.2),(-367,-475,1.1)),
                        ("TF_BundE",(1.2,64,2.2),(-273,-475,1.1))]:
        box(nm,size,pos,M_CON,coll=C,bevel=0.04,uv=False)
        box(nm+"_Haz",(size[0]*0.98,size[1]+0.02,0.25),(pos[0],pos[1],2.22),M_HAZ,coll=C,uv=False)
    # vertical cryo tanks
    for i,(x,y,r,h) in enumerate([(-345,-482,4.4,15.5),(-340,-458,4.4,15.5)]):
        cyl(f"TF_Tank{i}_Body",r,h,(x,y,h/2+0.8),M_T,coll=C,verts=32,smooth=True)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=r,location=(x,y,h+0.8))
        d=bpy.context.object; d.name=f"TF_Tank{i}_Dome"; d.scale.z=0.42
        bpy.ops.object.transform_apply(scale=True)
        for p in d.data.polygons: p.use_smooth=True
        d.data.materials.append(M_T)
        for c in list(d.users_collection): c.objects.unlink(d)
        C.objects.link(d)
        cyl(f"TF_Tank{i}_Skirt",r*1.04,0.7,(x,y,0.55),M_D,coll=C,verts=32)
        for z in (h*0.25+0.8,h*0.55+0.8,h*0.82+0.8):
            ring(f"TF_Tank{i}_Band_{z}",r+0.06,0.08,(x,y,z),M_S,C)
        for sx in (-1,1):
            cyl(f"TF_Tank{i}_LadderRail{sx}",0.035,h*0.82,(x+r+0.14,y+sx*0.24,h*0.46),M_S,coll=C,verts=6)
        for k in range(9,int(h/0.38)):
            cyl(f"TF_Tank{i}_Rung{k}",0.022,0.48,(x+r+0.14,y,0.8+k*0.38),M_S,
                rot=(math.radians(90),0,0),coll=C,verts=6)
        # top nozzle / valve
        cyl(f"TF_Tank{i}_Nozzle",0.26,1.4,(x-r*0.3,y,h+1.6),M_S,coll=C,verts=12)
        cyl(f"TF_Tank{i}_Valve",0.45,0.4,(x-r*0.3,y+0.85,h+2.4),M_ORG,
            rot=(math.radians(90),0,0),coll=C,verts=10)
        # hazard placard and base light
        box(f"TF_Tank{i}_Placard",(1.4,0.12,1.2),(x+r+0.02,y+1.0,2.4),M_HAZ,coll=C,uv=False)
        box(f"TF_Tank{i}_BaseLight",(0.9,0.15,0.12),(x+r+0.03,y-1.2,1.0),M_WARM,coll=C,uv=False)
    # horizontal day tank
    cyl("TF_DayTank",2.3,18,(-303,-456,5.1),M_T,rot=(0,math.radians(90),0),coll=C,verts=28,smooth=True)
    for sx in (-1,1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=2.3,location=(-303+sx*9,-456,5.1))
        d=bpy.context.object; d.name=f"TF_DayCap{sx}"; d.scale.x=0.4
        bpy.ops.object.transform_apply(scale=True)
        for p in d.data.polygons: p.use_smooth=True
        d.data.materials.append(M_T)
        for c in list(d.users_collection): c.objects.unlink(d)
        C.objects.link(d)
    for dx in (-6,0,6):
        ring(f"TF_DayBand{dx}",2.35,0.07,(-303+dx,-456,5.1),M_S,C)
    for dx in (-6,6):
        box(f"TF_DaySaddle{dx}",(1.2,3.8,1.0),(-303+dx,-456,1.6),M_D,coll=C,bevel=0.05)
    # pipe rack from tank farm to terminal
    pipe_run(C,M,-372,-472,-190,-472,6.0,4)
    # utility pumps / valves
    for i,(x,y) in enumerate([(-300,-493),(-292,-493),(-284,-485)]):
        box(f"TF_Pump{i}_Base",(2.6,2.0,0.5),(x,y,1.35),M_D,coll=C,bevel=0.04)
        cyl(f"TF_Pump{i}_Body",0.65,1.8,(x,y,2.4),M_ORG,rot=(0,math.radians(90),0),coll=C,verts=16)
        cyl(f"TF_Pump{i}_Pipe",0.18,3.0,(x,y,3.4),M_P,coll=C,verts=10)
        box(f"TF_Pump{i}_Panel",(0.8,0.2,0.6),(x,y-1.1,2.4),M_W,coll=C,bevel=0.02)
    return (Vector((-370,-510,0)),Vector((-275,-440,22)))

def pipe_run(C,M,x0,y0,x1,y1,z,r=0.28,count=3):
    M_P=M['pipe']; M_S=M['steel']; M_D=M['dark']; M_EDGE=M['edge']
    n=count
    for i in range(n):
        dz=i*0.62
        cyl(f"PipeRun_{x0}_{i}",r,math.hypot(x1-x0,y1-y0),( (x0+x1)/2,(y0+y1)/2,z+dz),
            M_P,rot=(math.radians(90),0,math.atan2(y1-y0,x1-x0)),coll=C,verts=16)
        # insulation bands
        for k in range(1,10):
            t=k/10
            cyl(f"PipeBand_{x0}_{i}_{k}",r+0.04,0.08,(x0+(x1-x0)*t,y0+(y1-y0)*t,z+dz),
                M_S,rot=(math.radians(90),0,math.atan2(y1-y0,x1-x0)),coll=C,verts=16)
    # supports
    ln=math.hypot(x1-x0,y1-y0); nsup=max(2,int(ln/12))
    for k in range(nsup+1):
        t=k/nsup; x=x0+(x1-x0)*t; y=y0+(y1-y0)*t
        box(f"PipeSupport_{x0}_{k}",(0.5,1.8,z), (x,y,z/2),M_D,coll=C,bevel=0.03)
        box(f"PipeSupportCap_{x0}_{k}",(0.8,2.4,0.25),(x,y,z+0.1),M_S,coll=C,bevel=0.02)
        box(f"PipeSupportFoot_{x0}_{k}",(1.2,2.4,0.25),(x,y,0.15),M_D,coll=C,bevel=0.02)
    box(f"PipeRunTrace_{x0}",(ln,0.06,0.06),((x0+x1)/2,(y0+y1)/2,z+0.45),M_EDGE,coll=C,uv=False)

def container(C,M,name,loc,rot,L=12.19,W=2.44,H=2.59,mat=None,stack=0):
    x,y=loc; z=stack*(H+0.02)
    mat=mat or M['container_blue']
    M_D=M['dark']; M_S=M['steel']; M_ORG=M['orange']; M_EDGE=M['edge']
    yaw=math.radians(rot); R=Matrix.Rotation(yaw,3,'Z')
    b=box(name,(L,W,H),(x,y,z+H/2),mat,rot=(0,0,yaw),coll=C,bevel=0.035)
    for sx in (-1,1):
        for sy in (-1,1):
            for sz in (0,1):
                d=R@Vector((sx*(L/2-0.12),sy*(W/2-0.09),0))
                box(f"{name}_Cast_{sx}_{sy}_{sz}",(0.26,0.25,0.26),
                    (x+d.x,y+d.y,z+0.15+sz*(H-0.3)),M_D,rot=(0,0,yaw),coll=C,bevel=0.015)
    # corrugation ribs
    for i in range(11):
        u=-L/2+0.8+i*(L-1.6)/10
        for sy in (-1,1):
            d=R@Vector((u,sy*(W/2+0.032),0))
            box(f"{name}_Rib_{i}_{sy}",(0.08,0.07,H-0.3),(x+d.x,y+d.y,z+H/2),
                mat,rot=(0,0,yaw),coll=C,bevel=0.006)
    for sy in (-1,1):
        d=R@Vector((0,sy*(W/2+0.03),0))
        box(f"{name}_RailT_{sy}",(L,0.09,0.09),(x+d.x,y+d.y,z+H-0.10),mat,rot=(0,0,yaw),coll=C,bevel=0.008)
        box(f"{name}_RailB_{sy}",(L,0.09,0.09),(x+d.x,y+d.y,z+0.10),mat,rot=(0,0,yaw),coll=C,bevel=0.008)
    # door end
    d=R@Vector((L/2+0.03,0,0))
    box(f"{name}_Door",(0.07,W-0.16,H-0.24),(x+d.x,y+d.y,z+H/2),M_D,rot=(0,0,yaw),coll=C,bevel=0.008)
    for k in (-1,0,1):
        d2=R@Vector((L/2+0.10,k*0.62,0))
        cyl(f"{name}_Lock{k}",0.032,H-0.55,(x+d2.x,y+d2.y,z+H/2),M_S,rot=(0,0,yaw),coll=C,verts=6)
    # stencil
    d3=R@Vector((0,-(W/2+0.09),0))
    text_mesh(f"{name}_Text","NRSU 2045",0.46,(x+d3.x,y+d3.y,z+H*0.63),M_ORG,
              rot=(math.radians(90),0,math.radians(rot)),font=get_font(),coll=C,extrude=0.004)
    if stack==0:
        hb=box(f"{name}_Haz",(0.6,W*0.8,0.28),(x+1.8,y,z+0.22),M['hazard'],coll=C,uv=False); box_uv(hb.data,0.4)
    return b

def container_yard(C,M):
    specs=[("A",(70,-440),-8,0,'container_red'),("B",(70,-440),-8,1,'container_grey'),
           ("C",(95,-440),-8,0,'container_blue'),("D",(95,-440),-8,1,'container_tan'),
           ("E",(120,-442),-6,0,'container_blue'),("F",(120,-442),-6,1,'container_red'),
           ("G",(145,-444),-4,0,'container_grey'),
           ("H",(48,-472),84,0,'container_tan'),("I",(72,-470),82,0,'container_blue'),
           ("J",(48,-472),84,1,'container_grey')]
    for i,(label,pos,rot,st,matkey) in enumerate(specs):
        container(C,M,f"CTN_{label}",pos,rot,mat=M[matkey],stack=st)
    # reach stacker / forklift: simple but authored from real industrial forms
    cx,cy=34,-468
    box("RS_Chassis",(7.2,2.5,1.2),(cx,cy,1.0),M['dark'],coll=C,bevel=0.06)
    box("RS_Cab",(2.2,2.2,2.3),(cx-2.0,cy,2.6),M['white_panel'],coll=C,bevel=0.06)
    box("RS_CabGlass",(2.0,0.1,1.1),(cx-2.0,cy-1.12,2.8),M['glass'],coll=C,bevel=0.02)
    box("RS_Mast",(0.4,0.4,8.8),(cx+2.4,cy,4.8),M['steel'],coll=C,bevel=0.03)
    box("RS_Header",(1.0,2.6,0.5),(cx+2.4,cy,9.2),M['steel'],coll=C,bevel=0.03)
    for sx in (-1,1):
        for sy in (-1,1):
            cyl(f"RS_Wheel{sx}{sy}",0.65,0.55,(cx+sx*2.4,cy+sy*1.15,0.75),M['dark'],
                rot=(math.radians(90),0,0),coll=C,verts=18)
    return

def light_mast(C,M,L,name,x,y,rot=0,height=26):
    M_S=M['steel']; M_D=M['dark']; M_WARM=M['warm']; M_EDGE=M['edge']
    cyl(f"{name}_Pole",0.25,height,(x,y,height/2),M_S,coll=C,verts=14)
    box(f"{name}_Base",(1.4,1.4,0.7),(x,y,0.35),M_D,coll=C,bevel=0.05)
    top=height
    for i,(dx,dy) in enumerate([(-0.7,-0.7),(0.7,-0.7),(-0.7,0.7),(0.7,0.7)]):
        box(f"{name}_Arm{i}",(0.12,0.12,0.7),(x+dx,y+dy,top-0.2),M_D,coll=C,uv=False)
        box(f"{name}_Lamp{i}",(1.2,0.9,0.35),(x+dx*1.5,y+dy*1.5,top-0.55),M_WARM,coll=C,bevel=0.02)
    # small ring / hazard
    ring(f"{name}_Ring",1.0,0.08,(x,y,2.0),M_EDGE,C,scale_z=0.15)

def boarding_stairs(C,M,ship_x,ship_y):
    M_S=M['steel']; M_D=M['dark']; M_HAZ=M['hazard']; M_WARM=M['warm']
    x0=ship_x-13.0; y0=ship_y; top=4.0; steps=12; run=0.34
    for i in range(steps):
        z=0.2+i*(top-0.2)/steps
        box(f"Boarding_Step{i}",(1.8,run+0.04,0.1),(x0,y0+i*run,z),M_S,coll=C,bevel=0.008)
    for sx in (-1,1):
        for i in range(steps):
            z=0.2+i*(top-0.2)/steps+0.55
            cyl(f"Boarding_RailPost{sx}_{i}",0.028,1.1,(x0+sx*0.85,y0+i*run,z),M_S,coll=C,verts=6)
        curve(f"Boarding_Rail{sx}",[(x0+sx*0.85,y0,0.75),(x0+sx*0.85,y0+steps*run,top+0.75)],
              0.04,M_S,coll=C)
    box("Boarding_Platform",(2.2,2.0,0.16),(x0,y0+steps*run+0.7,top+0.08),M_S,coll=C,bevel=0.02)
    box("Boarding_Haz",(2.2,0.2,0.05),(x0,y0-0.08,0.2),M_HAZ,coll=C,uv=False)
    box("Boarding_Light",(0.5,0.2,0.18),(x0+0.8,y0+steps*run+0.7,top+0.3),M_WARM,coll=C,uv=False)

def ship_landing_gear(C,M,ship_x,ship_y,z_hull=4.85):
    M_S=M['steel']; M_D=M['dark']; M_HAZ=M['hazard']; M_ORG=M['orange']
    for i,(dx,dy,rz) in enumerate([(-7,-8,0), (7,-8,0), (-7,7,0), (7,7,0)]):
        x=ship_x+dx; y=ship_y+dy
        cyl(f"Gear_Strut{i}",0.30,z_hull-0.6,(x,y,z_hull/2+0.3),M_S,coll=C,verts=12)
        cyl(f"Gear_Piston{i}",0.18,z_hull*0.55,(x,y,z_hull*0.33),M_ORG,coll=C,verts=10)
        box(f"Gear_Pad{i}",(1.8,1.8,0.35),(x,y,0.28),M_D,coll=C,bevel=0.05)
        gh=box(f"Gear_Haz{i}",(1.4,1.4,0.04),(x,y,0.47),M_HAZ,coll=C,uv=False); box_uv(gh.data,0.5)
        for k in (-1,1):
            beam(f"Gear_Brace{i}_{k}",(x+k*0.9,y,z_hull*0.75),(x,y+k*0.9,0.5),0.10,M_S,C,6)

def ground_support(C,M):
    M_D=M['dark']; M_S=M['steel']; M_ORG=M['orange']; M_W=M['white_panel']; M_EDGE=M['edge']
    M_HAZ=M['hazard']; M_WARM=M['warm']; M_GL=M['glass']
    # GPU cart and cable reel
    box("GPU_Body",(3.4,1.9,1.5),(18,-452,1.1),M_W,coll=C,bevel=0.07)
    box("GPU_Stripe",(3.45,0.25,0.28),(18,-452.9,1.25),M_ORG,coll=C,bevel=0.01)
    box("GPU_Screen",(0.8,0.05,0.4),(19.1,-453.0,1.3),M_EDGE,coll=C,bevel=0.01)
    for sx in (-1,1):
        for sy in (-1,1):
            cyl(f"GPU_Wheel{sx}{sy}",0.32,0.22,(18+sx*1.2,-452+sy*0.8,0.34),M_D,
                rot=(math.radians(90),0,0),coll=C,verts=16)
    cyl("GPU_Reel",0.7,0.7,(16.0,-452,1.1),M_D,rot=(0,math.radians(90),0),coll=C,verts=18)
    cyl("GPU_ReelHub",0.28,0.8,(16.0,-452,1.1),M_ORG,rot=(0,math.radians(90),0),coll=C,verts=12)
    curve("GPU_Cable",[(16.0,-452,0.7),(12,-452,0.25),(7,-450,0.2),(2,-445,0.2)],0.05,M_D,coll=C)
    # barrels / crates
    for i,(x,y) in enumerate([(-18,-482),(-16.8,-481.2),(-17.5,-483.0),(26,-486),(27,-484.8)]):
        cyl(f"Barrel_{i}",0.42,0.95,(x,y,0.48),M['container_blue'] if i%2 else M['container_red'],coll=C,verts=14)
        ring(f"BarrelBand_{i}",0.44,0.035,(x,y,0.72),M_S,C,scale_z=0.6)
    for i,(x,y,w,d,h,r) in enumerate([(30,-480,2.6,1.8,1.5,12),(33,-481,2.0,1.6,1.2,-6),(-22,-486,2.8,2.0,1.6,18)]):
        box(f"Crate_{i}",(w,d,h),(x,y,h/2+0.03),M['container_tan'],rot=(0,0,math.radians(r)),coll=C,bevel=0.04)
    # jersey barriers along the service road
    for i in range(8):
        x=55+i*7.0
        jb=box(f"Jersey_{i}",(3.6,0.8,1.05),(x,-556,0.55),M['concrete'],coll=C,bevel=0.06,uv=False); box_uv(jb.data,0.3)
        box(f"JerseyHaz_{i}",(3.4,0.82,0.18),(x,-556,0.94),M_HAZ,coll=C,uv=False)
    # windsock
    cyl("Windsock_Pole",0.10,7.0,(-45,-536,3.5),M_S,coll=C,verts=8)
    cone("Windsock_Cone",0.6,0.22,2.8,(-45,-534.6,6.7),M_ORG,rot=(math.radians(90),0,0),coll=C,verts=12)
    # utility truck at the terminal side
    tx,ty=44,-500
    box("Truck_Chassis",(6.0,2.2,0.8),(tx,ty,0.9),M_D,coll=C,bevel=0.05)
    box("Truck_Cab",(1.9,2.1,2.0),(tx-2.2,ty,2.2),M_ORG,coll=C,bevel=0.06)
    box("Truck_CabGlass",(1.5,0.08,0.75),(tx-2.2,ty-1.08,2.5),M_GL,coll=C,bevel=0.02)
    box("Truck_Bed",(3.5,2.1,0.4),(tx+1.2,ty,1.45),M_S,coll=C,bevel=0.03)
    for i in range(3):
        cyl(f"Truck_Wheel{i}",0.55,0.4,(tx-2.2+i*2.4,ty+1.1,0.6),M_D,
            rot=(math.radians(90),0,0),coll=C,verts=16)
    box("Truck_Light",(0.25,0.5,0.2),(tx-3.15,ty,1.4),M_WARM,coll=C,uv=False)

def pad_dressing(C,M,L):
    M_D=M['dark']; M_W=M['white_panel']; M_ORG=M['orange']; M_WARM=M['warm']; M_HAZ=M['hazard']; M_S=M['steel']
    # tie-down rings + edge lights
    for i in range(28):
        a=2*math.pi*i/28; x=math.cos(a)*27.0; y=-420+math.sin(a)*27.0
        cyl(f"PadTie_{i}",0.16,0.10,(x,y,0.20),M_S,coll=C,verts=8)
        box(f"PadEdgeLight_{i}",(0.32,0.18,0.10),(x,y,0.23),M_WARM,coll=C,uv=False)
    # wheel chocks at the A-30 gear
    for i,(x,y) in enumerate([(-7,-428),(7,-428),(-7,-412),(7,-412)]):
        box(f"Chock_{i}",(0.8,0.35,0.28),(x,y,0.34),M_ORG,coll=C,bevel=0.03)
        box(f"ChockHaz_{i}",(0.82,0.36,0.06),(x,y,0.50),M_HAZ,coll=C,uv=False)
    # ground power cable + fuel hose
    curve("Pad_Hose",[(15.5,-452,0.7),(11,-446,0.25),(7,-438,0.20),(4,-428,0.20)],0.07,M_D,coll=C)
    curve("Pad_Hose2",[(-16,-450,0.6),(-10,-440,0.22),(-4,-432,0.18)],0.055,M['container_blue'],coll=C)
    # cones
    for i,(x,y) in enumerate([(-28,-450),(-20,-390),(24,-390),(28,-452),(16,-394),(-28,-392)]):
        cone(f"PadCone_{i}",0.28,0.05,0.75,(x,y,0.40),M_ORG,coll=C,verts=12)
        ring(f"PadConeRing_{i}",0.22,0.035,(x,y,0.48),M_W,coll=C,scale_z=0.5)
        box(f"PadConeBase_{i}",(0.65,0.65,0.07),(x,y,0.05),M_D,coll=C,bevel=0.01)
    # tool cart + extinguisher + pallet
    box("PadToolCart",(1.8,1.0,1.6),(-21,-442,1.0),M_W,coll=C,bevel=0.05)
    for i,z in enumerate((0.45,0.85,1.25)):
        box(f"PadToolDrawer_{i}",(1.7,0.06,0.28),(-21,-442.55,z),M_D,coll=C,uv=False)
    for sx in (-1,1):
        for sy in (-1,1):
            cyl(f"PadToolWheel_{sx}_{sy}",0.18,0.14,(-21+sx*0.7,-442+sy*0.45,0.2),M_D,rot=(math.radians(90),0,0),coll=C,verts=10)
    for i,(x,y) in enumerate([(30,-470),(31.2,-470.8)]):
        cyl(f"PadExt_{i}",0.22,0.75,(x,y,0.40),M['container_red'],coll=C,verts=10)
        cyl(f"PadExtTop_{i}",0.08,0.22,(x,y,0.85),M_D,coll=C,verts=8)
    box("PadPallet",(2.4,1.6,0.16),(33,-456,0.20),M['container_tan'],coll=C,bevel=0.02)
    for i,(x,y) in enumerate([(32.4,-456),(33.6,-456),(33,-455.2)]):
        box(f"PadCase_{i}",(0.8,0.55,0.55),(x,y,0.55),M_D,coll=C,bevel=0.03)

def port(C,L,M):
    term=terminal(C,M,L)
    wh=warehouse(C,M,L)
    ct=control_tower(C,M,L)
    g=gantry(C,M,L,-420)
    tf=tank_farm(C,M,L)
    container_yard(C,M)
    light_mast(C,M,L,"MastSW",-48,-462,20,28)
    light_mast(C,M,L,"MastSE",52,-458,200,28)
    light_mast(C,M,L,"MastNW",-52,-386,20,26)
    light_mast(C,M,L,"MastNE",52,-386,200,26)
    boarding_stairs(C,M,0,-420)
    ground_support(C,M)
    pad_dressing(C,M,L)
    # a couple of physical pad lights for the close-up
    for i,(x,y) in enumerate([(-38,-452),(38,-452),(-38,-388),(38,-388)]):
        ld=bpy.data.lights.new(f"PadFlood_{i}",'SPOT'); ld.energy=1800; ld.color=(1.0,0.78,0.52)
        ld.spot_size=math.radians(55); ld.spot_blend=0.5; ld.shadow_soft_size=0.6
        lo=bpy.data.objects.new(f"PadFlood_{i}",ld); lo.location=(x,y,27.0)
        point_at(lo,(x*0.35,y*0.4,0)); link(lo,L)
    print("PORT built")
    return term,wh,ct,g,tf
