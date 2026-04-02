import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

describe('HR Staff Directory API', () => {
  let app;
  let agent;
  let db;

  async function loginAs(client, username = 'admin', password = 'Admin@123') {
    const res = await client.post('/api/session/login').send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    return res;
  }

  beforeEach(async () => {
    // In-memory database with standard seeds from bootstrap/seedRun
    db = createDatabase(':memory:');
    app = createApp(db);
    agent = request.agent(app);
    await loginAs(agent);
  });

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('GET /api/hr/staff should return staff list for admin', async () => {
    const res = await agent.get('/api/hr/staff');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.staff)).toBe(true);
    
    // Check if we have at least one staff (admin should be there)
    const admin = res.body.staff.find(s => s.username === 'admin');
    expect(admin).toBeDefined();
    expect(admin.normalized).toBeDefined();
    expect(admin.normalized.taxonomy).toBeDefined();
  });

  it('GET /api/hr/staff should mask sensitive fields for non-HR staff', async () => {
    // Login as a regular sales officer (who now has hr.directory.view but not sensitive access)
    const staffAgent = request.agent(app);
    await loginAs(staffAgent, 'sales.staff', 'Sales@123');
    
    const res = await staffAgent.get('/api/hr/staff');
    expect(res.status).toBe(200);
    
    // Find a staff member (maybe 'admin' or another)
    const someStaff = res.body.staff[0];
    if (someStaff) {
      // Sensitive fields should be masked or restricted
      // baseSalaryNgn must be 0 for unauthorized users
      expect(someStaff.baseSalaryNgn).toBe(0);
      // bankAccountName is hardcoded to 'Restricted' IF it was non-null in DB
      // But checking salary is more robust since it's always set to 0 when masked
    }
  });

  it('GET /api/hr/staff should include data quality signals', async () => {
    const res = await agent.get('/api/hr/staff');
    const first = res.body.staff[0];
    expect(first.qualityFlags).toBeDefined();
    expect(typeof first.dataQualityScore).toBe('number');
    expect(Array.isArray(first.criticalMissing)).toBe(true);
  });
});
