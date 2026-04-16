import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { attachReadinessGate, readinessExemptApiPath } from './readinessGate.js';
import { anonymousBootstrapStartingStub } from './bootstrapStartingStub.js';

describe('readinessExemptApiPath', () => {
  it('matches health + bootstrap-status only (GET /api/bootstrap uses no-DB stub in gate)', () => {
    expect(readinessExemptApiPath('/api/health')).toBe(true);
    expect(readinessExemptApiPath('/api/health/')).toBe(true);
    expect(readinessExemptApiPath('/api/health?x=1')).toBe(true);
    expect(readinessExemptApiPath('/api/session/login')).toBe(false);
    expect(readinessExemptApiPath('/api/session/forgot-password')).toBe(false);
    expect(readinessExemptApiPath('/api/session/reset-password')).toBe(false);
    expect(readinessExemptApiPath('/api/bootstrap')).toBe(false);
    expect(readinessExemptApiPath('/api/bootstrap-status')).toBe(true);
    expect(readinessExemptApiPath('/api/session')).toBe(false);
  });
});

describe('anonymousBootstrapStartingStub', () => {
  it('returns ok + starting phase and stable empty lists', () => {
    const s = anonymousBootstrapStartingStub();
    expect(s.ok).toBe(true);
    expect(s.bootstrapPhase).toBe('starting');
    expect(s.session?.authenticated).toBe(false);
    expect(Array.isArray(s.workspaceBranches)).toBe(true);
    expect(Array.isArray(s.masterData?.quoteItems)).toBe(true);
  });
});

describe('attachReadinessGate', () => {
  it('returns 200 stub bootstrap + 503 STARTING for login until apiReady', async () => {
    const app = express();
    app.use(express.json());
    const bootState = { apiReady: false };
    attachReadinessGate(app, bootState);
    app.post('/api/session/login', (req, res) => {
      res.status(200).json({ ok: true, reachedHandler: true });
    });
    app.get('/api/bootstrap', (req, res) => {
      res.json({ ok: true, reachedHandler: true });
    });

    const loginRes = await request(app).post('/api/session/login').send({ username: 'x', password: 'y' });
    expect(loginRes.status).toBe(503);
    expect(loginRes.body.code).toBe('STARTING');

    const bootRes = await request(app).get('/api/bootstrap');
    expect(bootRes.status).toBe(200);
    expect(bootRes.body.ok).toBe(true);
    expect(bootRes.body.bootstrapPhase).toBe('starting');
    expect(bootRes.body.session?.authenticated).toBe(false);
    expect(bootRes.headers['cache-control']).toMatch(/no-store/i);
  });

  it('returns 503 BOOTSTRAP_FAILED for GET /api/bootstrap when bootstrap failed (no stub)', async () => {
    const app = express();
    app.use(express.json());
    const bootState = {
      apiReady: false,
      bootstrapFailed: true,
      bootstrapExitCode: 1,
      bootstrapSignal: null,
      bootstrapSpawnError: null,
    };
    attachReadinessGate(app, bootState);
    app.get('/api/bootstrap', (_req, res) => {
      res.json({ ok: true, reachedHandler: true });
    });

    const bootRes = await request(app).get('/api/bootstrap');
    expect(bootRes.status).toBe(503);
    expect(bootRes.body.code).toBe('BOOTSTRAP_FAILED');
  });

  it('returns 503 BOOTSTRAP_FAILED when bootstrap subprocess failed', async () => {
    const app = express();
    app.use(express.json());
    const bootState = {
      apiReady: false,
      bootstrapFailed: true,
      bootstrapExitCode: 1,
      bootstrapSignal: null,
      bootstrapSpawnError: null,
    };
    attachReadinessGate(app, bootState);
    app.post('/api/session/login', (_req, res) => {
      res.status(200).json({ ok: true, reachedHandler: true });
    });

    const loginRes = await request(app).post('/api/session/login').send({ username: 'x', password: 'y' });
    expect(loginRes.status).toBe(503);
    expect(loginRes.body.code).toBe('BOOTSTRAP_FAILED');
    expect(String(loginRes.body.error || '')).toContain('Database setup failed');
  });
});
