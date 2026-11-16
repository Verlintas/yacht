#!/usr/bin/env python3
"""Report final GLB structure/texture stats (no external deps beyond PIL/numpy)."""
import json, struct, sys, hashlib, os
import numpy as np
from PIL import Image
import io

path = sys.argv[1] if len(sys.argv) > 1 else "public/models/candidates/rta_archon.glb"
data = open(path, "rb").read()
magic, version, length = struct.unpack_from("<III", data, 0)
assert magic == 0x46546C67
off = 12
json_chunk = None
bin_chunk = None
while off < length:
    clen, ctype = struct.unpack_from("<II", data, off)
    chunk = data[off + 8 : off + 8 + clen]
    if ctype == 0x4E4F534A:
        json_chunk = json.loads(chunk.decode("utf-8"))
    elif ctype == 0x004E4942:
        bin_chunk = chunk
    off += 8 + clen
print("FILE", path, len(data), "bytes")
print("ASSET", json_chunk.get("asset"))
print("EXT_USED", json_chunk.get("extensionsUsed"))
print("NODES", json_chunk.get("nodes"))
print("MATERIAL", json.dumps(json_chunk.get("materials"), indent=1))
print("SAMPLERS", json_chunk.get("samplers"))
print("ACCESSORS", [(a.get("type"), a.get("componentType"), a.get("count"), a.get("normalized")) for a in json_chunk.get("accessors", [])][:8])

images = json_chunk.get("images", [])
textures = json_chunk.get("textures", [])
views = json_chunk.get("bufferViews", [])
vram = 0
for i, img in enumerate(images):
    bv = views[img["bufferView"]]
    start = bv.get("byteOffset", 0)
    blob = bin_chunk[start : start + bv["byteLength"]]
    im = Image.open(io.BytesIO(blob)).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    flat = a.reshape(-1, 3)
    print(f"IMAGE {i} {img.get('name')} {img.get('mimeType')} {im.size} bytes={len(blob)} sha={hashlib.sha256(blob).hexdigest()[:12]}")
    print("  mean", np.round(flat.mean(0), 2), "median", np.median(flat, axis=0), "p1", np.percentile(flat, 1, axis=0), "p99", np.percentile(flat, 99, axis=0), "max", flat.max(0))
    if "metallic" in (img.get("name") or ""):
        for k, c in enumerate("RGB"):
            print(f"  {c} median", np.median(a[..., k]), "p1", np.percentile(a[..., k], 1), "p99", np.percentile(a[..., k], 99))
    if "emissive" in (img.get("name") or ""):
        mx = a.max(2)
        print("  emissive >16", round(float((mx > 16).mean() * 100), 3), "% >64", round(float((mx > 64).mean() * 100), 3), "% max", mx.max())
    if im.size[0] == 2048 and im.size[1] == 2048:
        vram += 2048 * 2048 * 4 * (4 / 3)
print("VRAM RGBA8+mips 4x2K", round(vram / 1024 / 1024, 2), "MB")
print("TEXTURE SLOTS", [(t.get("extensions"), t.get("source")) for t in textures])
