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
  const read = (relativePath: string) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

  // Only the floating chat still shows a snapshot: its stats panel renders
  // sales_days, stock_risks and inventory_summary. The AI page used to fetch the
  // same payload for a stats block that has since been removed, so it kept
  // paying for a request nobody read — see the assertions below.
  const floatingChat = read("../../components/shared/AIOperationsFloatingChat.tsx");

  it("clears restaurant-scoped snapshot state whenever the chat storage scope changes", () => {
    expect(floatingChat).toContain("snapshotRequestedRef.current = false;");
    expect(floatingChat).toContain("setLatestSnapshot(null);");
  });

  it("guards every snapshot update against stale request ordering", () => {
    expect(floatingChat).toContain("const [snapshotRequests] = useState(createRequestGeneration);");
    expect(floatingChat).toContain("snapshotRequests.invalidate();");
    expect(floatingChat.match(/const snapshotGeneration = snapshotRequests\.begin\(\);/g)).toHaveLength(3);
    expect(floatingChat.match(/setLatestSnapshot\(\(current\) => selectOperationsSnapshot\(current,/g)).toHaveLength(4);
  });

  // The AI page dropped its stats block, so a snapshot fetched there is a request
  // whose result is stored and never shown — three per question, plus one on
  // open. It must not creep back with the next feature that "just needs the
  // numbers"; whatever needs them should render them.
  it("keeps the AI page off the snapshot endpoint it has nothing to show from", () => {
    const page = read("../../app/(dashboard)/ai-assistant/page.tsx");
    for (const dead of ["getOperationsSnapshot", "selectOperationsSnapshot", "latestSnapshot"]) {
      expect(page).not.toContain(dead);
    }
  });
});
