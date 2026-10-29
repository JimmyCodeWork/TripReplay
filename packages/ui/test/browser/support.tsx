import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

/** Renders into a fresh container; `cleanup` removes it. */
export async function render(node: ReactNode): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

export async function rerender(node: ReactNode): Promise<void> {
  await act(async () => root?.render(node));
}

export function cleanup(): void {
  act(() => root?.unmount());
  container?.remove();
}

export function button(scope: Element, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`No button "${label}"`);
  return found;
}

export async function click(scope: Element, label: string): Promise<void> {
  const target = button(scope, label);
  await act(async () => target.click());
}

/** Types into an input the way React notices. */
export async function type(input: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function submit(form: HTMLFormElement): Promise<void> {
  await act(async () => form.requestSubmit());
}
