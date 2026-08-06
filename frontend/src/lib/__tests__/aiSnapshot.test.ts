import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectOperationsSnapshot } from "@/src/lib/aiSnapshot";
import type { AISnapshot } from "@/src/types/ai";

const snapshot = (generatedAt: string) => ({ generated_at: generatedAt }) as AISnapshot;

describe("selectOperationsSnapshot", () => {
  it("keeps a newer current snapshot when an older request finishes later", () => {
    const current = snapshot("2026-08-03T12:00:01Z");
    expect(selectOperationsSnapshot(current, snapshot("2026-08-03T12:00:00Z"))).toBe(current);
  });

  it("accepts a newer valid snapshot and rejects missing or invalid timestamps", () => {
    const current = snapshot("2026-08-03T12:00:00Z");
    const newer = snapshot("2026-08-03T12:00:01Z");

    expect(selectOperationsSnapshot(current, newer)).toBe(newer);
    expect(selectOperationsSnapshot(current, null)).toBe(current);
    expect(selectOperationsSnapshot(current, snapshot("invalid"))).toBe(current);
  });
});

describe("AI snapshot integration", () => {
  const sources = [
    "../../app/(dashboard)/ai-assistant/page.tsx",
    "../../components/shared/AIOperationsFloatingChat.tsx",
  ].map((relativePath) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"));

  it("clears restaurant-scoped snapshot state whenever the chat storage scope changes", () => {
    for (const source of sources) {
      expect(source).toContain("snapshotRequestedRef.current = false;");
      expect(source).toContain("setLatestSnapshot(null);");
    }
  });

  it("guards every snapshot update against stale request ordering", () => {
    for (const source of sources) {
      expect(source).toContain("const [snapshotRequests] = useState(createRequestGeneration);");
      expect(source).toContain("snapshotRequests.invalidate();");
      expect(source.match(/const snapshotGeneration = snapshotRequests\.begin\(\);/g)).toHaveLength(3);
      expect(source.match(/setLatestSnapshot\(\(current\) => selectOperationsSnapshot\(current,/g)).toHaveLength(4);
    }
  });
});
