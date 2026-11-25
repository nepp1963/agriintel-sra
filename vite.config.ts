import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sraSyncPlugin } from './src/sra/server/sraDevSyncMiddleware';

export default defineConfig({
  plugins: [react(), sraSyncPlugin()],
  server: {
    port: 3000,
  },
});
