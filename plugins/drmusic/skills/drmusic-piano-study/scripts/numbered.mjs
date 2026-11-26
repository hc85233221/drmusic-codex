#!/usr/bin/env node
/** DrMusic piano JSON → self-contained printable numbered notation. No dependencies. */
const usage = `用法：node numbered.mjs [score.json|-] [--key "Bb major"] [-o score.html]
省略輸入或指定 - 時讀取 stdin；省略 -o 或指定 - 時寫入 stdout。
--key 可覆寫原調，例如 B♭大調、F#、G minor、降E小調。小調採 6 為主音。
模組：renderNumberedHtml(score, { key }) 回傳 HTML 字串。`;

const letters = 'CDEFGAB';
const naturals = [0, 2, 4, 5, 7, 9, 11];
const signature = [0, 2, 4, -1, 1, 3, 5]; // Number of sharps for natural major tonics.
const mod = (n, base) => ((n % base) + base) % base;
const accidental = n => n < 0 ? '♭'.repeat(-n) : '♯'.repeat(n);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function parseKey(value) {
  const normalized = String(value ?? '').trim().replace(/♯/g, '#').replace(/♭/g, 'b')
    .replace(/^([a-g])[- ]+(flat|sharp)\b/i, (_, name, sign) => name + (sign.toLowerCase() === 'flat' ? 'b' : '#'))
    .replace(/^([升降])\s*([a-g])/i, (_, sign, name) => name + (sign === '升' ? '#' : 'b'));
  const match = /^([A-Ga-g])([#b]?)\s*(大調|小調|major|minor|maj|min|M|m)?$/i.exec(normalized);
  if (!match) throw new Error('調性未明或無法辨識，請指定 --key，例如 --key "Bb major" 或 --key "G minor"。');
  const minor = match[3] === 'm' || /^(min(or)?|小調)$/i.test(match[3] ?? '');
  const index = letters.indexOf(match[1].toUpperCase());
  const alteration = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const tonic = naturals[index] + alteration;
  const rootLetter = (index + (minor ? 2 : 0)) % 7;
  const rootAccidental = mod(tonic + (minor ? 3 : 0) - naturals[rootLetter] + 6, 12) - 6;
  return {
    name: letters[index] + accidental(alteration) + (minor ? ' 小調' : ' 大調'), minor,
    root: letters[rootLetter] + accidental(rootAccidental),
    baseMidi: 60 + naturals[rootLetter] + rootAccidental,
    preferFlats: signature[rootLetter] + 7 * rootAccidental < 0
  };
}

function pitchFor(midi, key) {
  const delta = midi - key.baseMidi;
  const pc = mod(delta, 12);
  let index = naturals.indexOf(pc);
  let alter = 0;
  if (index === -1) {
    // In la-based minor, raised 6th/7th scale tones are ♯4/♯5.
    alter = key.preferFlats && !(key.minor && (pc === 6 || pc === 8)) ? -1 : 1;
    index = naturals.indexOf(pc - alter);
  }
  return { degree: index + 1, alter, octave: Math.floor(delta / 12) };
}

// Absorb only binary floating-point noise when combining measure offsets.
function snap(n, origin = 0) {
  if (Number.isInteger(n)) return n;
  const tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(n), Math.abs(origin));
  for (let d = 1; d <= 96; d++) {
    const fraction = Math.round(n * d) / d;
    if (fraction !== 0 && Math.abs(n - fraction) <= tolerance) return fraction;
  }
  return Number(n.toPrecision(15));
}
function beatText(n) {
  if (Number.isInteger(n)) return String(n);
  for (let denominator = 2; denominator <= 96; denominator++) {
    const numerator = Math.round(n * denominator);
    if (Math.abs(n - numerator / denominator) < 1e-10 && numerator !== 0) {
      const whole = Math.floor(numerator / denominator);
      const rest = numerator % denominator;
      if (!rest) return String(whole);
      return (whole ? whole + ' ' : '') + rest + '/' + denominator;
    }
  }
  return String(snap(n));
}

function makeVoices(score, barLength) {
  const hands = { right: [], left: [] };
  const total = score.measures.length * barLength;
  for (const [bar, measure] of score.measures.entries()) {
    if (!Array.isArray(measure?.notes)) throw new Error('第 ' + (bar + 1) + ' 小節缺少 notes。');
    const chords = new Map();
    for (const [i, note] of measure.notes.entries()) {
      const label = '第 ' + (bar + 1) + ' 小節第 ' + (i + 1) + ' 音';
      if (!note || (note.hand !== 'right' && note.hand !== 'left') || !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127)
        throw new Error(label + '的 hand 或 MIDI 音高無效。');
      if (!Number.isFinite(note.start) || note.start < 0 || note.start >= barLength ||
          !Number.isFinite(note.duration) || note.duration <= 0 || note.start + note.duration > total - bar * barLength + 1e-7)
        throw new Error(label + '的起點或時值超出譜面。');
      const start = snap(bar * barLength + note.start);
      const end = Math.min(total, snap(bar * barLength + (note.start + note.duration)));
      if (end <= start) throw new Error(label + '的時值小於可呈現精度。');
      const id = [note.hand, start, end].join(':');
      if (!chords.has(id)) chords.set(id, { hand: note.hand, start, end, pitches: [] });
      chords.get(id).pitches.push(note.midi);
    }
    // Allocate from the whole timeline so a sustained note keeps its voice across bars.
    for (const chord of [...chords.values()].sort((a, b) => a.start - b.start || b.end - a.end)) {
      chord.pitches.sort((a, b) => b - a);
      const voices = hands[chord.hand];
      let voice = voices.find(notes => notes.at(-1).end <= chord.start);
      if (!voice) voices.push(voice = []);
      voice.push(chord);
    }
  }
  return hands;
}

/** Each row contains contiguous timed events within one bar. Null pitches mean rest. */
export function buildNumberedScore(score, { key: override } = {}) {
  if (!score || (score.kind && score.kind !== 'piano') || !Array.isArray(score.measures) || !score.measures.length)
    throw new Error('需要含 measures 的鋼琴譜 JSON。');
  const sourceKey = typeof score.key === 'string' && score.key.trim() ? score.key : score.keySignature;
  const key = parseKey(override ?? sourceKey);
  const meter = score.timeSignature;
  if (!Array.isArray(meter) || meter.length !== 2 || !Number.isSafeInteger(meter[0]) || meter[0] <= 0 ||
      ![1, 2, 4, 8, 16, 32].includes(meter[1])) throw new Error('拍號 timeSignature 無效。');
  if (!Number.isFinite(score.bpm) || score.bpm <= 0) throw new Error('四分音符速度 bpm 無效。');
  const barLength = 4 * meter[0] / meter[1];
  const hands = makeVoices(score, barLength);
  const bars = score.measures.map(() => ({ right: [], left: [] }));
  for (const hand of ['right', 'left']) {
    for (const [v, voice] of hands[hand].entries()) {
      for (const note of voice) {
        const pitches = note.pitches.map(midi => pitchFor(midi, key));
        for (let b = Math.floor(note.start / barLength); b < bars.length && b * barLength < note.end; b++) {
          const origin = b * barLength;
          const start = snap(Math.max(origin, note.start) - origin, origin);
          const end = snap(Math.min(origin + barLength, note.end) - origin, origin);
          (bars[b][hand][v] ??= []).push({
            start, end, pitches, tieIn: note.start < origin, tieOut: note.end > origin + barLength
          });
        }
      }
    }
    for (const bar of bars) {
      // Keep voice numbers stable but omit wholly silent upper voices in this measure.
      const rows = bar[hand];
      for (let v = 0; v < Math.max(1, rows.length); v++) {
        const events = [];
        let cursor = 0;
        for (const event of rows[v] ?? []) {
          if (event.start > cursor) events.push({ start: cursor, end: event.start, pitches: null });
          events.push(event);
          cursor = event.end;
        }
        if (cursor < barLength) events.push({ start: cursor, end: barLength, pitches: null });
        rows[v] = events;
      }
    }
  }
  return { title: score.title || '未命名樂譜', composer: score.composer || '', key, meter, bpm: score.bpm, barLength, bars };
}

function rhythm(duration) {
  for (const [dotted, multiplier] of [[false, 1], [true, 1.5]]) {
    for (let lines = 0; lines <= 5; lines++) {
      if (Math.abs(duration - multiplier / 2 ** lines) < 1e-10) return { lines, dotted };
    }
  }
  return { lines: 0, dotted: false };
}

function noteGlyph({ degree, alter, octave }) {
  const dots = '<i></i>'.repeat(Math.abs(octave));
  return `<span class="pitch"><span class="dots above">${octave > 0 ? dots : ''}</span><span>${accidental(alter)}${degree}</span><span class="dots below">${octave < 0 ? dots : ''}</span></span>`;
}

function cell(event, start, end, span) {
  const duration = snap(end - start);
  const { lines, dotted } = rhythm(duration);
  const tieIn = event.pitches && (event.tieIn || start > event.start);
  const tieOut = event.pitches && (event.tieOut || end < event.end);
  const notes = event.pitches?.map(noteGlyph).join('') ?? '<span class="rest">0</span>';
  const chord = (event.pitches?.length ?? 0) > 1;
  const pitchClass = chord ? (event.pitches.length > 6 ? ' chord wide' : ' chord') : '';
  const dashes = Number.isInteger(duration) && duration >= 2 && duration <= 4 ? '–'.repeat(duration - 1) : '';
  return `<td colspan="${span}"><div class="event">
    <div class="symbols">${tieIn ? '<span class="tie" aria-label="承前延音">⌒</span>' : ''}
    <span class="group"><span class="pitches${pitchClass}">${notes}</span>${'<i class="beam"></i>'.repeat(lines)}</span>${dotted ? '<b class="augment">·</b>' : ''}${dashes ? '<span class="dashes">' + dashes + '</span>' : ''}
    ${tieOut ? '<span class="tie" aria-label="延至下一段">⌒</span>' : ''}</div>
    <small>${beatText(duration)} 拍</small></div></td>`;
}

function renderBar(bar, number, barLength) {
  const times = new Set([barLength]);
  const voices = [];
  for (const [hand, label] of [['right', '右手'], ['left', '左手']]) {
    bar[hand].forEach((events, v) => {
      voices.push({ label: label + (bar[hand].length > 1 ? ' ' + (v + 1) : ''), events, index: 0 });
      for (const event of events) times.add(event.start);
    });
  }
  const stops = [...times].sort((a, b) => a - b);
  const indices = new Map(stops.map((time, i) => [time, i]));
  const bands = [];
  // Repeat position labels on dense measures; cut only at a real event boundary.
  const count = stops.length - 1;
  const columns = Math.ceil(count / Math.ceil(count / 8));
  for (let first = 0; first < count; first += columns) {
    const last = Math.min(first + columns, count);
    const labels = stops.slice(first, last).map(time => '<th scope="col">' + beatText(time) + '</th>').join('');
    const rows = voices.map(voice => {
      const parts = [];
      for (let pos = first; pos < last;) {
        const event = voice.events[voice.index];
        const end = Math.min(last, indices.get(event.end));
        parts.push(cell(event, stops[pos], stops[end], end - pos));
        if (stops[end] === event.end) voice.index++;
        pos = end;
      }
      return '<tr><th scope="row">' + voice.label + '</th>' + parts.join('') + '</tr>';
    }).join('');
    bands.push(`<table><caption>第 ${number} 小節${first ? '（續）' : ''}</caption><colgroup><col class="hand-col"><col span="${last - first}"></colgroup><thead><tr><th>拍位</th>${labels}</tr></thead><tbody>${rows}</tbody></table>`);
  }
  return bands.join('');
}

const css = `
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;color:#182a30;background:#eef1f1}
*{box-sizing:border-box}body{margin:0}main{max-width:860px;margin:28px auto;padding:40px clamp(16px,5vw,52px);background:white}
header{border-bottom:2px solid #314a52;padding-bottom:14px}.kicker,caption{color:#32545c;font-weight:700}h1{margin:6px 0 10px;font-size:2rem;overflow-wrap:anywhere}
.meta{display:flex;flex-wrap:wrap;gap:4px 20px;font-weight:600}.legend{font-size:.86rem;line-height:1.7;margin:12px 0 20px;color:#35494e}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 18px;font-variant-numeric:tabular-nums}
caption{text-align:left;padding-bottom:4px;font-size:.91rem}.hand-col{width:56px}th,td{text-align:center;border:1px solid #b1bfc1;padding:4px 2px}
th{font-size:.75rem}thead th{color:#35494e;background:#f1f4f3;font-weight:500;overflow-wrap:anywhere}
tbody th{background:#f7f9f8}.event{display:grid;justify-items:center;gap:4px}.event small{color:#475960;font-size:.68rem;overflow-wrap:anywhere}
.symbols{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:1px;font-family:Georgia,"Times New Roman",serif;font-size:1.23rem}
.group{max-width:100%}.group,.pitch{display:inline-flex;flex-direction:column;align-items:center}.pitches{display:flex;align-items:center}.pitch{font-weight:700;line-height:1}
.dots{display:flex;flex-direction:column;align-items:center;gap:1px;padding:1px 0;min-height:5px}.dots i{display:block;width:3px;height:3px;border-radius:50%;background:currentColor}
.chord{display:grid;grid-template-rows:repeat(var(--stack,3),auto);grid-auto-flow:column;gap:0 2px;align-items:center;border-inline:1px solid #718184;padding:0 3px}
.chord.wide{display:flex;flex-wrap:wrap;max-width:100%;justify-content:center}.chord:has(>.pitch:nth-child(2):last-child){--stack:2}.beam{width:100%;border-top:1px solid;margin-top:1px}.dashes,.tie{font-size:.75em}.tie{align-self:flex-start}.rest{line-height:1.3}
@media(max-width:560px){main{margin:0;padding:18px 8px}.hand-col{width:36px}.symbols{font-size:1rem}.event small,th{font-size:.63rem}}
@page{size:A4 portrait;margin:13mm 15mm;@bottom-center{content:counter(page) " / " counter(pages);font:9pt sans-serif;color:#46595e}}
@media print{:root{background:white;color:#111}main{max-width:none;margin:0;padding:0}header{break-inside:avoid}h1{font-size:19pt}
.legend{font-size:8pt;margin:6pt 0 10pt}table{break-inside:avoid;margin-bottom:8pt}caption{break-after:avoid;font-size:9pt}
thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:2pt}.dots i{background:transparent;border:1.5px solid currentColor}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

export function renderNumberedHtml(score, options) {
  const { title, composer, key, meter, bpm, barLength, bars } = buildNumberedScore(score, options);
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}｜鋼琴簡譜</title><style>${css}</style></head>
<body><main><header><div class="kicker">DrMusic　鋼琴簡譜</div><h1>${escape(title)}</h1><div class="meta"><span>${escape(key.name)}　1 = ${key.root}4</span><span>${meter.join('/')} 拍</span><span>♩ = ${bpm}</span>${composer ? '<span>作曲　' + escape(composer) + '</span>' : ''}</div></header>
<p class="legend">${key.minor ? '小調主音記為 6。' : ''}無點的 1 為 ${key.root}4（MIDI ${key.baseMidi}）。每個上點升一個八度，下點降一個八度。夾線內的音同彈，0 為休止，⌒ 接續同音。<br>拍位從 0 起算，以四分音符為 1 拍。數字下方標示實際時值。下方短線為減時線，右點為附點，橫線每條延長 1 拍。同手多列同時演奏。</p>
${bars.map((bar, i) => renderBar(bar, i + 1, barLength)).join('\n')}</main></body></html>\n`;
}

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
