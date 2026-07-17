type LogoProps = {
  size?: number
  className?: string
  /** When true, both halves use currentColor instead of the accent. */
  mono?: boolean
  title?: string
}

/**
 * ImbatranimOS mark — a geometric hourglass (two triangles meeting at a waist).
 * The name comes from "îmbătrânim" (we grow old); the hourglass is the glyph for
 * time/aging. Frame uses currentColor (B&W); the lower half carries the accent.
 */
export function Logo({ size = 20, className, mono = false, title = 'ImbatranimOS' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      {/* upper triangle — points down to the waist */}
      <path d="M4 3.5 H20 L12 12 Z" fill="currentColor" />
      {/* lower triangle — accent, points up to the waist */}
      <path d="M12 12 L20 20.5 H4 Z" fill={mono ? 'currentColor' : 'var(--accent)'} />
      {/* end caps for an hourglass read */}
      <path
        d="M3.5 3.5 H20.5 M3.5 20.5 H20.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  )
}
