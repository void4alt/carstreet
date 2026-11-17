/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function isMobileOrTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  );
}

export function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isWebkit = /WebKit/i.test(ua);
  const isOther = /CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
  return isIOS && isWebkit && !isOther;
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone)
  );
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as unknown as {
    fullscreenElement?: Element | null;
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return Boolean(
    doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
  );
}

export function canRequestFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as unknown as {
    requestFullscreen?: unknown;
    webkitRequestFullscreen?: unknown;
    mozRequestFullScreen?: unknown;
    msRequestFullscreen?: unknown;
  };
  return Boolean(
    el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen
  );
}

export async function requestFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const docEl = document.documentElement as unknown as {
    requestFullscreen?: (options?: { navigationUI?: string }) => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };

  try {
    if (docEl.requestFullscreen) {
      await docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        return docEl.requestFullscreen?.();
      });
    } else if (docEl.webkitRequestFullscreen) {
      await docEl.webkitRequestFullscreen();
    } else if (docEl.mozRequestFullScreen) {
      await docEl.mozRequestFullScreen();
    } else if (docEl.msRequestFullscreen) {
      await docEl.msRequestFullscreen();
    } else {
      return false;
    }

    // Try locking landscape orientation if supported
    try {
      if (
        typeof screen !== 'undefined' &&
        'orientation' in screen &&
        screen.orientation &&
        'lock' in screen.orientation
      ) {
        await (screen.orientation as { lock: (mode: string) => Promise<void> })
          .lock('landscape')
          .catch(() => {});
      }
    } catch {
      // Screen orientation lock not supported or allowed
    }

    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const doc = document as unknown as {
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  };

  try {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      await doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      await doc.msExitFullscreen();
    }
    return true;
  } catch {
    return false;
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return await requestFullscreen();
}

