/** Lielu Lists mark: a rounded tile with list rules forming an "L". Same geometry as /public/logo.svg. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="#1F3A5F" />
      <rect x="16" y="14" width="8" height="36" rx="4" fill="#fff" />
      <rect x="16" y="42" width="32" height="8" rx="4" fill="#fff" />
      <rect x="30" y="14" width="18" height="6" rx="3" fill="#fff" opacity=".55" />
      <rect x="30" y="28" width="18" height="6" rx="3" fill="#fff" opacity=".55" />
    </svg>
  );
}
