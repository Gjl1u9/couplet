// Paste into javascript_tool on a YouTube watch page. It reads what is on screen,
// compares it with docs/DESIGN.md, and changes nothing.
(() => {
  const root = document.querySelector('#dual-subtitles-overlay')?.shadowRoot;
  if (!root) return { error: 'Overlay not found' };

  const issues = [];
  const rect = (el) => el.getBoundingClientRect();
  const visible = (el) => {
    const r = rect(el);
    return r.width > 0 && r.height > 0;
  };
  const round = (n) => Math.round(n * 10) / 10;
  const all = (selector) =>
    [...root.querySelectorAll(selector)].filter(visible);

  const TYPE = {
    '.lookup-word': [20, 28, 600],
    '.phonetic': [13, 20, 400],
    '.settings-head': [20, 28, 600],
    '.lookup-meaning': [16, 24, 500],
    '.couplet-original': [15, 22, 500],
    '.couplet-translation': [14, 21, 400],
    '.setting': [14, null, 400],
  };
  for (const [selector, [size, line, weight]] of Object.entries(TYPE)) {
    for (const el of all(selector)) {
      const s = getComputedStyle(el);
      const actual = [
        parseFloat(s.fontSize),
        parseFloat(s.lineHeight),
        Number(s.fontWeight),
      ];
      if (
        actual[0] !== size ||
        (line !== null && actual[1] !== line) ||
        actual[2] !== weight
      ) {
        issues.push({
          rule: 'type scale',
          selector,
          expected: [size, line, weight],
          actual,
        });
      }
    }
  }

  const player = rect(document.querySelector('#movie_player'));
  const width = player.width;
  const scale =
    parseFloat(
      getComputedStyle(root.host).getPropertyValue('--subtitle-scale'),
    ) || 1;
  const clamp = (min, value, max) => Math.min(Math.max(min, value), max);
  const STRIPS = {
    '.original': clamp(14, width * 0.024, 34) * scale,
    '.translation': clamp(13, width * 0.021, 30) * scale,
  };
  for (const [selector, expected] of Object.entries(STRIPS)) {
    for (const el of all(selector)) {
      const actual = parseFloat(getComputedStyle(el).fontSize);
      if (Math.abs(actual - expected) > 0.5) {
        issues.push({
          rule: 'subtitle size',
          selector,
          expected: round(expected),
          actual,
        });
      }
    }
  }

  const strip = root.querySelector('.strip');
  const stripRect = strip && visible(strip) ? rect(strip) : null;
  if (stripRect && stripRect.width > width * 0.86 + 1) {
    issues.push({ rule: 'strip width', actual: round(stripRect.width) });
  }
  if (
    stripRect &&
    (stripRect.left < player.left ||
      stripRect.right > player.right ||
      stripRect.top < player.top ||
      stripRect.bottom > player.bottom)
  ) {
    issues.push({ rule: 'strip inside player' });
  }
  let previous = null;
  for (const token of all('.token')) {
    const r = rect(token);
    if (
      stripRect &&
      (r.top < stripRect.top - 0.5 ||
        r.bottom > stripRect.bottom + 0.5 ||
        r.left < stripRect.left - 0.5 ||
        r.right > stripRect.right + 0.5)
    ) {
      issues.push({ rule: 'token inside strip', word: token.textContent });
    }
    const range = document.createRange();
    range.selectNodeContents(token);
    const text = range.getBoundingClientRect();
    const slack = [r.width - text.width, r.height - text.height].map(round);
    if (slack[0] > 8) {
      issues.push({
        rule: 'token background fits word',
        word: token.textContent,
        slack,
      });
    }
    if (previous && previous.top === r.top && r.left < previous.right - 0.5) {
      issues.push({ rule: 'tokens overlap', word: token.textContent });
    }
    previous = r;
    const fill = parseFloat(getComputedStyle(token, '::before').height);
    const em = parseFloat(getComputedStyle(token).fontSize);
    if (fill > em + 0.5) {
      issues.push({
        rule: 'token background at most 1em tall',
        word: token.textContent,
        actual: [round(fill), round(em)],
      });
    }
  }

  for (const word of all('.lookup-word')) {
    const lines = rect(word).height / 28;
    const room = rect(word.closest('.lookup-head')).width - 96;
    if (lines > 1.1 && word.scrollWidth <= room) {
      issues.push({ rule: 'word on one line', word: word.textContent });
    }
  }

  // The settings menu has its own compact sizes; see docs/DESIGN.md.
  for (const el of all('.lookup-panel button, .lookup-panel select')) {
    const r = rect(el);
    const minWidth = el.closest('.lookup-actions') ? 30 : 44;
    if (r.width < minWidth || r.height < 44) {
      issues.push({
        rule: 'hit area 44px',
        element: el.getAttribute('aria-label') || el.textContent || el.tagName,
        actual: [round(r.width), round(r.height)],
      });
    }
  }

  // Form controls' focus rings touch their edge; see docs/DESIGN.md.
  const FORM_CONTROL =
    /\b(input|select|textarea)\b|\.switch|\.segmented|\.select-trigger/;
  const focusRules = (rules) =>
    [...rules].flatMap((rule) =>
      rule.cssRules ? focusRules(rule.cssRules) : [rule],
    );
  for (const sheet of root.styleSheets) {
    for (const rule of focusRules(sheet.cssRules)) {
      const offset = rule.style?.outlineOffset;
      if (
        rule.selectorText?.includes(':focus') &&
        FORM_CONTROL.test(rule.selectorText) &&
        offset &&
        parseFloat(offset) !== 0
      ) {
        issues.push({
          rule: 'focus ring touches control',
          selector: rule.selectorText,
          actual: offset,
        });
      }
    }
  }

  const intersects = (a, b) =>
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom;
  for (const panel of all('.panel')) {
    const r = rect(panel);
    if (
      r.left < player.left ||
      r.right > player.right ||
      r.top < player.top ||
      r.bottom > player.bottom
    ) {
      issues.push({ rule: 'panel inside player', panel: panel.className });
    }
    if (panel.scrollWidth > panel.clientWidth + 1) {
      issues.push({ rule: 'panel scrolls sideways', panel: panel.className });
    }
    for (const subtitle of all('.strip')) {
      if (intersects(r, rect(subtitle))) {
        issues.push({ rule: 'panel covers subtitle', panel: panel.className });
      }
    }
  }

  for (const el of all('.panel *, .original, .translation')) {
    if (
      el.scrollWidth > el.clientWidth + 1 &&
      getComputedStyle(el).overflowX === 'hidden'
    ) {
      issues.push({
        rule: 'clipped text',
        element: el.className || el.tagName,
      });
    }
  }

  const unique = [
    ...new Map(issues.map((i) => [JSON.stringify(i), i])).values(),
  ];
  return {
    player: [round(player.width), round(player.height)],
    subtitleScale: scale,
    states: {
      lookup: all('.lookup-panel').length > 0,
      settings: all('.settings-panel').length > 0,
      selected: all('.token.is-selected').length > 0,
      context: all('.context').length > 0,
      placed: root.querySelector('.box.is-placed') !== null,
    },
    issueCount: unique.length,
    issues: unique,
  };
})();
