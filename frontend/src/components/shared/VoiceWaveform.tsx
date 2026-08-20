"use client";

import { useEffect, useRef, useState } from "react";

// Live dictation waveform: a rolling window of recent loudness samples that
// scrolls right-to-left, so it reflects what was actually said rather than
// animating on a timer. `level` (0..1) comes from AIInputTools' mic meter.
//
// The buffer advances from this component's own animation loop (not from an
// effect that setStates on every `level` change), so the strip keeps scrolling
// during silence and re-renders stay capped at ~20fps.

const BAR_COUNT = 32;
const FRAME_MS = 50;

export default function VoiceWaveform({ level, className = "" }: { level: number; className?: string }) {
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const levelRef = useRef(0);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    let frame = 0;
    let lastAdvancedAt = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastAdvancedAt >= FRAME_MS) {
        lastAdvancedAt = timestamp;
        setBars((previous) => [...previous.slice(1), levelRef.current]);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`flex h-8 items-center gap-[3px] ${className}`} aria-hidden="true">
      {bars.map((value, index) => (
        <span
          key={index}
          className="min-w-[2px] flex-1 rounded-full bg-gradient-to-t from-orange-500 to-amber-400 transition-[height] duration-100 ease-out"
          style={{ height: `${Math.max(8, Math.min(100, value * 150))}%` }}
        />
      ))}
    </div>
  );
}
