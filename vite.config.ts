import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules')) {
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('@capacitor')) return 'capacitor';
            if (id.includes('zustand')) return 'state';
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
