import { describe, expect, it } from 'vitest';
import { secondsAt, tickAt, toSamples16, wavHeader } from './recordings';

describe('recordings', () => {
  it('turns samples into 16 bits, clipped at full scale', () => {
    expect([...toSamples16(Float32Array.from([0, 0.5, -0.5, 2, -2]))]).toEqual([0, 16384, -16383, 32767, -32767]);
  });

  it('writes the head of a WAV file a browser can play', () => {
    const view = wavHeader(Int16Array.from([1, 2, 3]), 11025);
    const text = (at: number, length: number) => String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(at + i)));
    expect(view.byteLength).toBe(44);
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 8)).toBe('WAVEfmt ');
    expect(view.getUint32(24, true)).toBe(11025);
    expect(view.getUint32(40, true)).toBe(6);
  });

  const moments: [number, number][] = [[0, 2], [48, 3], [96, 3.5], [192, 5.5]];

  it('finds the place in the recording, also where the player sped up', () => {
    expect(secondsAt(moments, 24, 48)).toBeCloseTo(2.5);
    expect(secondsAt(moments, 72, 48)).toBeCloseTo(3.25);
  });

  it('finds the tick back from the recording', () => {
    for (const tick of [0, 24, 60, 96, 150, 192]) expect(tickAt(moments, secondsAt(moments, tick, 48), 48)).toBeCloseTo(tick);
  });

  it('goes on at the tempo beyond the known moments', () => {
    expect(secondsAt(moments, 240, 48)).toBeCloseTo(6.5);
    expect(tickAt(moments, 1, 48)).toBeCloseTo(-48);
  });
});
