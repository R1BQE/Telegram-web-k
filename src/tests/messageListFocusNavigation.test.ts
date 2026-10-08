import {afterEach, expect, it, vi} from 'vitest';
import attachMessageListFocusNavigation, {
  getMessageItemKey,
  getMessageListItems,
  type MessageListFocusNavigation
} from '@helpers/dom/attachMessageListFocusNavigation';
import {
  hideDuplicateDateBubble,
  makeDateBubbleAccessible,
  updateMessageBubbleAccessibleName,
  updateServiceBubbleAccessibleName
} from '@helpers/dom/bubbleAccessibleName';

let nav: MessageListFocusNavigation;

afterEach(() => {
  nav?.detach();
  nav = undefined;
  vi.useRealTimers();
  document.body.replaceChildren();
});

type MessageInit = {
  mid: number,
  text?: string,
  sender?: string,
  out?: boolean,
  hideName?: boolean,
  edited?: boolean,
  time?: string,
  senderFallback?: string
};

/** The part of a bubble the accessible name is built from, shaped like what bubbles.ts renders. */
function createMessage(init: MessageInit) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (init.out ? 'is-out' : 'is-in') + (init.hideName ? ' hide-name' : '');
  bubble.tabIndex = 0;
  bubble.dataset.mid = '' + init.mid;
  bubble.dataset.peerId = '1';

  const content = document.createElement('div');
  content.className = 'bubble-content';

  if(init.sender) {
    const name = document.createElement('div');
    name.className = 'name';
    const title = document.createElement('span');
    title.className = 'peer-title';
    title.textContent = init.sender;
    name.append(title);
    content.append(name);
  }

  const message = document.createElement('div');
  message.className = 'message';

  if(init.text !== undefined) {
    const text = document.createElement('div');
    text.className = 'bubble-message-text';
    text.textContent = init.text;
    message.append(text);
  }

  // * `.time` is a hidden spacer holding a copy of the footer; `.time-inner` is the visible one
  const time = document.createElement('span');
  time.className = 'time';
  time.style.visibility = 'hidden';
  const hiddenCopy = document.createElement('span');
  hiddenCopy.className = 'time-value';
  hiddenCopy.textContent = init.time ?? '12:30';
  const inner = document.createElement('div');
  inner.className = 'time-inner';
  inner.style.visibility = 'visible';
  if(init.edited) {
    const edited = document.createElement('i');
    edited.className = 'time-edited time-part';
    edited.textContent = 'edited';
    inner.append(edited);
  }
  const value = document.createElement('span');
  value.className = 'time-value';
  value.textContent = init.time ?? '12:30';
  inner.append(value);
  time.append(hiddenCopy, inner);
  message.append(time);
  bubble.timeSpan = time;

  content.append(message);
  bubble.append(content);

  updateMessageBubbleAccessibleName(bubble, {
    outgoingLabel: 'You',
    createSenderName: init.senderFallback ? () => init.senderFallback : undefined
  });

  return bubble;
}

function createService(text: string, mid?: number) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble service';
  bubble.tabIndex = 0;
  if(mid) {
    bubble.dataset.mid = '' + mid;
    bubble.dataset.peerId = '1';
  }
  const content = document.createElement('div');
  content.className = 'bubble-content';
  const msg = document.createElement('div');
  msg.className = 'service-msg';
  msg.textContent = text;
  content.append(msg);
  bubble.append(content);
  updateServiceBubbleAccessibleName(bubble);
  return bubble;
}

/** A date group the way ChatBubbles builds it: the date, its hidden twin, then the messages. */
function createDateGroup(label: string, ...items: HTMLElement[]) {
  const date = createService(label);
  date.classList.add('is-date');
  makeDateBubbleAccessible(date);
  const fake = createService(label);
  fake.classList.add('is-date', 'is-fake');
  hideDuplicateDateBubble(fake);

  const section = document.createElement('section');
  section.className = 'bubbles-date-group';
  section.append(date, fake, ...items);
  return {section, date, fake};
}

