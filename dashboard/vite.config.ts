import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const nm = path.resolve(__dirname, 'node_modules');

export default defineConfig({
  plugins: [react()],
  root: '../src/dashboard/app',
  base: '/dashboard/',
  resolve: {
    alias: [
      { find: 'react/jsx-runtime', replacement: path.join(nm, 'react', 'jsx-runtime') },
      { find: 'react/jsx-dev-runtime', replacement: path.join(nm, 'react', 'jsx-dev-runtime') },
      { find: /^react-dom($|\/)/, replacement: path.join(nm, 'react-dom') + '/' },
      { find: /^react($|\/)/, replacement: path.join(nm, 'react') + '/' },
      { find: /^recharts($|\/)/, replacement: path.join(nm, 'recharts') + '/' },
      { find: /^d3-force($|\/)/, replacement: path.join(nm, 'd3-force') + '/' },
      { find: /^d3($|\/)/, replacement: path.join(nm, 'd3') + '/' },
      { find: /^framer-motion($|\/)/, replacement: path.join(nm, 'framer-motion') + '/' },
      { find: /^lucide-react($|\/)/, replacement: path.join(nm, 'lucide-react') + '/' },
      // Zustand: use ESM entries directly to fix .create() export
      { find: 'zustand/react', replacement: path.join(nm, 'zustand', 'esm', 'react.mjs') },
      { find: 'zustand/vanilla', replacement: path.join(nm, 'zustand', 'esm', 'vanilla.mjs') },
      { find: 'zustand', replacement: path.join(nm, 'zustand', 'esm', 'index.mjs') },
    ],
  },
  build: {
    outDir: '../../../dist/dashboard',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
