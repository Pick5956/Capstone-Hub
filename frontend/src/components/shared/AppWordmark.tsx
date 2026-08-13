import type { ComponentPropsWithoutRef, CSSProperties } from "react";

export const APP_WORDMARK_SRC = "/dishy-wordmark.svg";
export const APP_WORDMARK_ASPECT_RATIO = 520 / 190;

type AppWordmarkProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  decorative?: boolean;
  height?: number;
};

export default function AppWordmark({
  "aria-label": ariaLabel,
  className = "",
  decorative = false,
  height = 18,
  style,
  ...props
}: AppWordmarkProps) {
  const maskStyle: CSSProperties = {
    width: height * APP_WORDMARK_ASPECT_RATIO,
    height,
    backgroundColor: "currentColor",
    WebkitMaskImage: `url(${APP_WORDMARK_SRC})`,
    maskImage: `url(${APP_WORDMARK_SRC})`,
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    ...style,
  };

  return (
    <span
      {...props}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : (ariaLabel ?? "Dishy")}
      className={`inline-block shrink-0 ${className}`}
      role={decorative ? undefined : "img"}
      style={maskStyle}
    />
  );
}
