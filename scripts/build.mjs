import { execSync } from "node:child_process";

// Map Vercel native Postgres variables if DATABASE_URL / DIRECT_URL are not explicitly provided
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  "";

process.env.DIRECT_URL =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  "";

console.log("[build] Generating Prisma client...");
execSync("npx prisma generate", { stdio: "inherit", env: process.env });

if (process.env.DATABASE_URL) {
  console.log("[build] Deploying database migrations...");
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  } catch (err) {
    console.error("[build] Migration deployment failed:", err);
    process.exit(1);
  }
} else {
  console.warn("[build] No database connection string detected; skipping migrate deploy.");
}

console.log("[build] Building Next.js application...");
execSync("npx next build", { stdio: "inherit", env: process.env });
