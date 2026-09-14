#!/usr/bin/env node
// gen-scenes.mjs — 生成 5 个 Unity 场景的 YAML 骨架 + 为脚本预生成 .meta（确定性 guid）
// 用法：node tools/gen-scenes.mjs
//
// 改进说明（2026-09-14）：
//  1. 为 game/Assets 下全部 .cs 脚本预生成 .meta（MonoImporter 格式，guid 由
//     文件相对路径哈希确定性生成，重跑幂等）。Unity 导入时尊重已有 .meta，
//     场景 m_Script 即可引用真实 guid，打开场景自动挂载脚本，无需手动拖。
//  2. 场景 YAML 补全标准字段（m_CorrespondingSourceObject/m_PrefabInstance/
//     m_PrefabAsset 等），避免导入告警。
//  3. RenderSettings/LightingSettings 块按 Unity 2021+ classID 输出（104/105）。
//
// 注意：.cs 之外资产（PNG 等）的 .meta 不预生成，交给 Unity 首次导入自动生成，
// 避免手写 TextureImporter 字段不全导致导入异常。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GAME = path.join(ROOT, 'game');
const ASSETS = path.join(GAME, 'Assets');
const SCENES = path.join(ASSETS, 'Scenes');
fs.mkdirSync(SCENES, { recursive: true });

// 确定性 guid：取 relPath 的 sha1 前 32 位 hex（Unity guid 即 32 位 hex 或带分隔符；用纯 hex 合法）
function guidFor(relPath) {
  return crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 32);
}

