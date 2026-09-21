import { spawnSync } from 'node:child_process';

if (process.env.CPANEL_BUILD !== '1') {
  process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'build'], {
  stdio: 'inherit',
  shell: false
});

process.exit(result.status ?? 1);
