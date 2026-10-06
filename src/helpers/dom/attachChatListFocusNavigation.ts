const ROW_CLASS_NAME = 'chatlist-chat';

type MaybeCheckVisibility = HTMLElement & {checkVisibility?: () => boolean};

/**
 * A row that focus may land on right now: skips rows that are hidden, taken out of the
 * accessibility tree, or removed from the tab order.
 */
function isNavigableRow(row: HTMLElement) {
  return !row.hidden &&
    !row.classList.contains('hide') &&
    row.getAttribute('aria-hidden') !== 'true' &&
    row.tabIndex >= 0 &&
    (row as MaybeCheckVisibility).checkVisibility?.() !== false;
}

/**
 * The rows of a chat list that exist in the DOM at this moment, in document order.
 *
 * Always read from the DOM instead of being cached: the list re-sorts, inserts and removes
 * rows, and a windowed list mounts and unmounts them as it scrolls. Loading placeholders
 * are not rows (they lack the row class), so they are never a focus target.
 */
export function getChatListRows(list: HTMLElement) {
  return Array.from(list.querySelectorAll<HTMLElement>('.' + ROW_CLASS_NAME)).filter(isNavigableRow);
}

/**
 * ArrowUp / ArrowDown move real keyboard focus between the rows of a chat list.
 *
 * Deliberately minimal:
 * - Tab order is untouched: no roving tabindex, every row stays a tab stop of its own.
 * - It stops at both ends of the list: no wrap-around, focus never leaves the list.
 * - Only a plain arrow pressed while the row itself has focus is handled. Modified arrows
 *   (Alt+Up/Down switches dialogs globally), keys on controls nested inside a row, and
 *   every other key are left alone.
 * - The listener sits on the list element, not on the document, so it only ever sees
 *   keys pressed in this list.
 * - A row that is not in the DOM yet (a windowed list has not mounted it, or it is still
 *   loading) cannot take focus, so the arrow does nothing until it exists.
 *
 * @returns a function that removes the listener
 */
export default function attachChatListFocusNavigation(list: HTMLElement) {
  const onKeyDown = (e: KeyboardEvent) => {
    if(e.defaultPrevented || e.isComposing) return;
    if(e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    // * duck-typed on purpose: in a Document Picture-in-Picture window the target belongs to
    // * another realm, where `instanceof HTMLElement` is false
    const current = e.target as HTMLElement;
    if(!current?.classList?.contains(ROW_CLASS_NAME) || !list.contains(current)) return;

    const rows = getChatListRows(list);
    const index = rows.indexOf(current);
    if(index === -1) return;

    // * also at the edges: the key is ours there too, and letting it through would scroll
    // * the list under a focused row instead of doing nothing
    e.preventDefault();

    const next = rows[index + (e.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
  };

  list.addEventListener('keydown', onKeyDown);

  return () => {
    list.removeEventListener('keydown', onKeyDown);
  };
}
