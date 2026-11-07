// Paste into a page script on an extension page. It compares hover shapes with the
// rule in docs/DESIGN.md, and changes nothing.
(() => {
  const issues = [];
  const SHAPES = '.text-button';
  const textRect = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect();
  };
  const name = (element) =>
    element.getAttribute('aria-label') ||
    element.textContent.trim().slice(0, 12);
  const shapes = [...document.querySelectorAll(SHAPES)];
  for (const element of shapes) {
    const shape = element.getBoundingClientRect();
    const text = textRect(element);
    if (shape.height - text.height > 8 || shape.width - text.width > 12) {
      issues.push({ rule: 'shape hugs text', element: name(element) });
    }
  }
  const neighbours = [
    ...shapes,
    ...document.querySelectorAll(
      '.icon-button, .button, .action, .review-title, .review-word, .confirm',
    ),
  ];
  const touches = (a, b) =>
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom;
  for (const element of shapes) {
    for (const other of neighbours) {
      if (
        element === other ||
        element.contains(other) ||
        other.contains(element)
      ) {
        continue;
      }
      if (
        touches(element.getBoundingClientRect(), other.getBoundingClientRect())
      ) {
        issues.push({
          rule: 'shape overlaps neighbour',
          element: name(element),
          other: name(other),
        });
      }
    }
  }

  // Form controls' focus rings touch their edge; see docs/DESIGN.md.
  const FORM_CONTROL =
    /\b(input|select|textarea)\b|\.switch|\.segmented|\.select-trigger/;
  const focusRules = (rules) =>
    [...rules].flatMap((rule) =>
      rule.cssRules ? focusRules(rule.cssRules) : [rule],
    );
  for (const sheet of document.styleSheets) {
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

  if (document.documentElement.scrollWidth > innerWidth) {
    issues.push({ rule: 'page scrolls sideways' });
  }
  return { issueCount: issues.length, issues };
})();
