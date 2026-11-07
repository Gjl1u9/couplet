// Model of docs/SYNC.md: merge rules, stamps, outbox, conditional push, overlapping pull.
// Run: node prototype/sync-simulation.mjs [runs]. Exits non-zero when an invariant breaks.
const MAX_ENC = 3;
function rng(seed) {
  let s = seed >>> 0 || 1;
  return (n) => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return n ? s % n : s / 4294967296;
  };
}
const maxS = (a, b) => (a == null ? b : b == null ? a : a > b ? a : b);
const sortObj = (o) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const lww = (a, b) => (!a ? b : !b ? a : a.stamp >= b.stamp ? a : b);
const encKey = (e) => e.moment;
const encOrder = (a, b) =>
  b.savedAt - a.savedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function mergeEncs(as, bs) {
  const byId = new Map();
  for (const e of [...as, ...bs]) {
    const o = byId.get(e.id);
    byId.set(
      e.id,
      o ? { ...o, translation: maxS(o.translation, e.translation) } : e,
    );
  }
  const byMoment = new Map();
  for (const e of byId.values()) {
    const o = byMoment.get(encKey(e));
    if (!o || encOrder(e, o) < 0) byMoment.set(encKey(e), e);
  }
  return [...byMoment.values()].sort(encOrder).slice(0, MAX_ENC);
}
function mergeLife(a, b) {
  return {
    birth: a.birth,
    savedAt: Math.min(a.savedAt, b.savedAt),
    entry: lww(a.entry, b.entry),
    review: lww(a.review, b.review),
    forms: [...new Set([...a.forms, ...b.forms])].sort(),
    encounters: mergeEncs(a.encounters, b.encounters),
  };
}
export function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  const deleted = maxS(a.deleted, b.deleted);
  const lives = {};
  for (const src of [a, b])
    for (const [k, l] of Object.entries(src.lives)) {
      if (deleted != null && k <= deleted) continue;
      lives[k] = lives[k] ? mergeLife(lives[k], l) : l;
    }
  return { id: a.id, deleted, lives: sortObj(lives) };
}
export function view(d) {
  if (!d) return null;
  const ls = Object.values(d.lives);
  if (!ls.length) return null;
  const review = ls.map((l) => l.review).reduce(lww);
  const entry = ls.map((l) => l.entry).reduce(lww);
  return {
    id: d.id,
    review: review.v,
    reviewStamp: review.stamp,
    entry: entry.v,
    savedAt: Math.min(...ls.map((l) => l.savedAt)),
    forms: [...new Set(ls.flatMap((l) => l.forms))].sort(),
    encounters: ls.map((l) => l.encounters).reduce(mergeEncs),
    birth: ls
      .map((l) => l.birth)
      .sort()
      .at(-1),
  };
}
const mergeEvent = (a, b) =>
  !a ? b : !b ? a : { ...a, undone: a.undone || b.undone };
const eventVisible = (e, doc) =>
  !e.undone && (!doc || doc.deleted == null || e.wordBirth > doc.deleted);

