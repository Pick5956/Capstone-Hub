import Image from "next/image";

type AppLogoProps = {
  size?: number;
  priority?: boolean;
  className?: string;
  decorative?: boolean;
};

export const APP_LOGO_SRC = "/web-logo.png";

export default function AppLogo({
  size = 36,
  priority = false,
  className = "",
  decorative = false,
}: AppLogoProps) {
  return (
    <span
      // The artwork already carries its own hand-drawn frame and its outside is
      // transparent, so a CSS card behind it just adds a straight white square
      // that ignores the frame slant and shows up on any coloured surface.
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ height: size, width: size }}
    >
      <Image
        src={APP_LOGO_SRC}
        alt={decorative ? "" : "Dishy"}
        fill
        priority={priority}
        sizes={`${size}px`}
        className="object-contain"
      />
    </span>
  );
}
