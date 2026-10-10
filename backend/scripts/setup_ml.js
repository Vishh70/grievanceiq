const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const venvDir = path.join(__dirname, '..', '.venv');
const isWin = os.platform() === 'win32';

try {
  console.log('📦 Setting up Python virtual environment for ML services...');
  
  // 1. Create venv if it doesn't exist
  if (!fs.existsSync(venvDir)) {
    const pythonCmd = isWin ? 'python' : 'python3';
    execSync(`${pythonCmd} -m venv .venv`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  }

  // 2. Install requirements
  const pipCmd = isWin ? path.join('.venv', 'Scripts', 'pip') : path.join('.venv', 'bin', 'pip');
  execSync(`${pipCmd} install -r ml/requirements.txt`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  
  console.log('✅ ML setup complete!');
} catch (error) {
  console.error('❌ ML setup failed:', error.message);
  process.exit(1);
}