function createHistory(loadMore?: (up: boolean) => boolean, options: {loadTimeout?: number} = {}) {
  const root = document.createElement('div');
  root.className = 'scrollable bubbles-scrollable';
  const inner = document.createElement('div');
  inner.className = 'bubbles-inner';
  root.append(inner);
  document.body.append(root);
  nav = attachMessageListFocusNavigation(root, {loadMore, ...options});
  return {root, inner};
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init});
  target.dispatchEvent(event);
  return event;
}

/** The nodes `aria-labelledby` points at. They live inside the bubble, which may not be attached to the document. */
function referencedNodes(bubble: HTMLElement) {
  return (bubble.getAttribute('aria-labelledby') || '')
  .split(' ')
  .filter(Boolean)
  .map((id) => bubble.querySelector<HTMLElement>('[id="' + id + '"]'));
}

/** The name of a bubble, resolved from `aria-labelledby` the way a browser joins the referenced nodes. */
function nameOf(bubble: HTMLElement) {
  return referencedNodes(bubble).map((node) => node?.textContent.trim()).join(' ');
}

const flush = async() => {
  // * MutationObserver callbacks are microtasks
  await Promise.resolve();
  await Promise.resolve();
};

// ---------------------------------------------------------------- accessible name

it('is a plain focusable element: tabindex 0 and no role="article"', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello'});
  const service = createService('Bob joined', 2);
  const {date} = createDateGroup('Today', message, service);

  for(const item of [message, service, date]) {
    expect(item.getAttribute('role')).toBeNull();
    expect(item.getAttribute('tabindex')).toBe('0');
    expect(item.tabIndex).toBe(0);
  }
});

it('drops a role="article" left on a bubble', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello'});
  message.setAttribute('role', 'article');
  updateMessageBubbleAccessibleName(message);
  expect(message.hasAttribute('role')).toBe(false);
});

it('names a message by sender, text, edited and time, in that order', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello there', edited: true, time: '14:05'});
  expect(nameOf(message)).toBe('Alice Hello there edited 14:05');
});

it('leaves out "edited" for a message that was not edited', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello there', time: '14:05'});
  expect(nameOf(message)).toBe('Alice Hello there 14:05');
  expect(message.getAttribute('aria-labelledby').split(' ')).toHaveLength(3);
});

it('uses the sender node that is already in the DOM instead of a copy', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello'});
  const [sender] = referencedNodes(message);
  expect(sender).not.toBeNull();
  expect(sender).toBe(message.querySelector('.name'));
  expect(message.querySelector('.bubble-accessible-sender')).toBeNull();
});

it('puts the time into aria-labelledby, not aria-describedby, and never copies the text into aria-label', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello', edited: true, time: '09:41'});
  const referenced = referencedNodes(message);

  expect(referenced).toContain(message.querySelector('.time-inner > .time-edited'));
  expect(referenced).toContain(message.querySelector('.time-inner > .time-value'));
  expect(message.hasAttribute('aria-describedby')).toBe(false);
  expect(message.hasAttribute('aria-label')).toBe(false);
});

it('points at the visible footer, not at the hidden spacer copy of it', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello', edited: true});
  const referenced = referencedNodes(message);
  const spacerCopy = message.querySelector('.time > .time-value');

  expect(spacerCopy).not.toBeNull();
  expect(referenced).not.toContain(null);
  expect(referenced).toContain(message.querySelector('.time-inner > .time-value'));
  expect(referenced).not.toContain(spacerCopy);
});

it('names an outgoing message "You", with a visually hidden node', () => {
  const message = createMessage({mid: 1, out: true, text: 'My message', time: '10:00'});
  expect(nameOf(message)).toBe('You My message 10:00');

  const fallback = message.querySelector<HTMLElement>('.bubble-accessible-sender');
  expect(fallback.classList.contains('sr-only')).toBe(true);
  expect(fallback.textContent).toBe('You');
});

it('says "You" for an outgoing message even when the bubble shows a name', () => {
  const message = createMessage({mid: 1, out: true, sender: 'Me myself', text: 'My message'});
  expect(nameOf(message)).toBe('You My message 12:30');
});

