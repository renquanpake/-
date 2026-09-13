#!/usr/bin/env python3
"""post-art.py — 抠图 + 后处理（Pillow 版）

对 game/art/ 下所有 PNG：
  1. 自动检测幕色（品红 / 白）
  2. 从边界 flood-fill 移除与边界连通的幕色像素
  3. 品红幕做 despill
  4. 紧凑裁剪（留 2px 边距）
  5. 降采样到最大边 256
  6. 输出到 game/art/final/

用法：
  python3 tools/post-art.py                    # 全部
  python3 tools/post-art.py --dry-run          # 只报告
  python3 tools/post-art.py ui/gift_box.png    # 指定相对路径
"""
import os
import sys
from collections import deque
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART_DIR = os.path.join(ROOT, "game", "art")
OUT_DIR = os.path.join(ART_DIR, "final")

SKIP_DIRS = {"final", "crops.bak", "node_modules"}


def find_pngs(d):
    out = []
    for name in sorted(os.listdir(d)):
        p = os.path.join(d, name)
        if os.path.isdir(p):
            if name in SKIP_DIRS:
                continue
            out.extend(find_pngs(p))
        elif name.endswith(".png"):
            out.append(p)
    return out


def detect_key_color(arr, w, h):
    """
    返回 (is_magenta, key_color)
    采样策略：四边中点 8x8 块 + 中心外环
    """
    mid_x, mid_y = w // 2, h // 2

    # 四边中点 8x8 块
    border_pixels = []
    for bx, by in [
        (mid_x - 16, 0), (mid_x - 16, h - 8),
        (0, mid_y - 16), (w - 8, mid_y - 16),
        (mid_x + 8, 0), (mid_x + 8, h - 8),
        (0, mid_y + 8), (w - 8, mid_y + 8),
    ]:
        x0, x1 = max(0, bx), min(w, bx + 8)
        y0, y1 = max(0, by), min(h, by + 8)
        if x1 > x0 and y1 > y0:
            block = arr[y0:y1, x0:x1, :3]
            border_pixels.append(block.reshape(-1, 3))

    if not border_pixels:
        return False, np.array([255, 255, 255])

    samples = np.vstack(border_pixels)
    r, g, b = samples[:, 0], samples[:, 1], samples[:, 2]
    mag_count = int(((r > 180) & (g < 100) & (b > 180)).sum())
    mag_pct = mag_count / len(samples) * 100

    if mag_pct > 5:
        return True, np.array([255, 0, 255])
    return False, np.array([255, 255, 255])


def flood_fill_remove(arr, w, h, key, tol):
    """从四边 flood-fill，移除与边界连通的幕色像素。返回 visited mask。"""
    dist = np.sqrt(((arr[:, :, :3].astype(np.int32) - key) ** 2).sum(axis=2))
    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            if dist[y, x] <= tol and arr[y, x, 3] > 0:
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if dist[y, x] <= tol and arr[y, x, 3] > 0:
                q.append((x, y))

    while q:
        x, y = q.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                if dist[ny, nx] <= tol and arr[ny, nx, 3] > 0:
                    q.append((nx, ny))

    arr[visited, 3] = 0
    return visited


def despill_magenta(arr, visited, w, h):
    """对靠近透明区域的品红色像素做 despill。"""
    r = arr[:, :, 0].astype(np.int32)
    g = arr[:, :, 1].astype(np.int32)
    b = arr[:, :, 2].astype(np.int32)
    a = arr[:, :, 3]

    mag_diff = np.minimum(r, b) - g
    # 靠近透明区域的实心像素
    near_transparent = (
        np.roll(visited, 1, axis=1) | np.roll(visited, -1, axis=1) |
        np.roll(visited, 1, axis=0) | np.roll(visited, -1, axis=0)
    )
    mask = (mag_diff > 30) & (a > 0) & near_transparent
    t = np.clip(mag_diff, 0, 60) * 0.5

    arr[:, :, 0] = np.where(mask, np.clip(r - t * 0.5, 0, 255), arr[:, :, 0])
    arr[:, :, 1] = np.where(mask, np.clip(g + t, 0, 255), arr[:, :, 1])
    arr[:, :, 2] = np.where(mask, np.clip(b - t * 0.5, 0, 255), arr[:, :, 2])


def tight_crop(arr, pad=2):
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return arr
    minx = max(0, int(xs.min()) - pad)
    miny = max(0, int(ys.min()) - pad)
    maxx = min(arr.shape[1] - 1, int(xs.max()) + pad)
    maxy = min(arr.shape[0] - 1, int(ys.max()) + pad)
    return arr[miny:maxy + 1, minx:maxx + 1]


def downscale_256(arr):
    h, w = arr.shape[:2]
    if max(w, h) <= 256:
        return arr
    scale = 256 / max(w, h)
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    return np.array(Image.fromarray(arr).resize((nw, nh), Image.LANCZOS), dtype=np.uint8)


def process_one(src, dst, dry_run):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    arr = np.array(im, dtype=np.uint8).copy()

    is_mag, key = detect_key_color(arr, w, h)
    tol = 40 if is_mag else 25

    # 抠图前统计
    dist_before = np.sqrt(((arr[:, :, :3].astype(np.int32) - key) ** 2).sum(axis=2))
    bg_before = int(((dist_before <= tol) & (arr[:, :, 3] > 128)).sum())

    visited = flood_fill_remove(arr, w, h, key, tol)
    if is_mag:
        despill_magenta(arr, visited, w, h)

    # 抠图后统计
    opaque_after = int((arr[:, :, 3] > 128).sum())

    cropped = tight_crop(arr)
    result = downscale_256(cropped)

    if not dry_run:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        Image.fromarray(result).save(dst)

    out_w, out_h = result.shape[1], result.shape[0]
    opaque_final = int((result[:, :, 3] > 128).sum())
    rel = os.path.relpath(src, ART_DIR)
    print(
        f"  {rel}: key={'magenta' if is_mag else 'white'} tol={tol} "
        f"bg_before={bg_before / (w * h) * 100:.1f}% "
        f"opaque_after={opaque_after / (w * h) * 100:.1f}% "
        f"out={out_w}x{out_h} opaque_final={opaque_final / (out_w * out_h) * 100:.1f}%"
    )


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv[1:]

    if args:
        files = [os.path.join(ART_DIR, a) for a in args]
    else:
        files = find_pngs(ART_DIR)

    print(f"found {len(files)} png files, dry_run={dry_run}")
    for f in files:
        if not os.path.exists(f):
            print(f"  skip (not found): {os.path.relpath(f, ART_DIR)}")
            continue
        try:
            dst = os.path.join(OUT_DIR, os.path.relpath(f, ART_DIR))
            process_one(f, dst, dry_run)
        except Exception as e:
            print(f"  {os.path.relpath(f, ART_DIR)}: ERROR {e}")


if __name__ == "__main__":
    main()
