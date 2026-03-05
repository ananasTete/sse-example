/* global process */
import { spawnSync } from "node:child_process";
import path from "node:path";

const sqlitePath = path.resolve(process.cwd(), "prisma", "dev.db");
const defaultDatabaseUrl = `file:${sqlitePath.replace(/\\/g, "/")}`;
const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;

const run = (args) => {
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(["generate"]);
run(["migrate", "deploy"]);
