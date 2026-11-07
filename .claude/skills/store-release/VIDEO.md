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
