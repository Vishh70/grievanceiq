const path = require('path');
const fs = require('fs');

// onnxruntime-node@1.30.0 uses napi-v6 (not napi-v3)
const bindingPath = path.join(
  __dirname, '..', 'node_modules', 'onnxruntime-node',
  'bin', 'napi-v6', 'win32', 'x64', 'onnxruntime_binding.node'
);

console.log('Checking napi-v6 binding path:', bindingPath);
console.log('File exists:', fs.existsSync(bindingPath));

if (fs.existsSync(bindingPath)) {
  const stat = fs.statSync(bindingPath);
  console.log('File size:', stat.size, 'bytes');
  try {
    const mod = require(bindingPath);
    console.log('✅ ONNX binding loaded successfully! Module type:', typeof mod);
  } catch(e) {
    console.log('❌ Load failed:', e.message);
    console.log('Code:', e.code);
  }
}

// Also check what @xenova/transformers resolves for onnxruntime-node
console.log('\n--- Checking @xenova/transformers onnxruntime resolution ---');
const xenovaOrtPath = path.join(
  __dirname, '..', 'node_modules', '@xenova', 'transformers',
  'node_modules', 'onnxruntime-node'
);
console.log('@xenova nested onnxruntime-node exists:', fs.existsSync(xenovaOrtPath));

// The binding.js file in the new version uses napi-v6
const ortBindingJs = path.join(__dirname, '..', 'node_modules', 'onnxruntime-node', 'dist', 'binding.js');
console.log('\nTop-level onnxruntime-node/dist/binding.js exists:', fs.existsSync(ortBindingJs));
if (fs.existsSync(ortBindingJs)) {
  // Read and show first few lines
  const content = fs.readFileSync(ortBindingJs, 'utf8');
  const lines = content.split('\n').slice(0, 20).join('\n');
  console.log('binding.js preview:\n', lines);
}
