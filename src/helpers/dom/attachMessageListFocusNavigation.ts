const ITEM_CLASS_NAME = 'bubble';
const DEFAULT_LOAD_TIMEOUT = 4000;
const DEFAULT_RESTORE_TIMEOUT = 3000;

type MaybeCheckVisibility = HTMLElement & {
  checkVisibility?: (options?: {visibilityProperty?: boolean, checkVisibilityCSS?: boolean}) => boolean
};

/** Whether the element is rendered at all: not `display: none` and not `visibility: hidden`. */
function isRendered(element: HTMLElement) {
  const {checkVisibility} = element as MaybeCheckVisibility;
  if(checkVisibility) {
    // * the date separator that is not sticky yet is `visibility: hidden`, which the default
    // * call does not count; the second name is the same option from older Chromium
    return checkVisibility.call(element, {visibilityProperty: true, checkVisibilityCSS: true}) !== false;
  }

  // * no `checkVisibility` (older browsers, jsdom): walk up looking for `display: none`
  for(let node: HTMLElement = element; node; node = node.parentElement) {
    if(node.hidden) return false;

    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if(style && (style.display === 'none' || (node === element && style.visibility === 'hidden'))) {
      return false;
    }
  }

  return true;
}

/**
 * An item that focus may land on right now. Skips twins of date separators (`.is-fake`),
 * anything hidden from assistive technology, anything out of the tab order, and anything
 * that is not rendered.
 */
function isNavigableItem(item: HTMLElement) {
  return !item.hidden &&
    !item.classList.contains('hide') &&
    !item.classList.contains('is-fake') &&
    item.getAttribute('aria-hidden') !== 'true' &&
    item.hasAttribute('tabindex') &&
    item.tabIndex >= 0 &&
    isRendered(item);
}

/**
 * The items of the message history that exist in the DOM at this moment, in document order:
 * messages, date separators and service messages.
 *
 * Always read from the DOM and never cached. The history is split into date groups, so the
 * next item is often not a sibling, and bubbles are mounted, unmounted and re-created as the
 * history loads.
 */
export function getMessageListItems(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('.' + ITEM_CLASS_NAME)).filter(isNavigableItem);
}

/** Identity of a message that survives its bubble being re-created. Dates and service-less items have none. */
export function getMessageItemKey(item: HTMLElement) {
  const {mid, peerId} = item.dataset;
  return mid && peerId ? peerId + '_' + mid : undefined;
}

export type MessageListFocusNavigationOptions = {
  /**
   * Asks the history loader for more messages above (`up`) or below. Returns whether a load
   * is, or already was, under way, i.e. whether waiting for new items makes sense.
   */
  loadMore?: (up: boolean) => boolean,
  /** How long to wait for the loader before giving up, ms. */
  loadTimeout?: number,
  /** How long to try to give focus back to a re-created bubble, ms. */
  restoreTimeout?: number
};

export type MessageListFocusNavigation = {
  detach: () => void,
  /** Drops a pending wait for history. Call on a chat change. */
  cancel: () => void
};

type PendingLoad = {
  anchor: HTMLElement,
  key?: string,
  up: boolean,
  timer: ReturnType<typeof setTimeout>
};

type PendingRestore = {
  key: string,
  until: number
};

/**
 * ArrowUp / ArrowDown move real keyboard focus between the items of the message history.
 *
 * - Only a plain arrow pressed while the item itself has focus is handled. Links, buttons,
 *   inputs, contenteditable, menus and any other child of a bubble are the event target
 *   when they hold focus, so they keep their own arrows; modified arrows are left alone.
 * - It stops at both ends: no wrap-around.
 * - When the neighbour is not mounted yet, the history loader is asked for it and focus
 *   moves once it appears. The wait is cancelled by the next arrow, by focus moving away,
 *   on a chat change (`cancel`) and after a timeout.
 * - When Telegram re-creates the focused bubble, focus goes to the new bubble with the same
 *   `data-mid` + `data-peer-id`.
 *
 * The listener sits on the history container, not on the document.
 */
