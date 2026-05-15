import "dotenv/config";

import pg from "pg";

import { recordPostgresQuery, setPostgresPoolConnections } from "../metrics/index.js";
import type { IocUpsertRequestInput, LookupRequestInput } from "../schemas/ioc.js";
import type { IocRecord } from "../types/ioc.js";

const { Pool } = pg;

export function createPostgresPool(databaseUrl = process.env.IOCHECK_DATABASE_URL): pg.Pool {
  if (!databaseUrl) {
    throw new Error("IOCHECK_DATABASE_URL is required");
  }

  return new Pool({
    connectionString: databaseUrl,
  });
}

function durationSecondsSince(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function updatePoolMetrics(pool: pg.Pool): void {
  setPostgresPoolConnections({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
}

function mapIocRecord(row: {
  type: IocRecord["type"];
  value: string;
  source: string;
  score: number;
  added_at: Date | string;
}): IocRecord {
  return {
    type: row.type,
    value: row.value,
    source: row.source,
    score: row.score,
    added_at: new Date(row.added_at).toISOString(),
  };
}

export async function findIoc(
  pool: pg.Pool,
  input: LookupRequestInput,
): Promise<IocRecord | null> {
  const startedAt = process.hrtime.bigint();

  try {
    const result = await pool.query(
      `
        SELECT type, value, source, score, added_at
        FROM iocs
        WHERE type = $1 AND value = $2
      `,
      [input.type, input.value],
    );

    recordPostgresQuery("lookup", "success", durationSecondsSince(startedAt));
    updatePoolMetrics(pool);

    const row = result.rows[0] as
      | {
          type: IocRecord["type"];
          value: string;
          source: string;
          score: number;
          added_at: Date | string;
        }
      | undefined;

    return row ? mapIocRecord(row) : null;
  } catch (error) {
    recordPostgresQuery("lookup", "failure", durationSecondsSince(startedAt));
    updatePoolMetrics(pool);
    throw error;
  }
}

export async function upsertIoc(
  pool: pg.Pool,
  input: IocUpsertRequestInput,
): Promise<IocRecord> {
  const startedAt = process.hrtime.bigint();

  try {
    const result = await pool.query(
      `
        INSERT INTO iocs (type, value, source, score)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (type, value)
        DO UPDATE SET
          source = EXCLUDED.source,
          score = EXCLUDED.score,
          added_at = NOW()
        RETURNING type, value, source, score, added_at
      `,
      [input.type, input.value, input.source, input.score],
    );

    recordPostgresQuery("upsert", "success", durationSecondsSince(startedAt));
    updatePoolMetrics(pool);

    return mapIocRecord(
      result.rows[0] as {
        type: IocRecord["type"];
        value: string;
        source: string;
        score: number;
        added_at: Date | string;
      },
    );
  } catch (error) {
    recordPostgresQuery("upsert", "failure", durationSecondsSince(startedAt));
    updatePoolMetrics(pool);
    throw error;
  }
}

export async function checkPostgres(pool: pg.Pool): Promise<void> {
  const startedAt = process.hrtime.bigint();

  try {
    await pool.query("SELECT 1");
    recordPostgresQuery("health_check", "success", durationSecondsSince(startedAt));
    updatePoolMetrics(pool);
  } catch (error) {
    recordPostgresQuery("health_check", "failure", durationSecondsSince(startedAt));
    updatePoolMetrics(pool);
    throw error;
  }
}
