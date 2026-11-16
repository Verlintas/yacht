#!/usr/bin/env python3
"""Ensure occlusionTexture and metallicRoughnessTexture share one texture entry.

gltf-transform 4.5 writes a second texture entry when the same Texture object is
used by two material slots; Three.js keys its texture cache by glTF texture
index, so that would upload the ORM image twice (extra 22 MB at 2K RGBA8).
This patch rewrites the JSON chunk, drops unused texture entries, and remaps all
material texture indices. BIN chunk is untouched.
"""
import json, struct, sys, os

def read_glb(path):
    data = open(path, "rb").read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2
    off = 12
    chunks = []
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        chunks.append((ctype, data[off + 8 : off + 8 + clen]))
        off += 8 + clen
    return chunks

def write_glb(path, chunks):
    out = bytearray()
    total = 12 + sum(8 + len(c) for _, c in chunks)
    out += struct.pack("<III", 0x46546C67, 2, total)
    for ctype, c in chunks:
        pad = (4 - (len(c) % 4)) % 4
        c = c + (b" " if ctype == 0x4E4F534A else b"\x00") * pad
        out += struct.pack("<II", len(c), ctype) + c
    with open(path, "wb") as f:
        f.write(out)

path = sys.argv[1]
chunks = read_glb(path)
json_idx = next(i for i, (t, _) in enumerate(chunks) if t == 0x4E4F534A)
j = json.loads(chunks[json_idx][1].decode("utf-8"))

# Point occlusion at the same texture index as metallicRoughness when identical.
for mat in j.get("materials", []):
    pbr = mat.get("pbrMetallicRoughness", {})
    occ = mat.get("occlusionTexture")
    mr = pbr.get("metallicRoughnessTexture")
    if occ and mr:
        oi, mi = occ.get("index"), mr.get("index")
        if oi != mi:
            j["textures"][oi] = j["textures"][mi]
            occ["index"] = mi

# Collect every texture index referenced by materials.
used = set()
def note(info):
    if info and "index" in info:
        used.add(info["index"])
for mat in j.get("materials", []):
    pbr = mat.get("pbrMetallicRoughness", {})
    for info in [pbr.get("baseColorTexture"), pbr.get("metallicRoughnessTexture"),
                 mat.get("normalTexture"), mat.get("occlusionTexture"), mat.get("emissiveTexture")]:
        note(info)
    for ext in mat.get("extensions", {}).values():
        if isinstance(ext, dict):
            for v in ext.values():
                if isinstance(v, dict):
                    note(v)

# Remap used indices, drop unused textures.
remap = {}
new_textures = []
for old in sorted(used):
    remap[old] = len(new_textures)
    new_textures.append(j["textures"][old])

def remap_info(info):
    if info and "index" in info:
        info["index"] = remap[info["index"]]
for mat in j.get("materials", []):
    pbr = mat.get("pbrMetallicRoughness", {})
    for info in [pbr.get("baseColorTexture"), pbr.get("metallicRoughnessTexture"),
                 mat.get("normalTexture"), mat.get("occlusionTexture"), mat.get("emissiveTexture")]:
        remap_info(info)
j["textures"] = new_textures

chunks[json_idx] = (0x4E4F534A, json.dumps(j, separators=(",", ":")).encode("utf-8"))
write_glb(path, chunks)
print("textures", len(new_textures), "occlusion", j["materials"][0].get("occlusionTexture"),
      "mr", j["materials"][0]["pbrMetallicRoughness"].get("metallicRoughnessTexture"),
      "size", os.path.getsize(path))
