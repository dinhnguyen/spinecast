import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    // Dev over Tailscale: the session cookie is Secure, which browsers drop on a
    // plain-http origin (localhost is exempt, a bare IP is not), so reaching the
    // dev server from a phone or e-reader needs `tailscale serve` in front for
    // real HTTPS - and Vite then needs that MagicDNS host allowed.
    allowedHosts: ['.ts.net'],
  },
});
