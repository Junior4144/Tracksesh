// Dry-run first. With --apply, upload only this allowlisted runtime config to
// the existing GitHub production environment via gh's stdin, never argv/logs.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { trafficConfig } from './deployment-config.mjs';

try {
  const config = trafficConfig(parseEnv(readFileSync('.env', 'utf8')));
  console.log('Production secret: TRAFFIC_RUNTIME_CONFIG');
  console.log('Included setting names: ' + Object.keys(config).sort().join(', '));
  console.log('Visitor capture and forwarded-IP trust are disabled. The existing site UUID is preserved.');
  if (process.argv.includes('--apply')) {
    const result = spawnSync('gh', ['secret', 'set', 'TRAFFIC_RUNTIME_CONFIG', '--repo', 'Junior4144/tracksesh', '--env', 'production'],
      { input: JSON.stringify(config), stdio: ['pipe', 'ignore', 'pipe'], encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error('Could not set the production secret. Install/sign in to gh and verify production-environment access.');
    console.log('Production runtime secret updated. No workflow was dispatched.');
  } else console.log('Dry run only. Run with --apply to upload using an authenticated GitHub CLI.');
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid local traffic configuration JSON.' : error.message);
  process.exitCode = 1;
}