class Server {
  constructor() {
    this.rows = new Map();
    this.events = new Map();
    this.tick = 0;
  }
  casPush(id, doc, base) {
    const r = this.rows.get(id);
    const rev = r ? r.rev : 0;
    if (rev !== base) return { ok: false, rev, doc: r?.doc };
    if (r && JSON.stringify(merge(r.doc, doc)) !== JSON.stringify(doc))
      throw new Error(
        'server lost data ' + JSON.stringify([r.doc, doc]).slice(0, 300),
      );
    this.tick++;
    this.rows.set(id, { doc, rev: rev + 1, t: this.tick });
    // Deleting purges events the tombstone covers.
    for (const [k, e] of this.events)
      if (e.wordId === id && doc.deleted != null && e.wordBirth <= doc.deleted)
        this.events.delete(k);
    return { ok: true, rev: rev + 1 };
  }
  pushEvent(e) {
    const d = this.rows.get(e.wordId)?.doc;
    if (d?.deleted != null && e.wordBirth <= d.deleted) return;
    this.tick++;
    const o = this.events.get(e.id);
    this.events.set(e.id, { ...mergeEvent(o, e), t: this.tick });
  }
  pullSince(t) {
    return {
      words: [...this.rows.entries()]
        .filter(([, r]) => r.t >= t)
        .map(([id, r]) => ({ id, ...r })),
      events: [...this.events.values()].filter((e) => e.t >= t),
      now: this.tick,
    };
  }
}
class Device {
  constructor(name, server, r, skew) {
    Object.assign(this, { name, server, r, skew });
    this.docs = new Map();
    this.revs = new Map();
    this.events = new Map();
    this.dirty = new Map();
    this.dirtyEv = new Map();
    this.hlcMs = 0;
    this.ctr = 0;
    this.cursor = 0;
    this.seq = 0;
    this.online = true;
    this.inflight = [];
    this.ver = 0;
    this.clock = () => globalClock.t + skew;
  }
  stamp() {
    const ms = this.clock();
    if (ms > this.hlcMs) {
      this.hlcMs = ms;
      this.ctr = 0;
    } else this.ctr++;
    return (
      String(this.hlcMs).padStart(14, '0') +
      '-' +
      String(this.ctr).padStart(5, '0') +
      '-' +
      this.name
    );
  }
  observe(s) {
    if (!s) return;
    const ms = +s.slice(0, 14),
      c = +s.slice(15, 20);
    if (ms > this.hlcMs) {
      this.hlcMs = ms;
      this.ctr = c;
    } else if (ms === this.hlcMs && c > this.ctr) this.ctr = c;
  }
  observeDoc(d) {
    if (!d) return;
    this.observe(d.deleted);
    for (const l of Object.values(d.lives)) {
      this.observe(l.birth);
      this.observe(l.entry.stamp);
      this.observe(l.review.stamp);
    }
  }
  put(id, doc) {
    this.docs.set(id, doc);
    this.dirty.set(id, ++this.ver);
  }
  newest(d) {
    return Object.keys(d.lives).sort().at(-1);
  }
  save(id, moment) {
    const d = this.docs.get(id);
    const v = view(d);
    if (v) return this.addEnc(id, moment);
    const birth = this.stamp();
    if (d?.deleted && birth <= d.deleted) throw new Error('causal re-save');
    const enc = {
      id: birth + 'e',
      moment,
      translation: null,
      savedAt: this.clock(),
    };
    this.put(id, {
      id,
      deleted: d?.deleted ?? null,
      lives: {
        [birth]: {
          birth,
          savedAt: this.clock(),
          entry: { stamp: birth, v: 'entry-' + birth },
          review: { stamp: birth, v: { level: 0, retired: false, count: 0 } },
          forms: [moment + 'f'],
          encounters: [enc],
        },
      },
    });
    log.saves.push({ dev: this, id, birth, seenDeleted: d?.deleted ?? null });
    return birth;
  }
  addEnc(id, moment) {
    const d = this.docs.get(id);
    if (!view(d)) return;
    if (view(d).encounters.some((e) => e.moment === moment)) return;
    const k = this.newest(d);
    const s = this.stamp();
    const l = d.lives[k];
    const enc = {
      id: s + 'e',
      moment,
      translation: null,
      savedAt: this.clock(),
    };
    this.put(id, {
      ...d,
      lives: {
        ...d.lives,
        [k]: {
          ...l,
          forms: [...new Set([...l.forms, moment + 'f'])].sort(),
          encounters: mergeEncs(l.encounters, [enc]),
        },
      },
    });
  }
  writeReview(id, fn) {
    const d = this.docs.get(id);
    const v = view(d);
    if (!v) return null;
    const s = this.stamp();
    const k = this.newest(d);
    if (s <= v.reviewStamp)
      throw new Error('causal review ' + s + ' <= ' + v.reviewStamp);
    const next = fn(v.review);
    this.put(id, {
      ...d,
      lives: {
        ...d.lives,
        [k]: { ...d.lives[k], review: { stamp: s, v: next } },
      },
    });
    return { s, prev: v.review, prevStamp: v.reviewStamp };
  }
  grade(id) {
    const w = this.writeReview(id, (rv) => ({
      ...rv,
      level: rv.level + 1,
      count: rv.count + 1,
    }));
    if (!w) return;
    const d = this.docs.get(id);
    const e = {
      id: w.s + 'ev',
      wordId: id,
      wordBirth: view(d).birth,
      undone: false,
      stamp: w.s,
    };
    this.events.set(e.id, e);
    this.dirtyEv.set(e.id, ++this.ver);
    log.events.set(e.id, e);
    this.lastGrade = { id, eid: e.id, stamp: w.s, prev: w.prev };
    log.causal.push({ dev: this.name, id, stamp: w.s, seen: w.prevStamp });
  }
  undo() {
    const g = this.lastGrade;
    if (!g) return;
    this.lastGrade = null;
    const v = view(this.docs.get(g.id));
    if (!v || v.reviewStamp !== g.stamp) return; // changed elsewhere: Undo is refused
    this.writeReview(g.id, () => g.prev);
    const e = this.events.get(g.eid);
    if (e) {
      this.events.set(g.eid, { ...e, undone: true });
      this.dirtyEv.set(g.eid, ++this.ver);
      log.undone.add(g.eid);
    }
  }
  retire(id) {
    this.writeReview(id, (rv) => ({ ...rv, retired: true }));
  }
  restore(id) {
    this.writeReview(id, (rv) => ({ ...rv, level: 0, retired: false }));
  }
  translate(id) {
    const d = this.docs.get(id);
    if (!view(d)) return;
    const k = Object.keys(d.lives).find((k) =>
      d.lives[k].encounters.some((e) => !e.translation),
    );
    if (!k) return;
    const l = d.lives[k];
    this.put(id, {
      ...d,
      lives: {
        ...d.lives,
        [k]: {
          ...l,
          encounters: l.encounters.map((e) =>
            e.translation ? e : { ...e, translation: 't' + this.name },
          ),
        },
      },
    });
  }
  del(id) {
    const d = this.docs.get(id);
    if (!view(d)) return;
    const s = this.stamp();
    for (const k of Object.keys(d.lives))
      if (s <= k) throw new Error('causal delete');
    this.put(id, { id, deleted: s, lives: {} });
    for (const [k, e] of this.events)
      if (e.wordId === id && e.wordBirth <= s) {
        this.events.delete(k);
        this.dirtyEv.delete(k);
      }
    log.deletes.push({ dev: this.name, id, stamp: s });
  }
  applyRemote(id, doc, rev) {
    this.observeDoc(doc);
    const local = this.docs.get(id);
    const m = merge(local, doc);
    this.docs.set(id, m);
    this.revs.set(id, rev);
    if (JSON.stringify(m) !== JSON.stringify(doc))
      this.dirty.set(id, ++this.ver);
    else if (!this.dirty.has(id) || JSON.stringify(local) === JSON.stringify(m))
      this.dirty.delete(id);
    for (const [k, e] of this.events)
      if (e.wordId === id && !eventVisibleKeep(e, m)) {
        this.events.delete(k);
        this.dirtyEv.delete(k);
      }
  }
  pull() {
    const res = this.server.pullSince(Math.max(0, this.cursor - 3));
    for (const r of res.words) this.applyRemote(r.id, r.doc, r.rev);
    for (const e of res.events) {
      const d = this.docs.get(e.wordId);
      if (!eventVisibleKeep(e, d)) continue;
      const { t, ...clean } = e;
      const merged = mergeEvent(this.events.get(e.id), clean);
      this.events.set(e.id, merged);
      if (JSON.stringify(merged) !== JSON.stringify(clean))
        this.dirtyEv.set(e.id, ++this.ver);
      else this.dirtyEv.delete(e.id);
    }
    this.cursor = res.now;
  }
  // A push is split: send applies at the server, ack comes later (or never).
  send(lose) {
    for (const [id, ver] of [...this.dirty]) {
      const doc = this.docs.get(id);
      const base = this.revs.get(id) ?? 0;
      if (lose === 'before') return;
      const res = this.server.casPush(id, doc, base);
      this.inflight.push({ kind: 'word', id, ver, res, doc });
    }
    for (const [id, ver] of [...this.dirtyEv]) {
      const e = this.events.get(id);
      if (!e) {
        this.dirtyEv.delete(id);
        continue;
      }
      this.server.pushEvent(e);
      this.inflight.push({ kind: 'ev', id, ver });
    }
  }
  ack(drop) {
    const list = this.inflight;
    this.inflight = [];
    if (drop) return;
    for (const a of list) {
      if (a.kind === 'ev') {
        if (this.dirtyEv.get(a.id) === a.ver) this.dirtyEv.delete(a.id);
        continue;
      }
      if (a.res.ok) {
        if ((this.revs.get(a.id) ?? 0) < a.res.rev)
          this.revs.set(a.id, a.res.rev);
        if (this.dirty.get(a.id) === a.ver) this.dirty.delete(a.id);
        const row = this.server.rows.get(a.id);
        const local = this.docs.get(a.id);
        if (
          !this.dirty.has(a.id) &&
          row &&
          JSON.stringify(merge(row.doc, local)) !== JSON.stringify(row.doc)
        )
          throw new Error('unqueued local change ' + a.id);
      } else {
        if (a.res.doc) this.applyRemote(a.id, a.res.doc, a.res.rev);
      }
    }
  }
}
const eventVisibleKeep = (e, d) =>
  !d || d.deleted == null || e.wordBirth > d.deleted;
