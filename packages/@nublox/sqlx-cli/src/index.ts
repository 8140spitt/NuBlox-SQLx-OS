import { capabilities, learn, ping } from "@nublox/sqlx";

async function main() {
  const cmd = process.argv[2] ?? "ping";
  const urlArg = process.argv[3];
  const dbUrl = urlArg ?? process.env.DATABASE_URL;

  if (cmd === "capabilities") {
    const caps = capabilities(dbUrl);
    // Safer printing
    console.log(JSON.stringify({
      ...caps,
      security: caps.security ?? {}
    }, null, 2));
    return;
  }

  if (cmd === "learn") {
    const profile = await learn(dbUrl);
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  if (cmd === "ping") {
    console.log(await ping());
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
