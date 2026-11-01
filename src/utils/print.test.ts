import { describe, expect, it } from 'vitest';
import { paginate } from './print';

describe('paginate', () => {
  it('puts lines on a sheet until the next one no longer fits', () => {
    expect(paginate([100, 100, 100, 100, 100], 250, 250)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('leaves room for the title on the first sheet', () => {
    expect(paginate([100, 100, 100], 150, 250)).toEqual([[0], [1, 2]]);
  });

  it('fills a sheet exactly', () => {
    expect(paginate([100, 100, 100], 200, 200)).toEqual([[0, 1], [2]]);
  });

  it('gives a line too tall for any sheet a sheet of its own', () => {
    expect(paginate([100, 500, 100], 250, 250)).toEqual([[0], [1], [2]]);
  });

  it('starts with a too tall line instead of an empty sheet', () => {
    expect(paginate([500, 100], 250, 250)).toEqual([[0], [1]]);
  });

  it('has one empty sheet for a piece without lines', () => {
    expect(paginate([], 250, 250)).toEqual([[]]);
  });
});
