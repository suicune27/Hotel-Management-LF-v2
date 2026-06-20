import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const repoUrl = 'https://github.com/suicune27/Hotel-Management-LF-v2/archive/refs/heads/main.zip';
const zipPath = path.join(ROOT, 'repo-main.zip');
const extractTempDir = path.join(ROOT, 'tmp-extract');

async function downloadFile(url, dest) {
  console.log(`→ Downloading updates from stable URL: ${url}`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} - ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  console.log('✓ File saved to disk.');
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    const name = path.basename(src).toLowerCase();
    // Exclude env.local, .env, or other local files to prevent security/config deletion
    if (name === 'env.local' || name === '.env' || name === '.env.local') {
      console.log(`Skipping environment file: ${src}`);
      return;
    }
    // Skip git folder
    if (src.includes(`${path.sep}.git${path.sep}`) || name === '.git') {
      return;
    }
    
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  try {
    console.log(`Starting update process for ${repoUrl}`);
    await downloadFile(repoUrl, zipPath);
    console.log('✓ Download completed successfully.');

    console.log('→ Extracting repository archive...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractTempDir, true);
    console.log('✓ Extraction completed.');

    // Find the subdirectory inside extractTempDir dynamically
    const dirs = fs.readdirSync(extractTempDir).filter(d => {
      const fullPath = path.join(extractTempDir, d);
      return fs.statSync(fullPath).isDirectory() && !d.startsWith('.');
    });
    
    const subDirName = dirs[0];
    if (!subDirName) {
      throw new Error(`Could not find extracted repository directory in temporary path! Found: ${dirs.join(', ')}`);
    }

    const sourceDir = path.join(extractTempDir, subDirName);
    console.log(`→ Copying new updates from "${sourceDir}" into directory "${ROOT}"...`);
    
    // Copy all files
    copyRecursiveSync(sourceDir, ROOT);
    console.log('✓ Files updated successfully.');

    // Cleanup
    console.log('→ Cleaning up temporary files...');
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    if (fs.existsSync(extractTempDir)) {
      fs.rmSync(extractTempDir, { recursive: true, force: true });
    }
    console.log('✓ Cleanup completed.');

    console.log('🎉 GitHub Updates Pulled Successfully!');
  } catch (error) {
    console.error('❌ Error pulling updates:', error);
    process.exit(1);
  }
}

main();