it('falls back to a hidden sender node when an incoming bubble has no name (hide-name)', () => {
  const message = createMessage({mid: 1, hideName: true, text: 'Second in a row', senderFallback: 'Alice'});
  expect(nameOf(message)).toBe('Alice Second in a row 12:30');

  const fallback = message.querySelector<HTMLElement>('.bubble-accessible-sender');
  expect(fallback.textContent).toBe('Alice');
  expect(fallback.classList.contains('sr-only')).toBe(true);
});

it('falls back to a hidden sender node in a private chat where no name is rendered at all', () => {
  const message = createMessage({mid: 1, text: 'Hi', senderFallback: 'Bob'});
  expect(nameOf(message)).toBe('Bob Hi 12:30');
});

it('never hides the nodes that carry the name with display:none or aria-hidden', () => {
  const message = createMessage({mid: 1, hideName: true, text: 'Text', edited: true, senderFallback: 'Alice'});
  document.body.append(message);
  const referenced = referencedNodes(message);
  expect(referenced).toHaveLength(4);
  for(const node of referenced) {
    expect(node).not.toBeNull();
    expect(node.getAttribute('aria-hidden')).toBeNull();
    expect(node.hidden).toBe(false);
    expect(node.closest('[aria-hidden="true"]')).toBeNull();
    expect(getComputedStyle(node).display).not.toBe('none');
  }
});

it('creates the sender fallback once and keeps it when the name is refreshed', () => {
  const create = vi.fn(() => 'Alice');
  const message = createMessage({mid: 1, hideName: true, text: 'Text'});
  updateMessageBubbleAccessibleName(message, {createSenderName: create});
  updateMessageBubbleAccessibleName(message, {createSenderName: create});

  expect(create).toHaveBeenCalledTimes(1);
  expect(message.querySelectorAll('.bubble-accessible-sender')).toHaveLength(1);
});

it('follows the nodes when the footer is replaced and the name is refreshed', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'Hello', time: '10:00'});
  const inner = message.querySelector('.time-inner');
  const edited = document.createElement('i');
  edited.className = 'time-edited time-part';
  edited.textContent = 'edited';
  inner.prepend(edited);
  updateMessageBubbleAccessibleName(message);

  expect(nameOf(message)).toBe('Alice Hello edited 10:00');
});

it('keeps ids unique across bubbles', () => {
  const a = createMessage({mid: 1, sender: 'A', text: 'one'});
  const b = createMessage({mid: 2, sender: 'B', text: 'two'});
  document.body.append(a, b);

  const ids = [...a.getAttribute('aria-labelledby').split(' '), ...b.getAttribute('aria-labelledby').split(' ')];
  expect(new Set(ids).size).toBe(ids.length);
});

it('does not touch the links inside a message: they stay separate focusable nodes', () => {
  const message = createMessage({mid: 1, sender: 'Alice', text: 'see '});
  const link = document.createElement('a');
  link.href = 'https://example.com';
  link.textContent = 'example';
  message.querySelector('.bubble-message-text').append(link);
  updateMessageBubbleAccessibleName(message);
  document.body.append(message);

  expect(link.getAttribute('role')).toBeNull();
  expect(link.hasAttribute('aria-hidden')).toBe(false);
  expect(link.tabIndex).toBe(0);
  link.focus();
  expect(document.activeElement).toBe(link);
});

it('names a date by its own text and hides the twin that repeats it', () => {
  const {date, fake} = createDateGroup('26 May 2026');
  expect(nameOf(date)).toBe('26 May 2026');
  expect(date.getAttribute('tabindex')).toBe('0');

  expect(fake.getAttribute('aria-hidden')).toBe('true');
  expect(fake.hasAttribute('tabindex')).toBe(false);
  expect(fake.hasAttribute('aria-labelledby')).toBe(false);
});

it('names a service message by its text', () => {
  const service = createService('Alice joined the group', 5);
  expect(nameOf(service)).toBe('Alice joined the group');
  expect(service.getAttribute('role')).toBeNull();
  expect(service.getAttribute('tabindex')).toBe('0');
});

