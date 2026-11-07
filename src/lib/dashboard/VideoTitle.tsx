import type { VideoOrigin } from '../vocabulary/vocabulary';
import { ICONS } from './Icon';

/** A new site must add its icon here before the type check passes. */
const SITES: Record<
  VideoOrigin['site'],
  { readonly name: string; readonly paths: readonly string[] }
> = {
  youtube: { name: 'YouTube', paths: ICONS.youtube },
};

/** A video's title, with an icon for the site it came from. */
export function VideoTitle({ origin }: { readonly origin: VideoOrigin }) {
  const site = SITES[origin.site];
  return (
    <span className="video-title" title={origin.title}>
      <svg
        className="icon"
        viewBox="0 0 24 24"
        role="img"
        aria-label={site.name}
      >
        {site.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <span className="video-title-text">{origin.title}</span>
    </span>
  );
}
