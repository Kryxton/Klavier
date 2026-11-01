import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Hand, Piece } from './types';
import { audioClock } from './utils/audio';
import { barCount } from './utils/score';
import { loadLibrary } from './utils/storage';

// Sound and the VexFlow score need a real browser; both are checked there
vi.mock('./utils/audio', () => ({
  playKey: vi.fn(), unlockAudio: vi.fn(),
  audioClock: { now: () => 0, play: vi.fn(), silence: vi.fn() },
}));
vi.mock('./components/Sheet', () => ({
  Sheet: ({ piece, onSelect, onBar }: { piece: Piece; onSelect?: (hand: Hand, id: string) => void; onBar?: (bar: number) => void }) => (
    <>
      {onBar
        ? Array.from({ length: barCount(piece) }, (_, i) => <button key={i} type="button" onClick={() => onBar(i)}>Takt {i + 1}</button>)
        : piece.hands.right.map((ev, i) => <button key={ev.id} type="button" onClick={() => onSelect?.('right', ev.id)}>Note {i + 1}</button>)}
    </>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(audioClock.play).mockClear();
  Element.prototype.scrollTo = vi.fn(); // the keyboard scrolls to a selected note, jsdom can't
});
afterEach(cleanup);

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const notes = () => loadLibrary().pieces[0].hands;

function startPiece() {
  render(<App />);
  tap('Leeres Notenblatt');
}

// Eight quarters in the right hand, four in the left: two bars and one
function startTwoBars() {
  startPiece();
  tap('Sofort');
  for (const key of ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'H4', 'C5']) tap(key);
  tap('Linke Hand');
  for (const key of ['C3', 'D3', 'E3', 'F3']) tap(key);
  tap('Sofort');
  tap('Rechte Hand');
}
const right = () => notes().right.map(ev => ev.keys[0] ?? 0);
const left = () => notes().left.map(ev => ev.keys[0] ?? 0);

describe('App', () => {
  it('starts on the list when nothing is open', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /Video in Noten/ })).toBeTruthy();
  });

  it('writes a chord with the chosen length', () => {
    startPiece();
    tap('C4');
    tap('E4');
    tap('Halbe');
    tap(/Akkord \(2\) eintragen/);
    expect(notes().right).toMatchObject([{ keys: [60, 64], dur: 'h' }]);
  });

  it('writes into the chosen hand', () => {
    startPiece();
    tap('Linke Hand');
    tap('C3');
    tap('Eintragen');
    expect(notes().left).toMatchObject([{ keys: [48] }]);
    expect(notes().right).toEqual([]);
  });

  it('writes each tap at once in the Sofort mode', () => {
    startPiece();
    tap('Sofort');
    tap('C4');
    tap('D4');
    expect(notes().right.map(ev => ev.keys[0])).toEqual([60, 62]);
  });

  it('undoes and redoes', () => {
    startPiece();
    tap('C4');
    tap('Eintragen');
    tap('Rückgängig');
    expect(notes().right).toEqual([]);
    tap('Wiederholen');
    expect(notes().right).toHaveLength(1);
  });

  it('still has the piece after a reload and opens it again', () => {
    startPiece();
    tap('C4');
    tap('Eintragen');
    cleanup();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Korrigieren' })).toBeTruthy();
    expect(notes().right).toHaveLength(1);
  });

  it('makes two eighths of a quarter in the middle', () => {
    startTwoBars();
    tap('Note 2');
    tap('Teilen');
    expect(notes().right.slice(1, 3)).toMatchObject([{ keys: [62], dur: '8' }, { keys: [62], dur: '8' }]);
    expect(right().slice(3, 5)).toEqual([64, 65]);
  });

  it('keeps the notes behind when a length changes', () => {
    startTwoBars();
    tap('Note 2');
    tap('Achtel');
    expect(notes().right.slice(1, 4)).toMatchObject([{ keys: [62], dur: '8' }, { keys: [], dur: '8' }, { keys: [64], dur: 'q' }]);
  });

  it('copies the last note instead of cutting it', () => {
    startTwoBars();
    tap('Note 8');
    tap('Kopieren');
    expect(notes().right.slice(-2)).toMatchObject([{ keys: [72], dur: 'q' }, { keys: [72], dur: 'q' }]);
  });

  it('fills a deleted note from the keyboard', () => {
    startTwoBars();
    tap('Note 2');
    tap('Löschen');
    expect(right()[1]).toBe(0);
    tap('A4');
    expect(right()).toEqual([60, 69, 64, 65, 67, 69, 71, 72]);
  });

  it('copies a run of bars of both hands to the end', () => {
    startTwoBars();
    tap('Takte');
    tap('Takt 1');
    tap('Takt 2');
    expect(screen.getByText('Takt 1 bis 2')).toBeTruthy();
    tap('Kopieren');
    tap('Ans Ende');
    expect(right()).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 60, 62, 64, 65, 67, 69, 71, 72]);
    expect(left().slice(5)).toEqual([48, 50, 52, 53, 0]);
    expect(screen.getByText('Takt 3 bis 4')).toBeTruthy();
  });

  it('inserts bars where the copy is meant to begin', () => {
    startTwoBars();
    tap('Takte');
    tap('Takt 2');
    tap('Takt 2');
    expect(screen.getByText(/Tippe den ersten/)).toBeTruthy();
    tap('Takt 1');
    tap('Kopieren');
    tap('Takt 2');
    expect(right()).toEqual([60, 62, 64, 65, 60, 62, 64, 65, 67, 69, 71, 72]);
    expect(left().slice(0, 8)).toEqual([48, 50, 52, 53, 48, 50, 52, 53]);
  });

  it('writes one hand over bars and leaves the other', () => {
    startTwoBars();
    tap('Takte');
    tap('Takt 1');
    tap('Links');
    tap('Kopieren');
    expect(screen.getByRole('button', { name: 'Ersetzen' }).getAttribute('aria-pressed')).toBe('true');
    tap('Takt 2');
    expect(left()).toEqual([48, 50, 52, 53, 48, 50, 52, 53]);
    expect(right()).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it('deletes bars of both hands, and empties them for one', () => {
    startTwoBars();
    tap('Takte');
    tap('Takt 1');
    tap('Links');
    tap('Leeren');
    expect(left().every(key => key === 0)).toBe(true);
    tap('Beide');
    tap('Löschen');
    expect(right()).toEqual([67, 69, 71, 72]);
  });

  it('takes the bar of the selected note along', () => {
    startTwoBars();
    tap('Note 6');
    tap('Takte');
    expect(screen.getByText(/^Takt 2 –/)).toBeTruthy();
  });

  it('lets the notes of a chord ring with the pedal', () => {
    startPiece();
    tap('Sofort');
    for (const key of ['C4', 'E4', 'G4', 'C5']) tap(key);
    tap('Üben');
    tap('Abspielen');
    const written = vi.mocked(audioClock.play).mock.calls[0][2];
    tap('Anhalten');
    tap('Zum Anfang');
    vi.mocked(audioClock.play).mockClear();
    tap('Pedal');
    tap('Abspielen');
    expect(vi.mocked(audioClock.play).mock.calls[0][2]).toBeCloseTo(written * 4);
  });

  it('asks before deleting a piece', () => {
    startPiece();
    tap('Stücke');
    tap(/löschen/);
    expect(loadLibrary().pieces).toHaveLength(1);
    tap('Wirklich löschen');
    expect(loadLibrary().pieces).toEqual([]);
  });
});
