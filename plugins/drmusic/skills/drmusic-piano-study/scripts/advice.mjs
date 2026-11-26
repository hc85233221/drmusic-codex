// All time values are quarter notes. Durations already include ties in the DrMusic format.
const EPS = 1e-7;
const HANDS = ['right', 'left'];
const HAND_NAME = {right: '右手', left: '左手'};
const BLACK = new Set([1, 3, 6, 8, 10]);
const SHARPS = 'C C♯ D D♯ E F F♯ G G♯ A A♯ B'.split(' ');
const FLATS = 'C D♭ D E♭ E F G♭ G A♭ A B♭ B'.split(' ');
const MIXED = 'C C♯ D E♭ E F F♯ G A♭ A B♭ B'.split(' ');
function spellings(key = '') {
  if (/[♭b降]/.test(key) || /^(F|Dm)(?:$|\s)/i.test(key)) return FLATS;
  if (/[♯#升]/.test(key) || /^(G|D|A|E|B|Em|Bm)(?:$|\s)/.test(key)) return SHARPS;
  return MIXED;
}
function original(mark) {
  return mark.source == null || ['original', 'score', 'printed'].includes(mark.source);
}
function printedFinger(note) {
  const f = note.finger ?? note.fingering;
  return original(note) && Number.isInteger(f) && f >= 1 && f <= 5 ? f : null;
}

// For each pair of fingers, preferred and maximum simultaneous span in semitones.
// The maximum is a conservative practice envelope, not a measurement of the player.
const SPANS = {
  12:[2,7], 13:[4,9], 14:[5,11], 15:[7,14], 23:[2,4], 24:[3,6],
  25:[5,8], 34:[2,4], 35:[3,6], 45:[2,4],
};
function span(f, g) { return SPANS[Math.min(f,g)*10 + Math.max(f,g)]; }
function fingerShapes(count) {
  const results = [];
  function visit(f, chosen) {
    if (chosen.length === count) { results.push(chosen); return; }
    for (; f <= 5; f++) visit(f+1, [...chosen, f]);
  }
  visit(1, []);
  return results;
}
const SHAPES = Array.from({length:6}, (_,count) => fingerShapes(count));

function collectAttacks(score, barLength) {
  const attacks = {right:[], left:[]};
  for (const [index, bar] of score.measures.entries()) {
    for (const note of bar.notes) {
      if (!HANDS.includes(note.hand) || !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
          !Number.isFinite(note.start) || note.start < 0 || note.start >= barLength ||
          !Number.isFinite(note.duration) || note.duration <= 0) throw new TypeError('鋼琴音符的聲部、音高或拍位無效。');
      const time = index*barLength + note.start;
      attacks[note.hand].push({time, start:note.start, bar:index, midi:note.midi, end:time+note.duration, printed:printedFinger(note)});
    }
  }
  for (const hand of HANDS) {
    const groups = [];
    for (const n of attacks[hand].sort((a,b) => a.time-b.time || a.midi-b.midi)) {
      let group = groups.at(-1);
      if (!group || group.bar !== n.bar || n.time-group.time > EPS) {
        group = {time:n.time, bar:n.bar, start:n.start, notes:[]};
        groups.push(group);
      }
      const same = group.notes.find(note => note.midi === n.midi);
      if (!same) group.notes.push(n);
      else {
        same.end = Math.max(same.end, n.end);
        if (n.printed && same.printed && n.printed !== same.printed) same.conflict = true;
        same.printed ??= n.printed;
      }
    }
    for (const group of groups) group.notes.sort((a,b) => a.midi-b.midi);
    attacks[hand] = groups;
  }
  return attacks;
}

function movement(previous, current, direction, gap) {
  if (!previous.length || gap >= 1) return 0;
  // Compare the closest previous key. A thumb crossing can keep adjacent notes legato.
  let cost = 0;
  for (const note of current) {
    const last = previous.reduce((best, n) => Math.abs(n.midi-note.midi) < Math.abs(best.midi-note.midi) ? n : best);
    const pitchDelta = (note.midi-last.midi)*direction, fingerDelta = note.f-last.f;
    const distance = Math.abs(pitchDelta);
    if (!distance) { cost += fingerDelta === 0 ? 0 : .9; continue; }
    if (distance > 9) { cost += .45; continue; } // Lift and reset the hand on a leap.
    if (pitchDelta*fingerDelta > 0) {
      const [ideal] = span(last.f,note.f);
      cost += .38*Math.abs(distance-ideal) + (distance <= 2 && Math.abs(fingerDelta)>1 ? 1.25 : 0);
    } else if (distance <= 5 && (last.f===1 || note.f===1)) {
      const over = Math.max(last.f,note.f);
      const thumbKey = last.f===1 ? last.midi : note.midi;
      cost += 1.35 + (over===3 ? 0 : over===4 ? .45 : 1.9) + (BLACK.has(thumbKey%12) ? 1.2 : 0);
    } else cost += distance > 5 ? 2.8 : 5;
  }
  return cost/current.length * (gap > .25 ? .55 : 1);
}

function solveHand(groups, hand) {
  const direction = hand === 'right' ? 1 : -1;
  let states = [{cost:0, last:[], fingers:new Map(), path:null}];
  const sounding = new Map();
  let previousEnd = -Infinity;
  for (const group of groups) {
    for (const [m,end] of sounding) if (end <= group.time+EPS) sounding.delete(m);
    const notes = group.notes, repeated = notes.some(n => sounding.has(n.midi));
    const keys = [...new Set([...sounding.keys(), ...notes.map(n=>n.midi)])].sort((a,b)=>(a-b)*direction);
    const requested = new Map(notes.filter(n=>n.printed).map(n=>[n.midi,n.printed]));
    const reach = Math.abs(keys.at(-1)-keys[0]);
    const gap = group.time-previousEnd;
    let issue = '';
    if (keys.some(m=>m<21 || m>108)) issue='超出標準 88 鍵音域，請核對音高';
    else if (notes.some(n=>n.conflict)) issue='同鍵原譜指號互異，請核對';
    else if (repeated) issue='同鍵延音中又起音，請核對連結線或時值';
    else if (keys.length>5) issue='超過五個同時按鍵，請確認分手或踏板';
    else if (reach>14) issue='同時跨距過大，請確認分手或琶音';
    const next = [];
    if (!issue) {
      for (const shape of SHAPES[keys.length]) {
        let pose = 0, fits = true;
        const fingers = new Map();
        for (let i=0; i<keys.length && fits; i++) {
          const m=keys[i], f=shape[i];
          if (requested.has(m) && requested.get(m)!==f) { fits=false; break; }
          fingers.set(m,f);
          if (BLACK.has(m%12) && (f===1 || f===5)) pose += f===1 ? 1.15 : .45;
          for (let j=0;j<i;j++) {
            const d=Math.abs(m-keys[j]), [ideal,max]=span(f,shape[j]);
            if (d>max) { fits=false; break; }
            pose += Math.abs(d-ideal)*.15 + Math.max(0,d-ideal-2)*.35;
          }
        }
        if (!fits) continue;
        if (keys.length===3 && [0,1].every(j=>[3,4].includes(Math.abs(keys[j+1]-keys[j]))) &&
            (shape[0]!==1 || shape[1]!==3 || shape[2]!==5)) pose+=.45;
        const assigned = notes.map(n=>({midi:n.midi, f:fingers.get(n.midi)}));
        let best = null, lowest = Infinity;
        for (const prev of states) {
          if ([...sounding.keys()].some(m=>prev.fingers.get(m)!==fingers.get(m))) continue;
          let cost = prev.cost + pose + movement(prev.last,assigned,direction,gap);
          if (!prev.last.length || gap>=1) {
            // With no phrase context, start on a comfortable inner finger or thumb.
            cost += Math.min(...assigned.map(n=>Math.abs(n.f-2)))*.12;
          }
          if (cost<lowest) { lowest=cost; best=prev; }
        }
        if (best) next.push({cost:lowest, last:assigned, fingers, path:{previous:best.path,assigned,
          issue:reach>12?'大跨距，依手幅調整':Math.abs((best.last[0]?.midi ?? assigned[0].midi)-assigned[0].midi)>9 && !sounding.size?'換手位':''}});
      }
    }
    if (!next.length) {
      const best=states.reduce((a,b)=>a.cost<=b.cost?a:b);
      issue ||= '指距、原譜指號或延音占指受限，請核對';
      // Preserve independently known held fingers after an unplayable onset.
      const fingers=new Map([...best.fingers].filter(([m])=>sounding.has(m)));
      for (const [m,f] of requested) fingers.set(m,f);
      next.push({cost:best.cost,last:[],fingers,path:{previous:best.path,assigned:[],issue}});
    }
    // A shape fixes every currently sounding finger; only its cheapest history is needed.
    states=next;
    for (const n of notes) sounding.set(n.midi,Math.max(sounding.get(n.midi) ?? 0,n.end));
    previousEnd=Math.max(previousEnd,...notes.map(n=>n.end));
  }
  let path=states.reduce((a,b)=>a.cost<=b.cost?a:b).path;
  const result=new Array(groups.length);
  for (let i=result.length-1;i>=0;i--) { result[i]=path; path=path.previous; }
  return result;
}

const QUALITIES = [
  ['', [0,4,7]], ['m',[0,3,7]], ['dim',[0,3,6]], ['aug',[0,4,8]],
  ['7',[0,4,7,10]], ['maj7',[0,4,7,11]], ['m7',[0,3,7,10]],
  ['m7♭5',[0,3,6,10]], ['dim7',[0,3,6,9]], ['sus2',[0,2,7]], ['sus4',[0,5,7]],
];
const CHORDS = QUALITIES.flatMap(([quality,intervals])=>Array.from({length:12},(_,root)=>{
  const tones=intervals.map(i=>(i+root)%12);
  return {root,quality,tones,mask:tones.reduce((m,pc)=>m|(1<<pc),0)};
}));
function parsePrinted(symbol) {
  const match=/^([A-G])([#b]?)(maj7|m7b5|dim7|m7|7|min|m|dim|aug|sus[24]|maj|)(?:\/([A-G])([#b]?))?$/.exec(
    symbol.replaceAll('♯','#').replaceAll('♭','b').replaceAll('ø7','m7b5').replaceAll('°','dim'));
  if (!match) return null;
  const pc=(letter,acc)=>(12+'C D EF G A B'.indexOf(letter)+(acc==='#'?1:acc==='b'?-1:0))%12;
  const [,root,acc,q,bass,bassAcc]=match;
  const quality=({maj:'',min:'m',m7b5:'m7♭5'})[q] ?? q;
  return {chord:CHORDS.find(c=>c.root===pc(root,acc) && c.quality===quality),bass:bass?pc(bass,bassAcc):null};
}
function harmonyFrames(events, active, start, length, bar) {
  const points=new Map([[0,{notes:[]}]]);
  function point(at) {
    if (!points.has(at)) points.set(at,{notes:[]});
    return points.get(at);
  }
  for (const group of events) point(group.start).notes=group.notes;
  for (const mark of bar.chords ?? []) {
    if (mark && original(mark) && Number.isFinite(mark.start) && mark.start>=0 && mark.start<length &&
        typeof mark.symbol==='string' && /^[A-G][A-Za-z0-9/#♯♭b°ø+()−-]{0,18}$/.test(mark.symbol)) point(mark.start).printed=mark.symbol;
  }
  const times=[...points.keys()].sort((a,b)=>a-b);
  const frames=[];
  for (let i=0;i<times.length;i++) {
    const at=times[i], p=points.get(at), to=times[i+1] ?? length;
    for (const [m,end] of active) if (end<=start+at+EPS) active.delete(m);
    for (const n of p.notes) active.set(n.midi,Math.max(active.get(n.midi) ?? 0,n.end));
    if (!active.size) {
      frames.push({at,rest:true,printed:p.printed});
      continue;
    }
    const weights=new Float64Array(12);
    let until=at, bass=128, mask=0;
    for (const [m,end] of active) {
      const off=Math.min(to,end-start);
      weights[m%12]+=off-at;
      mask|=1<<(m%12);
      bass=Math.min(bass,m);
      until=Math.max(until,off);
    }
    frames.push({at,weights,bass,mask,printed:p.printed, duration:until-at});
    if (to-until>=.75-EPS) frames.push({at:until,rest:true});
  }
  return frames;
}
function inferChunk(frames, names, choices) {
  // Compare contiguous readings. Charging for a change favours a single broken chord
  // over individually labelled arpeggio notes. Complete simultaneous voicings anchor changes.
  const steps=[{cost:0}];
  for (let end=1;end<=frames.length;end++) {
    const weights=new Float64Array(12), blocks=new Map();
    const lowestByClass=new Uint8Array(12).fill(128);
    let mask=0, bass=128, highestBass=-1, sum=0, duration=0;
    let best={cost:Infinity};
    for (let i=end-1;i>=Math.max(0,end-24);i--) {
      const f=frames[i];
      duration+=f.duration; bass=Math.min(bass,f.bass); highestBass=Math.max(highestBass,f.bass); mask|=f.mask;
      lowestByClass[f.bass%12]=Math.min(lowestByClass[f.bass%12],f.bass);
      for (let pc=0;pc<12;pc++) { weights[pc]+=f.weights[pc]; sum+=f.weights[pc]; }
      if (!choices.has(mask)) choices.set(mask,CHORDS.filter(c=>(mask&c.mask)===c.mask));
      if (choices.get(f.mask)?.some(c=>c.mask===f.mask)) blocks.set(f.mask,(blocks.get(f.mask) ?? 0)+f.duration);
      const bassPC=bass%12;
      let fit=.9*sum, chord=null, ambiguous=false, alternatives=[];
      for (const c of choices.get(mask)) {
        const covered=c.tones.reduce((w,pc)=>w+weights[pc],0);
        // One persistent non-chord bass can support an independently complete upper chord.
        const pedal=bass===highestBass && !(c.mask&(1<<bassPC));
        const outside=Math.max(0,sum-covered-(pedal?weights[bassPC]:0));
        if (outside>.16*sum || !c.tones.every(pc=>weights[pc]>=.045*covered)) continue;
        // A sus2 and a sus4 can have the exact same tones; only suggest one when its bass supports the root.
        if (c.quality.startsWith('sus') && bassPC!==c.root) continue;
        let cost=outside*3 + (c.tones.length-3)*.16*duration;
        if (!(c.mask & (1<<bassPC))) cost+=duration*(pedal ? .38 : .55);
        for (const [block,length] of blocks) if (block!==c.mask && (!pedal || block!==(c.mask|(1<<bassPC)))) cost+=.8*length;
        if (cost+EPS<fit) { fit=cost; chord=c; ambiguous=false; alternatives=[]; }
        else if (chord && Math.abs(cost-fit)<EPS) {
          ambiguous=true; alternatives.push(c);
        }
      }
      // Prefer a metrically clear boundary when neighbouring arpeggios share a tone.
      const offbeat=i>0 && Math.abs(f.at-Math.round(f.at))>EPS;
      const cost=steps[i].cost+fit+.32+(offbeat ? .10 : 0);
      if (cost<=best.cost+EPS) {
        let structuralBass=bassPC;
        if (chord && highestBass!==bass && !(chord.mask & (1<<bassPC))) {
          const lowest=Math.min(...chord.tones.map(pc=>lowestByClass[pc]));
          structuralBass=lowest<128 ? lowest%12 : null;
        }
        best={cost,from:i,at:frames[i].at,chord,bassPC:structuralBass,mask,ambiguous,alternatives};
      }
    }
    steps.push(best);
  }
  const segments=[];
  for (let i=frames.length;i>0;i=steps[i].from) segments.push(steps[i]);
  return segments.reverse().map((s,i)=>{
    const {chord:c,bassPC}=s;
    const written=i===0?frames[0].printed:null;
    const inferred=c && (names[c.root]+c.quality+(bassPC!=null && c.root!==bassPC?'/'+names[bassPC]:''));
    const suspended=c?.quality.startsWith('sus');
    let text;
    if (written) {
      const parsed=parsePrinted(written);
      const matches=parsed && c && [c,...s.alternatives].some(candidate=>candidate.mask===parsed.chord?.mask) &&
        (parsed.bass==null || parsed.bass===bassPC);
      if (matches) text='原譜 '+written+'（左手音列相符）';
      else if (suspended) text='原譜 '+written+'；左手呈 '+inferred+' 音型（缺三音）';
      else if (!parsed || !c || s.ambiguous) text='原譜 '+written+'（左手音列不足以核實）';
      else text='原譜 '+written+'；左手較接近 '+inferred+'，請核對';
    } else if (!c) {
      const tones=names.filter((_,pc)=>s.mask & (1<<pc));
      text=tones.length<=2?'左手僅 '+tones.join('、')+' 音級，和弦未定':'左手和弦未定（音列不足或混合）';
    }
    else if (s.ambiguous) text='左手和弦未定（'+names[c.root]+c.quality+' 等同音組合）';
    else if (suspended) text='左手音型 '+inferred+'（缺三音，完整和弦未定）';
    else text='左手推測 '+inferred;
    return {at:s.at,text};
  });
}
function harmonies(score, groups, length, names, emit) {
  let groupIndex=0;
  const active=new Map(), choices=new Map();
  for (const [bar,measure] of score.measures.entries()) {
    const first=groupIndex;
    while (groups[groupIndex]?.bar===bar) groupIndex++;
    const frames=harmonyFrames(groups.slice(first,groupIndex),active,bar*length,length,measure);
    let chunk=[], previous;
    function add(at,text) {
      if (text!==previous) emit(bar,at,'leftChord',text);
      previous=text;
    }
    function flush() {
      if (chunk.length) for (const {at,text} of inferChunk(chunk,names,choices)) add(at,text);
      chunk=[];
    }
    for (const f of frames) {
      if (f.rest || f.printed) flush();
      if (f.rest) add(f.at,f.printed?'原譜 '+f.printed+'（左手休止）':'左手休止');
      else chunk.push(f);
    }
    flush();
  }
}
function beatOffset(value) {
  const rounded=Math.round(value*10000)/10000;
  if (!rounded) return '';
  for (const [fraction,text] of [[.25,'¼'],[.5,'½'],[.75,'¾'],[1/3,'⅓'],[2/3,'⅔']]) {
    if (Math.abs(value-fraction)<.0001) return '+'+text+'拍 ';
  }
  return '+'+rounded+'拍 ';
}

/**
 * Analyze a DrMusic piano score without modifying it. Optional direct transcriptions
 * may supply note.finger (1–5) and measure.chords [{start, symbol}] in quarter beats.
 * When supplied, a source tag must be original, score or printed to count as notation.
 * These optional marks are local evidence; the standard DrMusic v1 payload omits them.
 * entries use 1-based integer note cells. Extra details contain unabridged dense cells.
 */
export function analyzePianoStudy(score) {
  if (score?.kind==='guitar' || !Array.isArray(score?.measures)) throw new TypeError('請提供 DrMusic 鋼琴譜。');
  const [n,d]=score.timeSignature ?? [];
  if (!Number.isInteger(n) || n<=0 || !Number.isInteger(d) || d<=0) throw new TypeError('鋼琴譜缺少有效拍號。');
  const length=4*n/d, groups=collectAttacks(score,length), names=spellings(score.key);
  const cells=new Map();
  function emit(bar,start,field,text) {
    const measure=bar+1, beat=Math.min(Math.ceil(length),Math.floor(start+EPS)+1), key=measure+'-'+beat;
    if (!cells.has(key)) cells.set(key,{measure,beat,fingering:[],leftChord:[]});
    cells.get(key)[field].push({offset:Math.max(0,start-beat+1),text});
  }
  for (const hand of HANDS) {
    const decisions=solveHand(groups[hand],hand);
    for (const [i,group] of groups[hand].entries()) {
      const {assigned,issue}=decisions[i];
      const marked=group.notes.filter(n=>n.printed!=null);
      const mixed=marked.length>0 && marked.length!==group.notes.length;
      const prefix=marked.length===0?'建議':mixed?'':'原譜';
      const items=group.notes.flatMap(n=>{
        const finger=n.printed ?? assigned.find(a=>a.midi===n.midi)?.f;
        if (!finger) return [];
        return [names[n.midi%12]+(Math.floor(n.midi/12)-1)+'('+(mixed?(n.printed?'原譜':'建議'):'')+finger+')'];
      });
      const label=HAND_NAME[hand]+(items.length?prefix+' '+items.join(' '):'');
      emit(group.bar,group.start,'fingering',label+(issue?'〔'+issue+'〕':''));
    }
  }
  harmonies(score,groups.left,length,names,emit);
  const details=[];
  const entries=[...cells.values()].sort((a,b)=>a.measure-b.measure || a.beat-b.beat).map(cell=>{
    const entry={measure:cell.measure,beat:cell.beat};
    for (const field of ['fingering','leftChord']) {
      const items=cell[field].sort((a,b)=>a.offset-b.offset);
      if (!items.length) continue;
      const parts=items.map(item=>beatOffset(item.offset)+item.text);
      const full=parts.join('；'), limit=field==='fingering'?235:110;
      if (full.length<=limit) entry[field]=full;
      else {
        details.push({measure:cell.measure,beat:cell.beat,field,items});
        const kept=[];
        for (const part of parts) {
          if ([...kept,part].join('；').length>limit-23) break;
          kept.push(part);
        }
        entry[field]=(kept.length?kept.join('；')+'；':'')+'另有 '+(parts.length-kept.length)+' 組未展開';
      }
    }
    return entry;
  });
  return details.length?{entries,details}:{entries};
}
