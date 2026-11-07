---
name: dashboard-ui
description: Build or change Dashboard, Review, or word list pages from the spec, without stopping for detail decisions. Use for any UI work under src/lib/dashboard, and for new extension pages.
---

# Dashboard UI

Read [`docs/DASHBOARD.md`](../../../docs/DASHBOARD.md), [`docs/REVIEW.md`](../../../docs/REVIEW.md), and [`docs/DESIGN.md`](../../../docs/DESIGN.md) first.

## 1. Earn the feature

Give each feature a row in the spec: the problem without it, what it does, and what it interacts with. If removing it causes no problem, leave it out and name it under Out of scope.

Done when every control on the page traces to a row.

## 2. Decide or ask

Ask only about product position: who it is for, what it refuses to do, and pricing. Decide the rest and record it under Decisions made. A visible choice that is cheap to change is the person's to react to, on a working page.

## 3. Build from what exists

- Use tokens, and existing classes in `dashboard.css`.
- Keep logic that can be pure in `stats.ts`, `session.ts`, or `format.ts`, tested without a browser.
- Reach the extension only through `services.ts`.

Every number comes from stored data. Every control works. Each view handles new, loading, empty, and error.

## 4. Keep it ours

Look at other products for features, then close their tab and design from Zhupi. Before finishing, compare against their screenshots. If the logo were removed and a reader could still name the product we studied, redesign it.

Done when the Original design table in the spec names how each borrowed feature differs.

## 5. Prove it

1. Run the page with Playwright against the built extension, seeded with real-shaped data, because Claude in Chrome cannot open extension pages.
2. Use every control once. Look at light, dark, and 360px screenshots.
3. Run [`measure-page.js`](../ui-polish/measure-page.js) on each page and hover every control.
4. Run `npm run check`.

Report what was exercised and what was not.
