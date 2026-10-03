/**
 * MiniLM test using a spawned child process that has the DLL directory 
 * pre-set in PATH before Node.js starts (bypassing Windows DLL search cache)
 */
const { spawnSync } = require('child_process');
const path = require('path');

const dllDir1 = path.join(__dirname, '..', 'node_modules', '@xenova', 'transformers', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'win32', 'x64');
const dllDir2 = path.join(__dirname, '..', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'win32', 'x64');
const dllDir3 = path.join(__dirname, '..', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v3', 'win32', 'x64');

const env = {
  ...process.env,
  PATH: [dllDir1, dllDir2, dllDir3, process.env.PATH].join(';')
};

console.log('Spawning MiniLM test with DLL dirs in PATH...');

const result = spawnSync('node', ['-e', `
const { pipeline } = require('@xenova/transformers');
(async () => {
  try {
    console.log("Loading model...");
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("Inferring...");
    const out = await pipe('There is a large pothole near the NMIET campus entrance.');
    console.log("Embedding length:", out.data.length);
    console.log("First 3:", Array.from(out.data.slice(0,3)));
    console.log("SUCCESS");
  } catch(e) {
    console.error("FAIL:", e.message);
    process.exit(1);
  }
})();
`], {
  cwd: path.join(__dirname, '..'),
  env,
  timeout: 120000,
  stdio: 'inherit'
});

if (result.status === 0) {
  console.log('✅ MiniLM PASSED');
} else {
  console.log('❌ MiniLM FAILED with status:', result.status);
  if (result.error) console.log('Error:', result.error.message);
}
