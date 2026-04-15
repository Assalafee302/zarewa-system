import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { attachReadinessGate, readinessExemptApiPath } from './readinessGate.js';

describe('readinessExemptApiPath', () => {
  it('matches health and public session routes', () => {
    expect(readinessExemptApiPath('/api/health')).toBe(true);
    expect(readinessExemptApiPath('/api/health?x=1')).toBe(true);
    expect(readinessExemptApiPath('/api/session/login')).toBe(true);
    expect(readinessExemptApiPath('/api/session/forgot-password')).toBe(true);
    expect(readinessExemptApiPath('/api/session/reset-password')).toBe(true);
    expect(readinessExemptApiPath('/api/bootstrap')).toBe(true);
    expect(readinessExemptApiPath('/api/session')).toBe(false);
  });
});

describe('attachReadinessGate', () => {
  it('returns 503 STARTING for gated /api paths but not for public session routes', async () => {
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
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.reachedHandler).toBe(true);

    const bootRes = await request(app).get('/api/bootstrap');
    expect(bootRes.status).toBe(200);
    expect(bootRes.body.ok).toBe(true);
  });
});
