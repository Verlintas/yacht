"""Write the public manifest for the v2 Nautilus Reach sample.

Run after build_scene.py/render_v2.py:
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
    "Mid_K038_C": "K038 Neo Tokyo 2 / LargeC",
    "Mid_K038_E": "K038 Neo Tokyo 2 / LargeE",
    "Mid_K032_E": "K032 NeoShanghai / BldgLG_E",
    "Mid_K046_G": "K046 Heavy Metal / BldgLG_G",
    "Mid_K046_E": "K046 Heavy Metal / BldgLG_E",
    "Mid_K046_D": "K046 Heavy Metal / BldgLG_D",
}

def with_asset(rows, key="obj"):
    out = []
    for row in rows:
        d = dict(row)
        d["asset"] = ASSET.get(d.get(key), "K039 Sci-Fi Industrial 1:1" if str(d.get(key, "")).startswith("Low_K039") else "custom 1:1")
        out.append(d)
    return out

renders = [
    {"file": "renders/01_wide_port.jpg", "shot": "wide", "label": "Port wide / three native towers",
     "camera": "Cam_Wide", "lens_mm": 24, "loc": [-100, -595, 4.0], "target": [-50, -350, 45]},
    {"file": "renders/02_pad_closeup.jpg", "shot": "pad", "label": "60 m TLOF / A-30",
     "camera": "Cam_Pad", "lens_mm": 50, "loc": [-45, -520, 3.0], "target": [4, -420, 6.5]},
    {"file": "renders/03_aerial_skyline.jpg", "shot": "aerial_low", "label": "Skyline aerial",
     "camera": "Cam_AerialLow", "lens_mm": 35, "loc": [-600, -950, 480], "target": [-30, 80, 160]},
    {"file": "renders/04_terminal_detail.jpg", "shot": "detail", "label": "T2 arrival hall",
     "camera": "Cam_Detail", "lens_mm": 45, "loc": [-110, -560, 4.0], "target": [-145, -485, 8]},
    {"file": "renders/05_hero_facade.jpg", "shot": "hero", "label": "K038 LargeJ facade",
     "camera": "Cam_Hero", "lens_mm": 35, "loc": [245, -270, 2.2], "target": [245, -160, 110]},
    {"file": "renders/06_city_platform.jpg", "shot": "aerial", "label": "1200 m city platform",
     "camera": "Cam_Aerial", "lens_mm": 35, "loc": [-800, -1100, 600], "target": [0, 80, 110]},
    {"file": "renders/07_terminal_approach.jpg", "shot": "termwide", "label": "T2 terminal approach",
     "camera": "Cam_TermWide", "lens_mm": 35, "loc": [-170, -575, 4.8], "target": [-100, -430, 38]},
]

manifest = {
    "sample": "Nautilus Reach v2",
    "status": "authored offline Cycles sample",
    "units": "metres",
    "deck": {
        "size_m": [1200, 1200],
        "top_z": 0.0,
        "retaining_wall_depth_m": 40,
        "terrain_under_city": False,
        "note": "flat city platform; terrain ring only outside the retaining wall",
    },
    "heroes": with_asset(report["heroes"]),
    "secondary_single_buildings": with_asset(report["mids"]),
    "low_rise_1to1": with_asset(report.get("lows", [])),
    "background_skyline": [
        dict(row, asset="K015 Neo Tokyo / 1:100 kit, unit-corrected x100, silhouette only")
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
        "atmosphere": "finite Principled Volume, density 0.00008 /m",
        "compositing": "disabled in-render; final JPG grade applied in post",
    },
    "renders": renders,
    "limitations": [
        "Offline Cycles stills only; the realtime GLB/preview was not rebuilt in this pass.",
        "CommunityCentre terminal uses a 1.03M-tri authored subset of the 1.37M source (shell + interior).",
        "K015 towers are background silhouettes at ~1.3 km; their 1K textures are not used as close-up detail.",
        "Kitbash3D / Modelshop assets are private/offline only; public Web redistribution needs separate licence review.",
        "No K038 vertical stacking, no uniform giant scaling of hero modules, no procedural facade stretch.",
    ],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(manifest, f, indent=1)
print("WROTE", OUT)
