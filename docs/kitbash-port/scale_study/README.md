# Scale study — K039 Sci-Fi Industrial modules

## Source-unit evidence

- The Kitbash3D Sci-Fi Industrial FBX declares `UnitScaleFactor = 0.1` and
  `OriginalUnitScaleFactor = 0.1` (1 unit = 1 mm).
- BldgLG_G raw mesh coordinates reach ~28,566 units. Blender's FBX import applies a
  `0.001` object scale, producing **28.57 m** at 1×.
- 1× source dimensions: G 15.9 × 8.6 × 28.1 m / 904k tris; H 13.0 × 6.6 × 25.3 m /
  1.50M tris; I 22.2 × 11.1 × 17.1 m / 526k tris; J 14.0 × 4.8 × 16.1 m / 227k tris.
- Kitbash3D's public human-scale article shows ~1.8 m figures against these
  façades: `https://kitbash3d.com/a/blog/sci-fi-industial` (human-scale image).
  The 1× interpretation is internally consistent: these are 17–28 m industrial
  structures, not 100 m towers. The product cover art upscales the kit for a
  megacity.

## Fixed references in the study renders

A-30 = 25 m; human = 1.86 m; TLOF = 60 × 60 m. Only the four building modules are
scaled.

| Image | Module scale | G / H / I / J heights |
|---|---|---|
| `study_1x.png` | 1× | 28 / 25 / 17 / 16 m |
| `study_3x.png` | 3× | 84 / 76 / 51 / 48 m |
| `study_5x.png` | 5× | 141 / 127 / 86 / 81 m |

At 1× the 25 m A-30 is comparable to the building height and the modules read as
sheds at port scale. 3× reads as large industrial towers while the ship/pad remain
credible. 5× makes the ship and the 60 m pad look implausibly small. A uniform 10×
(the earlier review build) was rejected: it scaled doors/windows, crowded the pad,
and put low-detail K039 façades right beside the camera.

## Final scene decision — tiered, not uniform

- Hero port foreground is **1:1** and custom: 34 m terminal, 30 m gantry, 25 m
  A-30, 60 m pad, 1.8 m crew; K014/K034 greebles provide close-up detail.
- Midground K039 is **4–5×**: G 140.6 m, H 114.0 m, I 85.5 m, J 80.6 m at
  400–430 m from the pad; greebles/window bands/pipes/roof props dress the lower
  30–100 m.
- Background is **16–25×** single/2-stage K039 LG modules: 475–809 m towers at
  650–740 m from the pad, with structural collars, service spines and greeble
  bands. Their low detail is only seen at distance.

The file-true scale is 1×; the final city is an intentional art-directed tier
hierarchy, not a 10× uniform scale-up.
