import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { openCorrectionIntake } from "../client/src/public/correction-modal";

const doms: JSDOM[] = [];

afterEach(() => {
  while (doms.length) doms.pop()?.window.close();
});

function openDialog() {
  const dom = new JSDOM(
    '<!doctype html><button id="trigger">Düzeltme bildir</button><div id="host"></div>',
    { url: "https://public.example.test/", pretendToBeVisual: true }
  );
  doms.push(dom);
  const { document } = dom.window;
  const trigger = document.getElementById("trigger") as HTMLButtonElement;
  trigger.focus();
  const root = document.getElementById("host") as HTMLElement;
  openCorrectionIntake(
    { root, window: dom.window as unknown as Window },
    { entityKind: "event", entityId: "event-1" }
  );
  return { dom, document, trigger, root };
}

describe("correction dialog keyboard access", () => {
  it("keeps forward and backward Tab navigation within the modal", () => {
    const { dom, document, root } = openDialog();
    const first = root.querySelector('[name="claim"]') as HTMLTextAreaElement;
    const last = root.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(last);

    last.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(first);
  });

  it.each(["Escape", "cancel", "backdrop"])(
    "returns focus to the triggering control after closing with %s",
    closeWith => {
      const { dom, document, trigger, root } = openDialog();
      const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
      if (closeWith === "Escape") {
        dialog.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          })
        );
      } else if (closeWith === "cancel") {
        (
          dialog.querySelector('button[type="button"]') as HTMLButtonElement
        ).click();
      } else {
        (root.querySelector(".cm-correction-backdrop") as HTMLElement).click();
      }
      expect(root.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    }
  );
});
