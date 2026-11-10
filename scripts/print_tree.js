// 打印 GLB 节点树结构（名字 + 是否有 mesh）
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const path = require('path');

async function printTree(file) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.join(__dirname, 'model', file));
  const root = doc.getRoot();
  const scenes = root.listScenes();
  console.log(`\n=== ${file} ===`);
  const sceneRoots = scenes[0].listChildren();
  function printNode(node, depth) {
    const name = node.getName() || '(unnamed)';
    const hasMesh = node.getMesh() ? 'MESH' : '';
    const indent = '  '.repeat(depth);
    console.log(`${indent}${name} ${hasMesh}`);
    for (const child of node.listChildren()) printNode(child, depth + 1);
  }
  for (const rn of sceneRoots) printNode(rn, 0);
}

(async () => {
  for (const f of ['abrams_x.glb', 'ztz-99a.glb', 't-14_armata.glb']) {
    try { await printTree(f); } catch (e) { console.error(`${f}: ${e.message}`); }
  }
})();