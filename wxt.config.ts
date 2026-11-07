import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'wxt';

/** Prototype only: the key goes into development builds, never into a release. */
function deepSeekKey(mode: string): string {
  if (mode !== 'development' || !existsSync('.env')) return '';
  return parseEnv(readFileSync('.env', 'utf8')).DEEPSEEK_API_KEY ?? '';
}

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Dual Subtitles',
    description: 'Dual subtitles and word review for YouTube',
    // The store's public key, so unpacked builds keep the published extension's ID, which
    // the OAuth redirect depends on: pnjdidlglcbbnfhcnhmhndoakdphhckj.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApL5iVKg69dGiNniDJOAWCLXmeoCDTYTgPauMqmTZ3HXMvjsHUNMABUdQgP/h7fDJfCjqx4yd9XpisXMA0Rf8lQEuBSV8K8IEJRowsqfkKjz9NjQ+JarGgC2yOtj53QT2rh+VRo++kaAfQXqdvK+sL8ioMsXb8hW5XLkZJIoGjD5qlyJu8tSttInLV/I9p+zO9fcleHmMNLoF/2MiNThTMMaxHnVmXPZrfxk3RL3oj69V6Y/eepG1pUfLbg38sTr4iE2igjsOBPrvYVNQBPWWbwB5s0aBlcZDJlQyfmzGkYxYh+CRuxpVQoncuKJGh9++nyxxTXVNh2DrQEuMDLjoiQIDAQAB',
    permissions: ['storage', 'identity', 'alarms', 'unlimitedStorage'],
    action: { default_title: 'Dual Subtitles' },
    host_permissions: [
      'https://translate.googleapis.com/*',
      'https://api.deepseek.com/*',
    ],
  },
  vite: ({ mode }) => ({
    define: {
      'import.meta.env.DEEPSEEK_API_KEY': JSON.stringify(deepSeekKey(mode)),
    },
  }),
});
