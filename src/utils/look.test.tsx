import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LookRule } from '../components/LookRule';
import { loadLook, resetLook, setLook } from './look';

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetLook();
  delete document.documentElement.dataset.look;
});

const drag = (to: number) => {
  const handle = screen.getByRole('switch', { name: 'Aussehen wechseln' });
  fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 100 + to, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientX: 100 + to, pointerId: 1 });
  return handle;
};

describe('look', () => {
  it('starts as Barock and ignores what it does not know', () => {
    expect(loadLook()).toBe('barock');
    localStorage.setItem('klavier_look', 'neon');
    expect(loadLook()).toBe('barock');
  });

  it('keeps the chosen look and puts it on the page', () => {
    act(() => setLook('melancholie'));
    expect(document.documentElement.dataset.look).toBe('melancholie');
    expect(loadLook()).toBe('melancholie');
    act(() => setLook('barock'));
    expect(document.documentElement.dataset.look).toBeUndefined();
  });

  it('switches when the lozenge is dragged far enough to the right', () => {
    render(<LookRule />);
    const handle = drag(80);
    expect(handle.getAttribute('aria-checked')).toBe('true');
    expect(loadLook()).toBe('melancholie');
    drag(80);
    expect(handle.getAttribute('aria-checked')).toBe('false');
  });

  it('springs back without switching after a short drag or a drag to the left', () => {
    render(<LookRule />);
    drag(30);
    drag(-90);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(loadLook()).toBe('barock');
  });

  it('switches with Enter and Space', () => {
    render(<LookRule />);
    const handle = screen.getByRole('switch');
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(handle.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(handle, { key: ' ' });
    expect(handle.getAttribute('aria-checked')).toBe('false');
  });

  it('keeps every switch on the screen in step', () => {
    render(<><LookRule /><LookRule /></>);
    const [first, second] = screen.getAllByRole('switch');
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(second.getAttribute('aria-checked')).toBe('true');
  });
});
