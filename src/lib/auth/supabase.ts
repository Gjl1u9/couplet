import { createClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY } from './messages';

// Both are public: they ship in the extension, and Row Level Security protects the data.
const SUPABASE_URL = 'https://pfgymrsdimvrhaevndtk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_FShvH02rF-Adp-DSeuG3ng_I1A8thwH';

/** The session survives the background script stopping, so it lives in extension storage. */
export function createSupabase() {
  const { local } = browser.storage;
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      storage: {
        getItem: async (key) => {
          const value = (await local.get(key))[key];
          return typeof value === 'string' ? value : null;
        },
        setItem: (key, value) => local.set({ [key]: value }),
        removeItem: (key) => local.remove(key),
      },
      flowType: 'pkce',
      // Timers stop with the background script, so tokens refresh when they are read.
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
