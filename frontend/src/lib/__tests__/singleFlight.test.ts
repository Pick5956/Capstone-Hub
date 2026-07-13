import { describe, expect, it } from "vitest";
import { createSingleFlight } from "../singleFlight";

describe("createSingleFlight", () => {
  it("runs only one task while the first task is pending", async () => {
    const run = createSingleFlight();
    let release!: () => void;
    const firstTask = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;

    const first = run(async () => {
      calls += 1;
      await firstTask;
      return "done";
    });
    const duplicate = run(async () => {
      calls += 1;
      return "duplicate";
    });

    expect(await duplicate).toBeUndefined();
    expect(calls).toBe(1);
    release();
    await expect(first).resolves.toBe("done");
  });

  it("releases the lock after a task fails", async () => {
    const run = createSingleFlight();

    await expect(run(async () => {
      throw new Error("failed");
    })).rejects.toThrow("failed");

    await expect(run(async () => "recovered")).resolves.toBe("recovered");
  });
});
