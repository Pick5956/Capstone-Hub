"use client";

import { useEffect, useRef, useState } from "react";

// Live dictation waveform, iMessage-style: new samples appear at the RIGHT and
// scroll left. Silence collapses to a faint dot so a pause reads as a dotted
// line, while speech grows into warm rounded bars.
//
// The buffer advances from this component's own animation loop (not from an
// effect that setStates on every `level` change), so the strip keeps scrolling
// during silence and re-renders stay capped at ~20fps.

const BAR_COUNT = 56;
const FRAME_MS = 50;
const SILENCE_LEVEL = 0.06;

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
    <div
      className={`flex h-8 items-center justify-between overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {bars.map((value, index) =>
        value > SILENCE_LEVEL ? (
          <span
            key={index}
            className="w-[3px] shrink-0 rounded-full bg-gradient-to-t from-orange-500 to-amber-400 transition-[height] duration-100 ease-out"
            style={{ height: `${Math.max(16, Math.min(100, value * 165))}%` }}
          />
        ) : (
          <span
            key={index}
            className="h-[3px] w-[3px] shrink-0 rounded-full bg-gray-300 transition-[height] duration-100 ease-out dark:bg-gray-600"
          />
        ),
      )}
    </div>
  );
}