export default function attachMessageListFocusNavigation(
  root: HTMLElement,
  options: MessageListFocusNavigationOptions = {}
): MessageListFocusNavigation {
  const loadTimeout = options.loadTimeout ?? DEFAULT_LOAD_TIMEOUT;
  const restoreTimeout = options.restoreTimeout ?? DEFAULT_RESTORE_TIMEOUT;

  let pending: PendingLoad;
  let restore: PendingRestore;
  let tracked: {item: HTMLElement, key?: string};
  let observer: MutationObserver;

  const isItem = (element: EventTarget | null): element is HTMLElement => {
    // * duck-typed on purpose: in a Document Picture-in-Picture window the target belongs to
    // * another realm, where `instanceof HTMLElement` is false
    const el = element as HTMLElement;
    return !!el?.classList?.contains(ITEM_CLASS_NAME) && root.contains(el);
  };

  const findByKey = (key: string) => {
    return getMessageListItems(root).find((item) => getMessageItemKey(item) === key);
  };

  const needsObserver = () => !!(pending || restore || tracked);

  const syncObserver = () => {
    if(needsObserver()) {
      if(!observer) {
        observer = new MutationObserver(onMutation);
      }

      // * re-observing the same node is a no-op, so this is safe to call every time
      observer.observe(root, {childList: true, subtree: true});
    } else if(observer) {
      observer.disconnect();
    }
  };

  const cancelPending = () => {
    if(!pending) return;
    clearTimeout(pending.timer);
    pending = undefined;
    syncObserver();
  };

  function onMutation() {
    const doc = root.ownerDocument;

    // * the focused bubble was replaced: remember whose focus to give back
    if(tracked && !tracked.item.isConnected) {
      if(tracked.key) {
        restore = {key: tracked.key, until: Date.now() + restoreTimeout};
      }
      tracked = undefined;
    }

    if(restore) {
      const active = doc.activeElement;
      const focusMoved = active && active !== doc.body && active !== doc.documentElement;
      if(focusMoved || Date.now() > restore.until) {
        restore = undefined;
      } else {
        const found = findByKey(restore.key);
        if(found) {
          restore = undefined;
          // * the replacement sits where the old bubble was, nothing should scroll
          found.focus({preventScroll: true});
        }
      }
    }

    if(pending) {
      if(!pending.anchor.isConnected && pending.key) {
        const replacement = findByKey(pending.key);
        if(replacement) pending.anchor = replacement;
      }

      const {anchor, up} = pending;
      if(anchor.isConnected) {
        if(doc.activeElement !== anchor) {
          // * the user moved on while the history was loading
          cancelPending();
        } else {
          const items = getMessageListItems(root);
          const next = items[items.indexOf(anchor) + (up ? -1 : 1)];
          if(next) {
            cancelPending();
            next.focus();
          }
        }
      }
    }

    syncObserver();
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.defaultPrevented || e.isComposing) return;
    if(e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    // * a new arrow always ends the previous wait, wherever it was pressed
    cancelPending();

    const current = e.target as HTMLElement;
    if(!isItem(current)) return;

    const items = getMessageListItems(root);
    const index = items.indexOf(current);
    if(index === -1) return;

    // * also at the edges: the key is ours there too, and letting it through would scroll
    // * the history or hand focus to the composer instead of doing nothing
    e.preventDefault();

    const up = e.key === 'ArrowUp';
    const next = items[index + (up ? -1 : 1)];
    if(next) {
      next.focus();
      return;
    }

    if(!options.loadMore || !options.loadMore(up)) return;

    pending = {
      anchor: current,
      key: getMessageItemKey(current),
      up,
      timer: setTimeout(cancelPending, loadTimeout)
    };
    syncObserver();
  };

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target;
    if(isItem(target)) {
      tracked = {item: target, key: getMessageItemKey(target)};
      restore = undefined;
    } else {
      tracked = undefined;
    }

    syncObserver();
  };

  const onFocusOut = (e: FocusEvent) => {
    // * a null `relatedTarget` is also what a removed element and a blurred window look like,
    // * so only a real destination counts as the user moving away
    if(!e.relatedTarget) return;
    tracked = undefined;
    syncObserver();
  };

  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);

  const cancel = () => {
    cancelPending();
    restore = undefined;
    tracked = undefined;
    syncObserver();
  };

  return {
    cancel,
    detach: () => {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      cancel();
    }
  };
}
