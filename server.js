// Keep Next's standalone dependency tree separate from CloudLinux's virtualenv.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

try {
  const revision = readFileSync(join(__dirname, 'DEPLOY_SOURCE_SHA'), 'utf8').trim();
  if (/^[0-9a-f]{40}$/.test(revision)) process.env.ECOJOI_RUNNING_REVISION = revision;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

try {
  const probeToken = readFileSync(join(__dirname, '..', '.ecojoi-crm-releases', 'health-probe-token'), 'utf8').trim();
  if (/^[0-9a-f]{64}$/.test(probeToken)) process.env.ECOJOI_HEALTH_PROBE_TOKEN = probeToken;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

process.env.NODE_ENV = 'production';
process.env.HOSTNAME = '0.0.0.0';
require('./runtime/server.js');
