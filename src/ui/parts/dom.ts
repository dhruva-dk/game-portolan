// A small DOM helper, for the interface's root.

/** Makes an element with classes, appends it to a parent, and optionally fills it with HTML. */
export function el<T extends HTMLElement = HTMLDivElement>(cls: string, parent?: Element | null, html?: string, tag = 'div'): T {
  const e = document.createElement(tag) as T;
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}
