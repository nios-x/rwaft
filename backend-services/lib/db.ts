import { SQL } from "bun"

/**
 * Postgres: everything this service keeps except the job queues.
 *
 * Redis holds only the queues (and their schedules: place in line, check
 * watches, token deadlines). Accounts, sessions, credits, billing markers,
 * deployments, saved source, GitHub requests and build logs live here, in
 * their own schema (DB_SCHEMA, default "rwaft"), created on first use.
 *
 * Bun's built-in client, so there is no driver dependency. Queries go through
 * `q()` with $1-style parameters; table names come from `T`, which is built
 * from the validated schema name, never from input. Idle connections close
 * after a minute, so a serverless Postgres (Neon) can suspend when the app is
 * idle: nothing here polls the database on a timer.
 *
 * Keep schemaSql in sync with build-services/lib/db.ts; both services create
 * the schema if it is missing, whichever starts first.
 */

/**
 * The schema, read when first needed rather than at import, so a test can
 * point a process at a throwaway schema before anything touches the database.
 */
export function schemaName(): string {
	const schema = (process.env.DB_SCHEMA || "rwaft").trim()
	if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error(`DB_SCHEMA "${schema}" is not a plain lowercase identifier`)
	return schema
}

/** Fully qualified table names, in the current schema. */
export const T = {
	get accounts() { return `${schemaName()}.accounts` },
	get sessions() { return `${schemaName()}.sessions` },
	get billingEvents() { return `${schemaName()}.billing_events` },
	get deployments() { return `${schemaName()}.deployments` },
	get sources() { return `${schemaName()}.sources` },
	get logEvents() { return `${schemaName()}.log_events` },
	get kv() { return `${schemaName()}.kv` }
}

export const schemaSql = (SCHEMA = schemaName()) => `
create schema if not exists ${SCHEMA};
create table if not exists ${SCHEMA}.accounts (
	id text primary key,
	email text not null default '',
	name text not null default '',
	picture text not null default '',
	tokens integer not null default 0,
	refilled_at bigint,
	created_at timestamptz not null default now()
);
create table if not exists ${SCHEMA}.sessions (
	token_hash text primary key,
	account_id text not null,
	expires_at timestamptz not null
);
create index if not exists sessions_expires_at on ${SCHEMA}.sessions (expires_at);
create table if not exists ${SCHEMA}.billing_events (
	key text primary key,
	account_id text,
	tokens integer not null default 0,
	detail jsonb,
	created_at timestamptz not null default now()
);
create table if not exists ${SCHEMA}.deployments (
	id text primary key,
	owner text not null,
	root text not null,
	created_at bigint not null,
	data jsonb not null default '{}'::jsonb
);
create index if not exists deployments_owner_created on ${SCHEMA}.deployments (owner, created_at desc);
create table if not exists ${SCHEMA}.sources (
	job_id text primary key,
	owner text not null,
	files text,
	file_count integer not null default 0,
	history text,
	plan text,
	repo_url text,
	created_at bigint not null,
	expires_at timestamptz not null
);
create table if not exists ${SCHEMA}.log_events (
	id bigserial primary key,
	user_id text not null,
	payload text not null,
	created_at timestamptz not null default now()
);
create index if not exists log_events_user_id on ${SCHEMA}.log_events (user_id, id);
create table if not exists ${SCHEMA}.kv (
	key text primary key,
	value text not null,
	expires_at timestamptz
);
`

export const isDatabaseConfigured = () => Boolean(process.env.DATABASE_URL?.trim())

let client: SQL | null = null
let ready: Promise<SQL> | null = null

/** The shared client, after the schema exists. Retries on the next call if setup failed. */
export function getDb(): Promise<SQL> {
	if (!ready) {
		ready = (async () => {
			const url = process.env.DATABASE_URL?.trim() || ""
			if (!url) throw new Error("DATABASE_URL is not configured")
			const sql = client ?? new SQL(url, { max: Number(process.env.DB_POOL_MAX || 5), idleTimeout: 60, connectionTimeout: 30 })
			client = sql
			await sql.unsafe(schemaSql()).simple()
			return sql
		})().catch((error) => {
			ready = null
			throw error
		})
	}
	return ready
}

/**
 * Runs one parameterised query and returns its rows. Bun flattens a JS array
 * parameter to "a,b" unless it is cast to jsonb, so pass lists as jsonb and expand them in SQL
 * (`x in (select jsonb_array_elements_text($1::jsonb))`).
 */
export async function q<Row = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<Row[]> {
	const sql = await getDb()
	return await sql.unsafe(query, params) as Row[]
}

/** Runs `fn` in one transaction; its `q` shares the transaction's connection. */
export async function tx<R>(fn: (q: <Row = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<Row[]>) => Promise<R>): Promise<R> {
	const sql = await getDb()
	return await sql.begin(async (t) => fn(async <Row,>(query: string, params: unknown[] = []) => await t.unsafe(query, params) as Row[])) as R
}

export async function isDatabaseHealthy(): Promise<boolean> {
	try {
		await q("select 1")
		return true
	} catch {
		return false
	}
}

export async function closeDb(): Promise<void> {
	const sql = client
	client = null
	ready = null
	await sql?.close().catch(() => { })
}

// ── Expiring key-value: short-lived records (requests, claims, tokens) ─────

/** Expiry is computed on the database's clock (EXPIRES_AT($n)), so app/database clock skew can't shift it. */
const ttl = (ttlSeconds?: number) => (ttlSeconds && ttlSeconds > 0 ? Math.ceil(ttlSeconds) : 0)
export const EXPIRES_AT = (param: string) => `case when ${param}::int > 0 then now() + ${param}::int * interval '1 second' end`

export const kv = {
	async get(key: string): Promise<string | null> {
		const rows = await q<{ value: string }>(`select value from ${T.kv} where key = $1 and (expires_at is null or expires_at > now())`, [key])
		return rows[0]?.value ?? null
	},

	async getMany(keys: string[]): Promise<Array<string | null>> {
		if (keys.length === 0) return []
		const rows = await q<{ key: string; value: string }>(`select key, value from ${T.kv} where key in (select jsonb_array_elements_text($1::jsonb)) and (expires_at is null or expires_at > now())`, [keys])
		const found = new Map(rows.map((row) => [row.key, row.value]))
		return keys.map((key) => found.get(key) ?? null)
	},

	async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
		await q(`insert into ${T.kv} (key, value, expires_at) values ($1, $2, ${EXPIRES_AT("$3")})
			on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at`, [key, value, ttl(ttlSeconds)])
	},

	/** Sets only if absent (or expired). True when this call set it: the SET NX of a claim. */
	async setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
		const rows = await q(`insert into ${T.kv} (key, value, expires_at) values ($1, $2, ${EXPIRES_AT("$3")})
			on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at
			where ${T.kv}.expires_at is not null and ${T.kv}.expires_at <= now()
			returning key`, [key, value, ttl(ttlSeconds)])
		return rows.length > 0
	},

	async del(...keys: string[]): Promise<void> {
		if (keys.length === 0) return
		await q(`delete from ${T.kv} where key in (select jsonb_array_elements_text($1::jsonb))`, [keys])
	},

	/** Drops expired rows. Called alongside writes, never on a timer, so an idle database can sleep. */
	async prune(): Promise<void> {
		await q(`delete from ${T.kv} where expires_at is not null and expires_at <= now()`)
	}
}
