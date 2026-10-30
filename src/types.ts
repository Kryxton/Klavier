export type Hand = 'right' | 'left';
export type Duration = 'w' | 'h' | 'q' | '8' | '16' | '32';
export type Accidental = '#' | 'b';

// One moment of one hand: a note, a chord, or (keys empty) a rest
export interface Ev {
  id: string;
  keys: number[]; // MIDI numbers, sorted; A0 = 21 … C8 = 108
  dur: Duration;
  dotted?: boolean;
  tie?: boolean; // tied to the next event
  spell?: Record<number, Accidental>; // black key written against the key signature's default
}

export interface Piece {
  id: string;
  title: string;
  beats: number; // time signature 3/4: beats 3, beatValue 4
  beatValue: number;
  key: number; // sharps (+) or flats (−) in the key signature
  bpm: number; // quarter notes per minute
  hands: Record<Hand, Ev[]>;
  updatedAt: string;
}
