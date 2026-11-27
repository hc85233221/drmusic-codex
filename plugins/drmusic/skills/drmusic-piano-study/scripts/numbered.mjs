#!/usr/bin/env node
/** DrMusic piano JSON → self-contained printable numbered notation. No dependencies. */
const usage = `用法：node numbered.mjs [score.json|-] [--key "Bb major"] [-o score.html]
省略輸入或指定 - 時讀取 stdin；省略 -o 或指定 - 時寫入 stdout。
--key 可覆寫原調，例如 B♭大調、F#、G minor、降E小調。小調採 6 為主音。
模組：renderNumberedHtml(score, { key }) 回傳 HTML 字串。`;

import {renderNumberedHtml} from './numbered-render.mjs';
export {buildNumberedScore, renderNumberedHtml} from './numbered-render.mjs';

async function main(args) {
  const { parseArgs } = await import('node:util');
  const { readFile, writeFile, stat } = await import('node:fs/promises');
  const { values, positionals } = parseArgs({args, allowPositionals: true, options: {
    key: { type: 'string' }, output: { type: 'string', short: 'o' }, help: { type: 'boolean', short: 'h' }
  }});
  if (values.help) { console.log(usage); return; }
  if (positionals.length > 1) throw new Error(usage);
  const [input = '-'] = positionals;
  let json = '';
  if (input === '-') {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) json += chunk;
  } else json = await readFile(input, 'utf8');
  const html = renderNumberedHtml(JSON.parse(json.replace(/^\uFEFF/, '')), {key: values.key});
  if (!values.output || values.output === '-') { process.stdout.write(html); return; }
  if (input !== '-') {
    const source = await stat(input);
    const target = await stat(values.output).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (target && source.dev === target.dev && source.ino === target.ino) throw new Error('輸出檔不可覆寫來源 JSON。');
  }
  await writeFile(values.output, html, 'utf8');
}

if (typeof process === 'object' && process.versions?.node && process.argv?.[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.main ?? (import.meta.url === pathToFileURL(process.argv[1]).href)) {
    main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
