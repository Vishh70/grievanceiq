const pkg = require('../node_modules/onnxruntime-node/package.json');
console.log('scripts:', JSON.stringify(pkg.scripts, null, 2));
console.log('version:', pkg.version);
