"""Write the public manifest for the v4 Nautilus Reach sample."""
import json, os

ROOT = "/private/tmp/city-hero-v2"
OUT = "/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2/public/city-hero/manifest.json"

with open(f"{ROOT}/build_report.json") as f:
    report = json.load(f)

ASSET = {
    "Hero_K032_A": "K032 NeoShanghai / BldgLG_A",
    "Hero_K038_J": "K038 Neo Tokyo 2 / LargeJ",
    "Hero_K038_I": "K038 Neo Tokyo 2 / LargeI",
    "Mid_K032_B": "K032 NeoShanghai / BldgLG_B",
    "Mid_K032_D": "K032 NeoShanghai / BldgLG_D",
    "Mid_K032_E": "K032 NeoShanghai / BldgLG_E",
    "Mid_K032_F": "K032 NeoShanghai / BldgLG_F",
    "Mid_K032_H": "K032 NeoShanghai / BldgLG_H",
    "Mid_K038_C": "K038 Neo Tokyo 2 / LargeC",
    "Mid_K038_E": "K038 Neo Tokyo 2 / LargeE",
}

def with_asset(rows):
    out = []
    for row in rows:
        d = dict(row)
        key = d.get("asset_key") or d.get("obj", "")
        d["asset"] = ASSET.get(key) or ("K039 Sci-Fi Industrial 1:1" if key.startswith("K39_") else
                                        "K032 NeoShanghai 1:1" if key.startswith("K32_") else
                                        "K038 Neo Tokyo 2 1:1" if key.startswith("K38_") else
                                        "custom 1:1 port")
        out.append(d)
    return out

renders = [
    {"file": "renders/01_port_approach.jpg", "shot": "wide", "label": "Port approach / T2 + hero cluster",
     "camera": "Cam_Wide", "lens_mm": 18, "loc": [-55, -490, 1.7], "target": [0, -180, 110]},
    {"file": "renders/02_street_canyon.jpg", "shot": "street", "label": "Street canyon / A-30",
     "camera": "Cam_Street", "lens_mm": 20, "loc": [0, -470, 1.7], "target": [0, -140, 110]},
    {"file": "renders/03_terminal_detail.jpg", "shot": "detail", "label": "T2 terminal detail",
     "camera": "Cam_Detail", "lens_mm": 38, "loc": [-80, -580, 4.5], "target": [-145, -500, 7.5]},
    {"file": "renders/04_dense_aerial.jpg", "shot": "aerial_low", "label": "Dense district aerial",
     "camera": "Cam_AerialLow", "lens_mm": 35, "loc": [-700, -900, 300], "target": [0, -100, 40]},
    {"file": "renders/05_platform_aerial.jpg", "shot": "aerial", "label": "1200 m platform / industrial edge",
     "camera": "Cam_Aerial", "lens_mm": 35, "loc": [-600, -1400, 500], "target": [0, 0, 80]},
]

manifest = {
    "sample": "Nautilus Reach v4",
    "status": "authored offline Cycles city sample",
    "units": "metres",
    "deck": {
        "size_m": [1200, 1200],
        "top_z": 0.0,
        "retaining_wall_depth_m": 40,
        "terrain_under_city": False,
        "note": "flat city platform; terrain ring only outside retaining wall",
    },
    "density": {
        "district_single_modules": len(report.get("lows", [])),
        "hero_single_meshes": len(report.get("heroes", [])),
        "secondary_single_meshes": len(report.get("mids", [])),
        "note": "focused 3-4 block district with repeated K032/K039 families; no K038 stacking and no facade stretch",
    },
    "heroes": with_asset(report["heroes"]),
    "secondary_single_buildings": with_asset(report["mids"]),
    "district": with_asset(report.get("lows", [])),
    "background_skyline": [
        dict(row, asset="K015 Neo Tokyo / 1:100 kit, x100 unit-corrected; 600 m authored city base")
        for row in report.get("background", [])
    ],
    "terminal": report.get("terminal"),
    "ship": report.get("ship"),
    "stacking": report.get("stacking"),
    "audit": report.get("audit"),
    "brand": {
        "materials_replaced": report.get("brand_replaced"),
        "faces_removed": report.get("brand_faces_removed"),
        "audit": report.get("brand_audit"),
        "in_world_signs": report.get("in_world_signs"),
        "note": "source Ads/Banner/Signs_Lights/Screens/Decals geometry was deleted; in-world numeric/shipping/arrival signage added",
    },
    "triangles": {
        "total": report.get("total_tris"),
        "by_collection": report.get("by_collection"),
        "heroes": {h["name"]: h["tris"] for h in report["heroes"]},
    },
    "render": {
        "engine": "Cycles",
        "resolution": [1920, 1080],
        "samples": 160,
        "view_transform": "AgX - Medium High Contrast",
        "denoiser": "OpenImageDenoise",
        "hdri": "public/terrain-sample/sky.hdr",
        "sun_w_m2": 9.0,
        "atmosphere": "height-gradient finite volume; extra fog volumes removed for render time",
        "compositing": "disabled in-render; final JPG grade applied in post",
    },
    "terrain": {
        "outer_ring": "authored heights outside the retaining wall; no terrain under the city",
        "rocks": "authored asteroid-pack ridge rocks at the perimeter",
        "industry": "refinery clusters, wall warehouses, portal cranes, raised edge road, pipe bands",
        "roads": "ring/hill/foreground service roads with lamps, edge markers, long-exposure traffic lights",
    },
    "port": {
        "tlof_m": 60,
        "a30_length_m": 24.99,
        "a30_span_m": 28.84,
        "foreground": "CommunityCentre T2, arrival pylon, gantry, tanks, pipes, container yards, rail cranes, taxis, market, crowds, C2184 panel bank",
    },
    "renders": renders,
    "limitations": [
        "Offline Cycles stills only; realtime GLB/preview was not rebuilt.",
        "CommunityCentre terminal uses a 1.03M-tri authored subset of the 1.37M source (shell + interior).",
        "K015 towers are background silhouettes at ~1.3 km; their 1K textures are not close-up detail.",
        "K046 is used as material/detail reference on the custom port, not as a hero building kit; native Heavy Metal modules read as hulls.",
        "Kitbash3D / Modelshop assets are private/offline only; public Web redistribution needs separate licence review.",
        "No K038 vertical stacking, no uniform giant scaling of hero modules, no procedural facade stretch.",
    ],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(manifest, f, indent=1)
print("WROTE", OUT)
