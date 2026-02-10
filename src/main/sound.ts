import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger';

let isPlaying = false;

export function playCustomSound(filePath: string): void {
  if (!path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.wav') {
    log(`Invalid custom sound path: ${filePath}`);
    return;
  }

  if (isPlaying) {
    log('Sound already playing, skipping');
    return;
  }

  const resolved = path.resolve(filePath);

  void fs.promises.access(resolved, fs.constants.R_OK).then(() => {
    isPlaying = true;
    const escaped = resolved.replace(/'/g, "''");
    execFile(
      'powershell',
      ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${escaped}').PlaySync()`],
      (error) => {
        isPlaying = false;
        if (error) {
          log(`Failed to play custom sound: ${error.message}`);
        }
      },
    );
  }).catch(() => {
    log(`Custom sound file not found: ${resolved}`);
  });
}
