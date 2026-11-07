// A browser-level stand-in for Supabase's REST API, with the same rules as the SQL.
const sortKeys = (v) =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
            .map(([k, x]) => [k, sortKeys(x)]),
        )
      : v;
export function createBackend() {
  const users = new Map();
  let tick = Date.now();
  let down = false;
  const calls = [];
  const u = (id) => {
    if (!users.has(id)) users.set(id, { words: new Map(), events: new Map() });
    return users.get(id);
  };
  const ts = () => {
    tick += 5;
    return new Date(tick).toISOString();
  };
  const handle = (user, method, path, query, body) => {
    const d = u(user);
    calls.push(`${method} ${path}`);
    if (path === '/rest/v1/rpc/sync_now')
      return JSON.stringify(new Date().toISOString().replace('Z', '+00:00'));
    const list = (rows, idk) => {
      let r = [...rows];
      const gte = query.get('server_updated_at');
      if (gte)
        r = r.filter((x) => x.server_updated_at >= gte.replace('gte.', ''));
      r.sort(
        (a, b) =>
          a.server_updated_at.localeCompare(b.server_updated_at) ||
          a[idk].localeCompare(b[idk]),
      );
      return JSON.stringify(r.slice(0, +(query.get('limit') || 1000)));
    };
    if (path === '/rest/v1/words') return list(d.words.values(), 'word_id');
    if (path === '/rest/v1/review_events') return list(d.events.values(), 'id');
    if (path === '/rest/v1/rpc/push_words') {
      const results = body.items.map((it) => {
        const r = d.words.get(it.word_id);
        const rev = r?.rev ?? 0;
        if (rev !== it.base_rev)
          return {
            word_id: it.word_id,
            status: 'conflict',
            rev,
            doc: r?.doc ?? null,
          };
        d.words.set(it.word_id, {
          word_id: it.word_id,
          doc: sortKeys(it.doc),
          rev: rev + 1,
          server_updated_at: ts(),
        });
        if (it.doc.deleted)
          for (const [k, e] of d.events)
            if (e.word_id === it.word_id && e.word_birth <= it.doc.deleted)
              d.events.delete(k);
        return { word_id: it.word_id, status: 'stored', rev: rev + 1 };
      });
      return JSON.stringify({ results, server_time: new Date().toISOString() });
    }
    if (path === '/rest/v1/rpc/push_events') {
      for (const it of body.items) {
        const t = d.words.get(it.word_id)?.doc?.deleted;
        if (t && it.word_birth <= t) continue;
        const o = d.events.get(it.id);
        d.events.set(it.id, {
          id: it.id,
          word_id: it.word_id,
          word_birth: it.word_birth,
          doc: sortKeys(it.doc),
          undone: (o?.undone ?? false) || it.undone,
          server_updated_at: ts(),
        });
      }
      return JSON.stringify({
        rejected: [],
        server_time: new Date().toISOString(),
      });
    }
    return null;
  };
  return {
    handle,
    calls,
    users,
    u,
    setDown: (v) => {
      down = v;
    },
    isDown: () => down,
  };
}
export async function attach(ctx, backend, userOf) {
  await ctx.route(
    'https://pfgymrsdimvrhaevndtk.supabase.co/**',
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'OPTIONS')
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': '*',
          },
        });
      if (backend.isDown()) return route.abort('failed');
      let body = null;
      try {
        body = req.postDataJSON();
      } catch {}
      const out = backend.handle(
        userOf(),
        req.method(),
        url.pathname,
        url.searchParams,
        body,
      );
      if (out === null)
        return route.fulfill({
          status: 404,
          body: '{}',
          headers: { 'access-control-allow-origin': '*' },
        });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: out,
      });
    },
  );
}
