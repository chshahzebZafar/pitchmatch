import { mkdirSync } from 'fs';
import { join, resolve } from 'path';

// Uploads live OUTSIDE the deployed app dir so redeploys (which replace the app
// folder) don't wipe user files. Defaults to a sibling `uploads/` of the app cwd
// (e.g. ~/domains/<domain>/uploads on Hostinger). Override with UPLOAD_DIR.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || resolve(process.cwd(), '..', 'uploads');
export const AVATAR_DIR = join(UPLOAD_DIR, 'avatars');

// Public origin (no /api/v1) used to build absolute media URLs.
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || 'https://pitchmatch.myrtcat.com';

export function ensureUploadDirs() {
  mkdirSync(AVATAR_DIR, { recursive: true });
}

export function avatarUrl(filename: string): string {
  return `${PUBLIC_BASE_URL}/uploads/avatars/${filename}`;
}
