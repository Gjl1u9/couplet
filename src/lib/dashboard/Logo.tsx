/**
 * The product mark: the original (ink) and its translation (vermilion) overlap,
 * and the overlap is left empty. Geometry matches brand/mark.svg.
 *
 * `brand` follows the page theme. `toolbar` uses the mid-tones from
 * brand/toolbar.svg, to show the mark as it appears in the browser toolbar.
 */
export function Logo({
  variant = 'brand',
}: {
  readonly variant?: 'brand' | 'toolbar';
}) {
  const toolbar = variant === 'toolbar';
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <path
        fill={toolbar ? '#7a8087' : 'var(--ink)'}
        d="M15 4H31A11 11 0 0 1 42 15V22H33A11 11 0 0 0 22 33V42H15A11 11 0 0 1 4 31V15A11 11 0 0 1 15 4Z"
      />
      <path
        fill={toolbar ? '#df4e35' : 'var(--accent)'}
        d="M42 22H49A11 11 0 0 1 60 33V49A11 11 0 0 1 49 60H33A11 11 0 0 1 22 49V42H31A11 11 0 0 0 42 31Z"
      />
    </svg>
  );
}
