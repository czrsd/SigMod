import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: '/admin/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { strictPort: true, port: 5173, hmr: { host: 'localhost', clientPort: 5173, protocol: 'ws' } },
    build: { sourcemap: false },
    test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], clearMocks: true },
});
