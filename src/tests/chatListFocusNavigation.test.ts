import {afterEach, expect, it} from 'vitest';
import attachChatListFocusNavigation, {getChatListRows} from '@helpers/dom/attachChatListFocusNavigation';

let detach: () => void;

afterEach(() => {
  detach?.();
  detach = undefined;
  document.body.replaceChildren();
});

function createRow(name: string) {
  const row = document.createElement('a');
  row.href = '#' + name;
  row.className = 'chatlist-chat';
  row.textContent = name;
  return row;
}

function createList(names: string[], attach = true) {
  const list = document.createElement('ul');
  list.className = 'chatlist virtual-chatlist';
  const rows = names.map(createRow);
  list.append(...rows);
  document.body.append(list);
  if(attach) detach = attachChatListFocusNavigation(list);
  return {list, rows};
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init});
  target.dispatchEvent(event);
  return event;
}

it('moves real focus to the next and previous chat with ArrowDown and ArrowUp', () => {
  const {rows} = createList(['a', 'b', 'c']);
  rows[0].focus();

  const down = press(rows[0], 'ArrowDown');
  expect(document.activeElement).toBe(rows[1]);
  expect(down.defaultPrevented).toBe(true);

  press(rows[1], 'ArrowDown');
  expect(document.activeElement).toBe(rows[2]);

  press(rows[2], 'ArrowUp');
  expect(document.activeElement).toBe(rows[1]);
});

it('leaves the tab order exactly as it was', () => {
  const {rows} = createList(['a', 'b', 'c']);
  rows[0].focus();
  press(rows[0], 'ArrowDown');
  press(rows[1], 'ArrowDown');

  expect(rows.map((row) => row.tabIndex)).toEqual([0, 0, 0]);
  expect(rows.some((row) => row.hasAttribute('tabindex'))).toBe(false);

  const tab = press(rows[2], 'Tab');
  expect(tab.defaultPrevented).toBe(false);
});

it('does nothing at either end of the list and does not wrap around', () => {
  const {rows} = createList(['a', 'b']);
  const outside = document.createElement('button');
  document.body.append(outside);

  rows[0].focus();
  const up = press(rows[0], 'ArrowUp');
  expect(document.activeElement).toBe(rows[0]);
  expect(up.defaultPrevented).toBe(true);

  rows[1].focus();
  const down = press(rows[1], 'ArrowDown');
  expect(document.activeElement).toBe(rows[1]);
  expect(down.defaultPrevented).toBe(true);
  expect(document.activeElement).not.toBe(outside);
});

it('skips loading placeholders and rows that are hidden or out of the tab order', () => {
  const {list, rows} = createList(['a', 'b', 'c', 'd', 'e']);
  const placeholder = document.createElement('li');
  placeholder.className = 'skeleton';
  list.insertBefore(placeholder, rows[1]);
  rows[1].classList.add('hide');
  rows[2].hidden = true;
  rows[3].setAttribute('aria-hidden', 'true');

  expect(getChatListRows(list)).toEqual([rows[0], rows[4]]);

  rows[0].focus();
  press(rows[0], 'ArrowDown');
  expect(document.activeElement).toBe(rows[4]);
});

it('does nothing while the next chat is not in the DOM yet', () => {
  const {list, rows} = createList(['a', 'b']);
  const placeholder = document.createElement('li');
  placeholder.className = 'skeleton';
  list.append(placeholder);

  rows[1].focus();
  const down = press(rows[1], 'ArrowDown');
  expect(document.activeElement).toBe(rows[1]);
  expect(down.defaultPrevented).toBe(true);

  // the placeholder turns into a chat: the very next press reaches it
  const loaded = createRow('c');
  placeholder.replaceWith(loaded);
  press(rows[1], 'ArrowDown');
  expect(document.activeElement).toBe(loaded);
});

it('follows the current DOM when the list reorders, grows and shrinks', () => {
  const {list, rows} = createList(['a', 'b', 'c', 'd']);
  rows[1].focus();

  // a new chat appears right under the focused one
  const inserted = createRow('new');
  rows[1].after(inserted);
  press(rows[1], 'ArrowDown');
  expect(document.activeElement).toBe(inserted);

  // the chat below disappears: the one after it is next
  rows[2].remove();
  press(inserted, 'ArrowDown');
  expect(document.activeElement).toBe(rows[3]);

  // the list re-sorts: the previous chat is whatever is above now
  list.prepend(rows[3]);
  rows[3].focus();
  press(rows[3], 'ArrowDown');
  expect(document.activeElement).toBe(rows[0]);
  press(rows[0], 'ArrowUp');
  expect(document.activeElement).toBe(rows[3]);
});

it('lets modified arrows, other keys and nested controls through untouched', () => {
  const {rows} = createList(['a', 'b']);
  const nested = document.createElement('button');
  rows[0].append(nested);
  rows[0].focus();

  for(const init of [{altKey: true}, {ctrlKey: true}, {metaKey: true}, {shiftKey: true}]) {
    const event = press(rows[0], 'ArrowDown', init);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(rows[0]);
  }

  for(const key of ['Enter', ' ', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'PageDown']) {
    expect(press(rows[0], key).defaultPrevented).toBe(false);
  }

  nested.focus();
  const fromNested = press(nested, 'ArrowDown');
  expect(fromNested.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(nested);
});

it('keeps Enter activation of the focused chat intact after moving', () => {
  const {rows} = createList(['a', 'b']);
  let clicks = 0;
  rows[1].addEventListener('click', () => ++clicks);

  rows[0].focus();
  press(rows[0], 'ArrowDown');
  expect(document.activeElement).toBe(rows[1]);

  // a native link turns Enter into a click on the focused element, which is now the second row
  expect(press(rows[1], 'Enter').defaultPrevented).toBe(false);
  rows[1].click();
  expect(clicks).toBe(1);
});

it('only listens on its own list, never on the page', () => {
  const {rows} = createList(['a', 'b']);
  const {rows: otherRows} = createList(['x', 'y'], false);

  otherRows[0].focus();
  const event = press(otherRows[0], 'ArrowDown');
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(otherRows[0]);

  rows[0].focus();
  press(rows[0], 'ArrowDown');
  expect(document.activeElement).toBe(rows[1]);
});

it('stops handling keys once detached', () => {
  const {rows} = createList(['a', 'b']);
  rows[0].focus();
  detach();
  detach = undefined;

  const event = press(rows[0], 'ArrowDown');
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(rows[0]);
});
