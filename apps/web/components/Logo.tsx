import Image from "next/image";
import Link from "next/link";

export type LogoVariant = "dark" | "light" | "monochrome" | "symbol";

type LogoImageProps = {
  variant?: LogoVariant | undefined;
  size?: number | undefined;
  priority?: boolean | undefined;
  decorative?: boolean | undefined;
  alt?: string | undefined;
  className?: string | undefined;
};

type LogoProps = LogoImageProps & {
  href?: string | null | undefined;
};

const assets = {
  dark: {
    src: "/brand/lapsignal/lapsignal-horizontal-transparent.png",
    width: 1200,
    height: 600
  },
  light: {
    src: "/brand/lapsignal/lapsignal-horizontal-light.png",
    width: 1200,
    height: 480
  },
  symbol: {
    src: "/brand/lapsignal/lapsignal-symbol-transparent.png",
    width: 768,
    height: 576
  }
} as const;

function BrandImage({
  variant = "dark",
  size,
  priority = false,
  decorative = false,
  alt,
  className
}: LogoImageProps) {
  // The approved raster kit contains monochrome examples only inside reference
  // sheets. Preserve the approved full-colour lockup until a standalone master
  // is supplied instead of cropping or manufacturing a recoloured derivative.
  const monochromeFallback = variant === "monochrome";
  const resolvedVariant = monochromeFallback ? "dark" : variant;
  const asset = assets[resolvedVariant];
  const renderedWidth = size ?? (resolvedVariant === "symbol" ? 44 : 168);
  const imageAlt = decorative ? "" : (alt ?? (resolvedVariant === "symbol" ? "LapSignal symbol" : "LapSignal"));

  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={imageAlt}
      preload={priority}
      draggable={false}
      aria-hidden={decorative || undefined}
      data-logo-variant={variant}
      data-monochrome-fallback={monochromeFallback || undefined}
      className={["brand-logo-image", `brand-logo-image--${resolvedVariant}`, className].filter(Boolean).join(" ")}
      style={{ width: renderedWidth, height: "auto" }}
    />
  );
}

export function SignalMark({ size = 44, priority = false, decorative = false, alt, className }: Omit<LogoImageProps, "variant">) {
  return <BrandImage variant="symbol" size={size} priority={priority} decorative={decorative} alt={alt} className={className} />;
}

export function Logo({ href = "/", variant = "dark", size, priority = false, decorative = false, alt, className }: LogoProps) {
  const image = <BrandImage variant={variant} size={size} priority={priority} decorative={href ? true : decorative} alt={alt} />;
  const classes = ["logo", className].filter(Boolean).join(" ");

  if (!href) return <span className={classes}>{image}</span>;

  return (
    <Link href={href} className={classes} aria-label="LapSignal home">
      {image}
    </Link>
  );
}
