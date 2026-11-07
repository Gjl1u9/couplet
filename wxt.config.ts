import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  zip: { artifactTemplate: 'couplet-{{version}}-{{browser}}.zip' },
  modules: ['@wxt-dev/module-react'],
  // By default Vite scans every HTML file in the project, including dist/ while it is rebuilt.
  vite: () => ({
    optimizeDeps: { entries: ['src/entrypoints/*/index.html'] },
  }),
  manifest: {
    // The store shows the name and summary, so they say what the extension does. Their text
    // is in public/_locales, and each locale there also gets a description in the dashboard.
    default_locale: 'en',
    name: '__MSG_extensionName__',
    short_name: 'Couplet',
    description: '__MSG_extensionDescription__',
    // The store's public key, so unpacked builds keep the published extension's ID, which
    // the OAuth redirect depends on: pnjdidlglcbbnfhcnhmhndoakdphhckj. The store assigns that ID
    // itself and can refuse an upload with this field, so its package leaves it out.
    ...(process.env.COUPLET_STORE_BUILD
      ? {}
      : {
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApL5iVKg69dGiNniDJOAWCLXmeoCDTYTgPauMqmTZ3HXMvjsHUNMABUdQgP/h7fDJfCjqx4yd9XpisXMA0Rf8lQEuBSV8K8IEJRowsqfkKjz9NjQ+JarGgC2yOtj53QT2rh+VRo++kaAfQXqdvK+sL8ioMsXb8hW5XLkZJIoGjD5qlyJu8tSttInLV/I9p+zO9fcleHmMNLoF/2MiNThTMMaxHnVmXPZrfxk3RL3oj69V6Y/eepG1pUfLbg38sTr4iE2igjsOBPrvYVNQBPWWbwB5s0aBlcZDJlQyfmzGkYxYh+CRuxpVQoncuKJGh9++nyxxTXVNh2DrQEuMDLjoiQIDAQAB',
        }),
    permissions: ['storage', 'identity', 'alarms', 'unlimitedStorage'],
    action: { default_title: 'Couplet' },
    host_permissions: [
      'https://translate.googleapis.com/*',
      'https://api.coupletapp.com/*',
    ],
  },
});
