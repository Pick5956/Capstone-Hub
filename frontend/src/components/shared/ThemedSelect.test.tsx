import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ThemedSelect, { isThemedSelectInteractionTarget } from "./ThemedSelect";

function containingNode(expectedTarget: Node): Pick<Node, "contains"> {
  return {
    contains: (target) => target === expectedTarget,
  } as Pick<Node, "contains">;
}

describe("ThemedSelect", () => {
  it("renders its trigger during server rendering without accessing the portal target", () => {
    const markup = renderToStaticMarkup(
      <ThemedSelect
        value="waiter"
        onChange={() => {}}
        options={[
          { value: "manager", label: "Manager" },
          { value: "waiter", label: "Waiter" },
        ]}
      />,
    );

    expect(markup).toContain("Waiter");
    expect(markup).toContain('aria-haspopup="listbox"');
  });

  it("names the trigger from aria-label", () => {
    // The trigger is a button, so it has no implicit name. Call sites passed
    // aria-label for a long time and it reached nothing: TypeScript does not
    // check hyphenated JSX attributes against a props type, so the prop was
    // dropped in silence and the control was announced unlabelled.
    const markup = renderToStaticMarkup(
      <ThemedSelect
        aria-label="Role"
        value="waiter"
        onChange={() => {}}
        options={[{ value: "waiter", label: "Waiter" }]}
      />,
    );

    expect(markup).toContain('aria-label="Role"');
  });

  it("keeps interactions inside the portaled menu open", () => {
    const target = {} as Node;

    expect(isThemedSelectInteractionTarget(target, null, containingNode(target))).toBe(true);
  });

  it("closes only when an interaction is outside both trigger and portaled menu", () => {
    const target = {} as Node;
    const otherTarget = {} as Node;

    expect(
      isThemedSelectInteractionTarget(
        target,
        containingNode(otherTarget),
        containingNode(otherTarget),
      ),
    ).toBe(false);
  });
});
