import { writeFileSync, mkdirSync } from 'node:fs';
import { buildMinimalEpub } from '../test/fixtures/makeMinimalEpub.ts';

mkdirSync('test/fixtures', { recursive: true });
const zip = buildMinimalEpub();
writeFileSync('test/fixtures/minimal.epub', zip);
console.log('wrote test/fixtures/minimal.epub', zip.length, 'bytes');
