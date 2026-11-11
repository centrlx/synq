/**
 * UI-утилиты SYNQ. Все DOM-узлы создаются через h() с textContent —
 * пользовательские данные никогда не вставляются как HTML (защита от XSS).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function setStyleVar(el, name, value) {
  el.style.setProperty(name, value);
  return el;
}

/* ───────────── Иконки (stroke 1.6, 24×24) ───────────── */
const ICONS = {
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  left: ['m15 18-6-6 6-6'],
  right: ['m9 18 6-6-6-6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'],
  bag: ['M6 7h12l1 14H5L6 7Z', 'M9 7a3 3 0 0 1 6 0'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  box: ['m21 8-9-5-9 5 9 5 9-5Z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'],
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2V3Z', 'M9 8h6', 'M9 12h6'],
  users: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M2 21a7 7 0 0 1 14 0', 'M16 3.5a4 4 0 0 1 0 7', 'M22 21a7 7 0 0 0-4-6.3'],
  logout: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l-5-5 5-5', 'M5 12h11'],
  download: ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14'],
  upload: ['M12 20V9', 'm7 14 5-5 5 5', 'M5 4h14'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4Z', 'm13 7 4 4'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z', 'M14 3v5h5'],
  gauge: ['M12 14l4-4', 'M3.5 18a9 9 0 1 1 17 0'],
  tag: ['M3 12V4h8l10 10-8 8L3 12Z', 'M7.5 8.5h.01'],
  shield: ['M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z', 'm9 12 2 2 4-4'],
  store: ['M4 10h16', 'M5 10V20h14V10', 'M3 10l2-6h14l2 6'],
};

export function icon(name, { size } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (size) {
    svg.style.width = `${size}px`;
    svg.style.height = `${size}px`;
  }
  for (const d of ICONS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/* ───────────── Форматирование ───────────── */
// Магазин работает в Казахстане: цены в тенге без копеек, даты — в формате ru-KZ
const money = new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('ru-KZ', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fmt = {
  price: (value) => (Number(value) === 0 ? 'Бесплатно' : money.format(Number(value))),
  date: (iso) => dateFmt.format(new Date(iso)),
  dateTime: (iso) => dateTimeFmt.format(new Date(iso)),
  bytes(n) {
    if (!n && n !== 0) return '—';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
  },
  plural(n, [one, few, many]) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  },
  count(n, forms) {
    return `${n} ${fmt.plural(n, forms)}`;
  },
};

export const ORDER_STATUS_LABEL = { PENDING: 'Ожидает оплаты', PAID: 'Оплачен', CANCELLED: 'Отменён' };

export function statusBadge(status) {
  return h('span', { class: `badge badge--${status}` }, ORDER_STATUS_LABEL[status] ?? status);
}

/* ───────────── Генеративная обложка ───────────── */
function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    x ^= str.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}

// Монохромные тона обложек: оттенки графита и белые «чернила»
const TONES = [
  ['#1d1d1f', 'rgba(255, 255, 255, 0.92)'],
  ['#2a2a2e', 'rgba(255, 255, 255, 0.92)'],
  ['#141416', 'rgba(255, 255, 255, 0.92)'],
  ['#38383d', 'rgba(255, 255, 255, 0.92)'],
  ['#232327', 'rgba(255, 255, 255, 0.92)'],
  ['#0e0e10', 'rgba(255, 255, 255, 0.92)'],
];

function monogram(name) {
  const words = String(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Обложка товара: изображение из Supabase Storage, а если администратор его ещё
 * не загрузил — типографская обложка, детерминированно построенная из названия.
 */
export function cover(product, { eager = false } = {}) {
  if (product.imageUrl) {
    return h('div', { class: 'cover' },
      h('img', { src: product.imageUrl, alt: product.name, loading: eager ? 'eager' : 'lazy', decoding: 'async' }));
  }
  const seed = hash(product.name ?? '');
  const bars = [];
  let s = seed;
  for (let i = 0; i < 14; i += 1) {
    s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
    const height = 18 + (s % 82);
    bars.push(h('i', { style: { height: `${height}%` } }));
  }
  const el = h('div', { class: 'cover cover--gen', role: 'img', 'aria-label': product.name },
    h('div', { class: 'cover__mono' }, monogram(product.name)),
    h('div', { class: 'cover__wave' }, bars),
    h('div', { class: 'cover__dev' }, product.developer ?? ''));
  const [tone, ink] = TONES[seed % TONES.length];
  el.style.setProperty('--tone', tone);
  el.style.setProperty('--tone-ink', ink);
  return el;
}

/* ───────────── Состояния ───────────── */
export function emptyState({ title, text, action, ink = false }) {
  return h('div', { class: `empty${ink ? ' empty--ink' : ''}` },
    h('div', { class: 'empty__icon', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
    h('p', { class: 'empty__title' }, title),
    text ? h('p', { class: 'empty__text' }, text) : null,
    action ?? null);
}

export function skeletonGrid(count = 8) {
  return Array.from({ length: count }, () =>
    h('div', { class: 'skeleton-card', 'aria-hidden': 'true' },
      h('div', { class: 'skeleton skeleton--cover' }),
      h('div', { class: 'skeleton skeleton--line', style: { width: '40%' } }),
      h('div', { class: 'skeleton skeleton--line', style: { width: '75%' } })));
}

/** Цена с учётом скидки: новая цена + зачёркнутая старая. */
export function priceTag(product, { size = '' } = {}) {
  const final = product.finalPrice ?? product.price;
  return h('span', { class: `price${size ? ` price--${size}` : ''}` },
    h('span', { class: product.onSale ? 'price__now price__now--sale' : 'price__now' }, fmt.price(final)),
    product.onSale ? h('s', { class: 'price__old' }, fmt.price(product.price)) : null);
}

export function saleBadge(product) {
  return product.onSale && product.discountPercent > 0
    ? h('span', { class: 'sale-badge' }, `−${product.discountPercent}%`)
    : null;
}

/* ───────────── Рейтинг и отзывы ───────────── */
/** Звёзды: серая подложка и чёрная заливка по ширине = оценка / 5. */
export function stars(rating, { label = true } = {}) {
  const pct = Math.max(0, Math.min(100, (Number(rating) / 5) * 100));
  const fill = h('span', { class: 'stars__fill' }, '★★★★★');
  fill.style.width = `${pct}%`;
  return h('span', { class: 'stars', role: label ? 'img' : null, 'aria-label': label ? `Оценка ${Number(rating).toFixed(1)} из 5` : null },
    h('span', { class: 'stars__base', 'aria-hidden': 'true' }, '★★★★★'), fill);
}

const ratingFmt = new Intl.NumberFormat('ru-KZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatRating = (n) => ratingFmt.format(Number(n) || 0);

/** Сводка рейтинга: большая оценка, звёзды, количество и полосы распределения. */
export function ratingSummary(summary, { title } = {}) {
  const max = Math.max(1, ...Object.values(summary.distribution));
  return h('div', { class: 'rating-summary' },
    h('div', { class: 'rating-summary__score' },
      title ? h('p', { class: 'eyebrow' }, title) : null,
      h('div', { class: 'rating-summary__value' }, formatRating(summary.average), h('span', {}, '/5')),
      stars(summary.average),
      h('p', { class: 'muted' }, fmt.count(summary.count, ['отзыв', 'отзыва', 'отзывов']))),
    h('div', { class: 'rating-bars' }, [5, 4, 3, 2, 1].map((n) => {
      const bar = h('i');
      bar.style.width = `${(summary.distribution[n] / max) * 100}%`;
      return h('div', { class: 'rating-bars__row' },
        h('span', {}, `${n} ★`), h('span', { class: 'rating-bars__track' }, bar), h('span', { class: 'tabular' }, summary.distribution[n]));
    })));
}

/** Карточка отзыва. withProduct — показать товар (лента на странице «Отзывы»). */
export function reviewCard(review, { withProduct = false, actions = null } = {}) {
  const initial = review.user?.name?.trim()[0]?.toUpperCase() ?? '•';
  return h('article', { class: 'review-card' },
    h('header', { class: 'review-card__head' },
      h('span', { class: 'avatar review-card__avatar', 'aria-hidden': 'true' }, initial),
      h('div', {},
        h('div', { class: 'review-card__name' }, review.user?.name ?? 'Покупатель'),
        h('div', { class: 'review-card__meta' }, fmt.date(review.createdAt), h('span', { class: 'review-card__verified' }, 'Проверенная покупка'))),
      stars(review.rating)),
    h('p', { class: 'review-card__text' }, review.text),
    withProduct && review.product
      ? h('a', { class: 'review-card__product', href: `/product?id=${review.product.id}` },
        cover(review.product), h('span', {}, review.product.name))
      : null,
    actions);
}

export function productCard(product, index = 0) {
  const media = cover(product);
  const badge = saleBadge(product);
  if (badge) media.append(badge);
  const card = h('a', { class: 'card', href: `/product?id=${product.id}` },
    media,
    h('div', { class: 'card__body' },
      product.category ? h('span', { class: 'card__cat' }, product.category.name) : null,
      h('span', { class: 'card__title' }, product.name),
      product.reviewsCount > 0
        ? h('span', { class: 'card__rating' }, '★ ', formatRating(product.ratingAvg), h('span', { class: 'muted' }, ` · ${product.reviewsCount}`))
        : null,
      h('div', { class: 'card__row' },
        h('span', { class: 'card__dev' }, product.developer ?? ''),
        h('span', { class: 'card__price' }, priceTag(product)))));
  card.style.setProperty('--i', Math.min(index, 12));
  return card;
}

export function pager({ page, totalPages }, onChange) {
  if (totalPages <= 1) return h('div');
  const nav = h('nav', { class: 'pager', 'aria-label': 'Страницы' });
  const btn = (label, target, { current = false, disabled = false, aria } = {}) =>
    h('button', {
      class: 'pager__btn',
      type: 'button',
      disabled,
      'aria-current': current ? 'page' : null,
      'aria-label': aria,
      onclick: () => onChange(target),
    }, label);

  nav.append(btn(icon('left', { size: 16 }), page - 1, { disabled: page <= 1, aria: 'Предыдущая' }));
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  let prev = 0;
  for (const p of [...pages].sort((a, b) => a - b)) {
    if (p - prev > 1) nav.append(h('span', { class: 'muted', 'aria-hidden': 'true' }, '…'));
    nav.append(btn(String(p), p, { current: p === page }));
    prev = p;
  }
  nav.append(btn(icon('right', { size: 16 }), page + 1, { disabled: page >= totalPages, aria: 'Следующая' }));
  return nav;
}

/* ───────────── Тосты ───────────── */
let toastRoot;
export function toast(message, { type = 'ok', duration = 3600 } = {}) {
  if (!toastRoot) {
    toastRoot = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRoot);
  }
  const el = h('div', { class: `toast toast--${type}` }, h('span', { class: 'toast__dot' }), h('span', {}, message));
  toastRoot.append(el);
  setTimeout(() => {
    el.dataset.leaving = '';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, duration);
}

export function toastError(err) {
  toast(err?.message ?? 'Что-то пошло не так', { type: 'error', duration: 5000 });
}

/* ───────────── Кнопка с состоянием загрузки ───────────── */
export async function withBusy(button, fn) {
  if (!button) return fn();
  const original = [...button.childNodes];
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ...original.filter((n) => n.nodeType === 3));
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.replaceChildren(...original);
  }
}

/* ───────────── Появление секций при прокрутке ───────────── */
export function observeReveal(root = document) {
  const items = root.querySelectorAll('.reveal:not([data-visible])');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => { el.dataset.visible = ''; });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.dataset.visible = '';
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  items.forEach((el) => io.observe(el));
}

/* ───────────── Ошибки полей формы ───────────── */
export function clearFieldErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field__error').forEach((el) => { el.textContent = ''; });
}

export function showFieldErrors(form, details = []) {
  let shown = false;
  for (const { field, message } of details) {
    const input = form.elements.namedItem(field.split('.')[0]);
    if (!input || !(input instanceof Element)) continue;
    input.setAttribute('aria-invalid', 'true');
    const error = input.closest('.field')?.querySelector('.field__error');
    if (error && !error.textContent) error.textContent = message;
    shown = true;
  }
  return shown;
}

export const params = () => new URLSearchParams(window.location.search);

/** Эквалайзер из N полос со случайными, но стабильными параметрами анимации. */
export function equalizer(count = 64) {
  const eq = h('div', { class: 'eq', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const envelope = 0.35 + 0.65 * Math.sin(Math.PI * t) ** 0.8;
    const bar = h('i');
    bar.style.setProperty('--h', (0.18 + Math.random() * 0.8 * envelope).toFixed(3));
    bar.style.setProperty('--h2', (0.08 + Math.random() * 0.55 * envelope).toFixed(3));
    bar.style.setProperty('--d', `${(1.1 + Math.random() * 1.6).toFixed(2)}s`);
    bar.style.setProperty('--o', `${(-Math.random() * 3).toFixed(2)}s`);
    eq.append(bar);
  }
  return eq;
}