it('takes a service bubble with no text node out of the tab order instead of leaving it unnamed', () => {
  const bubble = document.createElement('div');
  bubble.className = 'bubble service';
  bubble.tabIndex = 0;
  updateServiceBubbleAccessibleName(bubble);

  expect(bubble.hasAttribute('tabindex')).toBe(false);
  expect(bubble.hasAttribute('aria-labelledby')).toBe(false);
});

// ---------------------------------------------------------------- ArrowUp / ArrowDown

function threeGroups() {
  const {inner} = createHistory();
  const m1 = createMessage({mid: 1, sender: 'A', text: 'one'});
  const m2 = createMessage({mid: 2, sender: 'B', text: 'two'});
  const s1 = createService('Carol joined', 3);
  const m3 = createMessage({mid: 4, out: true, text: 'three'});
  const g1 = createDateGroup('25 May 2026', m1, m2);
  const g2 = createDateGroup('Today', s1, m3);
  inner.append(g1.section, g2.section);
  return {inner, m1, m2, s1, m3, d1: g1.date, d2: g2.date, fake1: g1.fake, fake2: g2.fake};
}

it('moves focus with ArrowDown and ArrowUp through dates, messages and service messages, across date groups', () => {
  const {m1, m2, s1, m3, d1, d2} = threeGroups();
  const order = [d1, m1, m2, d2, s1, m3];

  order[0].focus();
  for(let i = 1; i < order.length; ++i) {
    const event = press(document.activeElement as HTMLElement, 'ArrowDown');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(order[i]);
  }

  for(let i = order.length - 2; i >= 0; --i) {
    press(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(order[i]);
  }
});

it('lists the items in document order without the date twins', () => {
  const {inner, m1, m2, s1, m3, d1, d2, fake1, fake2} = threeGroups();
  const items = getMessageListItems(inner);

  expect(items).toEqual([d1, m1, m2, d2, s1, m3]);
  expect(items).not.toContain(fake1);
  expect(items).not.toContain(fake2);
});

it('reads the list from the DOM every time, so a group added later is part of the sequence', () => {
  const {inner, m3} = threeGroups();
  const late = createMessage({mid: 9, sender: 'Dan', text: 'late'});
  const group = createDateGroup('Tomorrow', late);
  inner.append(group.section);

  m3.focus();
  press(m3, 'ArrowDown');
  expect(document.activeElement).toBe(group.date);
  press(group.date, 'ArrowDown');
  expect(document.activeElement).toBe(late);
});

it('does nothing at either end and never wraps around', () => {
  const {m3, d1} = threeGroups();

  d1.focus();
  const up = press(d1, 'ArrowUp');
  expect(document.activeElement).toBe(d1);
  expect(up.defaultPrevented).toBe(true);

  m3.focus();
  const down = press(m3, 'ArrowDown');
  expect(document.activeElement).toBe(m3);
  expect(down.defaultPrevented).toBe(true);
});

it('skips hidden and invalid items', () => {
  const {inner} = createHistory();
  const a = createMessage({mid: 1, sender: 'A', text: 'a'});
  const hiddenAttr = createMessage({mid: 2, sender: 'B', text: 'b'});
  hiddenAttr.hidden = true;
  const displayNone = createMessage({mid: 3, sender: 'C', text: 'c'});
  displayNone.style.display = 'none';
  const inHiddenParent = createMessage({mid: 4, sender: 'D', text: 'd'});
  const wrapper = document.createElement('div');
  wrapper.style.display = 'none';
  wrapper.append(inHiddenParent);
  const ariaHidden = createMessage({mid: 5, sender: 'E', text: 'e'});
  ariaHidden.setAttribute('aria-hidden', 'true');
  const noTabindex = createMessage({mid: 6, sender: 'F', text: 'f'});
  noTabindex.removeAttribute('tabindex');
  const negative = createMessage({mid: 7, sender: 'G', text: 'g'});
  negative.tabIndex = -1;
  const hideClass = createMessage({mid: 8, sender: 'H', text: 'h'});
  hideClass.classList.add('hide');
  const visibilityHidden = createMessage({mid: 10, sender: 'J', text: 'j'});
  visibilityHidden.style.visibility = 'hidden';
  const fake = createService('Today', 11);
  fake.classList.add('is-date', 'is-fake');
  const z = createMessage({mid: 12, sender: 'Z', text: 'z'});
  inner.append(a, hiddenAttr, displayNone, wrapper, ariaHidden, noTabindex, negative, hideClass, visibilityHidden, fake, z);

  expect(getMessageListItems(inner)).toEqual([a, z]);

  a.focus();
  press(a, 'ArrowDown');
  expect(document.activeElement).toBe(z);
  press(z, 'ArrowUp');
  expect(document.activeElement).toBe(a);
});

it('lets modified arrows through: Alt+Arrow switches chats, Ctrl/Meta+Arrow replies', () => {
  const {m1, m2} = threeGroups();
  m1.focus();

  for(const init of [{altKey: true}, {ctrlKey: true}, {metaKey: true}, {shiftKey: true}]) {
    const event = press(m1, 'ArrowDown', init);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(m1);
  }

  press(m1, 'ArrowDown');
  expect(document.activeElement).toBe(m2);
});

it('ignores every other key', () => {
  const {m1} = threeGroups();
  m1.focus();

  for(const key of ['Tab', 'Home', 'End', 'PageDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ']) {
    expect(press(m1, key).defaultPrevented).toBe(false);
  }
  expect(document.activeElement).toBe(m1);
});

it('does not handle an arrow that was already handled or comes from an IME', () => {
  const {m1} = threeGroups();
  m1.focus();

  const handled = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true});
  handled.preventDefault();
  m1.dispatchEvent(handled);
  expect(document.activeElement).toBe(m1);

  const composing = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true, isComposing: true});
  m1.dispatchEvent(composing);
  expect(composing.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(m1);
});

