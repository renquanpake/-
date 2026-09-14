#!/usr/bin/env node
// gen-scenes.mjs — 生成 5 个 Unity 场景的 YAML 骨架（最小可导入版）
// 用法：node tools/gen-scenes.mjs
// 说明：Unity 场景是 YAML。此处生成含 GameManager/各 Controller 的最小场景，
// 用户导入 Unity 后可直接在编辑器里补 UI 与预制体，不必从零手搭。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCENES = path.join(ROOT, 'game', 'Assets', 'Scenes');
fs.mkdirSync(SCENES, { recursive: true });

// 各场景挂载的组件清单
const SCENE_DEFS = [
  { name: 'Boot', objects: [
    { label: 'GameManager', comps: ['GameManager'] },
  ]},
  { name: 'Farm', objects: [
    { label: 'FarmRoot', comps: ['FarmController'] },
    { label: 'Camera', comps: ['Camera'] },
  ]},
  { name: 'Challenge', objects: [
    { label: 'ChallengeRoot', comps: ['LevelMapController', 'QuizUI'] },
  ]},
  { name: 'Shop', objects: [
    { label: 'ShopRoot', comps: ['EconomyController'] },
  ]},
  { name: 'Stats', objects: [
    { label: 'StatsRoot', comps: ['StatsController'] },
  ]},
];

// 生成 Unity 场景 YAML（最小结构，能被 Unity 导入识别）
function sceneYaml(def) {
  let oid = 100;
  const root = `RootObject`;
  const lines = [];
  lines.push('%YAML 1.1');
  lines.push('--- !u!1 &1');
  lines.push('GameObject:');
  lines.push(`  m_ObjectHideFlags: 0`);
  lines.push(`  m_CorrespondingSourceObject: {fileID: 0}`);
  lines.push(`  m_PrefabInstance: {fileID: 0}`);
  lines.push(`  m_PrefabAsset: {fileID: 0}`);
  lines.push(`  serializedVersion: 6`);
  lines.push(`  m_Component:`);
  lines.push(`  - component: {fileID: ${oid}}`);
  lines.push(`  m_Layer: 0`);
  lines.push(`  m_Name: ${root}`);
  lines.push(`  m_TagString: Untagged`);
  lines.push(`  m_Icon: {fileID: 0}`);
  lines.push(`  m_NavMeshLayer: 0`);
  lines.push(`  m_StaticEditorFlags: 0`);
  lines.push(`  m_IsActive: 1`);
  lines.push(`--- !u!${oid} &${oid}`);
  lines.push(`Transform:`);
  lines.push(`  m_ObjectHideFlags: 0`);
  lines.push(`  m_PrefabParentObject: {fileID: 0}`);
  lines.push(`  m_PrefabInternal: {fileID: 0}`);
  lines.push(`  m_GameObject: {fileID: 1}`);
  lines.push(`  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}`);
  lines.push(`  m_LocalPosition: {x: 0, y: 0, z: 0}`);
  lines.push(`  m_LocalScale: {x: 1, y: 1, z: 1}`);
  lines.push(`  m_Children: []`);
  lines.push(`  m_Father: {fileID: 0}`);
  lines.push(`  m_RootOrder: 0`);
  lines.push(`  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}`);
  lines.push(`--- !u!104 &${oid + 100}`);
  lines.push(`RenderSettings: {}`);
  lines.push(`--- !u!105 &${oid + 101}`);
  lines.push(`LightingSettings: {}`);

  // 各业务对象
  for (const o of def.objects) {
    const goFile = ++oid;
    lines.push(`--- !u!1 &${goFile}`);
    lines.push(`GameObject:`);
    lines.push(`  m_ObjectHideFlags: 0`);
    lines.push(`  m_Name: ${o.label}`);
    lines.push(`  m_TagString: Untagged`);
    lines.push(`  m_IsActive: 1`);
    lines.push(`  m_Component:`);
    lines.push(`  - component: {fileID: ${goFile + 1}}`);
    // 挂载脚本组件（MonoBehaviour，无 Inspector 配置，仅占位）
    for (let i = 0; i < o.comps.length; i++) {
      lines.push(`  - component: {fileID: ${goFile + 10 + i}}`);
    }
    lines.push(`--- !u!${goFile + 1} &${goFile + 1}`);
    lines.push(`Transform:`);
    lines.push(`  m_GameObject: {fileID: ${goFile}}`);
    lines.push(`  m_Father: {fileID: 0}`);
    lines.push(`  m_RootOrder: 0`);
    for (let i = 0; i < o.comps.length; i++) {
      lines.push(`--- !u!114 &${goFile + 10 + i}`);
      lines.push(`MonoBehaviour:`);
      lines.push(`  m_GameObject: {fileID: ${goFile}}`);
      lines.push(`  m_Enabled: 1`);
      lines.push(`  m_EditorHideFlags: 0`);
      lines.push(`  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}`);
      lines.push(`  m_Name: ${o.comps[i]}`);
    }
  }
  return lines.join('\n');
}

for (const def of SCENE_DEFS) {
  const out = path.join(SCENES, `${def.name}.unity`);
  fs.writeFileSync(out, sceneYaml(def));
  console.log(`wrote ${path.relative(ROOT, out)}`);
}
console.log('\n注意：.unity 的 m_Script guid 需 Unity 导入后自动补全（占位 000...）。');
console.log('导入 Unity 后，到 Inspector 给各 Controller 拖引用即可。');
