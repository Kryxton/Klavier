import type { Piece } from '../types';

const KEY = 'klavier_pieces';

export interface Library {
  pieces: Piece[];
  openId: string | null;
}

const isPiece = (value: unknown): value is Piece => {
  const piece = value as Piece | null;
  return Boolean(piece?.id && Array.isArray(piece.hands?.right) && Array.isArray(piece.hands?.left));
};

export function loadLibrary(): Library {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Library> | null;
    const pieces = (saved?.pieces ?? []).filter(isPiece);
    const openId = pieces.some(p => p.id === saved?.openId) ? saved?.openId ?? null : null;
    return { pieces, openId };
  } catch {
    return { pieces: [], openId: null };
  }
}

// false = not saved (storage full or blocked); the app shows that
export function saveLibrary(library: Library) {
  try {
    localStorage.setItem(KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export const exportPieces = (pieces: Piece[]) => JSON.stringify({ app: 'klavier', pieces }, null, 1);

// Pieces from a backup file; throws when the file is none
export function importPieces(text: string): Piece[] {
  const data = JSON.parse(text) as { pieces?: unknown[] };
  const pieces = (data.pieces ?? []).filter(isPiece);
  if (!pieces.length) throw new Error('Keine Stücke in der Datei');
  return pieces;
}

// A backup replaces a piece with the same id only if it is newer
export function mergePieces(current: Piece[], incoming: Piece[]) {
  const merged = new Map(current.map(p => [p.id, p]));
  for (const piece of incoming) {
    const have = merged.get(piece.id);
    if (!have || piece.updatedAt > have.updatedAt) merged.set(piece.id, piece);
  }
  return [...merged.values()];
}
