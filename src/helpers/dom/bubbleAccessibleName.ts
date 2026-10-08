/**
 * Accessible names for the items of the message history: ordinary messages, date
 * separators and service messages.
 *
 * Every item is a plain focusable element (`tabindex="0"`, no ARIA role: a chat message is
 * not an article) named with `aria-labelledby`, which points at DOM nodes that already
 * exist in the bubble. Nothing is copied into an `aria-label`, so when Telegram updates a
 * title or the message text in place the name follows it for free.
 *
 * The name of an ordinary message is, in this order:
 *   1. the sender: the bubble's `.name`; for an outgoing message `You`; and when an incoming
 *      bubble shows no name (a private chat, or a name hidden inside a run of messages from
 *      one sender) a visually hidden fallback node;
 *   2. the message text (`.bubble-message-text`);
 *   3. `edited` (the existing `.time-edited`), when the message was edited;
 *   4. the time (`.time-value`).
 *
 * The nodes that carry the name are never `display: none` or `aria-hidden`.
 */

export const BUBBLE_MESSAGE_TEXT_CLASS = 'bubble-message-text';
export const BUBBLE_TIME_VALUE_CLASS = 'time-value';
export const BUBBLE_SENDER_FALLBACK_CLASS = 'bubble-accessible-sender';

const ID_PREFIX = 'bubble-name';
let idCounter = 0;

/** An element can only be referenced by `aria-labelledby` when it has an id of its own. */
function ensureId(element: Element) {
  if(!element.id) {
    element.id = ID_PREFIX + '-' + (++idCounter);
  }

  return element.id;
}

function setLabelledBy(bubble: HTMLElement, nodes: Element[]) {
  if(!nodes.length) {
    bubble.removeAttribute('aria-labelledby');
    return;
  }

  bubble.setAttribute('aria-labelledby', nodes.map(ensureId).join(' '));
}

/** A role without a name is what NVDA read out as just "article"; a message is not an article anyway. */
function dropArticleRole(bubble: HTMLElement) {
  if(bubble.getAttribute('role') === 'article') {
    bubble.removeAttribute('role');
  }
}

function findSenderName(bubble: HTMLElement) {
  return bubble.querySelector<HTMLElement>(
    '.bubble-content > .name, .bubble-content > .name-with-reply > .name'
  );
}

function findTimeInner(bubble: HTMLElement) {
  const own = bubble.timeSpan && bubble.contains(bubble.timeSpan) ? bubble.timeSpan : undefined;
  const time = own || bubble.querySelector<HTMLElement>('.time');
  return time?.querySelector<HTMLElement>(':scope > .time-inner') || undefined;
}

export type BubbleAccessibleNameOptions = {
  /** Sender label of an outgoing message (`You`). */
  outgoingLabel?: string,
  /**
   * Creates the node with the sender's name for an incoming bubble that has no `.name` of its
   * own. Called at most once per bubble; the result is kept visually hidden but readable.
   */
  createSenderName?: () => Node | string | undefined
};

function removeSenderFallback(bubble: HTMLElement) {
  bubble.querySelectorAll(':scope > .' + BUBBLE_SENDER_FALLBACK_CLASS).forEach((node) => node.remove());
}

function ensureSenderFallback(bubble: HTMLElement, kind: 'in' | 'out', create?: () => Node | string | undefined) {
  let fallback = bubble.querySelector<HTMLElement>(':scope > .' + BUBBLE_SENDER_FALLBACK_CLASS);
  if(fallback && fallback.dataset.senderKind !== kind) {
    fallback.remove();
    fallback = undefined;
  }

  if(!fallback) {
    const content = create?.();
    if(!content) return;

    fallback = document.createElement('span');
    // * `.sr-only` is visually hidden and still part of the accessibility tree
    fallback.className = 'sr-only ' + BUBBLE_SENDER_FALLBACK_CLASS;
    fallback.dataset.senderKind = kind;
    fallback.append(content);
    bubble.append(fallback);
  }

  return fallback;
}

/**
 * Makes an ordinary message bubble a focusable element named by its sender, text, `edited`
 * mark and time. Safe to call again whenever the nodes it points at were replaced.
 */
export function updateMessageBubbleAccessibleName(bubble: HTMLElement, options: BubbleAccessibleNameOptions = {}) {
  dropArticleRole(bubble);
  bubble.tabIndex = 0;

  const nodes: Element[] = [];

  const isOut = bubble.classList.contains('is-out');
  const senderName = isOut || bubble.classList.contains('hide-name') ? undefined : findSenderName(bubble);
  if(senderName) {
    removeSenderFallback(bubble);
    nodes.push(senderName);
  } else {
    const fallback = isOut ?
      ensureSenderFallback(bubble, 'out', () => options.outgoingLabel) :
      ensureSenderFallback(bubble, 'in', options.createSenderName);
    if(fallback) nodes.push(fallback);
  }

  const text = bubble.querySelector<HTMLElement>('.' + BUBBLE_MESSAGE_TEXT_CLASS);
  if(text) nodes.push(text);

  const timeInner = findTimeInner(bubble);
  if(timeInner) {
    const edited = timeInner.querySelector<HTMLElement>(':scope > .time-edited');
    if(edited) nodes.push(edited);

    const time = timeInner.querySelector<HTMLElement>(':scope > .' + BUBBLE_TIME_VALUE_CLASS);
    if(time) nodes.push(time);
  }

  setLabelledBy(bubble, nodes);
}

/**
 * Makes a date separator or a service message ("X joined") a focusable element named by the
 * text it already shows (`.service-msg`). A bubble with no such node is taken out of the tab
 * order instead of being left as a focus stop without a name.
 */
export function updateServiceBubbleAccessibleName(bubble: HTMLElement) {
  dropArticleRole(bubble);

  const text = bubble.querySelector<HTMLElement>('.bubble-content .service-msg');
  if(text) {
    bubble.tabIndex = 0;
    setLabelledBy(bubble, [text]);
  } else {
    bubble.removeAttribute('tabindex');
    bubble.removeAttribute('aria-labelledby');
  }
}

/** The visible date separator is its own stop, named by its date text. */
export function makeDateBubbleAccessible(bubble: HTMLElement) {
  updateServiceBubbleAccessibleName(bubble);
}

/**
 * The twin of a date separator (`.is-fake`) repeats the same text, so it is hidden from
 * assistive technology and is never a focus stop.
 */
export function hideDuplicateDateBubble(bubble: HTMLElement) {
  bubble.removeAttribute('tabindex');
  bubble.removeAttribute('aria-labelledby');
  bubble.setAttribute('aria-hidden', 'true');
}
