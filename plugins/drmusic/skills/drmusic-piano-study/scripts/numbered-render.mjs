import {measureTiming,groupOctaveMarks} from './measure-timing.mjs';
/** Shared engraving for the offline CLI and the in-site reader. */
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
    root: letters[rootLetter] + accidental(rootAccidental), rootLetter,
    baseMidi: 60 + naturals[rootLetter] + rootAccidental,
    preferFlats: signature[rootLetter] + 7 * rootAccidental < 0
  };
}

function pitchFor(midi, key, spelling) {
  // A chromatic pitch can represent different scale degrees (e.g. ♯4 or ♭5).
  // Count letters, including octave boundaries such as B♯3 sounding at C4.
  const written = typeof spelling === 'string' && /^([A-G])(#{1,3}|b{1,3})?(-?\d+)$/.exec(spelling);
  if (written) {
    const letter = letters.indexOf(written[1]);
    const sign = written[2] ?? '';
    const offset = sign.length * (sign.startsWith('b') ? -1 : 1);
    const writtenOctave = Number(written[3]);
    if ((writtenOctave + 1) * 12 + naturals[letter] + offset === midi) {
      const steps = (writtenOctave - 4) * 7 + letter - key.rootLetter;
      const degree = mod(steps, 7);
      const octave = Math.floor(steps / 7);
      return { degree: degree + 1, alter: midi - (key.baseMidi + octave * 12 + naturals[degree]), octave };
    }
  }
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

function makeVoices(score, timing) {
  const hands = { right: [], left: [] };
  const explicit = { right: new Set(), left: new Set() };
  for (const bar of score.measures) {
    for (const note of bar.notationNotes ?? []) {
      if (note.voice === undefined) continue;
      if (!Number.isSafeInteger(note.voice) || note.voice < 0 || !['left', 'right'].includes(note.hand))
        throw new Error('書寫聲部編號或手別無效。');
      explicit[note.hand].add(note.voice);
    }
  }
  const voiceRows = {};
  for (const hand of ['right', 'left']) {
    const labels = [...explicit[hand]].sort((a, b) => a - b);
    voiceRows[hand] = new Map(labels.map((label, row) => [label, row]));
    hands[hand] = labels.map(() => []);
  }
  const {total} = timing;
  for (const [bar, measure] of score.measures.entries()) {
    if (!Array.isArray(measure?.notes)) throw new Error('第 ' + (bar + 1) + ' 小節缺少 notes。');
    const origin = timing.starts[bar], barLength = timing.durations[bar];
    const chords = new Map();
    for (const [i, note] of (measure.notationNotes ?? measure.notes).entries()) {
      const label = '第 ' + (bar + 1) + ' 小節第 ' + (i + 1) + ' 音';
      if (!note || (note.hand !== 'right' && note.hand !== 'left') || !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127)
        throw new Error(label + '的 hand 或 MIDI 音高無效。');
      if (!Number.isFinite(note.start) || note.start < 0 || note.start >= barLength ||
          !Number.isFinite(note.duration) || note.duration <= 0 || note.start + note.duration > total - origin + 1e-7)
        throw new Error(label + '的起點或時值超出譜面。');
      const start = snap(origin + note.start);
      const end = Math.min(total, snap(origin + (note.start + note.duration)));
      if (end <= start) throw new Error(label + '的時值小於可呈現精度。');
      const writtenVoice = measure.notationNotes === undefined ? undefined : note.voice;
      const id = [note.hand, start, end, writtenVoice].join(':');
      if (!chords.has(id)) chords.set(id, { bar, hand: note.hand, start, end, voice: writtenVoice, notes: [] });
      chords.get(id).notes.push(note);
    }
    // Allocate from the whole timeline so a sustained note keeps its voice across bars.
    for (const chord of [...chords.values()].sort((a, b) => a.start - b.start || b.end - a.end)) {
      chord.notes.sort((a, b) => b.midi - a.midi);
      const voices = hands[chord.hand];
      const rows = voiceRows[chord.hand];
      let voice = chord.voice === undefined ? voices.find((notes, i) => i >= rows.size && notes.at(-1).end <= chord.start)
        : voices[rows.get(chord.voice)];
      if (!voice) voices.push(voice = []);
      voice.push(chord);
    }
  }
  return hands;
}

// A single performed attack can be written as several consecutive notes. Only
// restore a tie when the full written chain matches the performed onset/release.
function restoreWrittenTies(score, timing, hands) {
  if (!score.measures.some(b => b.notationNotes !== undefined)) return;
  const attacks = new Map();
  score.measures.forEach((bar,i) => {
    for (const n of bar.notes) {
      const id = n.hand + ':' + n.midi;
      if (!attacks.has(id)) attacks.set(id, new Map());
      const start = snap(timing.starts[i] + n.start);
      attacks.get(id).set(start, snap(timing.starts[i] + (n.start + n.duration)));
    }
  });
  for (const [hand,voices] of Object.entries(hands)) for (const voice of voices) {
    const pitches = new Map();
    for (const chord of voice) for (const midi of new Set(chord.notes.map(n => n.midi))) {
      if (!pitches.has(midi)) pitches.set(midi, []);
      pitches.get(midi).push(chord);
    }
    for (const [midi, notes] of pitches) {
      const played = attacks.get(hand + ':' + midi);
      for (let i = 0; i < notes.length; i++) {
        const release = played?.get(notes[i].start);
        if (!(release > notes[i].end)) continue;
        let j = i;
        while (j+1 < notes.length && notes[j].end < release && notes[j].end === notes[j+1].start &&
          !played.has(notes[j+1].start)) j++;
        if (notes[j].end !== release) continue;
        for (let k=i; k<j; k++) {
          (notes[k].tieTo ??= new Set()).add(midi);
          (notes[k+1].tieFrom ??= new Set()).add(midi);
        }
        i = j;
      }
    }
  }
}

/**
 * Each row contains contiguous timed events within one bar. Null pitches mean rest.
 * @param {{title: string, composer?: string, key?: string, keySignature?: string,
 * kind?: string, bpm: number, timeSignature: number[], measures: {duration?: number, timeSignature?: number[], notes: {
 * midi: number, start: number, duration: number, hand: string}[]}[]}} score
 */
export function buildNumberedScore(score, { key: override } = {}) {
  if (!score || (score.kind && score.kind !== 'piano' && score.kind !== 'numbered') || !Array.isArray(score.measures) || !score.measures.length)
    throw new Error('需要含 measures 的鋼琴譜 JSON。');
  const sourceKey = typeof score.key === 'string' && score.key.trim() ? score.key : score.keySignature;
  const key = parseKey(override ?? sourceKey);
  const meter = score.timeSignature;
  if (!Array.isArray(meter) || meter.length !== 2 || !Number.isSafeInteger(meter[0]) || meter[0] <= 0 ||
      ![1, 2, 4, 8, 16, 32].includes(meter[1])) throw new Error('拍號 timeSignature 無效。');
  if (!Number.isFinite(score.bpm) || score.bpm <= 0) throw new Error('四分音符速度 bpm 無效。');
  const barLength = 4 * meter[0] / meter[1];
  const timing = measureTiming(score);
  const hands = makeVoices(score, timing);
  restoreWrittenTies(score, timing, hands);
  const bars = score.measures.map((measure, i) => {
    const current = timing.meters[i], prior = i ? timing.meters[i - 1] : meter;
    const mark = current[0] !== prior[0] || current[1] !== prior[1] ? ' · ' + current.join('/') : '';
    const duration = timing.durations[i];
    const partial = duration !== current[0] * 4 / current[1] ? ' · ' + beatText(duration) + ' 拍' : '';
    return { sourceMarks: [], duration, meter: current, meterLabel: mark + partial, chords: measure.chords ?? [], lyrics: measure.lyrics ?? [], right: [], left: [] };
  });
  for (const hand of ['right', 'left']) {
    for (const [v, voice] of hands[hand].entries()) {
      for (const note of voice ?? []) {
        const pitches = note.notes.map(({midi, spelling}) => ({
          midi, ...pitchFor(midi, key, spelling), ...(note.tieFrom?.has(midi) && {tieIn:true}), ...(note.tieTo?.has(midi) && {tieOut:true})
        }));
        for (let b = note.bar; b < bars.length && timing.starts[b] < note.end; b++) {
          const origin = timing.starts[b], barLength = timing.durations[b];
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
        if (cursor < bar.duration) events.push({ start: cursor, end: bar.duration, pitches: null });
        rows[v] = events;
      }
    }
  }
  attachSourceMarks(score, bars, hands, key);
  return { title: score.title || '未命名樂譜', composer: score.composer || '', key, meter, bpm: score.bpm, barLength, timing, bars };
}

// Resolve source voice numbers before projecting a chord to its top note.
function attachSourceMarks(score,bars,hands,key) {
  function target(i,a) {
    const rows=bars[i]?.[a.hand];
    if (!rows) return;
    for (const [v,events] of rows.entries()) {
      const voice=hands[a.hand][v]?.[0]?.voice ?? v;
      if (a.voice!==undefined && a.voice!==voice) continue;
      const e=events.find(n=>n.start<=a.start+1e-8 && n.end>a.start+1e-8);
      if (!e || (a.midi!==undefined && !e.pitches?.some(p=>p.midi===a.midi))) continue;
      return {lane:a.hand+v, lead:a.hand==='right' && v===0 && (a.midi===undefined || e.pitches?.[0].midi===a.midi),row:v,event:e};
    }
  }
  const occupied=new Map();
  groupOctaveMarks(score).forEach((marks,i)=>{
    for (const mark of marks) {
      const a=target(i,mark), j=mark.end ? mark.end.measure-1 : i;
      const b=mark.end ? target(j,mark.end) : a;
      if (!a || !b) continue;
      let rank=0;
      if (mark.end) {
        const side=sourceSide(mark);
        const lane=a.lane+side;
        const levels=occupied.get(lane) ?? [];
        const start=i+mark.start/bars[i].duration;
        while ((levels[rank] ?? -1)>start+1e-8) rank++;
        levels[rank]=j+mark.end.start/bars[j].duration;
        occupied.set(lane,levels);
      }
      const grace=mark.graceNotes?.map(n=>({value:n.value,pitches:n.pitches.map((p,i)=>pitchFor(p,key,n.spellings?.[i]))}));
      for (let k=i;k<=j;k++) {
        const bar=bars[k], first=k===i, last=k===j;
        const start=first?mark.start:0, until=last?(mark.end?.start ?? mark.start):bar.duration;
        bar.sourceMarks.push({mark,grace,rank,first,last,start,until,from:a.lane,to:b.lane,lead:a.lead&&b.lead});
        if (mark.type==='octaveShift') {
          for (const e of bar[mark.hand][a.row] ?? []) {
            if (e.pitches && e.start>=start-1e-8 && e.start<=until+1e-8) e.displayOctave=mark.octaves;
          }
        }
        if (mark.type==='tie') {
          // An explicit source tie supplies the visible arc; retain the actual pitch data.
          if (first) (a.event.sourceOut ??= []).push(mark.midi);
          if (last) (b.event.sourceIn ??= []).push(mark.end.midi);
        }
      }
    }
  });
}

// Durations are in quarter notes. Keep uncommon subdivisions exact, including tuplets.
function shortRhythm(duration) {
  for (let lines = 0; lines <= 6; lines++) {
    for (const [factor, dot, triplet] of [[1, false, false], [1.5, true, false], [2/3, false, true]]) {
      if (Math.abs(duration - factor / 2 ** lines) < 1e-9) return {lines, dot, triplet};
    }
  }
  return null;
}

function symbols(events, topOnly) {
  const items = [];
  for (const event of events) {
    let start = event.start, previousDuration = 0;
    while (start < event.end) {
      const remaining = snap(event.end - start);
      const rhythm = shortRhythm(remaining);
      const toNextBeat = snap(Math.floor(start) + 1 - start);
      const duration = rhythm || remaining < 1 ? remaining : toNextBeat;
      const continuation = start > event.start;
      const dash = continuation && previousDuration === 1 && duration === 1 && !!event.pitches;
      const short = rhythm ?? shortRhythm(duration);
      const group = topOnly ? event.pitches?.slice(0, 1) : event.pitches;
      const pitches = event.displayOctave ? group?.map(p=>({...p,octave:p.octave-event.displayOctave})) : group;
      items.push({start, duration, pitches, dash, rhythm: short ?? {lines:0, exact:duration < 1},
        tieIn: !!event.pitches && (((event.tieIn || pitches?.some(p => p.tieIn)) && !pitches?.some(p=>event.sourceIn?.includes(p.midi)) && !continuation) || (continuation && !dash)),
        tieOut: !!event.pitches && (event.tieOut || pitches?.some(p => p.tieOut)) && !pitches?.some(p=>event.sourceOut?.includes(p.midi)) && duration === remaining});
      previousDuration = duration;
      start = duration === remaining ? event.end : snap(start + duration);
    }
  }
  return items;
}

function pitchGlyph({degree, alter, octave}) {
  const dots = '<i></i>'.repeat(Math.abs(octave));
  return '<span class="jp-pitch">' + (octave > 0 ? '<span class="jp-oct jp-up">' + dots + '</span>' : '') +
    (alter ? '<sup>' + accidental(alter) + '</sup>' : '') + degree +
    (octave < 0 ? '<span class="jp-oct jp-down">' + dots + '</span>' : '') + '</span>';
}

function glyph(item) {
  const r = item.rhythm;
  const body = item.dash ? '–' : item.pitches?.map(pitchGlyph).join('') ?? '0';
  const under = Array.from({length:r.lines}, (_,n) => '<i class="jp-beam" style="--drop:'+(1+n*3)+'px"></i>').join('');
  const mark = r.exact ? beatText(item.duration) : r.triplet ? '3' : '';
  return '<span class="jp-glyph" style="--beam-space:' + (r.lines * 3) + 'px" title="' + beatText(item.duration) + ' 拍">' +
    (item.tieIn ? '<i class="incoming" aria-label="承前延音"></i>' : '') +
    '<span class="jp-stack">' + body + '</span>' + under +
    (r.dot ? '<b class="jp-dot">·</b>' : '') +
    (mark ? '<small class="jp-subdivision">' + mark + '</small>' : '') + '</span>';
}

function annotations(list, field, length) {
  const byTime = new Map();
  for (const entry of list) {
    if (!Number.isFinite(entry.start) || entry.start < 0 || entry.start >= length || typeof entry[field] !== 'string')
      throw new Error('和弦或歌詞的拍位、文字無效。');
    const separator = field === 'symbol' && byTime.has(entry.start) ? ' ' : '';
    byTime.set(entry.start, (byTime.get(entry.start) ?? '') + separator + entry[field]);
  }
  return byTime;
}

// One column is shared by every voice and every text line at the same onset.
function prepareBar(bar, index, both, extraOffsets) {
  const voices = new Map();
  for (const hand of both ? ['right', 'left'] : ['right']) {
    const rows = both ? bar[hand] : bar[hand].slice(0, 1);
    rows.forEach((events, i) => voices.set(hand + i, symbols(events, !both)));
  }
  const chords = annotations(bar.chords, 'symbol', bar.duration);
  const lyrics = new Map();
  for (const verse of new Set(bar.lyrics.map(l => l.verse ?? 1))) {
    lyrics.set(verse, annotations(bar.lyrics.filter(l => (l.verse ?? 1) === verse), 'text', bar.duration));
  }
  const widths = new Map();
  const reserve = (t, size) => widths.set(t, Math.max(size, widths.get(t) ?? 0));
  for (let t = 0; t < bar.duration; t++) reserve(t, 12);
  for (const t of extraOffsets) if (t >= 0 && t < bar.duration) reserve(t, 12);
  for (const voice of voices.values()) for (const note of voice) {
    reserve(note.start, note.rhythm.exact ? 42 : (note.pitches?.some(p => p.alter) || note.rhythm.dot ? 29 : 21));
  }
  for (const map of [chords, ...lyrics.values()]) for (const [start, label] of map) {
    const units = Array.from(label).reduce((n,c) => n + (c.charCodeAt(0) < 128 ? 9 : 16), 0);
    reserve(start, Math.max(23, Math.min(220, units + 8)));
  }
  const marks=bar.sourceMarks.filter(m=>both || m.lead);
  for (const m of marks) {
    if (m.first) reserve(m.start, m.grace ? Math.max(34, m.grace.length*15) : 18);
    if (m.last && m.mark.end) reserve(m.until,18);
  }
  const ordered = [...widths.keys()].sort((a,b) => a-b);
  const columns = ordered.map((t,i) => ({t, width:Math.max(widths.get(t), 30 * Math.min(2,(ordered[i+1] ?? bar.duration)-t))}));
  return {index, bar, voices, chords, lyrics, columns, marks};
}

function metricalBeat(meter) {
  const unit = 4 / meter[1];
  return meter[0] >= 6 && meter[0] % 3 === 0 && meter[1] >= 8 ? 3 * unit : unit;
}

function segments(model, both, beats) {
  const result = [];
  model.bars.forEach((bar,index) => {
    const prepared = prepareBar(bar, index, both, beats.map(t => snap(t - model.timing.starts[index])));
    let columns = [], width = 16;
    const flush = () => {
      result.push({...prepared, columns, width, openEnd:columns.at(-1) !== prepared.columns.at(-1)});
      columns = [];
      width = 16;
    };
    const groups = new Map();
    for (const column of prepared.columns) {
      const beat = Math.floor(snap(column.t / metricalBeat(bar.meter)));
      if (!groups.has(beat)) groups.set(beat, []);
      groups.get(beat).push(column);
    }
    for (const group of groups.values()) {
      const groupWidth = group.reduce((n,c) => n+c.width,0);
      if (columns.length && width + groupWidth > 252) flush();
      for (const column of group) {
        if (columns.length && width + column.width > 252) flush();
        columns.push(column);
        width += column.width;
      }
    }
    if (columns.length) flush();
  });
  return result;
}

const voiceName = name => (name.startsWith('right') ? '右' : '左') + (Number(name.match(/\d+/)[0]) + 1);
const cell = (i, content, extra='') => '<span class="jp-cell ' + extra + '" style="grid-column:' + (i+1) + '">' + content + '</span>';
const lane = (style, html, extra='') => '<div class="jp-lane ' + style + '" ' + extra + '>' + html + '</div>';

// Join only consecutive short values inside one metrical beat, independently
// for each voice and each beam level. A rest breaks a group.
function connectBeams(columns, notes, meter) {
  const beat = metricalBeat(meter);
  const group = start => Math.floor(snap(start / beat));
  const bridges = [];
  let prior;
  for (const [column,{t}] of columns.entries()) {
    const item = notes.get(t);
    if (!item) continue;
    if (prior && item.pitches && prior.item.pitches && group(prior.item.start) === group(t) &&
        Math.abs(prior.item.start + prior.item.duration - t) < 1e-9) {
      const levels = Math.min(item.rhythm.lines, prior.item.rhythm.lines);
      for (let level = 0; level < levels; level++) {
        bridges.push('<i class="jp-bridge" aria-hidden="true" data-level="'+(level+1)+
          '" style="grid-column:'+(prior.column+1)+' / '+(column+1)+';--drop:'+(1+level*3)+'px"></i>');
      }
    }
    prior = {column,item};
  }
  return bridges.join('');
}

// Vector outlines keep music signs legible in offline files without specialty fonts.
const markIcon=(path,extra='')=>'<svg aria-hidden="true" viewBox="0 0 24 16" width="22" height="15"><path d="'+path+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'+extra+'</svg>';
const wave='M2 10 L6 5 10 10 14 5 18 10 22 5';
const sourceSigns = {accent:markIcon('M5 4 L19 8 5 12'),marcato:markIcon('M7 13 L12 3 17 13'),
  espressivo:markIcon('M11 4 L2 8 11 12 M13 4 L22 8 13 12'),staccato:'•',tenuto:'–',fermata:markIcon('M3 12 Q12 -4 21 12','<circle cx="12" cy="10" r="1.7"/>'),
  mordent:markIcon(wave),mordentInverted:markIcon(wave+' M12 2 V14'),arpeggio:markIcon('M12 1 Q7 3 12 5 T12 9 T12 13 L11 15')};
const sourceNames = {accent:'重音',marcato:'強重音',espressivo:'單音漸強漸弱',staccato:'斷音',tenuto:'保持音',fermata:'延長記號',
  mordent:'波音',mordentInverted:'反向波音',arpeggio:'琶音',dynamic:'力度',grace:'倚音',octaveShift:'八度記號',tie:'延音線',slur:'圓滑線'};

function sourceSide(mark) {
  return mark.placement ?? ((mark.type==='octaveShift' && mark.octaves<0) || mark.type==='dynamic' || mark.type==='tie'?'below':'above');
}
function sourceLane(parts, key, columns, side, lanePositions) {
  const elements=[], stacks=new Map(), firstBeat=columns[0].t, lastBeat=columns.at(-1).t;
  const spanLevels=parts.reduce((n,p)=>p.from===key && p.mark.end && p.until>=firstBeat && p.start<=lastBeat &&
    sourceSide(p.mark)===side ? Math.max(n,p.rank+1):n,0);
  let layers=spanLevels;
  for (const part of parts) {
    const m=part.mark, type=m.type;
    const position=sourceSide(m);
    if (position!==side || part.from!==key || part.until<firstBeat || part.start>lastBeat) continue;
    const start=columns.findIndex(c=>Math.abs(c.t-part.start)<1e-7);
    const end=columns.findIndex(c=>Math.abs(c.t-part.until)<1e-7);
    const begins=part.first && start>=0, ends=part.last && end>=0;
    if (!m.end && !begins) continue;
    if (!Object.hasOwn(sourceNames,type)) continue;
    const label=sourceNames[type];
    const col=begins?start:0;
    const level=m.end?part.rank:(stacks.get(col) ?? spanLevels);
    if (!m.end) stacks.set(col,level+1);layers=Math.max(layers,level+1);
    const description=m.midi===undefined?label:label+' · MIDI '+Number(m.midi);
    const attrs=' data-source-mark="'+type+'" aria-label="'+description+'" title="'+description+'"';
    const grid='grid-row:'+ (level+1)+';grid-column:'+(col+1);
    if (type==='tie' || type==='slur' || (type==='octaveShift' && m.end)) {
      const right=ends?end:columns.length;
      const short=right===col;
      const placement=side==='below'?1:-1;
      const dy=ends && part.from!==part.to ? (lanePositions.get(part.to+'note'+side)??0)-(lanePositions.get(part.from+side)??0)-10-level*21 : 0;
      const y1=begins?10:10+placement*7, y2=(ends?10:10+placement*7)+dy;
      const d='M0 '+y1+' C24 '+(10+placement*10)+' 76 '+(10+placement*10+dy)+' 100 '+y2;
      const text=type==='octaveShift'&&begins?octaveText(m.octaves):'';
      elements.push('<span class="jp-source-span '+(begins?'jp-span-start ':'')+(ends?'jp-span-end ':'')+(short?'jp-span-short':'')+'"'+attrs+
        ' style="'+grid+' / '+(short?col+2:right+1)+'">'+(type==='octaveShift'?'<i class="jp-octave-rule">'+text+'</i>':
        '<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d="'+d+'" fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>')+'</span>');
    } else {
      let sign=sourceSigns[type];
      if (type==='dynamic') sign=escape(m.value);
      if (type==='octaveShift') sign=octaveText(m.octaves);
      if (type==='fermata' && side==='below') sign='<span style="display:inline-flex;transform:rotate(180deg)">'+sign+'</span>';
      if (type==='grace') sign=part.grace.map(g=>'<span class="jp-grace" data-value="'+(g.value==='16'?'16':'8')+'">'+g.pitches.map(pitchGlyph).join('')+'</span>').join('');
      elements.push('<span class="jp-source-sign"'+attrs+' style="'+grid+'">'+sign+'</span>');
    }
  }
  return {html:elements.join(''),height:layers*21};
}
function octaveText(n) { return (Math.abs(n)===2?'15':'8')+(n>0?(Math.abs(n)===2?'ma':'va'):(Math.abs(n)===2?'mb':'vb')); }

function renderLine(parts, both, interactive) {
  const voiceKeys = [...new Set(parts.flatMap(p => [...p.voices.keys()]))].sort((a,b) =>
    Number(b.startsWith('right')) - Number(a.startsWith('right')) || parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  const verses = [...new Set(parts.flatMap(p => [...p.lyrics.keys()]))].sort((a,b) => a-b);
  const hasChords = parts.some(p => p.chords.size);
  const voiceMetrics = new Map(voiceKeys.map(key => {
    let height = 44, foot = 10;
    for (const p of parts) for (const item of p.voices.get(key) ?? []) {
      if (!item.pitches || item.dash) continue;
      const stack = item.pitches.reduce((sum,pitch) => sum + 23 + Math.max(0, Math.abs(pitch.octave)-1)*4, 0);
      const lowest = item.pitches.at(-1).octave;
      foot = Math.max(foot, Math.max(0, -lowest)*4 + item.rhythm.lines*3 + 5);
      height = Math.max(height, stack + 18 + item.rhythm.lines*2);
    }
    return [key,{foot, height:height+Math.max(0,foot-10)}];
  }));
  const lanePositions=new Map(), sourceRows=new Map();
  let y=0;
  for (const key of voiceKeys) {
    for (const side of ['above','below']) {
      if (side==='below') y+=voiceMetrics.get(key).height+(both?9:0);
      lanePositions.set(key+side,y);
      if (side==='below') {
        const foot=voiceMetrics.get(key).foot;
        lanePositions.set(key+'noteabove',y-foot-30);
        lanePositions.set(key+'notebelow',y-foot+7);
      }
      const height=Math.max(...parts.map(p=>sourceLane(p.marks,key,p.columns,side,lanePositions).height));
      sourceRows.set(key+side,height);
      y+=height;
    }
    if (key==='right0') y+=verses.length*22;
  }
  const markup = parts.map(p => {
    const {columns, bar} = p, number = p.index + 1, from = columns[0].t;
    const grid = columns.map(c => c.width + 'fr').join(' ');
    const rows = [];
    const textLane = (map, cls) => lane(cls, columns.map((c,i) => map?.has(c.t) ? cell(i, escape(map.get(c.t))) : '').join(''));
    if (hasChords) rows.push(textLane(p.chords,'jp-chords'));
    for (const key of voiceKeys) {
      const notes = p.voices.get(key) ?? [];
      const byStart = new Map(notes.map(n => [n.start,n]));
      const noteRow = columns.map((c,i) => {
        const item = byStart.get(c.t);
        if (item) return cell(i,glyph(item));
        if (!i && from > 0 && notes.some(n => n.start < from && n.start+n.duration > from && n.pitches))
          return cell(i,'<span class="jp-carry" aria-label="接續前行">⌒</span>');
        return '';
      }).join('');
      const curves = [];
      let previous = -1;
      for (const [i,c] of columns.entries()) {
        const item = byStart.get(c.t);
        if (!item) continue;
        if (item.tieIn) {
          if (previous < 0) curves.push('<i class="jp-incoming" style="grid-column:'+(i+1)+'" aria-label="承前延音"></i>');
          else curves.push('<i class="jp-arc" style="grid-column:'+(previous+1)+' / '+(i+1)+'" aria-label="同音相連"></i>');
        }
        previous = i;
      }
      if (previous >= 0 && byStart.get(columns[previous].t).tieOut) curves.push(
        '<i class="jp-arc jp-outgoing" style="grid-column:'+(previous+1)+' / -1" aria-label="延至下一段"></i>');
      const markRow=side=>{
        const height=sourceRows.get(key+side);
        if (height) rows.push(lane('jp-source-row',sourceLane(p.marks,key,columns,side,lanePositions).html,'style="min-height:'+height+'px"'));
      };
      markRow('above');
      rows.push(lane('jp-notes', (both ? '<span class="jp-hand">' + voiceName(key) + '</span>' : '') + noteRow + connectBeams(columns, byStart, bar.meter) + curves.join(''),
        'style="--lane-h:' + voiceMetrics.get(key).height + 'px;--foot:' + voiceMetrics.get(key).foot + 'px"'));
      markRow('below');
      if (key === 'right0') for (const verse of verses) rows.push(textLane(p.lyrics.get(verse), 'jp-lyrics'));
    }
    const barTitle = '第 ' + number + ' 小節' + bar.meterLabel;
    const hits = interactive ? lane('jp-hits', columns.map((c,i) =>
      '<button type="button" style="grid-column:'+(i+1)+'" data-offset="'+c.t+'" aria-label="第 '+number+' 小節，拍位 '+beatText(c.t)+'"></button>').join('')) : '';
    return '<div class="jp-bar' + (from ? ' jp-continued' : '') + (p.openEnd ? ' jp-open' : '') + '" data-bar="'+number+'" data-from="'+from+'" role="group" aria-label="'+barTitle+'" style="--need:'+p.width+'px;--tracks:'+grid+'">' +
      '<small class="jp-bar-number">'+(from ? '↳' : number + bar.meterLabel)+'</small>' + rows.join('') + hits + '</div>';
  });
  return '<div class="jp-system">' + markup.join('') + '</div>';
}

/** @param {ReturnType<typeof buildNumberedScore>} model @param {{both?:boolean, interactive?:boolean, beats?:number[]}} options */
export function renderNumberedSystems(model, {both = false, interactive = false, beats = []} = {}) {
  const systems = [];
  let line = [], need = 0;
  for (const part of segments(model, both, beats)) {
    if (line.length && (line.length >= 4 || need + part.width > 660)) {
      systems.push(renderLine(line, both, interactive));
      line = [];
      need = 0;
    }
    line.push(part);
    need += part.width;
  }
  if (line.length) systems.push(renderLine(line, both, interactive));
  return '<div class="jp-systems' + (both ? ' jp-both' : '') + '">' + systems.join('') + '</div>';
}

export function numberedPartName(model) {
  return model.bars.some(b => b.right.length > 1 || b.right[0].some(e => e.pitches?.length > 1))
    ? '右手第一聲部・取高音' : '右手聲部';
}

export function numberedHeader(model) {
  return '<header class="jp-title"><h2>' + escape(model.title) + '</h2>' +
    (model.composer ? '<p>' + escape(model.composer) + '</p>' : '') +
    '<div class="jp-meta"><span>1 = ' + escape(model.key.root) + '</span><span>' + model.key.name +
    (model.key.minor ? '（6 為主音）' : '') + '</span><span>' + model.meter.join('/') + '</span><span>♩ = ' +
    model.bpm + '</span></div></header>';
}

export const numberedCss = `
.jp-title,.jp-systems{color:#1e2524;font-family:"Times New Roman","Songti TC","PMingLiU",serif}
.jp-title{text-align:center}.jp-title h2{font:700 clamp(25px,3.4vw,38px)/1.3 "Songti TC","PMingLiU",serif;letter-spacing:.08em;margin:0;overflow-wrap:anywhere}.jp-title p{margin:6px 0 0;font-size:14px}
.jp-meta{display:flex;gap:8px 18px;align-items:baseline;flex-wrap:wrap;text-align:left;margin:20px 0 8px;font-weight:600;font-size:16px}
.jp-system{display:flex;flex-wrap:wrap;align-items:flex-start;row-gap:14px;margin:0 0 20px;break-inside:avoid}
.jp-bar{position:relative;box-sizing:border-box;flex:1 1 var(--need);min-width:0;padding:0 6px 0 8px}
.jp-bar-number{display:block;font:11px/1.45 system-ui;color:#606967;margin-bottom:2px}.jp-continued .jp-bar-number{font-size:11px}
.jp-lane{display:grid;grid-template-columns:var(--tracks);position:relative}
.jp-cell{grid-row:1;min-width:0;align-self:center;line-height:1.2}
.jp-notes{height:var(--lane-h);align-items:center}
.jp-notes::after{content:"";position:absolute;right:-6px;top:14%;bottom:14%;border-right:1px solid currentColor}
.jp-system:last-child .jp-bar:last-child .jp-notes::after{border-right:3px double currentColor}
.jp-continued .jp-notes::before{content:"";position:absolute;left:-7px;top:20%;bottom:20%;border-left:1px dashed #999}
.jp-glyph,.jp-carry{font:600 24px/1 "Times New Roman",serif;display:inline-flex;flex-direction:column;align-items:center;position:relative;vertical-align:middle;min-width:14px}
.jp-stack{display:flex;flex-direction:column;align-items:center}.jp-pitch{display:inline-block;position:relative;line-height:1.04}.jp-pitch:has(.jp-up){padding-top:4px}.jp-pitch:has(.jp-down){padding-bottom:4px}
.jp-oct{display:flex;align-items:center;flex-direction:column;gap:1px}.jp-oct i{width:3px;height:3px;background:currentColor;border-radius:50%}.jp-up{margin:0 auto -2px}.jp-down{margin:-1px auto 0}
.jp-pitch sup{position:absolute;right:97%;top:0;font:14px/1 "Times New Roman",serif}.jp-notes>.jp-cell{display:flex;align-items:flex-end;align-self:end;margin-bottom:var(--foot)}
.jp-pitch:last-child:has(.jp-down){padding-bottom:0}.jp-pitch:last-child>.jp-down{position:absolute;top:calc(100% + var(--beam-space) + 2px);left:50%;transform:translateX(-50%);margin:0}
.jp-beam,.jp-bridge{height:1.5px;background:currentColor;pointer-events:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.jp-beam{position:absolute;left:-1px;right:-1px;top:calc(100% + var(--drop))}
.jp-bridge{grid-row:1;align-self:end;margin-left:7px;margin-right:-7px;margin-bottom:calc(var(--foot) - var(--drop) - 1.5px)}
.jp-dot{position:absolute;left:108%;top:50%;transform:translateY(-56%);font:700 22px/1 serif}
.jp-arc,.jp-incoming{position:relative;grid-row:1;align-self:start;pointer-events:none;margin-top:3px;height:8px;border-top:1.5px solid currentColor;border-radius:50% 50% 0 0;margin-left:7px;margin-right:-7px}
.jp-arc.jp-outgoing{border-top-left-radius:95%;border-top-right-radius:0;margin-right:-6px}.jp-incoming{justify-self:start;width:15px;margin-left:-8px;border-top-left-radius:0;border-top-right-radius:95%}
.jp-open .jp-notes::after{border-right-style:dashed;color:#777}
.jp-subdivision{position:absolute;right:-3px;top:-11px;font:11px/1 serif}
.jp-chords{min-height:20px;font:600 14px/1.2 system-ui}.jp-lyrics{min-height:22px;font:16px/1.4 "Songti TC","PMingLiU",serif}.jp-lyrics .jp-cell,.jp-chords .jp-cell{white-space:pre-wrap;overflow-wrap:anywhere}
.jp-source-row{position:relative;grid-auto-rows:21px;align-items:center;z-index:1;pointer-events:none}
.jp-source-sign{justify-self:start;text-align:center;min-width:14px;font:600 17px/20px "Apple Symbols","STIX Two Math",serif;white-space:nowrap}
.jp-source-sign svg{display:block;overflow:visible}
.jp-source-sign[data-source-mark=dynamic]{font:bold italic 17px/20px Georgia,serif}
.jp-source-span{position:relative;display:block;height:20px;margin-left:-8px;margin-right:-6px;overflow:visible}
.jp-source-span.jp-span-start{margin-left:7px}.jp-source-span.jp-span-end{margin-right:-7px}.jp-source-span.jp-span-short{width:15px}
.jp-source-span svg{display:block;width:100%;height:20px;overflow:visible}.jp-octave-rule{display:block;border-top:1px dashed currentColor;font:italic 13px Georgia,serif}
.jp-span-end .jp-octave-rule{border-right:1px solid currentColor;min-height:5px}.jp-grace{display:inline-flex;flex-direction:column;margin-right:2px;font:600 12px/1 serif;border-bottom:1px solid currentColor}.jp-grace[data-value="16"]{border-bottom:3px double currentColor}
.jp-hand{position:absolute;left:0;top:-4px;font:10px/1.1 system-ui;color:#525d58}.jp-both .jp-notes{margin-top:9px}
.jp-hits{position:absolute;inset:14px 6px 0 8px}.jp-hits button{grid-row:1;background:transparent;border:0;border-radius:2px;padding:0;min-width:0;cursor:pointer}
@media screen{.jp-hits button:focus-visible{outline:2px solid #295c49;outline-offset:-2px;background:#40845a12}.jp-hits button:hover{background:#40845a16}.jp-bar[data-playing]{background:#43895f10}.jp-hits button[data-current]{box-shadow:inset 0 -3px #295c49}.jp-hits button[data-in-loop]{background:#40845a20}.jp-hits button[data-boundary]{border-left:2px solid #316a4c}}
@media(max-width:560px){.jp-bar{flex-basis:max(var(--need),49%)}.jp-meta{gap:6px 12px}}
@media print{.jp-system{break-inside:avoid;margin-bottom:14px}.jp-bar{flex-basis:var(--need)}.jp-hits{display:none}.jp-title{break-after:avoid}.jp-title h2{font-size:25pt}.jp-oct i{print-color-adjust:exact;-webkit-print-color-adjust:exact}.jp-title,.jp-systems{color:black}.jp-bar-number,.jp-hand{color:#333}}
`;

export function renderNumberedHtml(score, options) {
  const model = buildNumberedScore(score, options);
  const name = numberedPartName(model);
  return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+
    escape(model.title)+'｜數字簡譜</title><style>'+numberedCss+`
*{box-sizing:border-box}body{margin:0;background:#edf0ee;color:#1b2622;font:15px system-ui}main{max-width:900px;margin:24px auto;background:white;padding:32px clamp(14px,4vw,52px)}
.jp-views{min-width:0;border:0;margin:0;padding:0}.jp-views legend{position:absolute;clip-path:inset(50%)}.jp-views label{cursor:pointer;margin-right:15px}
.jp-views input{accent-color:#325c49}.jp-views>section{margin-top:18px}.jp-views h3{display:none}
#jp-right:checked~.jp-full,#jp-both:checked~.jp-lead{display:none}
@media(max-width:560px){main{margin:0;padding:22px 12px}}
@page{size:A4 portrait;margin:14mm 15mm;@bottom-center{content:counter(page) " / " counter(pages);font:9pt serif}}
@media print{body{background:white}main{margin:0;padding:0;max-width:none}.jp-views{display:contents}.jp-views input,.jp-views label{display:none}.jp-views h3{display:block;font:12px system-ui;margin:0 0 8px}.jp-views>section{margin-top:6px}}
</style></head><body><main>` + numberedHeader(model) + '<fieldset class="jp-views"><legend>顯示聲部</legend>'+
    '<input type="radio" name="part" id="jp-right" checked><label for="jp-right">'+name+'</label>'+
    '<input type="radio" name="part" id="jp-both"><label for="jp-both">完整雙手</label>'+
    '<section class="jp-lead"><h3>'+name+'</h3>'+renderNumberedSystems(model)+'</section>'+
    '<section class="jp-full"><h3>完整雙手</h3>'+renderNumberedSystems(model,{both:true})+'</section></fieldset></main></body></html>\n';
}
