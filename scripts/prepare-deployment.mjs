import { writeFileSync } from 'node:fs';
import { containerDefinition } from './deployment-config.mjs';

try {
  const definition = containerDefinition(process.env, process.env.DEPLOY_IMAGE ?? ':validation.app.1');
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(definition), { mode: 0o600 });
  console.log('Deployment configuration validated. Visitor capture remains disabled.');
} catch (error) {
  // Only controlled validation messages; JSON parsing errors might quote secrets.
  console.error(error instanceof SyntaxError ? 'Invalid traffic configuration JSON.' : error.message);
  process.exitCode = 1;
}