it.each([
  ['a link', () => {
    const el = document.createElement('a');
    el.href = '#x';
    el.textContent = 'link';
    return el;
  }],
  ['a button', () => {
    const el = document.createElement('button');
    el.textContent = 'button';
    return el;
  }],
  ['an input', () => document.createElement('input')],
  ['a textarea', () => document.createElement('textarea')],
  ['a contenteditable', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    el.tabIndex = 0;
    return el;
  }],
  ['a menu item', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'menuitem');
    el.tabIndex = 0;
    return el;
  }],
  ['a role=button element', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    return el;
  }]
])('leaves the arrows alone inside %s within a message', (_, create) => {
  const {m1, m2} = threeGroups();
  const child = create();
  m1.querySelector('.bubble-message-text').append(child);
  child.focus();
  expect(document.activeElement).toBe(child);

  for(const key of ['ArrowDown', 'ArrowUp']) {
    const event = press(child, key);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(child);
  }
  expect(document.activeElement).not.toBe(m2);
});

it('does not listen outside the history it is attached to', () => {
  threeGroups();
  const outside = createMessage({mid: 77, sender: 'X', text: 'elsewhere'});
  const sibling = createMessage({mid: 78, sender: 'Y', text: 'elsewhere too'});
  document.body.append(outside, sibling);
  outside.focus();

  const event = press(outside, 'ArrowDown');
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(outside);
});

it('stops handling keys once detached', () => {
  const {m1} = threeGroups();
  m1.focus();
  nav.detach();

  const event = press(m1, 'ArrowDown');
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(m1);
});

// ---------------------------------------------------------------- history loading

function setupLoader(up = true) {
  const loadMore = vi.fn((_: boolean) => true);
  const {inner} = createHistory(loadMore);
  const first = createMessage({mid: 20, sender: 'A', text: 'first loaded'});
  const group = createDateGroup('Today', first);
  inner.append(group.section);
  const edge = up ? group.date : first;
  return {loadMore, inner, first, group, edge};
}

it('asks the history loader for the missing neighbour and moves focus when it appears', async() => {
  const {loadMore, inner, group} = setupLoader();
  group.date.focus();

  const event = press(group.date, 'ArrowUp');
  expect(event.defaultPrevented).toBe(true);
  expect(loadMore).toHaveBeenCalledTimes(1);
  expect(loadMore).toHaveBeenCalledWith(true);
  expect(document.activeElement).toBe(group.date);

  const older = createMessage({mid: 10, sender: 'B', text: 'older'});
  const olderGroup = createDateGroup('Yesterday', older);
  inner.prepend(olderGroup.section);
  await flush();

  expect(document.activeElement).toBe(older);
});

