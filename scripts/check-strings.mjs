// Fails when a Vietnamese string leaks outside the i18n tables or the quote pool.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIACRITICS = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵĂÂĐÊÔƠƯÀẢÃÁẠẰẲẴẮẶẦẨẪẤẬÈẺẼÉẸỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌỒỔỖỐỘỜỞỠỚỢÙỦŨÚỤỪỬỮỨỰỲỶỸÝỴ]/;
const ALLOW = [/^src\/web\/i18n\/vi\.ts$/, /^src\/web\/quotes\/vi\.ts$/, /\.test\.tsx?$/];
// "Tiếng Việt" is the language's own name, kept as-is in en.ts's locale.vi/locale.switch entries, not a translation leak.
const LINE_ALLOW = [{ file: /^src\/web\/i18n\/en\.ts$/, line: /^\s*'locale\.(vi|switch)':/ }];

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});

const offenders = [];
for (const root of ['src/worker', 'src/web', 'src/shared']) {
  for (const file of walk(root)) {
    const rel = relative(process.cwd(), file);
    if (ALLOW.some((re) => re.test(rel))) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (LINE_ALLOW.some((a) => a.file.test(rel) && a.line.test(line))) return;
      if (DIACRITICS.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (offenders.length) {
  console.error(offenders.join('\n'));
  console.error(`\n${offenders.length} line(s) with Vietnamese text outside the i18n tables`);
  process.exit(1);
}
console.log('check-strings: ok');
