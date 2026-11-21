/**
 * Script 100 % Node.js (multi-plateforme : Windows / Linux / macOS, zéro outil externe)
 * Génère `faas-vote/faas-vote.zip` avec chemins UNIX (`/`) prêts pour upload en 1 clic sur AWS Lambda.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const zipPath = path.join(rootDir, 'faas-vote.zip');

// Table CRC32 standard IEEE 802.3
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function collectFiles(absPath, relPrefix, list) {
  const stat = fs.lstatSync(absPath);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absPath)) {
      if (entry === '.bin' || entry === '.cache') continue;
      collectFiles(path.join(absPath, entry), `${relPrefix}/${entry}`, list);
    }
  } else if (stat.isFile()) {
    list.push({ absPath, zipName: relPrefix.replace(/\\/g, '/') });
  }
}

function createZip(entries, outputPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const raw = fs.readFileSync(entry.absPath);
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const nameBuf = Buffer.from(entry.zipName, 'utf8');

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x5421, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4); // Unix creator, version 2.0
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // permissions UNIX rw-r--r--
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(outputPath, Buffer.concat([...localParts, centralDir, eocd]));
}

if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
  console.log('[PACKAGE] Installation des dépendances de production...');
  execSync('npm install --omit=dev', { cwd: rootDir, stdio: 'inherit' });
}

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

console.log('[PACKAGE] Création de l\'archive AWS Lambda (faas-vote.zip)...');
const files = [
  { absPath: path.join(rootDir, 'index.mjs'), zipName: 'index.mjs' },
  { absPath: path.join(rootDir, 'package.json'), zipName: 'package.json' },
];
collectFiles(path.join(rootDir, 'node_modules'), 'node_modules', files);
createZip(files, zipPath);

const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`[PACKAGE] Succès ! Archive prête : ${zipPath} (${sizeKb} Ko, ${files.length} fichiers)`);
console.log('[PACKAGE] Téléversez ce fichier dans AWS Console -> Lambda -> Upload from -> .zip file.');
