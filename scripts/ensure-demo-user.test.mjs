import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const errorCode of ['user_already_exists', 'unexpected_failure']) {
  test(`demo setup does not log credentials on ${errorCode}`, () => {
    const secret = 'private-test-password-must-not-be-logged';
    const response = { error_code: errorCode, msg: secret, access_token: secret };
    const script = `
      globalThis.fetch = async () => ({
        ok: false, status: 400,
        json: async () => (${JSON.stringify(response)})
      });
      await import('./scripts/ensure-demo-user.mjs');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, E2E_PASSWORD: secret },
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.length > 0);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
  });
}
