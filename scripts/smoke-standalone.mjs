import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || '.next/standalone');
const port = 3197;
const origin = `http://127.0.0.1:${port}`;

async function verify(configured) {
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1' };
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete env[key];
  if (configured) {
    env.NEXT_PUBLIC_SUPABASE_URL = 'https://runtime-smoke.supabase.co';
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-smoke-key';
  }
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { await fetch(origin); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert.ok(ready, `Standalone did not start: ${logs}`);
    const login = await fetch(`${origin}/login`, { redirect: 'manual' });
    assert.equal(login.status, configured ? 200 : 503);
    if (configured) {
      const html = await login.text();
      assert.ok(html.includes('window.__ECOJOI_PUBLIC_ENV__={"supabaseUrl":"https://runtime-smoke.supabase.co","supabaseAnonKey":"public-smoke-key"}'), 'Runtime public configuration missing from HTML');
      const app = await fetch(`${origin}/app`, { redirect: 'manual' });
      assert.equal(app.status, 307);
      assert.equal(new URL(app.headers.get('location'), origin).pathname, '/login');
      const api = await fetch(`${origin}/api/contacts`, { redirect: 'manual' });
      assert.equal(api.status, 401);
    }
    console.log(`Standalone smoke passed (${configured ? 'runtime configuration' : 'missing configuration'}).`);
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
}

await verify(true);
await verify(false);