const globalClock = { t: 1000 };
let log;
function run(seed) {
  const r = rng(seed * 2654435761 + 7);
  log = {
    saves: [],
    events: new Map(),
    undone: new Set(),
    deletes: [],
    causal: [],
  };
  globalClock.t = 1000;
  const server = new Server();
  const skews = [0, r(4) * 5 - 10, r(4) * 5];
  const devs = ['A', 'B', 'C'].map(
    (n, i) => new Device(n, server, r, skews[i]),
  );
  const ids = ['w1', 'w2', 'w3'];
  const steps = 40 + r(120);
  for (let i = 0; i < steps; i++) {
    globalClock.t += r(5);
    const d = devs[r(3)];
    const id = ids[r(3)];
    switch (r(16)) {
      case 0:
      case 1:
        d.save(id, 'm' + r(6));
        break;
      case 2:
        d.addEnc(id, 'm' + r(6));
        break;
      case 3:
      case 4:
        d.grade(id);
        break;
      case 5:
        d.undo();
        break;
      case 6:
        d.retire(id);
        break;
      case 7:
        d.restore(id);
        break;
      case 8:
        d.translate(id);
        break;
      case 9:
        d.del(id);
        break;
      case 10:
        d.online = !d.online;
        break;
      case 11:
        if (d.online) d.pull();
        break;
      case 12:
        if (d.online) d.send(r(5) === 0 ? 'before' : null);
        break;
      case 13:
        if (d.online) d.ack(r(4) === 0);
        else d.inflight = [];
        break;
      case 14:
        if (d.online) {
          d.send();
          d.ack(false);
        }
        break;
      case 15:
        d.inflight = [];
        break;
    }
  }
  for (const d of devs) {
    d.online = true;
    d.inflight = [];
  }
  for (let i = 0; i < 8; i++)
    for (const d of devs) {
      d.pull();
      d.send();
      d.ack(false);
    }
  for (const d of devs) d.pull();
  const fail = (m, x) => {
    throw new Error(
      `seed ${seed}: ${m} ${x ? JSON.stringify(x).slice(0, 400) : ''}`,
    );
  };
  // I1 convergence of documents, views, and visible events.
  const snap = (d) => JSON.stringify([...d.docs.entries()].sort());
  for (const d of devs)
    if (snap(d) !== snap(devs[0]))
      fail('docs diverge', [d.name, snap(d), snap(devs[0])]);
  for (const d of devs) {
    for (const id of ids)
      if (
        JSON.stringify(d.docs.get(id)) !==
        JSON.stringify(server.rows.get(id)?.doc)
      )
        fail('server differs', [
          d.name,
          id,
          d.docs.get(id),
          server.rows.get(id),
        ]);
  }
  const ev = (d) =>
    JSON.stringify(
      [...d.events.values()]
        .filter((e) => eventVisible(e, d.docs.get(e.wordId)))
        .map((e) => e.id)
        .sort(),
    );
  for (const d of devs)
    if (ev(d) !== ev(devs[0])) fail('events diverge', [ev(d), ev(devs[0])]);
  // I8 outboxes drained.
  for (const d of devs)
    if (d.dirty.size || d.dirtyEv.size)
      fail('outbox not empty', [d.name, [...d.dirty], [...d.dirtyEv]]);
  // I2 no event silently lost: each created, not undone, whose word life was not deleted, stays visible.
  const final = devs[0];
  for (const e of log.events.values()) {
    const doc = final.docs.get(e.wordId);
    const covered = doc?.deleted != null && e.wordBirth <= doc.deleted;
    if (!covered && !log.undone.has(e.id) && !final.events.has(e.id))
      fail('event lost', e);
    for (const d of devs)
      if (
        log.undone.has(e.id) &&
        d.events.has(e.id) &&
        eventVisible(d.events.get(e.id), d.docs.get(e.wordId))
      )
        fail('undone event visible', e);
    if (
      covered &&
      final.events.has(e.id) &&
      eventVisible(final.events.get(e.id), doc)
    )
      fail('deleted event visible', e);
  }
  // I3 a word stays dead unless saved after the tombstone.
  for (const id of ids) {
    const doc = final.docs.get(id);
    const v = view(doc);
    if (v) {
      for (const k of Object.keys(doc.lives))
        if (doc.deleted != null && k <= doc.deleted)
          fail('dead life kept', doc);
      if (v.encounters.length < 1 || v.encounters.length > MAX_ENC)
        fail('encounter count', v);
      if (
        new Set(v.encounters.map((e) => e.moment)).size !== v.encounters.length
      )
        fail('duplicate moment', v);
    }
    const lastDel = log.deletes
      .filter((x) => x.id === id)
      .map((x) => x.stamp)
      .sort()
      .at(-1);
    const laterBirth = log.saves
      .filter((s) => s.id === id)
      .some((s) => !lastDel || s.birth > lastDel);
    if (!lastDel && log.saves.some((s) => s.id === id) && !v)
      fail('never deleted but gone', id);
    if (lastDel && !laterBirth && v) fail('resurrected', [id, doc]);
    if (lastDel && laterBirth && !v) fail('re-save lost', [id, doc, lastDel]);
  }
  return {
    steps,
    saves: log.saves.length,
    dels: log.deletes.length,
    evs: log.events.size,
  };
}
// Algebra on random documents.
function randDoc(r) {
  const stamps = ['0001', '0002', '0003', '0004', '0005', '0006'].map(
    (s) => s.padStart(14, '0') + '-00000-A',
  );
  const lives = {};
  const deleted = r(3) === 0 ? stamps[r(6)] : null;
  for (const b of stamps)
    if (r(3) === 0 && !(deleted && b <= deleted)) {
      lives[b] = {
        birth: b,
        savedAt: 1,
        entry: { stamp: stamps[r(6)], v: 'e' },
        review: { stamp: stamps[r(6)], v: { level: 0 } },
        forms: ['a', 'b'].slice(0, r(3)).sort(),
        encounters: mergeEncs(
          [],
          Array.from({ length: r(5) }, () => {
            const n = r(6);
            return {
              id: 'e' + n,
              moment: 'm' + (n % 4),
              translation: r(2) ? 't' + r(2) : null,
              savedAt: n * 3,
            };
          }),
        ),
      };
    }
  for (const k of Object.keys(lives)) {
    const s = lives[k].entry.stamp;
    lives[k].entry = { stamp: s, v: 'e' + s };
    const q = lives[k].review.stamp;
    lives[k].review = { stamp: q, v: { level: q } };
  }
  return { id: 'w', deleted, lives: sortObj(lives) };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let algebra = 0;
const ra = rng(99);
for (let i = 0; i < 200000; i++) {
  const [a, b, c] = [randDoc(ra), randDoc(ra), randDoc(ra)];
  if (!same(merge(a, a), a) && !same(merge(merge(a, a), a), merge(a, a)))
    throw new Error('idempotent ' + JSON.stringify(a));
  if (!same(merge(a, b), merge(b, a)))
    throw new Error(
      'commutative ' + JSON.stringify([a, b, merge(a, b), merge(b, a)]),
    );
  if (!same(merge(merge(a, b), c), merge(a, merge(b, c))))
    throw new Error(
      'associative ' +
        JSON.stringify([a, b, c, merge(merge(a, b), c), merge(a, merge(b, c))]),
    );
  algebra++;
}
console.log('algebra ok', algebra);
let tot = { steps: 0, saves: 0, dels: 0, evs: 0 };
const N = +process.argv[2] || 20000;
for (let s = 1; s <= N; s++) {
  const x = run(s);
  for (const k in tot) tot[k] += x[k];
}
console.log('runs ok', N, tot);
