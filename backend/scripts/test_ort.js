try {
  const ort = require('onnxruntime-node');
  console.log('onnxruntime-node loaded OK');
  console.log('Type:', typeof ort);
  console.log('Keys:', Object.keys(ort).slice(0, 5));
} catch(e) {
  console.log('FAIL code:', e.code);
  console.log('FAIL msg:', e.message);
}
