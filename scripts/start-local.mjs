#!/usr/bin/env node
import { spawn } from 'child_process';
import { networkInterfaces } from 'os';
import { detectSupabaseCmd, installSupabaseLocal, checkDocker, ensureSupabase, ROOT } from './lib/supabase-local.mjs';

function getLocalIPs() {
  const ips = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function fail(msg) {
  console.error('\n[✕] ' + msg);
  process.stderr.write('', () => process.exit(1));
}

async function main() {
  console.log('\n═══ Link Fortress IT Solutions - Local Dev Setup ═══\n');

  if (!checkDocker()) {
    return fail('Docker is not running. Please start Docker Desktop first.');
  }
  console.log('✓ Docker is running\n');

  let supabaseCmd = detectSupabaseCmd();
  if (!supabaseCmd) {
    console.log('→ Installing Supabase CLI...');
    supabaseCmd = installSupabaseLocal();
    if (!supabaseCmd) {
      return fail('Could not install Supabase CLI.\n  Try: npm install supabase --save-dev');
    }
  }
  console.log('✓ Supabase CLI ready\n');

  await ensureSupabase(supabaseCmd);

  console.log('\n📱 Access from other devices on your network:');
  const ips = getLocalIPs();
  ips.forEach(ip => console.log(`   http://${ip}:3000`));

  console.log('\n→ Starting Vite dev server on http://localhost:3000 ...\n');
  const dev = spawn('npx', ['vite', '--port=3000', '--host=0.0.0.0'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ISLOCAL: 'true' },
    shell: true,
  });
  dev.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error('\n[✕] Error:', e.message);
  process.stderr.write('', () => process.exit(1));
});
