import { describe, expect, it } from 'vitest';
import { findRangeByParaAndText } from './relocate';

const docWith = (html: string): Document => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');

const BOOK = `
  <p>Rang nam trong coi nguoi ta</p>
  <p>Chu tai chu menh kheo la ghet nhau</p>
  <p>Trai qua mot cuoc be dau</p>
  <p>Chu tai chu menh kheo la ghet nhau</p>
`;

describe('findRangeByParaAndText', () => {
  it('uses para to pick the later of two identical paragraphs', () => {
    const doc = docWith(BOOK);
    const range = findRangeByParaAndText(doc, 4, 'chu menh');
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('chu menh');
    // block 2 also matches, and a whole-section search finds it first;
    // para 4 must still land in the fourth block, not the second
    expect(doc.body.querySelectorAll('p')[3]!.contains(range!.startContainer)).toBe(true);
  });

  it('falls back to the whole section when para points at the wrong block', () => {
    const doc = docWith(BOOK);
    const range = findRangeByParaAndText(doc, 3, 'coi nguoi ta');
    expect(range).not.toBeNull();
    expect(doc.body.querySelectorAll('p')[0]!.contains(range!.startContainer)).toBe(true);
  });

  it('takes the first occurrence when the text appears twice in one paragraph', () => {
    const doc = docWith('<p>mot hai mot hai ba</p>');
    const range = findRangeByParaAndText(doc, 1, 'mot');
    expect(range!.startOffset).toBe(0);
  });

  it('returns null when the text is nowhere in the section', () => {
    expect(findRangeByParaAndText(docWith(BOOK), 1, 'khong co trong sach')).toBeNull();
  });

  it('returns null for empty text rather than matching everything', () => {
    expect(findRangeByParaAndText(docWith(BOOK), 1, '')).toBeNull();
    expect(findRangeByParaAndText(docWith(BOOK), 1, '   ')).toBeNull();
  });

  it('searches the whole section when para is null', () => {
    const range = findRangeByParaAndText(docWith(BOOK), null, 'be dau');
    expect(range).not.toBeNull();
  });

  it('is out of range safe when para exceeds the block count', () => {
    const range = findRangeByParaAndText(docWith(BOOK), 99, 'be dau');
    expect(range).not.toBeNull();
  });

  it('matches text that spans two inline elements inside one block', () => {
    const doc = docWith('<p>mot <em>hai</em> ba</p>');
    const range = findRangeByParaAndText(doc, 1, 'hai ba');
    expect(range).not.toBeNull();
    expect(range!.toString().replace(/\s+/g, ' ')).toBe('hai ba');
  });

  it('matches a line-wrapped source paragraph with a single-spaced needle', () => {
    const doc = docWith('<p>Rang nam\n  trong coi</p>');
    const range = findRangeByParaAndText(doc, 1, 'Rang nam trong coi');
    expect(range).not.toBeNull();
  });

  it('normalizes the needle as well as the document, when their spacing differs', () => {
    const doc = docWith('<p>Rang nam trong coi</p>');
    const range = findRangeByParaAndText(doc, 1, 'Rang nam\n trong  coi');
    expect(range).not.toBeNull();
  });

  it('pins the raw offsets, not the normalized ones, so the range keeps the document\'s own spelling', () => {
    const doc = docWith('<p>Rang nam\n  trong coi</p>');
    const range = findRangeByParaAndText(doc, 1, 'Rang nam trong coi');
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('Rang nam\n  trong coi');
  });

  it('resolves the end of a match at an element boundary to the following text node', () => {
    const doc = docWith('<p><em>mot</em>hai</p>');
    const range = findRangeByParaAndText(doc, 1, 'mot');
    expect(range).not.toBeNull();
    const followingText = doc.querySelector('em')!.nextSibling;
    expect(range!.endContainer).toBe(followingText);
    expect(range!.endOffset).toBe(0);
  });
});
