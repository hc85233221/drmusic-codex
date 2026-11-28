#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolveGuitarChord, shiftedChartKey } from './guitar-chords.mjs';

const usage = '用法：node scripts/read-chords.mjs 吉他譜.json';
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error(usage);
  const score = JSON.parse((await readFile(args[0], 'utf8')).replace(/^\uFEFF/, ''));
  if (score.kind !== 'guitar' || !Array.isArray(score.sections)) throw new Error('請提供含 sections 的 DrMusic 吉他譜。');
  let key = shiftedChartKey(score.chartKey ?? (score.capo ? undefined : score.originalKey), 0);
  const readings = [];
  for (const [section, part] of score.sections.entries()) {
    for (const [line, row] of part.lines.entries()) {
      for (const entry of row.chords) {
        if (entry.keyChange !== undefined) key = shiftedChartKey(entry.keyChange, 0);
        const { chord, degree } = resolveGuitarChord(entry.symbol, key);
        readings.push({ section: section + 1, line: line + 1, at: entry.at,
          symbol: entry.symbol, chartKey: key ?? null, chord, degree });
      }
    }
  }
  console.log(JSON.stringify(readings, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
