const fs = require('fs');
const path = require('path');
const os = require('os');

// Get the directory where the binding.node is
const bindingDir = path.join(
  __dirname, '..', 'node_modules', '@xenova', 'transformers',
  'node_modules', 'onnxruntime-node', 'bin', 'napi-v3', 'win32', 'x64'
);

// Get the actual cwd for PATH extension
console.log('Binding directory:', bindingDir);
console.log('Current PATH:', process.env.PATH ? 'set' : 'not set');

// Add the binding directory to PATH so Windows can find onnxruntime.dll
// This is the fix: the .dll files must be in PATH when the .node loads
process.env.PATH = bindingDir + path.delimiter + (process.env.PATH || '');
console.log('Added binding dir to PATH');

try {
  const bindingPath = path.join(bindingDir, 'onnxruntime_binding.node');
  console.log('Loading:', bindingPath);
  const mod = require(bindingPath);
  console.log('✅ ONNX binding loaded successfully! Module type:', typeof mod);
  console.log('Module keys:', Object.keys(mod));
} catch(e) {
  console.log('❌ Still failed:', e.message);
  console.log('Code:', e.code);
}
