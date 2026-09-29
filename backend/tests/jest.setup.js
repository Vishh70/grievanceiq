// backend/tests/jest.setup.js

// Align VM typed arrays with outer Node runtime for native ONNX tensor compatibility
// This prevents errors like "A float32 tensor's data must be type of Float32Array"
const outer = new Function('return { Float32Array, BigInt64Array, Int32Array, Uint8Array, Float64Array }')();

global.Float32Array = outer.Float32Array;
global.BigInt64Array = outer.BigInt64Array;
global.Int32Array = outer.Int32Array;
global.Uint8Array = outer.Uint8Array;
global.Float64Array = outer.Float64Array;
