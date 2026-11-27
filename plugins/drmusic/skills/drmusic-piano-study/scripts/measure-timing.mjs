/** Absolute quarter-note boundaries, including the exclusive end of the score.
 * Each local meter applies to that bar only. A pickup can have the printed meter
 * of a full bar and a shorter sounding duration.
 * @param {{timeSignature: readonly number[], measures: ReadonlyArray<{duration?:number,timeSignature?:readonly number[],notes?:readonly unknown[]}>}} score
 */
export function measureTiming(score) {
  const starts = [0], durations = [], meters = [];
  for (const bar of score.measures) {
    const meter = bar.timeSignature ?? score.timeSignature;
    if (!Array.isArray(meter) || meter.length !== 2 || !Number.isInteger(meter[0]) || meter[0] < 1 ||
        ![1, 2, 4, 8, 16, 32].includes(meter[1])) throw new Error('小節拍號無效。');
    const duration = bar.duration ?? meter[0] * 4 / meter[1];
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('小節拍數無效。');
    meters.push(meter);
    durations.push(duration);
    starts.push(starts[starts.length - 1] + duration);
  }
  return { starts, durations, meters, total: starts[starts.length - 1] };
}

/** Locate an onset; for an exclusive release exactly on a barline select the preceding bar.
 * @param {readonly number[]} starts @param {number} beat
 */
export function measureAt(starts, beat, release = false) {
  let low = 0, high = starts.length - 1;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (release ? starts[mid] < beat : starts[mid] <= beat) low = mid;
    else high = mid;
  }
  return low;
}

/** Group adjacent written ottava events into one visual bracket. Endpoints
 * refer to the first and last note onsets, even when they are on different systems.
 * The portable score and its sounding pitches remain intact. */
export function groupOctaveMarks(score,timing=measureTiming(score)) {
  const runs=new Map();
  return score.measures.map((bar,i)=>{
    const marks=[];
    for (const raw of [...(bar.notationMarks ?? [])].sort((a,b)=>a.start-b.start)) {
      if (raw.type!=='octaveShift' || raw.end) {marks.push(raw);continue;}
      const note=(bar.notationNotes ?? bar.notes).find(n=>n.hand===raw.hand && Math.abs(n.start-raw.start)<1e-7 &&
        (raw.voice===undefined || raw.voice===(n.voice ?? 0)) && (raw.midi===undefined || raw.midi===n.midi));
      if (!note) {marks.push(raw);continue;}
      const key=[raw.hand,raw.voice ?? note.voice ?? 0,raw.octaves,raw.placement].join(':');
      const at=timing.starts[i]+raw.start, until=at+note.duration, prior=runs.get(key);
      if (prior && Math.abs(prior.until-at)<1e-7) {
        const {start,hand,voice,midi}=raw;
        prior.mark.end={measure:i+1,start,hand,voice,midi};
        prior.until=until;
      } else {
        const mark={...raw};
        marks.push(mark);
        runs.set(key,{mark,until});
      }
    }
    return marks;
  });
}
