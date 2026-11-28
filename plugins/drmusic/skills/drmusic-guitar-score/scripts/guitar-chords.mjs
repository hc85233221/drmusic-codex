/** Music helpers for a local songbook. Pitch classes use C = 0. */
export const KEYS = Object.freeze(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NATURALS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const mod = (value, divisor = 12) => ((value % divisor) + divisor) % divisor;
const cleanAccidentals = (value) => String(value ?? '').replaceAll('♯', '#').replaceAll('♭', 'b');

function parseRoot(value) {
  const match = /^([A-Ga-g])(#{1,2}|b{1,2}|)$/.exec(cleanAccidentals(value).trim());
  if (!match) return null;
  const letter = match[1].toUpperCase();
  return { letter, accidental: match[2], pitch: mod(NATURALS[letter] + alterationOf(match[2])) };
}

/** Canonical tonic from the twelve supported selector keys, or null. */
export function normalizeKey(value) {
  const input = cleanAccidentals(value).trim().replace(/\s*(?:major|minor|maj|min|m)$/i, '');
  const root = parseRoot(input);
  return root ? KEYS[root.pitch] : null;
}

function parseChord(value) {
  const input = cleanAccidentals(value).trim();
  const match = /^([A-Ga-g](?:#{1,2}|b{1,2})?)(.*?)(?:\/([A-Ga-g](?:#{1,2}|b{1,2})?))?$/.exec(input);
  if (!match) return null;
  // Known chord spelling tokens also allow extensions whose voicing is unsupported.
  // This rejects ordinary words such as "Bridge" and preserves them as text.
  if (!/^(?:(?:6\/9|major|minor|maj|Maj|min|dim|aug|sus|add|omit|alt|no)|[mMoøØ°Δ\d#b(),+.\-])*$/u.test(match[2])) return null;
  return { root: parseRoot(match[1]), rootText: match[1], suffix: match[2], bass: match[3] ? parseRoot(match[3]) : null };
}

/** Respell just the root and optional bass of a recognized symbol, keeping the printed suffix verbatim. */
export function mapChordRoots(symbol, transform) {
  if (!parseChord(symbol)) return symbol;
  return symbol.replace(/^(\s*)([A-Ga-g][#b♯♭]{0,2})/u, (_, space, root) => space + transform(root))
    .replace(/\/([A-Ga-g][#b♯♭]{0,2})(\s*)$/u, (_, bass, space) => '/' + transform(bass) + space);
}

/** Transpose both root and slash bass while retaining the quality/extension. */
export function transposeChord(chord, semitones, preferFlats = false, targetKey = '') {
  const parsed = parseChord(chord);
  if (!parsed || !Number.isFinite(Number(semitones))) return String(chord ?? '');
  const distance = Math.trunc(Number(semitones));
  // A zero shift preserves the user's original enharmonic spelling.
  if (mod(distance) === 0) return String(chord ?? '');
  const names = preferFlats ? FLATS : SHARPS;
  const root = names[mod(parsed.root.pitch + distance)];
  const bass = parsed.bass ? `/${names[mod(parsed.bass.pitch + distance)]}` : '';
  const result = root + parsed.suffix + bass;
  // A minor's lowered second is Bb; its raised leading tone stays G#.
  if (normalizeKey(targetKey) === 'A' && /m$/i.test(targetKey)) {
    return result.replace(/^A#/, 'Bb').replace(/\/A#$/, '/Bb');
  }
  return result;
}

/** Turn a written key into a tonic for the fingering and degree displays. */
export function shiftedChartKey(key, semitones) {
  const match = /^([A-G][#b♯♭]?)\s*(m|minor|min|小調|major|maj|大調)?$/i.exec(String(key ?? '').trim());
  if (!match) return undefined;
  const minor = /^(m|minor|min|小調)$/i.test(match[2] || '');
  const tonic = match[1][0].toUpperCase() + match[1].slice(1);
  return transposeChord(tonic + (minor ? 'm' : ''), semitones, true);
}

function romanForRoot(root, tonic, scale = MAJOR_SCALE) {
  // Key selectors and transposition may use an enharmonic spelling (F rather
  // than E# in F# major). Match diatonic pitches before judging spelling.
  const diatonicDegree = scale.indexOf(mod(root.pitch - tonic.pitch));
  if (diatonicDegree !== -1) return ROMANS[diatonicDegree];
  const degree = mod(LETTERS.indexOf(root.letter) - LETTERS.indexOf(tonic.letter), 7);
  let difference = mod(root.pitch - tonic.pitch - scale[degree]);
  if (difference > 6) difference -= 12;
  return `${difference < 0 ? 'b'.repeat(-difference) : '#'.repeat(difference)}${ROMANS[degree]}`;
}

/** Roman degrees use the declared major or natural-minor tonic. */
export function chordToRoman(chord, key) {
  const parsed = parseChord(chord);
  const tonic = parseRoot(cleanAccidentals(key).trim().replace(/\s*(?:major|minor|maj|min|m)$/i, ''));
  if (!parsed || !tonic) return String(chord ?? '');
  const scale = /(?:minor|min|m)$/i.test(cleanAccidentals(key).trim()) ? MINOR_SCALE : MAJOR_SCALE;
  let degree = romanForRoot(parsed.root, tonic, scale);
  let suffix = parsed.suffix;
  const minor = /^(?:min|m(?!aj)|-)/.test(suffix);
  const diminished = /^(?:dim|o|°|ø)/u.test(suffix);
  if (minor || diminished) degree = degree.toLowerCase();
  if (/^(?:m7b5|m7-5|ø7?)$/u.test(suffix)) suffix = 'ø7';
  else if (/^(?:dim|o|°)/u.test(suffix)) suffix = suffix.replace(/^(?:dim|o|°)/u, '°');
  else if (minor) suffix = suffix.replace(/^(?:min|m|-)/, '');
  else if (/^(?:aug|\+)/.test(suffix)) suffix = suffix.replace(/^(?:aug|\+)/, '+');
  return degree + suffix + (parsed.bass ? `/${romanForRoot(parsed.bass, tonic, scale)}` : '');
}

function alterationOf(accidental) {
  return accidental.startsWith('b') ? -accidental.length : accidental.length;
}

function canonicalQuality(suffix) {
  const aliases = {
    major: '', maj: '', M: '', minor: 'm', min: 'm', '-': 'm', min7: 'm7', '-7': 'm7',
    M7: 'maj7', Maj7: 'maj7', 'Δ7': 'maj7', 'Δ': 'maj7', sus: 'sus4', o: 'dim', '°': 'dim',
    o7: 'dim7', '°7': 'dim7', '+': 'aug', 'm7-5': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5',
    add2: 'add9', 'm(maj7)': 'mMaj7', mmaj7: 'mMaj7', mM7: 'mMaj7', '7-9':'7b9', '7+9':'7#9',
  };
  suffix = suffix.replace(/^Ø/u, 'ø').replace(/^(?:M|Maj|Δ)(?=7|9|11|13)/u, 'maj');
  // Plus/minus inside an extension replace a written sharp/flat.
  suffix = suffix.replace(/([7-9]|13|11|\(|,)([+-])(?=5|9|11|13)/g,
    (_, before, sign) => before + (sign === '-' ? 'b' : '#'));
  return Object.hasOwn(aliases, suffix) ? aliases[suffix] : suffix;
}

// Semitones above the root. Keep compound extensions in their written octave
// for root-position examples. The 13th voicing omits the optional natural 11.
const PIANO_INTERVALS = {
  '': [0, 4, 7], '5': [0, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '6/9': [0, 4, 7, 9, 14], 'm6/9': [0, 3, 7, 9, 14],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mMaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], '7sus4': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10],
  '7sus': [0, 5, 7, 10], sus4add9: [0, 5, 7, 14],
  '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  '11': [0, 4, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 21], m13: [0, 3, 7, 10, 14, 17, 21], maj13: [0, 4, 7, 11, 14, 21],
};
const ALTERABLE_INTERVALS = { 5: 7, 9: 14, 11: 17, 13: 21 };
// Written degrees distinguish enharmonic intervals such as a minor third (3)
// and an augmented ninth (15); the diminished seventh has its own spelling.
const WRITTEN_DEGREES = {
  0: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 5, 7: 5, 8: 5,
  9: 6, 10: 7, 11: 7, 13: 9, 14: 9, 15: 9,
  16: 11, 17: 11, 18: 11, 20: 13, 21: 13, 22: 13,
};

function pianoIntervals(quality) {
  if (Object.hasOwn(PIANO_INTERVALS, quality)) return PIANO_INTERVALS[quality];
  // Accept only fully specified alterations, including 7(b9,#11).
  const altered = /^((?:maj|m)?(?:13|11|9|7))(.+)$/.exec(quality);
  if (!altered || !Object.hasOwn(PIANO_INTERVALS, altered[1])) return null;
  const tail = altered[2];
  const parenthesized = /^\([#b]\d+(?:,[#b]\d+)*\)$/.test(tail);
  if (!parenthesized && !/^(?:[#b]\d+)+$/.test(tail)) return null;
  const intervals = new Set(PIANO_INTERVALS[altered[1]]);
  for (const [, accidental, degree] of tail.matchAll(/([#b])(\d+)/g)) {
    if (!Object.hasOwn(ALTERABLE_INTERVALS, degree)) return null;
    const natural = ALTERABLE_INTERVALS[degree];
    intervals.delete(natural);
    intervals.add(natural + (accidental === '#' ? 1 : -1));
  }
  const ordered = [...intervals].sort((a, b) => a - b);
  return ordered.filter(step => !intervals.has(step - 12));
}

// The songbook's numbered chord roots carry their accidental after the digit.
// Scale steps keep their letter names (e.g. #4 and b5 remain distinct).
function keyContext(key) {
  const match = /^([A-Ga-g][#b]?)\s*(m|minor|min|小調|major|maj|大調)?$/i.exec(cleanAccidentals(key).trim());
  if (!match) return null;
  return { tonic: parseRoot(match[1]), scale: /^(?:m|minor|min|小調)$/i.test(match[2] ?? '') ? MINOR_SCALE : MAJOR_SCALE };
}

function accidentalName(difference) {
  return (difference < 0 ? 'b' : '#').repeat(Math.abs(difference));
}

function rootAsDegree(root, {tonic, scale}) {
  const index = mod(LETTERS.indexOf(root.letter) - LETTERS.indexOf(tonic.letter), 7);
  const offset = mod(root.pitch - tonic.pitch - scale[index] + 6) - 6;
  return {index, accidental: accidentalName(offset)};
}

function degreeAsRoot({index, accidental}, {tonic, scale}) {
  const letter = LETTERS[mod(LETTERS.indexOf(tonic.letter) + index, 7)];
  const pitch = tonic.pitch + scale[index] + alterationOf(accidental);
  return letter + accidentalName(mod(pitch - NATURALS[letter] + 6) - 6);
}

function readDegreeRoot(text) {
  const match = /^(#{1,2}|b{1,2}|)([1-7]|VII|III|VI|IV|II|V|I|vii|iii|vi|iv|ii|v|i)(#{1,2}|b{1,2}|)(.*)$/.exec(text);
  if (!match || (match[1] && match[3])) return null;
  const token = match[2], isRoman = !/^[1-7]$/.test(token);
  const index = isRoman ? ROMANS.indexOf(token.toUpperCase()) : Number(token) - 1;
  return {index, accidental: match[1] || match[3], implicitMinor: isRoman && token === token.toLowerCase(), suffix: match[4]};
}

// A known root with a (11) label can be respelled without deciding which
// third or seventh an arranger intended. Its diagrams stay unavailable.
function writtenQuality(suffix) {
  const quality = canonicalQuality(suffix);
  if (!pianoIntervals(quality) && !/^(?:\((?:9|11|13)\)|(?:m|maj)?(?:7alt|add(?:2|4|9|11|13)|11|13)|(?:7)?(?:omit|no)[35])$/.test(quality)) return null;
  if (quality === 'm7b5') return {letter: 'm7b5', number: 'Ø'};
  if (quality === '7sus' || quality === '7sus4') return {letter: '7sus4', number: '7sus'};
  if (quality === 'sus4') return {letter: 'sus4', number: 'sus'};
  return {letter: quality, number: quality.replace(/^maj/, 'M')};
}

function readDegreeChord(text) {
  const lastSlash = text.lastIndexOf('/');
  const bass = lastSlash < 0 ? null : readDegreeRoot(text.slice(lastSlash + 1));
  // The 9 in 6/9 is an extension, not a bass degree.
  if (bass?.suffix) return null;
  const root = readDegreeRoot(bass ? text.slice(0, lastSlash) : text);
  if (!root) return null;
  let suffix = root.suffix;
  if (root.implicitMinor && !/^(?:m|dim|ø|Ø|°|o|[-+]|aug)/u.test(suffix)) suffix = 'm' + suffix;
  const quality = writtenQuality(suffix);
  return quality ? {root, bass, quality} : null;
}

const degreeName = degree => String(degree.index + 1) + degree.accidental;

/** Resolve a chord token in its local written key. The optional shift is in semitones. */
export function resolveGuitarChord(symbol, key, shift = 0) {
  const source = String(symbol ?? '').trim();
  const text = cleanAccidentals(source);
  const context = keyContext(key);
  const target = context && (shift % 12 ? keyContext(shiftedChartKey(key, shift)) : context);
  const degree = readDegreeChord(text);
  if (degree) {
    const {root, bass, quality} = degree;
    // Retain the printed alteration on extensions such as 37(-13) and 57-9.
    const qualityLabel = /^[1-7]/.test(text) && /[+-]\d/.test(root.suffix) ? root.suffix : quality.number;
    return {
      chord: target ? degreeAsRoot(root, target) + quality.letter + (bass ? '/' + degreeAsRoot(bass, target) : '') : null,
      degree: degreeName(root) + qualityLabel + (bass ? '/' + degreeName(bass) : ''),
    };
  }
  const absolute = parseChord(text);
  const quality = absolute && writtenQuality(absolute.suffix);
  if (!quality) return {chord: null, degree: null};
  if (!context) return {chord: transposeChord(source, shift), degree: null};
  const root = rootAsDegree(absolute.root, context);
  const bass = absolute.bass && rootAsDegree(absolute.bass, context);
  return {
    chord: shift % 12 && target ? degreeAsRoot(root, target) + absolute.suffix + (bass ? '/' + degreeAsRoot(bass, target) : '') : source,
    degree: degreeName(root) + quality.number + (bass ? '/' + degreeName(bass) : ''),
  };
}

function intervalName(root, step, quality) {
  const degree = step === 9 && quality === 'dim7' ? 7 : WRITTEN_DEGREES[step];
  const letter = LETTERS[(LETTERS.indexOf(root.letter) + degree - 1) % 7];
  const alteration = mod(root.pitch + step - NATURALS[letter] + 6) - 6;
  return letter + (alteration < 0 ? '♭' : '♯').repeat(Math.abs(alteration));
}

/** One representative keyboard voicing; an explicit slash bass always occupies the lowest key. */
export function pianoChordVoicing(symbol) {
  const parsed = parseChord(symbol);
  if (!parsed) return null;
  const quality = canonicalQuality(parsed.suffix);
  const intervals = pianoIntervals(quality);
  if (!intervals) return null;
  const root = 55 + mod(parsed.root.pitch - 7); // G3 through F#4, close to middle C
  const bass = parsed.bass ? 48 + parsed.bass.pitch : null; // C3 through B3
  const keys = [];
  if (parsed.bass) keys.push({ midi: bass, name: intervalName(parsed.bass, 0, '') });
  for (const step of intervals) {
    const pitch = mod(root + step);
    if (parsed.bass?.pitch === pitch) continue;
    const midi = bass === null ? root + step : bass + mod(pitch - bass);
    keys.push({ midi, name: intervalName(parsed.root, step, quality) });
  }
  keys.sort((a, b) => a.midi - b.midi);
  return { midi: keys.map(key => key.midi), bass, names: keys.map(key => key.name) };
}

const OPEN_SHAPES = Object.freeze({
  C: [-1, 3, 2, 0, 1, 0], D: [-1, -1, 0, 2, 3, 2], E: [0, 2, 2, 1, 0, 0],
  F: [1, 3, 3, 2, 1, 1], G: [3, 2, 0, 0, 0, 3], A: [-1, 0, 2, 2, 2, 0],
  Dm: [-1, -1, 0, 2, 3, 1], Em: [0, 2, 2, 0, 0, 0], Am: [-1, 0, 2, 2, 1, 0],
  C7: [-1, 3, 2, 3, 1, 0], D7: [-1, -1, 0, 2, 1, 2], E7: [0, 2, 0, 1, 0, 0],
  G7: [3, 2, 0, 0, 0, 1], A7: [-1, 0, 2, 0, 2, 0], B7: [-1, 2, 1, 2, 0, 2],
  Cmaj7: [-1, 3, 2, 0, 0, 0], Dmaj7: [-1, -1, 0, 2, 2, 2],
  Emaj7: [0, 2, 1, 1, 0, 0], Fmaj7: [-1, -1, 3, 2, 1, 0],
  Gmaj7: [3, 2, 0, 0, 0, 2], Amaj7: [-1, 0, 2, 1, 2, 0],
  Dm7: [-1, -1, 0, 2, 1, 1], Em7: [0, 2, 0, 0, 0, 0], Am7: [-1, 0, 2, 0, 1, 0],
  Csus2: [-1, 3, 0, 0, 1, 3], Dsus2: [-1, -1, 0, 2, 3, 0], Asus2: [-1, 0, 2, 2, 0, 0],
  Csus4: [-1, 3, 3, 0, 1, 1], Dsus4: [-1, -1, 0, 2, 3, 3],
  Esus4: [0, 2, 2, 2, 0, 0], Gsus4: [3, 3, 0, 0, 1, 3], Asus4: [-1, 0, 2, 2, 3, 0],
  Cadd9: [-1, 3, 2, 0, 3, 0], Gadd9: [3, 2, 0, 2, 0, 3],
  E9: [0, 2, 0, 1, 0, 2], C9: [-1, 3, 2, 3, 3, 3], D9: [-1, 5, 4, 5, 5, 5],
  Bm7b5: [-1, 2, 3, 2, 3, -1], Cdim: [-1, 3, 4, 5, 4, -1],
  Caug: [-1, 3, 2, 1, 1, -1], Eaug: [0, 3, 2, 1, 1, 0],
  'C/E': [0, 3, 2, 0, 1, 0], 'C/G': [3, 3, 2, 0, 1, 0],
  'D/F#': [2, 0, 0, 2, 3, 2], 'E/G#': [4, -1, 2, 1, 0, 0], 'G/B': [-1, 2, 0, 0, 0, 3],
  'Am/G': [3, 0, 2, 2, 1, 0], 'F/C': [-1, 3, 3, 2, 1, 1],
});

// Established E- and A-form movable fingerings. All entries are chord-tone voicings.
const BARRE_E = {
  '': [0, 2, 2, 1, 0, 0], '5': [0, 2, 2, null, null, null], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0],
  aug: [0, 3, 2, 1, null, null], '9': [0, 2, 0, 1, 0, 2],
  '6': [0, 2, 2, 1, 2, 0], m6: [0, 2, 2, 0, 2, 0], m9: [0, 2, 0, 0, 0, 2],
  '7sus4': [0, 2, 0, 2, 0, 0], maj9: [0, 2, 1, 1, 0, 2],
  '7b9': [0, 2, 0, 1, 0, 1], '7b13': [0, 2, 0, 1, 1, 0],
};
const BARRE_A = {
  '': [null, 0, 2, 2, 2, 0], '5': [null, 0, 2, 2, null, null], m: [null, 0, 2, 2, 1, 0], '7': [null, 0, 2, 0, 2, 0],
  maj7: [null, 0, 2, 1, 2, 0], m7: [null, 0, 2, 0, 1, 0], sus2: [null, 0, 2, 2, 0, 0],
  sus4: [null, 0, 2, 2, 3, 0], dim: [null, 0, 1, 2, 1, null],
  aug: [null, 0, 3, 2, 2, null], add9: [null, 0, 2, 4, 2, 0],
  m7b5: [null, 0, 1, 0, 1, null], '7sus2': [null, 0, 2, 0, 0, 0],
};

const SLASH_TRIADS = {
  'm/3': [['E',[3,2,2,0,0,0]], ['A',[-1,3,2,2,-1,-1]], ['D',[1,-1,0,2,-1,-1]]],
  '/7':  [['A',[0,0,2,2,2,0]], ['D',[-1,0,0,2,3,2]], ['G',[-1,-1,0,0,0,3]]],
  'm/7': [['A',[0,0,2,2,1,0]], ['D',[-1,0,0,2,3,1]], ['E',[-1,2,2,0,0,0]]],
  '/2':  [['A',[-1,2,2,2,2,-1]], ['C',[-1,-1,0,0,1,0]], ['F',[3,-1,3,2,1,-1]]],
};

function shapeResult(frets) {
  const positive = frets.filter((fret) => fret > 0);
  const minimum = positive.length ? Math.min(...positive) : 1;
  return { frets: [...frets], baseFret: frets.includes(0) || Math.max(...frets) <= 4 ? 1 : minimum };
}

/** A verified common/open or movable guitar shape; unsupported voicings return null. */
export function guitarShape(chord) {
  const parsed = parseChord(chord);
  if (!parsed) return null;
  const quality = canonicalQuality(parsed.suffix).replace(/^(7)\(([#b]\d+)\)$/, '$1$2');
  const rootName = KEYS[parsed.root.pitch];
  const bassName = parsed.bass ? SHARPS[parsed.bass.pitch] : null;
  const lookup = rootName + quality + (bassName ? `/${bassName}` : '');
  if (OPEN_SHAPES[lookup]) return shapeResult(OPEN_SHAPES[lookup]);
  if (quality === '' && parsed.bass && mod(parsed.bass.pitch - parsed.root.pitch) === 4) {
    // Both movable triads sound third, fifth, root from low to high.
    // Slide G/B on strings 5–3 or C/E on strings 4–2 to the lower position.
    const fromGB = mod(parsed.bass.pitch - 11);
    const fromCE = mod(parsed.bass.pitch - 4);
    return shapeResult(fromGB < fromCE
      ? [-1, fromGB + 2, fromGB, fromGB, -1, -1]
      : [-1, -1, fromCE + 2, fromCE, fromCE + 1, -1]);
  }
  if (parsed.bass) {
    // Each movable shape contains the complete triad and its specified bass.
    // Positions are indexed by quality and the interval of the low note.
    const interval = mod(parsed.bass.pitch - parsed.root.pitch);
    const forms = SLASH_TRIADS[quality + '/' + interval];
    if (!forms) return null;
    const shifted = forms.map(([base, frets]) => {
      const distance = mod(parsed.root.pitch - NATURALS[base]);
      return frets.map(f => f < 0 ? -1 : f + distance);
    });
    shifted.sort((a, b) => Math.max(...a) - Math.max(...b));
    return shapeResult(shifted[0]);
  }
  const candidates = [];
  for (const [forms, openRoot] of [[BARRE_E, 4], [BARRE_A, 9]]) {
    const form = forms[quality];
    if (!form) continue;
    const fret = mod(parsed.root.pitch - openRoot);
    candidates.push(form.map((offset) => offset === null ? -1 : offset + fret));
  }
  if (quality === 'dim7') {
    const fret = mod(parsed.root.pitch - 2);
    candidates.push([-1, -1, fret, fret + 1, fret, fret + 1]);
  }
  if (!candidates.length) return null;
  candidates.sort((first, second) => Math.max(...first) - Math.max(...second));
  return shapeResult(candidates[0]);
}
