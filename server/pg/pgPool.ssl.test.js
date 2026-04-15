import { afterEach, describe, expect, it } from 'vitest';
import { inferSslForPostgres } from './pgPool.js';

describe('inferSslForPostgres', () => {
  const prev = process.env.PGSSLMODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = prev;
  });

  it('disables SSL for localhost and docker service hostname without url sslmode', () => {
    delete process.env.PGSSLMODE;
    expect(inferSslForPostgres({ host: 'localhost', sslmodeFromUrl: null })).toBe(false);
    expect(inferSslForPostgres({ host: '127.0.0.1', sslmodeFromUrl: null })).toBe(false);
    expect(inferSslForPostgres({ host: 'postgres', sslmodeFromUrl: null })).toBe(false);
    expect(inferSslForPostgres({ host: '10.0.0.5', sslmodeFromUrl: null })).toBe(false);
  });

  it('honors sslmode=disable from URL even when host is public-shaped', () => {
    delete process.env.PGSSLMODE;
    expect(inferSslForPostgres({ host: 'db.example.com', sslmodeFromUrl: 'disable' })).toBe(false);
  });

  it('honors PGSSLMODE=disable', () => {
    process.env.PGSSLMODE = 'disable';
    expect(inferSslForPostgres({ host: 'db.example.com', sslmodeFromUrl: 'require' })).toBe(false);
  });

  it('uses TLS for unknown public hosts when not disabled', () => {
    delete process.env.PGSSLMODE;
    const ssl = inferSslForPostgres({ host: 'aws-0-eu.pooler.supabase.com', sslmodeFromUrl: null });
    expect(ssl).toEqual({ rejectUnauthorized: false });
  });
});