it('loads downwards for ArrowDown at the bottom', async() => {
  const {loadMore, inner, first} = setupLoader(false);
  first.focus();

  press(first, 'ArrowDown');
  expect(loadMore).toHaveBeenCalledWith(false);

  const newer = createMessage({mid: 30, sender: 'B', text: 'newer'});
  inner.querySelector('.bubbles-date-group').append(newer);
  await flush();

  expect(document.activeElement).toBe(newer);
});

it('does not wait when the loader has nothing more to give', async() => {
  const loadMore = vi.fn(() => false);
  const {inner} = createHistory(loadMore);
  const only = createMessage({mid: 1, sender: 'A', text: 'only'});
  inner.append(only);
  only.focus();

  const event = press(only, 'ArrowUp');
  expect(event.defaultPrevented).toBe(true);
  expect(loadMore).toHaveBeenCalledTimes(1);

  inner.prepend(createMessage({mid: 0, sender: 'B', text: 'appeared anyway'}));
  await flush();
  expect(document.activeElement).toBe(only);
});

it('does not call the loader when the neighbour is already mounted', () => {
  const loadMore = vi.fn(() => true);
  const {inner} = createHistory(loadMore);
  const a = createMessage({mid: 1, sender: 'A', text: 'a'});
  const b = createMessage({mid: 2, sender: 'B', text: 'b'});
  inner.append(a, b);
  a.focus();

  press(a, 'ArrowDown');
  expect(document.activeElement).toBe(b);
  expect(loadMore).not.toHaveBeenCalled();
});

it('cancels the wait on the next arrow', async() => {
  const {loadMore, inner, group, first} = setupLoader();
  group.date.focus();
  press(group.date, 'ArrowUp');

  // * the user changes their mind and goes down instead
  press(group.date, 'ArrowDown');
  expect(document.activeElement).toBe(first);
  expect(loadMore).toHaveBeenCalledTimes(1);

  inner.prepend(createMessage({mid: 10, sender: 'B', text: 'older'}));
  await flush();
  expect(document.activeElement).toBe(first);
});

it('cancels the wait when focus leaves the list', async() => {
  const {inner, group} = setupLoader();
  const outside = document.createElement('button');
  document.body.append(outside);

  group.date.focus();
  press(group.date, 'ArrowUp');
  outside.focus();

  inner.prepend(createMessage({mid: 10, sender: 'B', text: 'older'}));
  await flush();
  expect(document.activeElement).toBe(outside);
});

it('cancels the wait on a chat change', async() => {
  const {inner, group} = setupLoader();
  group.date.focus();
  press(group.date, 'ArrowUp');

  nav.cancel();
  inner.prepend(createMessage({mid: 10, sender: 'B', text: 'older'}));
  await flush();
  expect(document.activeElement).toBe(group.date);
});

it('gives up after the timeout', async() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date']});
  const loadMore = vi.fn(() => true);
  const {inner} = createHistory(loadMore, {loadTimeout: 1000});
  const only = createMessage({mid: 1, sender: 'A', text: 'only'});
  inner.append(only);
  only.focus();

  press(only, 'ArrowUp');
  vi.advanceTimersByTime(1500);

  inner.prepend(createMessage({mid: 0, sender: 'B', text: 'too late'}));
  await flush();
  expect(document.activeElement).toBe(only);
});

it('keeps waiting while the timeout has not passed', async() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date']});
  const loadMore = vi.fn(() => true);
  const {inner} = createHistory(loadMore, {loadTimeout: 1000});
  const only = createMessage({mid: 1, sender: 'A', text: 'only'});
  inner.append(only);
  only.focus();

  press(only, 'ArrowUp');
  vi.advanceTimersByTime(500);

  const older = createMessage({mid: 0, sender: 'B', text: 'older'});
  inner.prepend(older);
  await flush();
  expect(document.activeElement).toBe(older);
});

