import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { loadLibrary } from './utils/storage';

// Sound and the VexFlow score need a real browser; both are checked there
vi.mock('./utils/audio', () => ({
  playKey: vi.fn(), unlockAudio: vi.fn(),
  audioClock: { now: () => 0, play: vi.fn(), silence: vi.fn() },
}));
vi.mock('./components/Sheet', () => ({ Sheet: () => null }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const notes = () => loadLibrary().pieces[0].hands;

function startPiece() {
  render(<App />);
  tap(/Neues Stück/);
}

describe('App', () => {
  it('starts on the list when nothing is open', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Stücke' })).toBeTruthy();
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
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy();
    expect(notes().right).toHaveLength(1);
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
