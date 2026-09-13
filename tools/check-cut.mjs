// check-cut.mjs — 检查抠图结果是否存在内部误透明像素
// 检测：在 alpha>0 区域内部，是否存在被抠掉的洞（四邻全是 alpha>0 但自身 alpha==0）
// 用法：node tools/check-cut.mjs [rel1 rel2 ...]  不传则检查 final/ 下全部
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FINAL_DIR = path.join(ROOT, 'game/art/final');

// 复用 post-art 的 PNG 读取
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function readPNG(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data.readUInt8(9); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const cpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const px = new Uint8Array(width * height * 4);
  const rowSize = width * cpp;
  const prevRow = new Uint8Array(rowSize);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowSize + 1)];
    const base = y * (rowSize + 1) + 1;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = x >= cpp ? px[(i - cpp) * 4] : 0;
      const a = y > 0 ? prevRow[x * cpp] : 0;
      const b = (x >= cpp && y > 0) ? prevRow[(x - cpp) * cpp] : 0;
      const c = x >= 1 ? px[(i - 1) * 4] : 0;
      let r = 0, g = 0, bl = 0, al = 255;
      const dec = (off) => {
        let v = raw[base + off];
        if (filter === 1) v = (v + p) & 0xff;
        else if (filter === 2) v = (v + a) & 0xff;
        else if (filter === 3) v = (v + ((p + a) >> 1)) & 0xff;
        else if (filter === 4) v = (v + paeth(p, a, b, c)) & 0xff;
        return v;
      };
      if (colorType === 6) { r = dec(x*4); g = dec(x*4+1); bl = dec(x*4+2); al = dec(x*4+3); }
      else if (colorType === 2) { r = dec(x*3); g = dec(x*3+1); bl = dec(x*3+2); }
      else if (colorType === 4) { const v = dec(x*2); r = g = bl = v; al = dec(x*2+1); }
      else { const v = dec(x); r = g = bl = v; }
      px[i*4] = r; px[i*4+1] = g; px[i*4+2] = bl; px[i*4+3] = al;
    }
    for (let x = 0; x < width; x++) for (let ch = 0; ch < cpp; ch++) prevRow[x*cpp+ch] = px[y*width*4+x*4+ch];
  }
  return { width, height, px };
}

// 检测内部误透明：alpha==0 且 4 邻（在边界内）全 alpha>0 的像素，且距离边界 >= 3
function checkInternalHoles(w, h, px) {
  const holes = [];
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const i = y * w + x;
      if (px[i * 4 + 3] !== 0) continue;
      // 四邻全不透明
      const n4 = [
        px[(i - 1) * 4 + 3], px[(i + 1) * 4 + 3],
        px[(i - w) * 4 + 3], px[(i + w) * 4 + 3],
      ];
      if (n4.every((a) => a > 128)) holes.push([x, y]);
    }
  }
  return holes;
}

// 生成 2x2 诊断图：原图 | 抠图棋盘 | 误透明高亮(红) | 四角放大
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
function scale(w, h, px, tw) {
  const th = Math.round(h * tw / w);
  const out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const sx = Math.min(w - 1, Math.round(x * w / tw));
    const sy = Math.min(h - 1, Math.round(y * h / th));
    const si = (sy * w + sx) * 4, di = (y * tw + x) * 4;
    out[di] = px[si]; out[di+1] = px[si+1]; out[di+2] = px[si+2]; out[di+3] = px[si+3];
  }
  return { w: tw, h: th, px: out };
}

function makeDiag(srcRel, outDir) {
  const artDir = path.join(ROOT, 'game/art');
  const src = path.join(artDir, srcRel);
  const finalRel = srcRel;
  const fin = path.join(FINAL_DIR, finalRel);
  const { width: w, height: h, px: cut } = readPNG(fin);
  const { width: ow, height: oh, px: orig } = readPNG(src);

  // 误透明检测
  const holes = checkInternalHoles(w, h, cut);

  // 面板 256
  const panel = 256, pad = 8;
  const gx = panel * 2 + pad, gy = panel * 2 + pad;
  const grid = Buffer.alloc(gx * gy * 4);
  for (let i = 0; i < grid.length; i += 4) { grid[i]=210; grid[i+1]=210; grid[i+2]=210; grid[i+3]=255; }

  const place = (srcW, srcH, srcPx, ox, oy, mode) => {
    const s = scale(srcW, srcH, srcPx, panel);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const si = (y * s.w + x) * 4, di = ((oy + y) * gx + (ox + x)) * 4;
      const a = s.px[si + 3] / 255;
      if (mode === 'checker') {
        const bg = ((x >> 3) + (y >> 3)) % 2 === 0 ? 235 : 185;
        grid[di] = s.px[si] * a + bg * (1 - a);
        grid[di+1] = s.px[si+1] * a + bg * (1 - a);
        grid[di+2] = s.px[si+2] * a + bg * (1 - a);
      } else if (mode === 'holes') {
        // 原图叠红高亮（对应洞的位置）
        grid[di] = s.px[si]; grid[di+1] = s.px[si+1]; grid[di+2] = s.px[si+2];
      } else {
        grid[di] = s.px[si]; grid[di+1] = s.px[si+1]; grid[di+2] = s.px[si+2];
        grid[di+3] = 255;
      }
      grid[di+3] = 255;
    }
  };

  // 1 原图
  place(ow, oh, orig, 0, 0, 'flat');
  // 2 抠图棋盘
  place(w, h, cut, panel + pad, 0, 'checker');
  // 3 原图 + 洞高亮（红点）
  const holeSet = new Set(holes.map(([x, y]) => `${x},${y}`));
  const hl = Buffer.from(orig); // 原图副本
  for (const [x, y] of holes) {
    // 把原图对应位置（比例映射到裁剪后的 w/h）染红
    const mx = Math.round(x * ow / w), my = Math.round(y * oh / h);
    if (mx < ow && my < oh) {
      const hi = (my * ow + mx) * 4;
      hl[hi] = 255; hl[hi+1] = 0; hl[hi+2] = 0;
    }
  }
  place(ow, oh, hl, 0, panel + pad, 'flat');
  // 4 抠图灰底
  place(w, h, cut, panel + pad, panel + pad, 'flat');

  const outName = path.join(outDir, srcRel.replace(/\//g, '_').replace('.png', '') + '_diag.png');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outName, encodePNG(gx, gy, grid));
  return { holes: holes.length, outName, w, h };
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const outDir = '/tmp/opencode/diag';
  const specific = args.length ? args : null;

  if (specific) {
    for (const rel of specific) {
      const r = makeDiag(rel, outDir);
      console.log(`${rel}: internal_holes=${r.holes} final=${r.w}x${r.h} -> ${r.outName}`);
    }
  } else {
    // 全部 final 检查
    const all = [];
    function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.name.endsWith('.png')) all.push(path.relative(FINAL_DIR, path.join(d, e.name)));
      }
    }
    walk(FINAL_DIR);
    let totalHoles = 0, badFiles = 0;
    for (const rel of all) {
      const r = makeDiag(rel, outDir);
      if (r.holes > 0) { totalHoles += r.holes; badFiles++; console.log(`  ${rel}: HOLE ${r.holes}`); }
    }
    console.log(`\n${all.length} files checked, ${badFiles} with internal holes, total hole pixels ${totalHoles}`);
  }
}

main();
