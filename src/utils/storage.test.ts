import { beforeEach, describe, expect, it } from 'vitest';
import { newPiece } from './edit';
import { exportPieces, importPieces, loadLibrary, mergePieces, saveLibrary } from './storage';

beforeEach(() => localStorage.clear());

describe('library', () => {
  it('comes back as saved', () => {
    const piece = newPiece('Eins');
    expect(saveLibrary({ pieces: [piece], openId: piece.id })).toBe(true);
    expect(loadLibrary()).toEqual({ pieces: [piece], openId: piece.id });
  });

  it('survives broken data', () => {
    localStorage.setItem('klavier_pieces', '{kaputt');
    expect(loadLibrary()).toEqual({ pieces: [], openId: null });
  });

  it('drops an open id that no longer exists', () => {
    saveLibrary({ pieces: [newPiece()], openId: 'weg' });
    expect(loadLibrary().openId).toBeNull();
  });
});

describe('backup', () => {
  it('round-trips', () => {
    const piece = newPiece('Eins');
    expect(importPieces(exportPieces([piece]))).toEqual([piece]);
  });

  it('refuses a file without pieces', () => {
    expect(() => importPieces('{}')).toThrow();
    expect(() => importPieces('kein json')).toThrow();
  });

  it('keeps the newer version of a piece', () => {
    const old = { ...newPiece('Alt'), updatedAt: '2026-01-01' };
    const fresh = { ...old, title: 'Neu', updatedAt: '2026-02-01' };
    expect(mergePieces([fresh], [old])[0].title).toBe('Neu');
    expect(mergePieces([old], [fresh])[0].title).toBe('Neu');
  });
});
