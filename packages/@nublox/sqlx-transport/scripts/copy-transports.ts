// Copy raw transport config files into dist/transports after build
const fs = require("fs");
const path = require("path");

const from = path.resolve(__dirname, "..", "transports");
const to = path.resolve(__dirname, "..", "dist", "transports");

if (!fs.existsSync(from)) {
    console.error(`No transports directory at ${from}`);
    process.exit(0); // don't fail the build if configs aren't present
}

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });

for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    fs.copyFileSync(src, dst);
}

console.log("Copied transports -> dist/transports");
