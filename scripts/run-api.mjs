// Node's dotenv parser handles quoted values; only the API process receives secrets.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const inherited = { ...process.env };
if (existsSync('.env')) loadEnvFile('.env');
Object.assign(process.env, inherited);
const child = spawn('dotnet', ['run', '--project', 'server/Tracksesh.Api'], {
  stdio: 'inherit', env: process.env,
});
child.on('error', () => { console.error('Could not start the .NET API.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
