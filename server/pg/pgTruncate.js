/**
 * Truncate all application tables in `public` (keeps `zarewa_migrations` so baseline DDL is not re-applied).
 */
export async function truncatePublicApplicationTables(pool) {
  const { rows } = await pool.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'zarewa_migrations'
    ORDER BY tablename
  `);
  if (rows.length === 0) return;
  for (const { tablename } of rows) {
    const t = String(tablename);
    if (!/^[a-zA-Z0-9_]+$/.test(t)) {
      throw new Error(`[pg-truncate] Refusing unsafe table name: ${t}`);
    }
  }
  const list = rows.map(({ tablename }) => `"${String(tablename)}"`).join(', ');
  await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
