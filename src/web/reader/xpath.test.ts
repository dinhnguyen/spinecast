import { describe, expect, it } from 'vitest';
import { innerPathFromNode, nearestAnchor, paragraphBlocks, paragraphIndexOf, resolveInnerPath } from './xpath';

const html = `<html><body>
  <h1 id="ch1">Chapter 1</h1>
  <div class="a"><p>first</p><p>second <em>em</em> tail</p></div>
  <div class="b"><p id="p3">third</p><ul><li>one</li><li>two</li></ul></div>
</body></html>`;

const body = (): Element => new DOMParser().parseFromString(html, 'text/html').body;

describe('xpath dom helpers', () => {
  it('builds an inner path with sibling indices and text steps', () => {
    const b = body();
    const p2 = b.querySelectorAll('p')[1]!;
    expect(innerPathFromNode(b, p2)).toEqual({ inner: 'div[1]/p[2]', textIndex: null });
    const tail = p2.lastChild!; // " tail" text node, the second text child of p2
    expect(innerPathFromNode(b, tail)).toEqual({ inner: 'div[1]/p[2]/text()[2]', textIndex: 2 });
  });

  it('resolves paths back to the same node, including text steps', () => {
    const b = body();
    const li2 = b.querySelectorAll('li')[1]!;
    expect(resolveInnerPath(b, 'div[2]/ul[1]/li[2]')).toBe(li2);
    expect(resolveInnerPath(b, 'div[1]/p[2]/text()[2]')?.textContent).toBe(' tail');
    expect(resolveInnerPath(b, 'div[9]/p[1]')).toBeNull();
    expect(resolveInnerPath(b, 'not a path [')).toBeNull();
  });

  it('counts paragraph-like blocks in document order', () => {
    const b = body();
    const blocks = paragraphBlocks(b);
    expect(blocks.map((e) => e.textContent?.trim())).toEqual(['Chapter 1', 'first', 'second em tail', 'third', 'one', 'two']);
    expect(paragraphIndexOf(b, b.querySelector('#p3')!)).toBe(4);
    expect(paragraphIndexOf(b, b.querySelector('em')!.firstChild!)).toBe(3);
  });

  it('finds the nearest preceding anchor id', () => {
    const b = body();
    expect(nearestAnchor(b, b.querySelectorAll('li')[0]!)).toBe('p3');
    expect(nearestAnchor(b, b.querySelector('p')!)).toBe('ch1');
  });
});
