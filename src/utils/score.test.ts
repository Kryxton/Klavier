import { describe, expect, it } from 'vitest';
import type { Duration, Ev, Piece } from '../types';
import { barCount, barOfEvent, eventAtBar, eventTicks, halves, soundsBetween, splitTicks, timeline, toBars } from './score';

let next = 0;
const ev = (dur: Duration, keys: number[] = [60], extra: Partial<Ev> = {}): Ev => ({ id: `e${next++}`, keys, dur, ...extra });
const piece = (right: Ev[], left: Ev[] = [], beats = 4): Piece => ({
  id: 'p', title: 'T', beats, beatValue: 4, key: 0, bpm: 100, hands: { right, left }, updatedAt: '',
});

describe('splitTicks', () => {
  it('uses dotted values where they fit', () => {
    expect(splitTicks(72)).toEqual([{ dur: 'q', dotted: true }]);
    expect(splitTicks(144)).toEqual([{ dur: 'h', dotted: true }]);
    expect(splitTicks(48 + 12)).toEqual([{ dur: 'q', dotted: false }, { dur: '16', dotted: false }]);
  });
});

describe('toBars', () => {
  it('fills bars in order', () => {
    const bars = toBars([ev('h'), ev('h'), ev('q')], 192);
    expect(bars.map(b => b.length)).toEqual([2, 1]);
    expect(bars[1][0].start).toBe(192);
  });

  it('splits a note over the barline and ties the parts', () => {
    const note = ev('h');
    const bars = toBars([ev('h'), ev('q'), note], 192);
    expect(bars).toHaveLength(2);
    expect(bars[0][2]).toMatchObject({ ev: note, dur: 'q', tie: true, start: 144 });
    expect(bars[1][0]).toMatchObject({ ev: note, dur: 'q', tie: false, start: 192, continued: true });
    expect(bars[0][2].continued).toBe(false);
  });

  it('never ties rests', () => {
    const bars = toBars([ev('h'), ev('q'), ev('h', [])], 192);
    expect(bars[0][2].tie).toBe(false);
    expect(bars[1][0].tie).toBe(false);
  });

  it('keeps a tie the user set on the last part', () => {
    const bars = toBars([ev('w', [60], { tie: true })], 192);
    expect(bars[0][0].tie).toBe(true);
  });

  it('works in 3/4', () => {
    expect(toBars([ev('q'), ev('q'), ev('q'), ev('q')], 144).map(b => b.length)).toEqual([3, 1]);
  });
});

describe('timeline', () => {
  it('lets both hands start together and sorts by time', () => {
    const sounds = timeline(piece([ev('q', [72]), ev('q', [74])], [ev('h', [48])]));
    expect(sounds.map(s => [s.start, s.midi, s.hand])).toEqual([[0, 48, 'left'], [0, 72, 'right'], [48, 74, 'right']]);
  });

  it('joins tied notes into one sound', () => {
    const sounds = timeline(piece([ev('q', [60], { tie: true }), ev('q', [60]), ev('q', [60])]));
    expect(sounds.map(s => [s.start, s.length])).toEqual([[0, 96], [96, 48]]);
  });

  it('holds only the tied keys of a chord', () => {
    const sounds = timeline(piece([ev('q', [60, 64], { tie: true }), ev('q', [60, 67])]));
    expect(sounds.map(s => [s.midi, s.start, s.length])).toEqual([[60, 0, 96], [64, 0, 48], [67, 48, 48]]);
  });

  it('counts rests as time', () => {
    const sounds = timeline(piece([ev('q', []), ev('q', [60])]));
    expect(sounds).toHaveLength(1);
    expect(sounds[0].start).toBe(48);
  });
});

describe('bars of a piece', () => {
  it('counts the longer hand', () => {
    expect(barCount(piece([ev('w')], [ev('w'), ev('q')]))).toBe(2);
    expect(barCount(piece([]))).toBe(0);
  });

  it('finds bars and events', () => {
    const events = [ev('w', [60]), ev('h', [62]), ev('h', [64])];
    expect(barOfEvent(events, events[2].id, 192)).toBe(1);
    expect(eventAtBar(events, 1, 192)).toBe(events[1]);
    expect(eventAtBar(events, 2, 192)).toBeNull();
  });

  it('cuts a value in two', () => {
    expect(halves({ dur: 'q' })).toEqual([{ dur: '8' }, { dur: '8' }]);
    expect(halves({ dur: 'q', dotted: true })).toEqual([{ dur: 'q' }, { dur: '8' }]);
    expect(halves({ dur: '32' })).toBeNull();
  });

  it('knows dotted lengths', () => {
    expect(eventTicks({ dur: 'q', dotted: true })).toBe(72);
  });
});

describe('soundsBetween', () => {
  const sound = (start: number, length: number) => ({ midi: 60, hand: 'right' as const, start, length, evId: String(start) });
  const sounds = [sound(0, 200), sound(10, 10), sound(50, 10), sound(100, 10), sound(300, 10)];
  const starts = (from: number, to: number) => soundsBetween(sounds, from, to, 200).map(s => s.start);

  it('finds what reaches into the stretch, however early it began', () => {
    expect(starts(60, 120)).toEqual([0, 100]);
  });

  it('leaves out what ended before and what starts after', () => {
    expect(starts(205, 250)).toEqual([]);
    expect(starts(55, 55)).toEqual([0, 50]);
  });
});
