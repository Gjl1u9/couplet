---
name: ui-polish
description: Audit and fix the extension's UI in one pass, on real YouTube and extension pages. Use for visual defects such as font size, hover backgrounds, spacing, alignment, clipping, or overlap, after changing any UI or prototype, and before calling UI work finished.
---

# UI polish

Find every visual defect in one pass, fix them together, and prove each fix on real YouTube. The person should never have to report defects one at a time.

Read [`docs/DESIGN.md`](../../../docs/DESIGN.md) first. It is the standard for this audit, and [`AGENTS.md`](../../../AGENTS.md) holds the originality rule.

## 1. Load the current build

1. Run `npm run build:dev`.
2. Use Claude in Chrome in a new tab. An automation-launched browser gets empty captions, so its results do not count.
3. On a YouTube tab, run `window.postMessage({ __dualSubtitlesDevReload: true }, location.origin)`, wait 5 seconds, then open a watch page.
4. Wait for an ad to finish. If `#dual-subtitles-overlay` is still missing, reload once: the first page after an extension reload can miss the content script.

Done when the shadow root contains `.panels` and a subtitle is on screen.

## 2. Audit every state

Pause the video on a cue with several words. For each row below, take a zoomed screenshot and run [`measure.js`](measure.js) through `javascript_tool` when the state is showing. On extension pages, run [`measure-page.js`](measure-page.js) instead. Claude in Chrome cannot open them, so load the build with Playwright.

| Surface  | States                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Subtitle | At rest, controls hidden and showing, wrapped, token hover, selected, Context Lines, Selection, Grip, moved to each edge |
| Lookup   | Loading, with and without phonetics, one and two senses, a long example, playing, failed                                 |
| Settings | Default, and a learning language the video lacks                                                                         |
| Sizes    | Each surface in the default player and in theater mode, at small, medium, and large subtitles                            |
| Pages    | Dashboard, Review Card, and word list, in light and dark, at 360px and desktop width                                     |

Judge each screenshot for: size hierarchy, background fit around text, even padding, alignment, wrapping, clipping, overlap, and contrast.

Hover every interactive element with a real pointer: use `computer` `hover`, then `zoom`. Each shape must meet the hover rule in [`docs/DESIGN.md`](../../../docs/DESIGN.md). This is the defect most often missed, because a 44px hit area on a text button also makes a 44px background, so check it on every new control and prototype.

Tab to every form control: inputs, selects, switches, and segmented options. Each focus ring touches the control's edge, with `outline-offset: 0`, so no gap shows between them. Both measure scripts flag any other offset.

Record every defect with its state, selector, measured value, and the DESIGN.md rule it breaks. Keep going after the first defect.

Done when every row has a screenshot and a `measure.js` result, or a stated reason it could not be reached.

## 3. Fix at the root

Fix the whole list in one batch:

- Prefer changing a token or a shared rule in `src/lib/ui/` over overriding a single element.
- When a defect has no rule, add the rule to `docs/DESIGN.md` and a check to `measure.js`, so it stays fixed.
- Decide ordinary visual details yourself. Ask the person only when a fix would change a design principle or remove a feature.

Done when no recorded defect is left without a fix or a stated reason.

## 4. Prove it

1. Repeat steps 1 and 2 on every state a fix touched.
2. Run `npm run check` and confirm exit code 0.

Done when `measure.js` reports no issues, except any you explain, and the screenshots show the defects gone.

## 5. Report

List each defect with its before and after values, anything you could not reach, and anything that needs the person's eye. Fullscreen needs a real user gesture, so hand that check to the person.
