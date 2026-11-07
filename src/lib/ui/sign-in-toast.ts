import { element, iconButton, ICON_CLOSE } from './dom';
import { googleMark } from './google-mark';

export interface SignInToastOptions {
  /** Where the toast goes; `null` when the player is not available. */
  readonly layer: () => HTMLElement | null;
  readonly isSignedIn: () => Promise<boolean>;
  /** Resolves with whether the user ended up signed in. */
  readonly signIn: () => Promise<boolean>;
}

export interface SignInToast {
  /** Resolves true once signed in, or false if the user walks away from it. */
  require: () => Promise<boolean>;
  /** Another page may have signed in while the toast waits. */
  recheck: () => void;
  isOpen: () => boolean;
  dispose: () => void;
}

const SHOWN_MS = 10_000;

/** Asks for sign-in only when the user wants something that needs it. */
export function createSignInToast(options: SignInToastOptions): SignInToast {
  let toast: HTMLElement | null = null;
  let settle: ((signedIn: boolean) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signingIn = false;

  const finish = (signedIn: boolean) => {
    clearTimeout(timer);
    toast?.remove();
    toast = null;
    signingIn = false;
    settle?.(signedIn);
    settle = null;
  };

  const startTimer = () => {
    clearTimeout(timer);
    if (signingIn) return;
    timer = setTimeout(() => {
      finish(false);
    }, SHOWN_MS);
  };

  const show = (layer: HTMLElement) => {
    const note = element('p', 'sign-in-toast-note', 'Sign in to save words');
    const label = element('span', '', 'Sign in with Google');
    const button = element(
      'button',
      'menu-action google-sign-in',
      googleMark(),
      label,
    );
    button.type = 'button';
    button.addEventListener('click', () => {
      signingIn = true;
      clearTimeout(timer);
      button.disabled = true;
      label.textContent = 'Signing in…';
      note.textContent = 'Sign in to save words';
      note.classList.remove('is-alert');
      options.signIn().then(
        (signedIn) => {
          if (signedIn) {
            finish(true);
            return;
          }
          // The window was closed: the offer stays for a moment.
          signingIn = false;
          button.disabled = false;
          label.textContent = 'Sign in with Google';
          startTimer();
        },
        () => {
          signingIn = false;
          button.disabled = false;
          label.textContent = 'Sign in with Google';
          note.textContent = "Couldn't sign in. Try again.";
          note.classList.add('is-alert');
          startTimer();
        },
      );
    });
    const current = element(
      'div',
      'panel sign-in-toast',
      note,
      button,
      iconButton('close', 'Close', ICON_CLOSE, () => {
        finish(false);
      }),
    );
    current.dataset.theme = 'dark';
    current.setAttribute('role', 'status');
    current.addEventListener('mouseenter', () => {
      clearTimeout(timer);
    });
    current.addEventListener('mouseleave', startTimer);
    current.addEventListener('focusin', () => {
      clearTimeout(timer);
    });
    toast = current;
    layer.append(current);
    startTimer();
  };

  return {
    require: async () => {
      if (await options.isSignedIn()) return true;
      // The newest word wins: an earlier one waiting here is left unsaved.
      finish(false);
      const layer = options.layer();
      if (!layer) return false;
      return new Promise<boolean>((resolve) => {
        settle = resolve;
        show(layer);
      });
    },
    recheck() {
      if (!toast) return;
      options.isSignedIn().then(
        (signedIn) => {
          if (signedIn) finish(true);
        },
        () => undefined,
      );
    },
    isOpen: () => toast !== null,
    dispose() {
      finish(false);
    },
  };
}
