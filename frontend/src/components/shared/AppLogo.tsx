import Image from "next/image";

type AppLogoProps = {
  size?: number;
  priority?: boolean;
  className?: string;
};

export const APP_LOGO_SRC = "/web-logo.png";

export default function AppLogo({ size = 36, priority = false, className = "" }: AppLogoProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 ${className}`}
      style={{ height: size, width: size }}
    >
      <Image
        src={APP_LOGO_SRC}
        alt="Restaurant Hub"
        fill
        priority={priority}
        sizes={`${size}px`}
        className="object-cover"
      />
    </span>
  );
}
