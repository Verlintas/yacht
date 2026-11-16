"""Write the public manifest for the v3 Nautilus Reach sample.

Run after build_scene.py/render_v2.py/grade_final.py:
  python3 scripts/city-hero-v2/make_manifest.py
"""
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
    {"file": "renders/01_port_wide.jpg", "shot": "termwide", "label": "Port wide / T2 approach",
     "camera": "Cam_TermWide", "lens_mm": 32, "loc": [-170, -575, 5.5], "target": [-100, -430, 40]},
    {"file": "renders/02_street_canyon.jpg", "shot": "street", "label": "Street canyon / A-30",
     "camera": "Cam_Street", "lens_mm": 20, "loc": [0, -470, 1.7], "target": [0, -140, 110]},
    {"file": "renders/03_pad_closeup.jpg", "shot": "pad", "label": "60 m TLOF / A-30",
     "camera": "Cam_Pad", "lens_mm": 50, "loc": [-45, -520, 3.0], "target": [4, -420, 6.5]},
    {"file": "renders/04_dense_aerial.jpg", "shot": "aerial_low", "label": "Dense district aerial",
     "camera": "Cam_AerialLow", "lens_mm": 35, "loc": [-700, -900, 300], "target": [0, -100, 40]},
    {"file": "renders/05_platform_aerial.jpg", "shot": "aerial", "label": "1200 m platform aerial",
     "camera": "Cam_Aerial", "lens_mm": 34, "loc": [-950, -1200, 600], "target": [0, 0, 80]},
    {"file": "renders/06_terminal_detail.jpg", "shot": "detail", "label": "T2 terminal detail",
     "camera": "Cam_Detail", "lens_mm": 38, "loc": [-80, -580, 4.5], "target": [-145, -500, 7.5]},
]

manifest = {
    "sample": "Nautilus Reach v3",
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
        "note": "single native K039/K032/K038 modules; no K038 stacking and no facade stretch",
    },
    "heroes": with_asset(report["heroes"]),
    "secondary_single_buildings": with_asset(report["mids"]),
    "district": with_asset(report.get("lows", [])),
    "background_skyline": [
        dict(row, asset="K015 Neo Tokyo / 1:100 kit, unit-corrected x100; 600 m authored city base")
        for row in report.get("background", [])
    ],
    "terminal": report.get("terminal"),
    "ship": report.get("ship"),
    "stacking": report.get("stacking"),
    "audit": report.get("audit"),
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
        "atmosphere": "finite Principled Volume, density 0.00014 /m",
        "compositing": "disabled in-render; final JPG grade applied in post",
    },
    "terrain": {
        "outer_ring": "authored heights outside the retaining wall; no terrain under the city",
        "rocks": "authored asteroid-pack rock ridges at the deck perimeter",
        "roads": "ring/hill service roads with lamps and edge markers",
        "macro_variation": "Noise-driven terrain colour variation",
    },
    "port": {
        "tlof_m": 60,
        "a30_length_m": 24.99,
        "a30_span_m": 28.84,
        "foreground": "CommunityCentre T2, gantry, tanks, pipes, container yards, rail cranes, taxis, market, crowds, C2184 panel banks",
    },
    "renders": renders,
    "limitations": [
        "Offline Cycles stills only; the realtime GLB/preview was not rebuilt in this pass.",
        "CommunityCentre terminal uses a 1.03M-tri authored subset of the 1.37M source (shell + interior).",
        "K015 towers are background silhouettes at ~1.3 km; their 1K textures are not close-up detail.",
        "K046 is used as material/detail reference on the custom port, not as a hero building geometry kit.",
        "Kitbash3D / Modelshop assets are private/offline only; public Web redistribution needs separate licence review.",
        "No K038 vertical stacking, no uniform giant scaling of hero modules, no procedural facade stretch.",
    ],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(manifest, f, indent=1)
print("WROTE", OUT)
