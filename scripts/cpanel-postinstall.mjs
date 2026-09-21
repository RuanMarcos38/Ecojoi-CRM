import { openSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

if (process.env.CPANEL_BUILD !== '1') {
  process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const logPath = join(process.cwd(), 'cpanel-build.log');
const logFd = openSync(logPath, 'a');

const child = spawn(npmCommand, ['run', 'build'], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, CPANEL_BUILD: '' },
  shell: false,
  stdio: ['ignore', logFd, logFd]
});

child.unref();
console.log(`cPanel build started in background. Log: ${logPath}`);
process.exit(0);
