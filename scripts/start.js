// `npm start` without Docker: runs the standalone server built by `npm run build`.
// (`next start` doesn't support output: "standalone"; the Docker image runs server.js directly.)
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const server = path.join(standalone, "server.js");

if (!fs.existsSync(server)) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

// Load .env from the project (server.js would otherwise read the copy frozen at build time).
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// server.js changes into .next/standalone, so pin uploads to the project folder, not the build output.
process.env.UPLOAD_DIR ||= path.join(root, "uploads");

// The standalone server serves static assets only from its own folder.
const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
if (!fs.existsSync(staticDest)) fs.cpSync(staticSrc, staticDest, { recursive: true });

require(server);
