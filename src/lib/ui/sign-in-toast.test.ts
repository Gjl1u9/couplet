// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignInToast, type SignInToast } from './sign-in-toast';

describe('createSignInToast', () => {
  let layer: HTMLElement;
  let toast: SignInToast;
  const isSignedIn = vi.fn<() => Promise<boolean>>();
  const signIn = vi.fn<() => Promise<boolean>>();
  const find = (selector: string) => layer.querySelector<HTMLElement>(selector);
  const flush = async () => {
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    isSignedIn.mockResolvedValue(false);
    signIn.mockResolvedValue(true);
    layer = document.createElement('div');
    document.body.replaceChildren(layer);
    toast = createSignInToast({ layer: () => layer, isSignedIn, signIn });
  });

  afterEach(() => {
    toast.dispose();
    vi.useRealTimers();
  });

  it('lets a signed-in user through without a toast', async () => {
    isSignedIn.mockResolvedValue(true);
    await expect(toast.require()).resolves.toBe(true);
    expect(find('.sign-in-toast')).toBeNull();
  });

  it('continues once the user signs in', async () => {
    const result = toast.require();
    await flush();
    expect(find('.sign-in-toast-note')?.textContent).toBe(
      'Sign in to save words',
    );
    find('.google-sign-in')?.click();
    await expect(result).resolves.toBe(true);
    expect(find('.sign-in-toast')).toBeNull();
  });

  it('says what the sign-in is for', async () => {
    void toast.require('Sign in to use explanations');
    await flush();
    expect(find('.sign-in-toast-note')?.textContent).toBe(
      'Sign in to use explanations',
    );
  });

  it('stays after the sign-in window is closed', async () => {
    signIn.mockResolvedValue(false);
    const result = toast.require();
    await flush();
    find('.google-sign-in')?.click();
    await flush();
    expect(find('.sign-in-toast')).not.toBeNull();
    expect(find('.google-sign-in')?.textContent).toBe('Sign in with Google');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toBe(false);
  });

  it('says when signing in failed, without an expiring wait while it runs', async () => {
    let fail: (error: Error) => void = () => undefined;
    signIn.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    void toast.require();
    await flush();
    find('.google-sign-in')?.click();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(find('.google-sign-in')?.textContent).toBe('Signing in…');
    fail(new Error('Nope'));
    await flush();
    expect(find('.is-alert')?.textContent).toContain('Try again');
  });

  it('gives up when closed or ignored', async () => {
    const closed = toast.require();
    await flush();
    find('.close')?.click();
    await expect(closed).resolves.toBe(false);
    const ignored = toast.require();
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(ignored).resolves.toBe(false);
  });

  it('waits while pointed at', async () => {
    const result = toast.require();
    await flush();
    find('.sign-in-toast')?.dispatchEvent(new Event('mouseenter'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(find('.sign-in-toast')).not.toBeNull();
    find('.sign-in-toast')?.dispatchEvent(new Event('mouseleave'));
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toBe(false);
  });

  it('keeps only the newest request', async () => {
    const first = toast.require();
    await flush();
    const second = toast.require();
    await expect(first).resolves.toBe(false);
    await flush();
    expect(layer.querySelectorAll('.sign-in-toast')).toHaveLength(1);
    find('.google-sign-in')?.click();
    await expect(second).resolves.toBe(true);
  });

  it('continues when another page signs in', async () => {
    const result = toast.require();
    await flush();
    isSignedIn.mockResolvedValue(true);
    toast.recheck();
    await expect(result).resolves.toBe(true);
  });
});
