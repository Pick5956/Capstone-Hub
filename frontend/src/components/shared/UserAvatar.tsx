"use client";

import Image from "next/image";
import { useState } from "react";

type UserAvatarProps = {
  src?: string | null;
  name: string;
  size: number;
  className?: string;
};

function initialsFromName(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export default function UserAvatar({ src, name, size, className = "" }: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState("");
  const imageUrl = src?.trim() || "";
  const showImage = Boolean(imageUrl) && failedSrc !== imageUrl;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 font-semibold text-orange-700 dark:bg-orange-900/25 dark:text-orange-300 ${className}`}
    >
      {showImage ? (
        <Image
          src={imageUrl}
          alt={name}
          width={size}
          height={size}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(imageUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        initialsFromName(name)
      )}
    </div>
  );
}
