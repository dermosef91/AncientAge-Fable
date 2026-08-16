// Fullscreen API wrapper — Safari (incl. older iOS) needs the webkit-prefixed fallback.
type FSDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type FSElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

export function fullscreenSupported(): boolean {
  const el = document.documentElement as FSElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  const doc = document as FSDocument;
  return !!(document.fullscreenElement || doc.webkitFullscreenElement);
}

export function toggleFullscreen() {
  const doc = document as FSDocument;
  const el = document.documentElement as FSElement;
  if (isFullscreen()) {
    (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())?.catch(() => {});
  } else {
    (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.())?.catch(() => {});
  }
}

/**
 * Wires a button's icon to reflect live fullscreen state (including exits via
 * Esc or browser chrome, not just our own click). Returns a cleanup function
 * to call when the button is torn down.
 */
export function bindFullscreenButton(
  btn: HTMLButtonElement,
  renderIcon: (fs: boolean) => string,
  onToggle?: () => void
): () => void {
  const sync = () => {
    const fs = isFullscreen();
    btn.innerHTML = renderIcon(fs);
    btn.title = fs ? 'Exit full screen' : 'Full screen';
  };
  sync();
  btn.onclick = () => { onToggle?.(); toggleFullscreen(); };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  return () => {
    document.removeEventListener('fullscreenchange', sync);
    document.removeEventListener('webkitfullscreenchange', sync);
  };
}
