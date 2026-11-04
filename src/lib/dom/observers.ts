/**
 * 專案裡唯一可以建立 MutationObserver 的地方。
 * YouTube 的 DOM 變動非常頻繁，所以這裡只提供範圍很窄的監聽，不提供 subtree。
 */

/** 監聽單一元素的 class，內容真的改變才通知。 */
export function observeClass(
  target: Element,
  signal: AbortSignal,
  onChange: (className: string) => void,
): void {
  if (signal.aborted) return;
  let last = target.className;
  const observer = new MutationObserver(() => {
    const next = target.className;
    if (next === last) return;
    last = next;
    onChange(next);
  });
  observer.observe(target, { attributes: true, attributeFilter: ['class'] });
  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
    },
    { once: true },
  );
}

/** 監聽某個子元素是否被移除，用來重新掛載 overlay 或按鈕。只看直接子節點。 */
export function observeChildRemoval(
  parent: Node,
  child: Node,
  signal: AbortSignal,
  onRemoved: () => void,
): void {
  if (signal.aborted) return;
  const observer = new MutationObserver(() => {
    if (child.parentNode === parent) return;
    observer.disconnect();
    onRemoved();
  });
  observer.observe(parent, { childList: true });
  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
    },
    { once: true },
  );
}
