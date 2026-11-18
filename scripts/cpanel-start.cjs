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

try {
  const workerToken = readFileSync(join(__dirname, '..', '.ecojoi-crm-releases', 'reactivation-worker-token'), 'utf8').trim();
  if (/^[0-9a-f]{64}$/.test(workerToken)) process.env.ECOJOI_REACTIVATION_WORKER_TOKEN = workerToken;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

// The deploy bundle includes an Opus-enabled ffmpeg for WhatsApp voice notes.
// An explicit environment override remains supported for other hosting layouts.
if (!process.env.FFMPEG_PATH) {
  process.env.FFMPEG_PATH = join(__dirname, 'runtime', 'bin', 'ffmpeg');
}

process.env.NODE_ENV = 'production';
process.env.HOSTNAME = '0.0.0.0';
require('./runtime/server.js');