// ---------- 1. 脚本 .meta（幂等：内容一致则不写） ----------
function collectFiles(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function writeScriptMetas() {
  const scripts = collectFiles(ASSETS, '.cs');
  const written = [];
  for (const cs of scripts) {
    const rel = path.relative(ASSETS, cs); // 如 Scripts/Core/GameManager.cs
    const guid = guidFor('cs:' + rel);
    const metaPath = cs + '.meta';
    const content = [
      'fileFormatVersion: 2',
      'guid: ' + guid,
      'MonoImporter:',
      '  externalObjects: {}',
      '  serializedVersion: 2',
      '  defaultReferences: []',
      '  executionOrder: 0',
      '  icon: {instanceID: 0}',
      '  userData: ',
      '  assetBundleName: ',
      '  assetBundleVariant: ',
      '',
    ].join('\n');
    if (!fs.existsSync(metaPath) || fs.readFileSync(metaPath, 'utf8') !== content) {
      fs.writeFileSync(metaPath, content);
      written.push(metaPath);
    }
  }
  return written;
}

// 读回 .cs 的 guid（场景 m_Script 引用）。
// 兼容两种 .meta：本次脚本生成的（guid 在行首）与 Unity 编辑器已生成的（guid: 带缩进）。
function scriptGuid(csAbsPath) {
  const metaPath = csAbsPath + '.meta';
  if (!fs.existsSync(metaPath)) return '00000000000000000000000000000000';
  const m = fs.readFileSync(metaPath, 'utf8').match(/^guid:\s*([0-9a-f]{32})/m);
  if (m) return m[1];
  const m2 = fs.readFileSync(metaPath, 'utf8').match(/^\s+guid:\s*([0-9a-f]{32})/m);
  return m2 ? m2[1] : '00000000000000000000000000000000';
}

const scriptGuids = {
  GameManager: scriptGuid(path.join(ASSETS, 'Scripts', 'Core', 'GameManager.cs')),
  FarmController: scriptGuid(path.join(ASSETS, 'Scripts', 'Farm', 'FarmController.cs')),
  LevelMapController: scriptGuid(path.join(ASSETS, 'Scripts', 'Challenge', 'LevelMapController.cs')),
  QuizUI: scriptGuid(path.join(ASSETS, 'Scripts', 'UI', 'QuizUI.cs')),
  EconomyController: scriptGuid(path.join(ASSETS, 'Scripts', 'Core', 'EconomyController.cs')),
  StatsController: scriptGuid(path.join(ASSETS, 'Scripts', 'Core', 'StatsController.cs')),
};

// ---------- 2. 场景定义 ----------
const SCENE_DEFS = [
  { name: 'Boot', objects: [
    { label: 'GameManager', comps: ['GameManager'] },
  ]},
  { name: 'Farm', objects: [
    { label: 'FarmRoot', comps: ['FarmController'] },
    { label: 'MainCamera', comps: ['__Camera'] },
  ]},
  { name: 'Challenge', objects: [
    { label: 'ChallengeRoot', comps: ['LevelMapController', 'QuizUI'] },
    { label: 'MainCamera', comps: ['__Camera'] },
  ]},
  { name: 'Shop', objects: [
    { label: 'ShopRoot', comps: ['EconomyController'] },
  ]},
  { name: 'Stats', objects: [
    { label: 'StatsRoot', comps: ['StatsController'] },
  ]},
];

// 各场景 m_Script 字段（UnityEditor scene 组件：按名称查 guid，__Camera 无脚本）
function scriptRef(comp) {
  return scriptGuids[comp] || '00000000000000000000000000000000';
}

// ---------- 3. 场景 YAML 生成 ----------
function sceneYaml(def) {
  const lines = [];
  const blockIds = [];
  let nextId = 100;
  const takeId = () => {
    let id = nextId++;
    while (blockIds.includes(id)) id = nextId++;
    blockIds.push(id);
    return id;
  };

  lines.push('%YAML 1.1');

  // RootObject：场景根（空）
  const rootGo = takeId();
  const rootTf = takeId();
  lines.push(`--- !u!1 &${rootGo}`);
  lines.push('GameObject:');
  lines.push('  m_ObjectHideFlags: 0');
  lines.push('  m_CorrespondingSourceObject: {fileID: 0}');
  lines.push('  m_PrefabInstance: {fileID: 0}');
  lines.push('  m_PrefabAsset: {fileID: 0}');
  lines.push('  serializedVersion: 6');
  lines.push('  m_Component:');
  lines.push(`  - component: {fileID: ${rootTf}}`);
  lines.push('  m_Layer: 0');
  lines.push('  m_Name: RootObject');
  lines.push('  m_TagString: Untagged');
  lines.push('  m_Icon: {fileID: 0}');
  lines.push('  m_NavMeshLayer: 0');
  lines.push('  m_StaticEditorFlags: 0');
  lines.push('  m_IsActive: 1');
  lines.push(`--- !u!4 &${rootTf}`);
  lines.push('Transform:');
  lines.push('  m_ObjectHideFlags: 0');
  lines.push('  m_CorrespondingSourceObject: {fileID: 0}');
  lines.push('  m_PrefabInstance: {fileID: 0}');
  lines.push('  m_PrefabAsset: {fileID: 0}');
  lines.push('  m_GameObject: {fileID: ' + rootGo + '}');
  lines.push('  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}');
  lines.push('  m_LocalPosition: {x: 0, y: 0, z: 0}');
  lines.push('  m_LocalScale: {x: 1, y: 1, z: 1}');
  lines.push('  m_Children: []');
  lines.push('  m_Father: {fileID: 0}');
  lines.push('  m_RootOrder: 0');
  lines.push('  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}');

  // RenderSettings (classID 104) / LightingSettings (classID 105)
  const rs = takeId();
  const ls = takeId();
  lines.push(`--- !u!104 &${rs}`);
  lines.push('RenderSettings:');
  lines.push('  m_ObjectHideFlags: 0');
  lines.push('  serializedVersion: 9');
  lines.push(`--- !u!105 &${ls}`);
  lines.push('LightingSettings:');
  lines.push('  m_ObjectHideFlags: 0');
  lines.push('  serializedVersion: 3');

  // 业务对象
  for (const o of def.objects) {
    const goId = takeId();
    const tfId = takeId();
    const compIds = o.comps.map(() => takeId());

    lines.push(`--- !u!1 &${goId}`);
    lines.push('GameObject:');
    lines.push('  m_ObjectHideFlags: 0');
    lines.push('  m_CorrespondingSourceObject: {fileID: 0}');
    lines.push('  m_PrefabInstance: {fileID: 0}');
    lines.push('  m_PrefabAsset: {fileID: 0}');
    lines.push('  serializedVersion: 6');
    lines.push('  m_Component:');
    lines.push(`  - component: {fileID: ${tfId}}`);
    compIds.forEach((cid) => lines.push(`  - component: {fileID: ${cid}}`));
    lines.push('  m_Layer: 0');
    lines.push(`  m_Name: ${o.label}`);
    lines.push('  m_TagString: Untagged');
    lines.push('  m_Icon: {fileID: 0}');
    lines.push('  m_NavMeshLayer: 0');
    lines.push('  m_StaticEditorFlags: 0');
    lines.push('  m_IsActive: 1');

    lines.push(`--- !u!4 &${tfId}`);
    lines.push('Transform:');
    lines.push('  m_ObjectHideFlags: 0');
    lines.push('  m_CorrespondingSourceObject: {fileID: 0}');
    lines.push('  m_PrefabInstance: {fileID: 0}');
    lines.push('  m_PrefabAsset: {fileID: 0}');
    lines.push(`  m_GameObject: {fileID: ${goId}}`);
    lines.push('  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}');
    lines.push('  m_LocalPosition: {x: 0, y: 0, z: 0}');
    lines.push('  m_LocalScale: {x: 1, y: 1, z: 1}');
    lines.push('  m_Children: []');
    lines.push('  m_Father: {fileID: 0}');
    lines.push('  m_RootOrder: 0');
    lines.push('  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}');

    o.comps.forEach((comp, i) => {
      if (comp === '__Camera') {
        lines.push(`--- !u!203 &${compIds[i]}`);
        lines.push('Camera:');
        lines.push('  m_ObjectHideFlags: 0');
        lines.push('  m_CorrespondingSourceObject: {fileID: 0}');
        lines.push('  m_PrefabInstance: {fileID: 0}');
        lines.push('  m_PrefabAsset: {fileID: 0}');
        lines.push(`  m_GameObject: {fileID: ${goId}}`);
        lines.push('  m_Enabled: 1');
        lines.push('  serializedVersion: 2');
        lines.push('  m_ClearFlags: 1');
        lines.push('  m_BackGroundColor: {r: 0.19, g: 0.19, b: 0.2, a: 0}');
        lines.push('  m_projectionMatrixMode: 1');
        lines.push('  m_GateFitMode: 2');
        lines.push('  m_FOVAxisMode: 0');
        lines.push('  m_SensorSize: {x: 36, y: 25}');
        lines.push('  m_LensShift: {x: 0, y: 0}');
        lines.push('  m_FocalLength: 50');
        lines.push('  m_NormalizedViewRectBegin: {x: 0, y: 0}');
        lines.push('  m_NormalizedViewRectSize: {x: 1, y: 1}');
        lines.push('  near clip plane: 0.3');
        lines.push('  far clip plane: 1000');
        lines.push('  field of view: 60');
        lines.push('  blend mode: 0');
        lines.push('  weight: 1');
        lines.push('  iso speed: 200');
        lines.push('  shutter speed: 1/60');
        lines.push('  aperture: 16');
        lines.push('  focal length: 50');
        lines.push('  white balance: 5500');
        return;
      }
      lines.push(`--- !u!114 &${compIds[i]}`);
      lines.push('MonoBehaviour:');
      lines.push('  m_ObjectHideFlags: 0');
      lines.push('  m_CorrespondingSourceObject: {fileID: 0}');
      lines.push('  m_PrefabInstance: {fileID: 0}');
      lines.push('  m_PrefabAsset: {fileID: 0}');
      lines.push(`  m_GameObject: {fileID: ${goId}}`);
      lines.push('  m_Enabled: 1');
      lines.push('  m_EditorHideFlags: 0');
      lines.push('  m_Script: {fileID: 11500000, guid: ' + (scriptRef(comp) || '00000000000000000000000000000000') + ', type: 3}');
      lines.push(`  m_Name: ${comp}`);
    });
  }

  return lines.join('\n') + '\n';
}

// ---------- main ----------
const metasWritten = writeScriptMetas();
console.log(`meta: ${metasWritten.length} 个脚本 .meta（幂等跳过 ${collectFiles(ASSETS, '.cs').length - metasWritten.length} 个）`);

for (const def of SCENE_DEFS) {
  const out = path.join(SCENES, `${def.name}.unity`);
  fs.writeFileSync(out, sceneYaml(def));
  console.log(`wrote ${path.relative(ROOT, out)}`);
}
console.log('\n脚本 .meta 已预生成（guid 确定性），场景 m_Script 引用真实 guid。');
console.log('Unity 导入后脚本应自动挂载；若 Inspector 仍显示 Missing，按 LOCAL_BUILD.md 3.1 手动拖引用。');
