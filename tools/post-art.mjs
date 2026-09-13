#!/usr/bin/env node
// post-art.mjs — 用 Python/Pillow 做可靠的 PNG 解码 + flood-fill 抠图
// 调用 python3 子进程，避免手写 PNG 解码的 filter bug。
// 用法：
//   node tools/post-art.mjs                # 处理 game/art 下全部 png，输出 game/art/final/
//   node tools/post-art.mjs --dry-run       # 只报告
//   node tools/post-art.mjs ui/gift_box.png # 指定相对路径

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ART_DIR = path.join(ROOT, 'game/art');
const OUT_DIR = path.join(ROOT, 'game/art/final');

const PYTHON = `
import sys, os
from PIL import Image
import numpy as np

def paeth(a,b,c):
    p = a+b-c
    pa,pb,pc = abs(p-a),abs(p-b),abs(p-c)
    if pa<=pb and pa<=pc: return a
    if pb<=pc: return b
    return c

def process_one(src, dst, dry_run):
    im = Image.open(src).convert('RGBA')
    w,h = im.size
    arr = np.array(im, dtype=np.uint8)
    r,g,b,a = arr[:,:,0].astype(int), arr[:,:,1].astype(int), arr[:,:,2].astype(int), arr[:,:,3].astype(int)

    # 判断幕色：中心 128x128 外环 + 四边中点 8x8 块
    mid_x, mid_y = w//2, h//2
    rw = min(w,256); rh = min(h,256)
    rx0 = max(0, mid_x - rw//2); ry0 = max(0, mid_y - rh//2)
    rx1 = min(w, mid_x + rw//2); ry1 = min(h, mid_y + rh//2)
    ring = arr[ry0:ry1, rx0:rx1, :3].reshape(-1,3)
    # 四边中点 8x8
    blocks = []
    for bx,by in [(mid_x-16,0),(mid_x-16,h-8),(0,mid_y-16),(w-8,mid_y-16),
                  (mid_x+8,0),(mid_x+8,h-8),(0,mid_y+8),(w-8,mid_y+8)]:
        x0=max(0,bx); y0=max(0,by); x1=min(w,bx+8); y1=min(h,by+8)
        if x1>x0 and y1>y0:
            blocks.append(arr[y0:y1,x0:x1,:3].reshape(-1,3))
    if blocks:
        border = np.vstack(blocks)
    else:
        border = ring
    samples = np.vstack([ring, border]) if len(border) else ring
    mag = ((samples[:,0]>180)&(samples[:,1]<100)&(samples[:,2]>180)).sum()
    total = len(samples)
    mag_pct = mag/total*100 if total else 0
    is_magenta = mag_pct > 5
    key = np.array([255,0,255]) if is_magenta else np.array([255,255,255])
    tol = 40 if is_magenta else 20

    # 距离
    dist = np.sqrt(((arr[:,:,:3].astype(int) - key)**2).sum(axis=2))

    # flood-fill：从四边入队，4 邻域
    visited = np.zeros((h,w), dtype=bool)
    # 初始化队列：四边
    q = []
    for x in range(w):
        for y in [0, h-1]:
            if dist[y,x]<=tol and a[y,x]>0:
                q.append((x,y))
    for y in range(h):
        for x in [0, w-1]:
            if dist[y,x]<=tol and a[y,x]>0:
                q.append((x,y))
    # BFS
    from collections import deque
    dq = deque(q)
    filled = 0
    while dq:
        x,y = dq.popleft()
        if visited[y,x]: continue
        visited[y,x] = True
        filled += 1
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny = x+dx,y+dy
            if 0<=nx<w and 0<=ny<h and not visited[ny,nx]:
                if dist[ny,nx]<=tol and a[ny,nx]>0:
                    dq.append((nx,ny))

    # 把 flood-fill 到的像素设透明
    arr[:,:,3] = np.where(visited, 0, a)

    # despill（品红幕）
    if is_magenta:
        mag_diff = np.minimum(arr[:,:,0].astype(int), arr[:,:,2].astype(int)) - arr[:,:,1].astype(int)
        edge = np.zeros((h,w), dtype=bool)
        edge[1:-1,:] |= visited[:-2,:]  # 简化：靠近 flood 区域的边缘
        edge[:-2,:] |= visited[2:,:]
        mask = (mag_diff>30) & (arr[:,:,3]>0) & (
            np.roll(visited,1,axis=1)|np.roll(visited,-1,axis=1)|np.roll(visited,1,axis=0)|np.roll(visited,-1,axis=0))
        t = np.clip(mag_diff,0,60)*0.5
        arr[:,:,0] = np.where(mask, np.clip(arr[:,:,0].astype(int)-t*0.5,0,255).astype(np.uint8), arr[:,:,0])
        arr[:,:,1] = np.where(mask, np.clip(arr[:,:,1].astype(int)+t,0,255).astype(np.uint8), arr[:,:,1])
        arr[:,:,2] = np.where(mask, np.clip(arr[:,:,2].astype(int)-t*0.5,0,255).astype(np.uint8), arr[:,:,2])

    # 紧凑裁剪（留 2px 边距）
    alpha = arr[:,:,3]
    ys,xs = np.where(alpha>0)
    if len(xs)==0:
        box = (0,0,w,h)
    else:
        minx = max(0, xs.min()-2); miny = max(0, ys.min()-2)
        maxx = min(w-1, xs.max()+2); maxy = min(h-1, ys.max()+2)
        box = (minx, miny, maxx+1, maxy+1)
    cropped = np.array(Image.fromarray(arr).crop(box), dtype=np.uint8)

    # 降采样到最大边 256
    ch,cw = cropped.shape[:2]
    if max(cw,ch)>256:
        scale = 256/max(cw,ch)
        nw = max(1,round(cw*scale)); nh = max(1,round(ch*scale))
        cropped = np.array(Image.fromarray(cropped).resize((nw,nh), Image.LANCZOS), dtype=np.uint8)

    if not dry_run:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        Image.fromarray(cropped).save(dst)

    opaque = int((cropped[:,:,3]>128).sum())
    total_px = cropped.shape[0]*cropped.shape[1]
    print(f"{os.path.relpath(src, os.path.dirname(src))}")
    print(f"key={'magenta' if is_magenta else 'white'} tol={tol} filled={filled} crop={cropped.shape[1]}x{cropped.shape[0]} opaque={opaque/total_px*100:.1f}%")
`

function findAllPngs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === 'final' || e.name === 'crops.bak' || e.name === 'node_modules') continue;
      findAllPngs(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.png')) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const specific = args.filter((a) => !a.startsWith('--'));
  const files = specific.length
    ? specific.map((rel) => path.join(ART_DIR, rel))
    : findAllPngs(ART_DIR);

  console.log(`found ${files.length} png files, dry_run=${dryRun}`);

  // 生成 Python 脚本
  const pyScript = path.join(ROOT, 'tools', '_post_art_worker.py');
  fs.writeFileSync(pyScript, PYTHON);

  for (const file of files) {
    const rel = path.relative(ART_DIR, file);
    const outPath = path.join(OUT_DIR, rel);
    const cmd = `python3 ${JSON.stringify(pyScript)} ${JSON.stringify(file)} ${JSON.stringify(outPath)} ${dryRun ? '1' : '0'}`;
    try {
      const out = execSync(cmd, { encoding: 'utf8', timeout: 60000 }).trim();
      console.log(out);
    } catch (e) {
      console.log(`  ${rel}: ERROR ${e.message.slice(0, 200)}`);
    }
  }
}

main();
