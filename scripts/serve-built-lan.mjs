/**
 * Serve the Vite production build + API from one Node process, bound for LAN access.
 * Run after `npm run build` (see npm script `build:serve:lan`).
 */
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
if (!process.env.ZAREWA_LISTEN_HOST) process.env.ZAREWA_LISTEN_HOST = '0.0.0.0';

await import('../server/index.js');
