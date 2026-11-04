import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifest: {
    name: 'Dual Subtitles',
    description: 'YouTube 雙語字幕',
    host_permissions: ['https://translate.googleapis.com/*'],
  },
});
