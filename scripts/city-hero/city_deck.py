"""1200 x 1200 m authored city deck, roads, plaza and exterior terrain ring."""
import bpy, bmesh, math, os, random
from mathutils import Vector, noise
from lib_city import *
from lib_kb3d import box, box_uv, cyl, ring, text_mesh, link


def smoothstep(a,b,x):
    t=max(0.0,min(1.0,(x-a)/(b-a)))
    return t*t*(3-2*t)

def stripe(name,x0,y0,x1,y1,width,mat,z=0.075,coll=None):
    dx=x1-x0; dy=y1-y0; ln=math.hypot(dx,dy); ang=math.atan2(dy,dx)
    ob=box(name,(ln,width,0.012),( (x0+x1)/2,(y0+y1)/2,z),mat,
           rot=(0,0,ang),coll=coll,uv=False)
    return ob

def road(coll,name,x0,x1,y0,y1,mat):
    ob=box(name,(x1-x0,y1-y0,0.05),((x0+x1)/2,(y0+y1)/2,0.025),mat,coll=coll,uv=False)
    box_uv(ob.data,0.12)
    return ob

def build_deck(C, mats):
    M_DECK=mats['deck']; M_PLAZA=mats['plaza']; M_WALL=mats['wall']; M_ASP=mats['asphalt']
    M_WHITE=mats['white']; M_YELLOW=mats['yellow']; M_DARK=mats['dark']; M_HAZ=mats['hazard']
    M_EDGE=mats['edge']; M_EDGE_W=mats['edge_warm']; M_TER=mats['terrain']

    # ------------------------------------------------------------ slab + top
    slab=box("CityDeck_Slab",(1200,1200,40),(0,0,-20.18),M_WALL,coll=C,bevel=0.15,uv=False)
    box_uv(slab.data,0.05)
    top=box("CityDeck_Top",(1200,1200,0.06),(0,0,-0.015),M_DECK,coll=C,bevel=0.04,uv=False)
    box_uv(top.data,0.05)

    # permanent expansion joints every 40 m (geometry, not texture)
    for i,x in enumerate(range(-580,581,40)):
        box(f"DeckJointX_{i}",(0.28,1200,0.012),(x,0,0.055),M_DARK,coll=C,uv=False)
    for i,y in enumerate(range(-580,581,40)):
        box(f"DeckJointY_{i}",(1200,0.28,0.012),(0,y,0.055),M_DARK,coll=C,uv=False)

    # ------------------------------------------------------------ port plaza
    pl=box("Port_Plaza",(460,300,0.10),(-20,-445,0.08),M_PLAZA,coll=C,bevel=0.3,uv=False)
    box_uv(pl.data,0.08)
    # plaza paver bands
    for i,x in enumerate(range(-245,221,20)):
        box(f"PlazaBandV_{i}",(0.16,300,0.008),(x,-445,0.142),M_DARK,coll=C,uv=False)
    for i,y in enumerate(range(-590,-291,20)):
        box(f"PlazaBandH_{i}",(460,0.16,0.008),(-20,y,0.142),M_DARK,coll=C,uv=False)
    # darker inlays around terminal / container yard
    box("Plaza_InlayW",(120,120,0.012),(-160,-465,0.145),M_ASP,coll=C,bevel=0.05,uv=False)
    box("Plaza_InlayE",(130,110,0.012),(150,-450,0.145),M_ASP,coll=C,bevel=0.05,uv=False)
    for ob in (bpy.data.objects.get("Plaza_InlayW"), bpy.data.objects.get("Plaza_InlayE")):
        if ob: box_uv(ob.data,0.1)

    # ------------------------------------------------------------ road grid
    road(C,"Road_PortSouth",-600,600,-575,-555,M_ASP)
    road(C,"Road_CrossPort",-600,600,-315,-289,M_ASP)
    road(C,"Road_Boulevard",-600,600,102,138,M_ASP)
    road(C,"Road_North",-600,600,317,343,M_ASP)
    road(C,"Road_WestAve",-374,-346,-600,600,M_ASP)
    road(C,"Road_EastAve",346,374,-600,600,M_ASP)
    road(C,"Road_CenterAve",-11,11,-289,600,M_ASP)
    road(C,"Road_Approach",-17,17,-600,-450,M_ASP)
    # service spur into terminal
    road(C,"Road_TerminalSpur",-230,-95,-365,-345,M_ASP)
    road(C,"Road_ContainerSpur",75,330,-390,-370,M_ASP)

    # lane markings: yellow centre dashes, white edge lines
    def dash_x(name,y,x0,x1,step=12,dash=6,mat=M_YELLOW,w=0.38,z=0.062):
        for i,x in enumerate(range(int(x0),int(x1),step)):
            stripe(f"{name}_{i}",x,y,x+dash,y,w,mat,z,C)
    def dash_y(name,x,y0,y1,step=12,dash=6,mat=M_YELLOW,w=0.38,z=0.062):
        for i,y in enumerate(range(int(y0),int(y1),step)):
            stripe(f"{name}_{i}",x,y,x,y+dash,w,mat,z,C)
    dash_x("BlvdDash",120,-590,590,18,8,M_YELLOW,0.42,0.064)
    dash_x("NorthDash",330,-590,590,18,8,M_YELLOW,0.36,0.064)
    dash_x("CrossDash",-302,-590,590,18,8,M_YELLOW,0.36,0.064)
    dash_y("WestDash",-360,-590,590,18,8,M_YELLOW,0.36,0.064)
    dash_y("EastDash",360,-590,590,18,8,M_YELLOW,0.36,0.064)
    dash_y("CenterDash",0,-280,590,18,8,M_YELLOW,0.32,0.064)
    dash_y("ApproachDash",0,-600,-452,16,7,M_YELLOW,0.30,0.064)

    for nm,y in [("BlvdEdgeN",144),("BlvdEdgeS",96)]:
        stripe(nm,-596,y,596,y,0.26,M_WHITE,0.066,C)
    for nm,x in [("WestEdgeW",-376),("WestEdgeE",-344)]:
        stripe(nm,x,-600,x,596,0.24,M_WHITE,0.066,C)
    for nm,x in [("EastEdgeW",344),("EastEdgeE",376)]:
        stripe(nm,x,-600,x,596,0.24,M_WHITE,0.066,C)
    for nm,y in [("CrossEdgeS",-318),("CrossEdgeN",-286)]:
        stripe(nm,-596,y,596,y,0.24,M_WHITE,0.066,C)
    for nm,x in [("ApproachEdgeW",-18.2),("ApproachEdgeE",18.2)]:
        stripe(nm,x,-600,x,-450,0.22,M_WHITE,0.066,C)

    # crosswalks at the port plaza entrance
    for k in range(9):
        stripe(f"Crosswalk_{k}",-14+k*3.5,-334,-12.6+k*3.5,-319,0.55,M_WHITE,0.067,C)
    # stop line
    stripe("StopLine",-17,-327,17,-327,0.8,M_WHITE,0.067,C)

    # ------------------------------------------------------------ TLOF pad
    pad_pts=[(-25,-30),(25,-30),(30,-25),(30,25),(25,30),(-25,30),(-30,25),(-30,-25)]
    me=bpy.data.meshes.new("TLOF_Pad")
    bm=bmesh.new()
    vs=[bm.verts.new((x-0,y-420,0.155)) for x,y in pad_pts]
    f=bm.faces.new(vs)
    r=bmesh.ops.extrude_face_region(bm,geom=[f])
    for v in r['geom']:
        if isinstance(v,bmesh.types.BMVert): v.co.z=0.02
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    box_uv(me,0.06)
    pad=bpy.data.objects.new("TLOF_Pad",me); link(pad,C)
    pad.data.materials.append(M_PLAZA)
    # pad border
    for nm,size,pos in [("PadEdgeS",(61,0.5,0.04),(0,-450,0.17)),
                        ("PadEdgeN",(61,0.5,0.04),(0,-390,0.17)),
                        ("PadEdgeW",(0.5,61,0.04),(-30,-420,0.17)),
                        ("PadEdgeE",(0.5,61,0.04),(30,-420,0.17))]:
        box(nm,size,pos,M_DARK,coll=C,uv=False)
    # painted ring / H / text
    ring("TLOF_Ring",21.0,0.36,(0,-420,0.19),M_WHITE,C,scale_z=0.03)
    ring("TLOF_Ring2",25.0,0.16,(0,-420,0.19),M_WHITE,C,scale_z=0.03)
    box("TLOF_H_L",(2.0,13,0.007),(-6.2,-420,0.188),M_WHITE,coll=C,uv=False)
    box("TLOF_H_R",(2.0,13,0.007),(6.2,-420,0.188),M_WHITE,coll=C,uv=False)
    box("TLOF_H_C",(10.4,2.0,0.007),(0,-420,0.188),M_WHITE,coll=C,uv=False)
    for sx in (-1,1):
        for sy in (-1,1):
            cx,cy=sx*27.5,-420+sy*27.5
            stripe(f"PadCornerA_{sx}_{sy}",cx-sx*2.2,cy,cx,cy,0.45,M_WHITE,0.195,C)
            stripe(f"PadCornerB_{sx}_{sy}",cx,cy-sy*2.2,cx,cy,0.45,M_WHITE,0.195,C)
    text_mesh("PadTLOF","TLOF-01",1.9,(0,-448.0,0.20),M_WHITE,font=get_font(),coll=C,extrude=0.004)
    text_mesh("PadSize","60 m  /  R 21",1.5,(0,-392.5,0.20),M_WHITE,font=get_font(),coll=C,extrude=0.004)
    text_mesh("PadCode","A-30",3.1,(-19,-402,0.20),M_YELLOW,font=get_font(),coll=C,extrude=0.005)
    # taxi line
    for i in range(9):
        stripe(f"PadTaxiDash_{i}",0,-458-i*8,0,-462-i*8,0.42,M_YELLOW,0.19,C)

    # big deck labels
    text_mesh("DeckLabel1","NAUTILUS REACH",5.8,(-70,-335,0.16),M_WHITE,font=get_font(),coll=C,extrude=0.005,spacing=0.95)
    text_mesh("DeckLabel2","PORT 07   //   CITY DECK 01   //   1200 x 1200 m",2.2,(-70,-343,0.16),M_WHITE,font=get_font(),coll=C,extrude=0.004,spacing=0.92)
    text_mesh("DeckLabel3","AUTHORED PLATFORM   /   APRON ELEV. 0.00",1.6,(-70,-349,0.16),M_YELLOW,font=get_font(),coll=C,extrude=0.003)

    # ------------------------------------------------------------ perimeter
    for nm,size,pos in [
        ("DeckParapet_S",(1200,0.9,1.35),(0,-599.55,0.68)),
        ("DeckParapet_N",(1200,0.9,1.35),(0,599.55,0.68)),
        ("DeckParapet_E",(0.9,1200,1.35),(599.55,0,0.68)),
        ("DeckParapet_W",(0.9,1200,1.35),(-599.55,0,0.68))]:
        box(nm,size,pos,M_WALL,coll=C,bevel=0.05)
    for nm,size,pos in [
        ("EdgeStrip_S",(1198,0.06,0.10),(0,-598.95,1.18)),
        ("EdgeStrip_N",(1198,0.06,0.10),(0,598.95,1.18)),
        ("EdgeStrip_E",(0.06,1198,0.10),(598.95,0,1.18)),
        ("EdgeStrip_W",(0.06,1198,0.10),(-598.95,0,1.18))]:
        box(nm,size,pos,M_EDGE,coll=C,uv=False)

    # retaining wall bays: pilasters / horizontal ledges / buttresses
    for side,(fixed,axis) in enumerate([(-602,'x'),(602,'x'),(-602,'y'),(602,'y')]):
        for i in range(20):
            t=(i+0.5)/20
            p=-600+1200*t
            if axis=='x':
                x=fixed; y=p
                box(f"DeckButtress_{side}_{i}",(8,5,40),(x,y,-20.0),M_WALL,coll=C,bevel=0.15)
                box(f"DeckButtressCap_{side}_{i}",(10,7,1.0),(x,y,0.55),M_DARK,coll=C,bevel=0.08)
                box(f"DeckButtressLight_{side}_{i}",(1.2,0.2,0.12),(x+(3.8 if side==1 else -3.8),y,0.92),M_EDGE,coll=C,uv=False)
            else:
                x=p; y=fixed
                box(f"DeckButtress_{side}_{i}",(5,8,40),(x,y,-20.0),M_WALL,coll=C,bevel=0.15)
                box(f"DeckButtressCap_{side}_{i}",(7,10,1.0),(x,y,0.55),M_DARK,coll=C,bevel=0.08)
                box(f"DeckButtressLight_{side}_{i}",(0.2,1.2,0.12),(x,y+(3.8 if side==3 else -3.8),0.92),M_EDGE,coll=C,uv=False)
    for z in (-8.0,-24.0):
        for nm,size,pos in [("BandS",(1200,0.5,0.55),(0,-600.4,z)),
                            ("BandN",(1200,0.5,0.55),(0,600.4,z)),
                            ("BandE",(0.5,1200,0.55),(600.4,0,z)),
                            ("BandW",(0.5,1200,0.55),(-600.4,0,z))]:
            box(f"DeckWall{nm}_{z}",size,pos,M_DARK,coll=C,bevel=0.04,uv=False)

    # hazard band at the base of the retaining wall
    for nm,size,pos in [("HazBaseS",(1200,0.12,0.7),(0,-603.2,-39.3)),
                        ("HazBaseN",(1200,0.12,0.7),(0,603.2,-39.3)),
                        ("HazBaseE",(0.12,1200,0.7),(603.2,0,-39.3)),
                        ("HazBaseW",(0.12,1200,0.7),(-603.2,0,-39.3))]:
        b=box(nm,size,pos,M_HAZ,coll=C,uv=False); box_uv(b.data,0.25)

    # ------------------------------------------------------------ deck furniture
    # street lamps along main roads
    def lamp(name,x,y,rot=0):
        cyl(f"{name}_Pole",0.16,10.5,(x,y,5.3),M_DARK,coll=C,verts=10)
        box(f"{name}_Arm",(2.4,0.18,0.18),(x,y,10.35),M_DARK,coll=C,rot=(0,0,math.radians(rot)),bevel=0.01)
        box(f"{name}_Head",(1.3,0.52,0.20),(x,y,10.20),M_EDGE_W,coll=C,rot=(0,0,math.radians(rot)),bevel=0.01)
        box(f"{name}_Base",(0.65,0.65,0.45),(x,y,0.24),M_DARK,coll=C,bevel=0.03)
    for i,x in enumerate(range(-560,581,80)):
        lamp(f"BlvdLampS_{i}",x,91)
        lamp(f"BlvdLampN_{i}",x,150)
    for i,y in enumerate(range(-560,581,90)):
        lamp(f"WestLamp_{i}",-381,y,90)
        lamp(f"EastLamp_{i}",381,y,90)
    for i,x in enumerate(range(-560,581,80)):
        lamp(f"NorthLamp_{i}",x,351)
    # planters / bollards around plaza
    for i,(x,y) in enumerate([(-220,-585),(-200,-585),(-180,-585),(180,-585),(200,-585),(220,-585)]):
        cyl(f"PlazaBollard_{i}",0.24,1.1,(x,y,0.55),M_DARK,coll=C,verts=12)
        box(f"PlazaBollardCap_{i}",(0.5,0.5,0.12),(x,y,1.12),M_EDGE_W,coll=C,uv=False)
    # edge light strips on plaza
    for i,x in enumerate(range(-250,251,25)):
        box(f"PlazaEdgeLight_{i}",(0.15,0.04,0.08),(x,-295,0.22),M_EDGE_W,coll=C,uv=False)

    # ------------------------------------------------------------ terrain ring
    SIZE=3000; SEG=260
    verts=[]; faces=[]
    def h(x,y):
        # 40 m below deck at the retaining wall, rising into dry ridges outside
        e=max(abs(x)-620,abs(y)-620,0)
        if e<=0: return -40.0
        n1=noise.noise(Vector((x*0.0035,y*0.0035,0.7)))
        n2=noise.noise(Vector((x*0.011,y*0.011,4.2)))
        n3=noise.noise(Vector((x*0.028,y*0.028,9.1)))
        rise=smoothstep(0,220,e)*(2.5+7.0*(0.5+0.5*n1)+2.0*n2)
        ridge=smoothstep(280,900,e)*(24.0*(0.6+0.4*n1)+8.0*n2+2.0*n3)
        far=smoothstep(700,1500,e)*(55.0*(0.55+0.45*n1)+10*n3)
        return -40.0+rise+ridge+far
    for j in range(SEG+1):
        y=-SIZE/2+SIZE*j/SEG
        for i in range(SEG+1):
            x=-SIZE/2+SIZE*i/SEG
            verts.append((x,y,h(x,y)))
    for j in range(SEG):
        for i in range(SEG):
            x=-SIZE/2+SIZE*(i+0.5)/SEG
            y=-SIZE/2+SIZE*(j+0.5)/SEG
            if -615<x<615 and -615<y<615: continue
            a=j*(SEG+1)+i
            faces.append((a,a+1,a+SEG+2,a+SEG+1))
    me=bpy.data.meshes.new("TerrainRing"); me.from_pydata(verts,[],faces); me.update()
    for p in me.polygons: p.use_smooth=True
    uv=me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v=me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv=(v.x/68.0, v.y/68.0)
    ter=bpy.data.objects.new("TerrainRing",me); link(ter,C)
    ter.data.materials.append(M_TER)
    # thin flat shelf covers the grid stair-step at the wall foot
    for nm,size,pos in [("TerrShelfS",(1260,18,1.0),(0,-618,-40.4)),
                        ("TerrShelfN",(1260,18,1.0),(0,618,-40.4)),
                        ("TerrShelfE",(18,1260,1.0),(618,0,-40.4)),
                        ("TerrShelfW",(18,1260,1.0),(-618,0,-40.4))]:
        ob=box(nm,size,pos,M_TER,coll=C,uv=False)
        box_uv(ob.data,0.01)
    print("DECK built")
    return slab
