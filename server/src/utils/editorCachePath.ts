import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
/** Untrusted item identifiers never become directory components. */
export function editorCachePath(directory: string, kind: string, itemId: unknown, extension: string): string {
  if (!/^[a-z]+$/.test(kind) || !/^\.[a-z0-9]+$/.test(extension)) throw new Error('Invalid internal cache type.');
  const name = crypto.createHash('sha256').update(String(itemId)).digest('hex');
  const file = path.join(directory, `${kind}_${name}${extension}`);
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Editor cache symlinks are not allowed.'); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  return file;
}
