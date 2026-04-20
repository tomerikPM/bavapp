import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/diagrams/',
  build: {
    outDir: '../frontend/diagrams',
    emptyOutDir: true,
  },
});
