#!/usr/bin/env python3
"""
从标注过的四视图里读取武器/喷口位置。

用法：
  python3 scripts/read-markers.py ~/Documents/ship-sheets/grid/xxx.png

约定：
  红色标记 = 武器（#ff3040 附近）
  蓝色标记 = 喷口（#3070ff 附近）
  青色标记 = 座舱/舰桥
  标记画成实心圆点或十字即可，脚本取每个色块的质心。

输出：每艘船一份 YAML 片段，坐标已换算成游戏局部坐标
（+X 右 / +Y 上 / -Z 机首，原点在舰体几何中心，单位米）。
"""
import sys
import json
import math
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit('需要 Pillow：pip3 install pillow')

META = Path('/tmp/grid-sheets/meta.json')
CELL = 1024

# Blender 相机 → 图像轴映射
# (水平轴名, 水平正方向, 垂直轴名, 垂直正方向)
VIEW_AXES = {
    'front': ('x', 1, 'z', 1),
    'top': ('x', 1, 'y', 1),
    'left': ('y', 1, 'z', 1),
    'back': ('x', -1, 'z', 1),
}

MARKERS = {
    'weapon': (255, 48, 64),
    'nozzle': (48, 112, 255),
    'cockpit': (48, 220, 220),
}


def close(pixel, target, tol=70):
    return all(abs(pixel[i] - target[i]) <= tol for i in range(3))


def find_blobs(img, target, tol=70, min_pixels=12):
    w, h = img.size
    px = img.load()
    seen = set()
    blobs = []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if (x, y) in seen:
                continue
            if not close(px[x, y], target, tol):
                continue
            stack = [(x, y)]
            seen.add((x, y))
            pts = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
                    nx, ny = cx + dx, cy + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    if (nx, ny) in seen:
                        continue
                    if close(px[nx, ny], target, tol):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(pts) >= min_pixels:
                blobs.append(pts)
    out = []
    for pts in blobs:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        out.append((cx, cy))
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit('用法: python3 scripts/read-markers.py <标注图.png>')

    path = Path(sys.argv[1]).expanduser()
    meta = {m['object']: m for m in json.loads(META.read_text())}

    stem = path.stem.replace('_grid', '')
    ship = None
    for key, value in meta.items():
        if key in stem or value['label'] in stem:
            ship = value
            break
    if ship is None:
        raise SystemExit(f'找不到对应舰船：{stem}')

    m_per_px = (ship['ortho'] / CELL) * (ship['length_m'] / ship['maxdim'])
    img = Image.open(path).convert('RGB')

    cells = {'front': (0, 0), 'top': (1, 0), 'left': (0, 1), 'back': (1, 1)}
    found = {}

    for view, (cx, cy) in cells.items():
        cell = img.crop((cx * CELL, cy * CELL, (cx + 1) * CELL, (cy + 1) * CELL))
        for kind, color in MARKERS.items():
            for bx, by in find_blobs(cell, color):
                h_axis, h_sign, v_axis, v_sign = VIEW_AXES[view]
                h_val = (bx - CELL / 2) * m_per_px * h_sign
                v_val = (CELL / 2 - by) * m_per_px * v_sign
                entry = found.setdefault((kind, round(h_val, 1), round(v_val, 1)), [])
                entry.append((view, h_axis, v_axis, h_val, v_val))

    print(f'# {ship["label"]}  全长 {ship["length_m"]:.0f} m  网格比例 {m_per_px:.3f} m/px')
    for (kind, _, _), views in sorted(found.items()):
        print(f'{kind}:')
        for view, h_axis, v_axis, h_val, v_val in views:
            print(f'  {view:5}  {h_axis}={h_val:+.1f}  {v_axis}={v_val:+.1f}')


if __name__ == '__main__':
    main()
