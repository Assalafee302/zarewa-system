import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { attachReadinessGate, readinessExemptApiPath } from './readinessGate.js';

describe('readinessExemptApiPath', () => {
  it('matches health + bootstrap-status only (bootstrap waits for schema to avoid 502)', () => {
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

describe('attachReadinessGate', () => {
  it('returns 503 STARTING for session + bootstrap until apiReady', async () => {
    const app = express();
    app.use(express.json());
    const bootState = { apiReady: false };
    attachReadinessGate(app, bootState);
    app.post('/api/session/login', (req, res) => {
      res.status(200).json({ ok: true, reachedHandler: true });
    });
    app.get('/api/bootstrap', (req, res) => {
      res.json({ ok: true });
    });

    const loginRes = await request(app).post('/api/session/login').send({ username: 'x', password: 'y' });
    expect(loginRes.status).toBe(503);
    expect(loginRes.body.code).toBe('STARTING');

    const bootRes = await request(app).get('/api/bootstrap');
    expect(bootRes.status).toBe(503);
    expect(bootRes.body.code).toBe('STARTING');
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
