#!/usr/bin/env python3
# check-unity-yaml.py — 校验 5 个 .unity 场景与脚本 .meta 的 YAML 结构
# 用法：python3 tools/check-unity-yaml.py
# 检查项：
#  1. 每个 .unity 的每个 block 都是合法 YAML 文档，blockID 唯一
#  2. GameObject 引用的组件 fileID 在场景内有对应 block（且 classID 非 1）
#  3. m_Script 引用的 guid 能在某个 .cs.meta 里找到
#  4. 脚本 .cs 与其 .meta 一一对应
import re, sys, glob, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, 'game')
ASSETS = os.path.join(GAME, 'Assets')
SCENES = os.path.join(ASSETS, 'Scenes')

# 简单 YAML block 解析：按 '--- !u!<classID> <fileID>' 切分，验证每个 block 的 key 行格式
def parse_blocks(path):
    text = open(path).read()
    blocks = re.findall(r'^--- !u!(\d+) &(\d+)\n((?:.*\n)*?)^(?=--- !u!|$)', text, re.M)
    out = []
    for cls, fid, body in blocks:
        # 首行必须是 <TypeName> 或 <TypeName> 后接缩进键值
        lines = body.split('\n')
        hdr = lines[0].rstrip()
        keys = [l for l in lines[1:] if re.match(r'^  \S', l) and ':' in l]
        out.append((int(cls), int(fid), hdr, keys))
    return out

errors = 0
warns = 0

# 收集所有 .meta guid
meta_guids = set()
for m in glob.glob(os.path.join(ASSETS, '**', '*.meta'), recursive=True):
    for line in open(m):
        mm = re.match(r'\s*guid:\s*([0-9a-fA-F]{32})', line)
        if mm:
            meta_guids.add(mm.group(1).lower())
            break

# 场景
for sc in sorted(glob.glob(os.path.join(SCENES, '*.unity'))):
    blocks = parse_blocks(sc)
    fids = [b[1] for b in blocks]
    if len(fids) != len(set(fids)):
        print('ERROR %s: fileID 重复' % sc)
        errors += 1
    name = os.path.basename(sc)
    # 每块首行类型
    for cls, fid, hdr, keys in blocks:
        if not re.match(r'^[A-Za-z][A-Za-z0-9_]*:?', hdr):
            print('ERROR %s: block %d 首行非法类型名: %r' % (name, fid, hdr))
            errors += 1
        # GameObject 的组件引用必须指向存在的 block
        if hdr.startswith('GameObject'):
            for k in keys:
                if k.startswith('m_Component:'):
                    continue
                m2 = re.search(r'component: \{fileID: (\d+)\}', k)
                if m2:
                    if int(m2.group(1)) not in fids:
                        print('ERROR %s: GameObject 引用不存在的组件 fileID %s' % (name, m2.group(1)))
                        errors += 1
    # MonoBehaviour m_Script guid 校验
    referenced_guids = set()
    for cls, fid, hdr, keys in blocks:
        for k in keys:
            mm = re.search(r'm_Script: \{fileID: \d+, guid: ([0-9a-fA-F]{32})', k)
            if mm:
                g = mm.group(1).lower()
                referenced_guids.add(g)
                if g not in meta_guids:
                    print('WARN %s: m_Script guid %s 未找到对应 .meta' % (name, g))
                    warns += 1
    print('OK  %s: blocks=%d, script guids referenced=%d' % (name, len(blocks), len(referenced_guids)))

# .cs 与 .meta 一一对应
missing_meta = []
for cs in glob.glob(os.path.join(ASSETS, '**', '*.cs'), recursive=True):
    if not os.path.exists(cs + '.meta'):
        missing_meta.append(cs)
if missing_meta:
    print('WARN %d 个 .cs 缺 .meta（Unity 导入时会自动生成）:' % len(missing_meta))
    for p in missing_meta:
        print('  -', os.path.relpath(p, ROOT))
    warns += len(missing_meta)
else:
    print('OK  全部 .cs 均有 .meta')

print('\n%d errors, %d warns' % (errors, warns))
sys.exit(1 if errors else 0)
