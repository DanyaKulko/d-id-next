const fs = require("node:fs");
const path = require("node:path");

const loadEnvFile = (filePath, override = false) => {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }
};

const cwd = process.cwd();
loadEnvFile(path.join(cwd, ".env"));
loadEnvFile(path.join(cwd, ".env.local"), true);

const baseUrl = (
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

async function runOnce() {
  const response = await fetch(`${baseUrl}/api/cron/external-sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-cron-secret": secret } : {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  console.log("External sources sync:", payload);
}

runOnce().catch((error) => {
  console.error(error);
  process.exit(1);
});
