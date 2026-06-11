#!/usr/bin/env node
import { execSync, exec } from 'child_process';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import express from 'express';
import path from 'path';
import {
  detectSupabaseCmd, installSupabaseLocal,
  checkDocker, ensureSupabase, ROOT,
} from './lib/supabase-local.mjs';

const DIST = path.join(ROOT, 'dist');

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
  console.error('    Press any key to exit.');
  // Flush stderr before exit so the batch pause sees the message
  process.stderr.write('', () => process.exit(1));
}

async function main() {
  console.log('\n═══ Link Fortress IT Solutions - Client Server ═══\n');

  // 1. Docker
  if (!checkDocker()) {
    return fail('Docker is not running.\n    Please start Docker Desktop and try again.');
  }
  console.log('✓ Docker is running\n');

  // 2. Supabase CLI
  let supabaseCmd = detectSupabaseCmd();
  if (!supabaseCmd) {
    console.log('Supabase CLI not found. Installing...');
    supabaseCmd = installSupabaseLocal();
    if (!supabaseCmd) {
      return fail('Could not install Supabase CLI.\n    Try: npm install supabase --save-dev');
    }
  }
  console.log('✓ Supabase CLI ready\n');

  // 3. Ensure local Supabase is running + schema applied
  const status = await ensureSupabase(supabaseCmd);

  // 4. Build frontend if needed
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.log('\n→ Building frontend...');
    try {
      execSync('npm run build', { cwd: ROOT, stdio: 'inherit', encoding: 'utf-8' });
    } catch {
      return fail('Frontend build failed. Check for errors above.');
    }
  } else {
    console.log('\n✓ Frontend already built (dist/)');
  }

  // 5. Serve
  const app = express();
  app.use(express.static(DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✓ Server running on http://localhost:${PORT}\n`);

    const ips = getLocalIPs();
    if (ips.length > 0) {
      console.log('📱 Access from other devices on your network:');
      ips.forEach(ip => console.log(`   http://${ip}:${PORT}`));
    }

    console.log(`\n📊 Supabase Studio: ${status.studio_url}`);
    console.log('📋 Press Ctrl+C in this window to stop the server\n');

    exec(`start http://localhost:${PORT}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('\n[✕] Unexpected error:', err.message);
  process.stderr.write('', () => process.exit(1));
});

main().catch((e) => {
  console.error('\n[✕] Error:', e.message);
  process.stderr.write('', () => process.exit(1));
});
