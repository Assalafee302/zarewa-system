if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    'DATABASE_URL must be set for Vitest (PostgreSQL). Example: postgres://postgres:postgres@127.0.0.1:5432/zarewa_test'
  );
}
