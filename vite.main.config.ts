import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    {
      name: 'copy-tray-icons',
      closeBundle() {
        const src = path.resolve(__dirname, 'assets');
        const dest = path.resolve(__dirname, '.vite/build/assets');
        mkdirSync(dest, { recursive: true });
        for (const file of readdirSync(src)) {
          if (file.startsWith('tray-icon')) {
            copyFileSync(path.join(src, file), path.join(dest, file));
          }
        }
      },
    },
  ],
});
