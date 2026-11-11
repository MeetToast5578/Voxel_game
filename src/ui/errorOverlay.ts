/**
 * Development builds only: uncaught errors and rejected promises show in a box on screen with a Copy button, so they
 * can be pasted into a bug report. Loaded before the game, so errors while it starts show too.
 */
if (import.meta.env.DEV) {
  let box: HTMLDivElement | null = null, text: HTMLPreElement | null = null;
  const show = (what: string) => {
    if (!box) {
      box = document.createElement('div');
      box.id = 'error-overlay';
      box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;max-height:40vh;overflow:auto;z-index:99999;'
        + 'background:#2a0d0d;color:#ffd9d4;border:1px solid #c0392b;border-radius:6px;padding:10px;font:12px/1.4 monospace';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:8px;margin-bottom:6px';
      const copy = document.createElement('button'), close = document.createElement('button');
      copy.textContent = 'Copy';
      close.textContent = 'Close';
      copy.onclick = () => void navigator.clipboard?.writeText(text!.textContent ?? '');
      close.onclick = () => { box!.remove(); box = null; };
      bar.append(Object.assign(document.createElement('strong'), { textContent: 'Error (development build)' }), copy, close);
      text = document.createElement('pre');
      text.style.cssText = 'margin:0;white-space:pre-wrap';
      box.append(bar, text);
      document.body.append(box);
    }
    text!.textContent += `${what}\n\n`;
  };
  const describe = (e: unknown) => (e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));
  addEventListener('error', (e) => show(describe(e.error ?? e.message)));
  addEventListener('unhandledrejection', (e) => show(`Unhandled rejection: ${describe(e.reason)}`));
}
export {};
