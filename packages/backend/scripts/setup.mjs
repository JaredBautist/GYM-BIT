import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Ensure data directory exists
const dataDir = path.join(rootDir, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✓ data/ directory created');
}

// Generate JWT keys if missing
const keysDir = path.join(rootDir, 'keys');
const privateKeyPath = path.join(keysDir, 'private.pem');
const publicKeyPath = path.join(keysDir, 'public.pem');

if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }
  console.log('✓ Generating JWT RSA keys...');
  execSync(
    `openssl genpkey -algorithm RSA -out "${privateKeyPath}" -pkeyopt rsa_keygen_bits:2048 2>/dev/null`,
    { stdio: 'pipe' },
  );
  execSync(
    `openssl rsa -pubout -in "${privateKeyPath}" -out "${publicKeyPath}" 2>/dev/null`,
    { stdio: 'pipe' },
  );
  console.log('✓ JWT keys generated');
}

// Run database migrations
console.log('✓ Running migrations...');
execSync('npx tsx src/db/migrate.ts', { cwd: rootDir, stdio: 'pipe' });
console.log('✓ Setup complete');
