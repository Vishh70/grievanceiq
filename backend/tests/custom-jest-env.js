const NodeEnvironment = require('jest-environment-node').TestEnvironment;

class CustomEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    
    // Inject the host's typed array constructors into the Jest VM.
    // This resolves prototype chain mismatches between Jest's VM context
    // and Node's native C++ addons (like onnxruntime-node), which always
    // return host typed arrays.
    this.global.Float32Array = Float32Array;
    this.global.Float64Array = Float64Array;
    this.global.Int8Array = Int8Array;
    this.global.Int16Array = Int16Array;
    this.global.Int32Array = Int32Array;
    this.global.Uint8Array = Uint8Array;
    this.global.Uint16Array = Uint16Array;
    this.global.Uint32Array = Uint32Array;
    this.global.BigInt64Array = BigInt64Array;
    this.global.BigUint64Array = BigUint64Array;
    this.global.ArrayBuffer = ArrayBuffer;
    this.global.SharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined;
  }
}

module.exports = CustomEnvironment;
