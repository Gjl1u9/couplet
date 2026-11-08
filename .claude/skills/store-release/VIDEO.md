# Promo video

The person approved the current film, rendered from [`brand/video/teaser.html`](../../../brand/video/teaser.html). New films start from it and keep this style.

## Style

- **Length:** 40 seconds at most. The current one is 38.
- **Sound:** silent. The person decided against music, so add it only if they ask.
- **Story:** the problem first, then one feature per scene, then the ending. Each scene has one short title, such as "Click any word."
- **Titles:** large serif on the paper ground, on their own band above the picture. Words rise one at a time, and the key words get a vermilion rule drawn left to right.
- **Picture:** a browser window that rises and flattens, then a slow push-in on what the title names. The pointer is white with a dark outline, and each click ripples.
- **Ending:** the logo, "Watch what you love. Keep the words you meet.", the Add to Chrome button, and the domain.
- **Calm:** paper colours and Zhupi, with plain transitions, and no emoji or gradients.

[This film by another product](https://www.youtube.com/watch?v=DroOl8klI0w) is what the person pointed to for the pacing and structure. Its look and wording stay its own, under the originality rule in `AGENTS.md`.

## What it shows

- **Real interface:** subtitles, panels, and the Review Card load the product's CSS, and copy its markup and behaviour: the panel's placement, the skeleton, pausing on lookup, and the jump two seconds before a cue.
- **Own footage:** the video inside the player is a drawn scene, so nothing needs a license.
- **Accurate claims:** only features that ship. No user counts, ratings, or results the product hasn't produced. Lookups show one or two common meanings, as the real panel does, not the meaning in that sentence.

When the interface changes, compare the film's markup with `src/lib/ui/lookup-panel.ts` and `src/lib/dashboard/ReviewCard.tsx`.

## Making it

`render(t)` draws any moment from time alone, and the `AT` and `TITLES` tables at the top of its script hold every timing and title.

```bash
node scripts/build-video.mjs --stills <folder>
```

```bash
node scripts/build-video.mjs
```

Check stills at each scene's key moments first, because rendering the film is the slow step. Then check frames pulled from the mp4 itself.

- **Sharp frames:** the product's CSS transitions run on the clock, so the film turns them off in each shadow root.
- **Stacking:** the overlay's real styles use `z-index: 60`, so `#player` isolates them to keep the pointer on top.
- **Colour:** screenshots are full range, and the script converts them to video range so players show the same colours.

Done when `ffprobe` shows the expected length at 1920x1080 and `yuv420p`, and the person has watched it. You can check frames, but only they can judge the pacing, so say so when you hand it over. Deliver it to their Desktop.

## The Short

The upright film for Shorts, Reels, and TikTok is [`brand/video/short.html`](../../../brand/video/short.html), 1080x1920 and 32 seconds. Add `--film short` to both commands above; it renders `brand/video/couplet-short.mp4`.

The person chose its story: Dual Subtitles and "Free" from the first frame, a travel-vlog scene with English and Chinese lines, one word saved, one phrase saved, then the toolbar Popup, Review, Home, Progress, and Explain with AI on Words.

- **Real pages:** the Popup and Dashboard are the shipping React components, rendered by [`short-ui.tsx`](../../../brand/video/short-ui.tsx) with a demo learner's words and a fake `DashboardServices`. Each `?scene=` is its own frame, and its `ready` promise resolves once the page has settled. The script bundles it to `dist/video/` and serves the repo over HTTP, so the film can reach into its frames.
- **Safe area:** the feed's buttons cover the right edge and its caption covers the bottom, so the picture centres a little left and `SAFE` bounds panels and the Explain with AI lean-in.
- **Readable on a phone:** the subtitles use the Large size, and the camera crops the 16:9 player to its middle so they fill the width.
- **Accurate:** a phrase shows Google's translation of the selection alone (`吸收`), as the Lookup Panel does; the AI explanation then gives the meaning in context.
