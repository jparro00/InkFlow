// App-wide brand mark. Rendered via <img> instead of inlined JSX so the 75 KB
// SVG is fetched once and HTTP-cached — inlining it into every component
// import would bloat every chunk that uses Logo. The file lives at
// public/logo.svg and is the single source of truth for the favicon, PWA
// icons (generated via scripts/generate-icons.mjs), and the boot splash.

type LogoProps = {
  className?: string;
  ariaLabel?: string;
};

export default function Logo({ className, ariaLabel = 'Ink Bloop' }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt={ariaLabel}
      className={className}
      draggable={false}
    />
  );
}
