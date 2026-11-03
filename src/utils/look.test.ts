import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { applyLook, loadLook, useLook } from './look';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.look;
});

describe('look', () => {
  it('starts as Barock and ignores what it does not know', () => {
    expect(loadLook()).toBe('barock');
    localStorage.setItem('klavier_look', 'neon');
    expect(loadLook()).toBe('barock');
  });

  it('keeps the chosen look and puts it on the page', () => {
    const { result } = renderHook(() => useLook());
    act(() => result.current[1]('melancholie'));
    expect(result.current[0]).toBe('melancholie');
    expect(document.documentElement.dataset.look).toBe('melancholie');
    expect(loadLook()).toBe('melancholie');
    applyLook('barock');
    expect(document.documentElement.dataset.look).toBeUndefined();
  });
});
