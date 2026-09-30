import { defineConfig } from 'vite';

// GitHub Pages sirve el sitio en /ar-airport-rides/; Vercel, en la raíz.
export default defineConfig({
  base: process.env.GH_PAGES ? '/ar-airport-rides/' : '/',
});
