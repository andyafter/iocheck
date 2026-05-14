import "dotenv/config";

import pg from "pg";

const { Pool } = pg;

export function createPostgresPool(databaseUrl = process.env.IOCHECK_DATABASE_URL): pg.Pool {
  if (!databaseUrl) {
    throw new Error("IOCHECK_DATABASE_URL is required");
  }

  return new Pool({
    connectionString: databaseUrl,
  });
}
