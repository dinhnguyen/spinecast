const BLOCK_TAGS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'dd', 'dt', 'div', 'td', 'th', 'figcaption']);

const tagOf = (el: Element): string => el.localName.toLowerCase();

const sameTagIndex = (el: Element): number => {
  let n = 1;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (tagOf(s) === tagOf(el)) n++;
  return n;
};

const textIndexOf = (text: Node): number => {
  let n = 1;
  for (let s = text.previousSibling; s; s = s.previousSibling) if (s.nodeType === Node.TEXT_NODE) n++;
  return n;
};

export const innerPathFromNode = (body: Element, node: Node): { inner: string; textIndex: number | null } => {
  const steps: string[] = [];
  let textIndex: number | null = null;
  let cur: Node | null = node;
  if (cur.nodeType === Node.TEXT_NODE) {
    textIndex = textIndexOf(cur);
    steps.push(`text()[${textIndex}]`);
    cur = cur.parentNode;
  }
  while (cur && cur !== body && cur.nodeType === Node.ELEMENT_NODE) {
    const el = cur as Element;
    steps.push(`${tagOf(el)}[${sameTagIndex(el)}]`);
    cur = cur.parentNode;
  }
  return { inner: steps.reverse().join('/'), textIndex };
};

const STEP_RE = /^([a-zA-Z][\w-]*)(?:\[(\d+)\])?$/;
const TEXT_RE = /^text\(\)(?:\[(\d+)\])?$/;

// Manual walk instead of document.evaluate: XHTML sections are namespaced and KOReader indices
// count same-tag siblings, which is exactly what this does.
export const resolveInnerPath = (body: Element, inner: string): Node | null => {
  if (!inner) return body;
  let cur: Node = body;
  for (const step of inner.split('/')) {
    const t = step.match(TEXT_RE);
    if (t) {
      const want = t[1] ? Number(t[1]) : 1;
      let n = 0;
      let found: Node | null = null;
      for (const child of Array.from(cur.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && ++n === want) { found = child; break; }
      }
      if (!found) return null;
      return found;
    }
    const m = step.match(STEP_RE);
    if (!m) return null;
    const tag = m[1]!.toLowerCase();
    const want = m[2] ? Number(m[2]) : 1;
    let n = 0;
    let found: Element | null = null;
    for (const child of Array.from(cur.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && tagOf(child as Element) === tag && ++n === want) { found = child as Element; break; }
    }
    if (!found) return null;
    cur = found;
  }
  return cur;
};

const hasBlockChild = (el: Element): boolean => Array.from(el.children).some((c) => BLOCK_TAGS.has(tagOf(c)));

export const paragraphBlocks = (body: Element): Element[] => {
  const out: Element[] = [];
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const tag = tagOf(child);
      if (BLOCK_TAGS.has(tag) && !hasBlockChild(child)) {
        if ((child.textContent ?? '').trim()) out.push(child);
      } else {
        walk(child);
      }
    }
  };
  walk(body);
  return out;
};

export const paragraphIndexOf = (body: Element, node: Node): number | null => {
  const blocks = paragraphBlocks(body);
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return null;
  const idx = blocks.findIndex((b) => b === el || b.contains(el));
  return idx === -1 ? null : idx + 1;
};

export const nearestAnchor = (body: Element, node: Node): string | null => {
  const all = Array.from(body.querySelectorAll('[id]'));
  let best: string | null = null;
  for (const el of all) {
    const rel = el.compareDocumentPosition(node);
    const precedesOrContains = rel & Node.DOCUMENT_POSITION_FOLLOWING || rel & Node.DOCUMENT_POSITION_CONTAINED_BY || el === node;
    if (precedesOrContains) best = el.id;
    else break;
  }
  if (!best) return null;
  return new TextEncoder().encode(best).length <= 48 ? best : null;
};
