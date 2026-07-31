const fs = require('fs');
const path = require('path');

let loaded = false;

function loadEnv() {
  if (loaded) return;
  loaded = true;
  // Find .env by checking the current directory, parent directory, and grandparent directory
  const searchPaths = [
    path.join(__dirname, '..', '.env'), // from backend/lib/ -> backend/.env
    path.join(__dirname, '..', '..', '.env'), // from backend/lib/ -> root .env
    path.join(process.cwd(), '.env'),
  ];

  let envPath = null;
  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      envPath = p;
      break;
    }
  }

  if (!envPath) {
    return;
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Only set if not already set (allows command line overrides)
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn(`[env] Warning: failed to load .env file: ${err.message}`);
  }
}

loadEnv();
