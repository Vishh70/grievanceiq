// Test if onnxruntime-web (WASM-based) works as a fallback
// @xenova/transformers can use either onnxruntime-node or onnxruntime-web

// Force use of WASM backend by setting env before import
process.env.TRANSFORMERS_JS_BACKEND = 'onnxruntime-web';

const { pipeline, env } = require('@xenova/transformers');

// Configure to use WASM instead of native node bindings
env.backends.onnx.wasm.numThreads = 1;

async function run() {
  try {
    console.log('Loading model with WASM backend...');
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { 
      backend: 'cpu',
      dtype: 'fp32'
    });
    console.log('Model loaded. Inferring...');
    const out = await pipe('There is a large pothole near the NMIET campus entrance.', {
      pooling: 'mean',
      normalize: true
    });
    console.log('Embedding length:', out.data.length);
    console.log('First 5 values:', Array.from(out.data.slice(0, 5)));
    console.log('✅ MiniLM WASM backend: SUCCESS');
  } catch (e) {
    console.error('Error:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  }
}
run();