it('does not stop at an unrelated mutation while waiting', async() => {
  const {inner, group} = setupLoader();
  group.date.focus();
  press(group.date, 'ArrowUp');

  inner.append(document.createElement('div'));
  await flush();
  expect(document.activeElement).toBe(group.date);

  const older = createMessage({mid: 10, sender: 'B', text: 'older'});
  inner.prepend(older);
  await flush();
  expect(document.activeElement).toBe(older);
});

// ---------------------------------------------------------------- keeping focus

it('gives focus back to a re-created bubble with the same data-mid and data-peer-id', async() => {
  const {inner} = createHistory();
  const before = createMessage({mid: 5, sender: 'A', text: 'old text'});
  const other = createMessage({mid: 6, sender: 'B', text: 'other'});
  inner.append(before, other);
  before.focus();

  const after = createMessage({mid: 5, sender: 'A', text: 'new text', edited: true});
  before.replaceWith(after);
  await flush();

  expect(document.activeElement).toBe(after);
  expect(getMessageItemKey(after)).toBe('1_5');
});

it('restores focus when the new bubble arrives a little later than the old one leaves', async() => {
  const {inner} = createHistory();
  const before = createMessage({mid: 5, sender: 'A', text: 'old'});
  inner.append(before);
  before.focus();

  before.remove();
  await flush();
  expect(document.activeElement).not.toBe(before);

  const after = createMessage({mid: 5, sender: 'A', text: 'new'});
  inner.append(after);
  await flush();
  expect(document.activeElement).toBe(after);
});

it('does not take focus back from where the user moved it', async() => {
  const {inner} = createHistory();
  const before = createMessage({mid: 5, sender: 'A', text: 'old'});
  const input = document.createElement('input');
  document.body.append(input);
  inner.append(before);
  before.focus();

  input.focus();
  before.replaceWith(createMessage({mid: 5, sender: 'A', text: 'new'}));
  await flush();
  expect(document.activeElement).toBe(input);
});

it('does not move focus to a different message', async() => {
  const {inner} = createHistory();
  const before = createMessage({mid: 5, sender: 'A', text: 'old'});
  inner.append(before);
  before.focus();

  before.replaceWith(createMessage({mid: 6, sender: 'A', text: 'someone else'}));
  await flush();
  expect(document.activeElement).toBe(document.body);
});

it('does not mix up the same mid in another chat', async() => {
  const {inner} = createHistory();
  const before = createMessage({mid: 5, sender: 'A', text: 'old'});
  inner.append(before);
  before.focus();

  const otherChat = createMessage({mid: 5, sender: 'A', text: 'other chat'});
  otherChat.dataset.peerId = '2';
  before.replaceWith(otherChat);
  await flush();
  expect(document.activeElement).toBe(document.body);
});

it('does not restore focus after the chat changed', async() => {
  const {inner} = createHistory();
  const before = createMessage({mid: 5, sender: 'A', text: 'old'});
  inner.append(before);
  before.focus();

  nav.cancel();
  before.replaceWith(createMessage({mid: 5, sender: 'A', text: 'new'}));
  await flush();
  expect(document.activeElement).toBe(document.body);
});

it('gives up restoring focus after the timeout', async() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date']});
  const root = document.createElement('div');
  const inner = document.createElement('div');
  root.append(inner);
  document.body.append(root);
  nav = attachMessageListFocusNavigation(root, {restoreTimeout: 1000});

  const before = createMessage({mid: 5, sender: 'A', text: 'old'});
  inner.append(before);
  before.focus();

  before.remove();
  await flush();
  vi.advanceTimersByTime(2000);

  // * an unrelated change after the window has passed
  inner.append(document.createElement('div'));
  await flush();
  inner.append(createMessage({mid: 5, sender: 'A', text: 'much later'}));
  await flush();

  expect(document.activeElement).toBe(document.body);
});

it('leaves the tab order exactly as it was', () => {
  const {m1, m2, s1, m3, d1, d2} = threeGroups();
  const items = [d1, m1, m2, d2, s1, m3];
  items[0].focus();
  press(items[0], 'ArrowDown');
  press(items[1], 'ArrowDown');

  expect(items.map((item) => item.tabIndex)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(press(items[2], 'Tab').defaultPrevented).toBe(false);
});
