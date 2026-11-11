import { api } from './api.js';
import { cover, h, icon, priceTag } from './ui.js';

/**
 * Быстрый поиск в стиле Spotlight: ⌘K / Ctrl+K или «/».
 * Открывается мгновенно (без анимации) — это частое действие с клавиатуры.
 */
let dialog;
let input;
let list;
let hint;
let results = [];
let active = 0;
let requestId = 0;
let debounce;

function setActive(index) {
  const items = list.querySelectorAll('.spotlight__item');
  if (!items.length) return;
  active = (index + items.length) % items.length;
  items.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
  items[active].scrollIntoView({ block: 'nearest' });
}

function renderResults(products, heading) {
  results = products;
  active = 0;
  if (!products.length) {
    list.replaceChildren(h('li', { class: 'spotlight__empty' }, 'Ничего не найдено. Попробуйте название плагина или разработчика.'));
    return;
  }
  list.replaceChildren(
    // replaceChildren() выводит null как текст — заголовок добавляем только если он есть
    ...(heading ? [h('li', { class: 'spotlight__heading', role: 'presentation' }, heading)] : []),
    ...products.map((p, i) => h('li', {
      class: 'spotlight__item', role: 'option', id: `spot-${i}`, 'aria-selected': String(i === 0),
      onmousemove: () => setActive(i),
      onclick: () => go(p),
    }, cover(p), h('span', { class: 'spotlight__text' },
      h('span', { class: 'spotlight__name' }, p.name),
      h('span', { class: 'spotlight__sub' }, [p.developer, p.category?.name].filter(Boolean).join(' · '))), priceTag(p))),
  );
}

function go(product) {
  window.location.href = `/product?id=${product.id}`;
}

async function search(query) {
  const id = (requestId += 1);
  try {
    if (!query) {
      const { data } = await api.popular(6);
      if (id !== requestId) return;
      if (data.length) renderResults(data, 'Популярное');
      else list.replaceChildren(h('li', { class: 'spotlight__empty' }, 'Начните вводить название товара или разработчика.'));
      return;
    }
    const { data, meta } = await api.products({ search: query, limit: 8 });
    if (id !== requestId) return;
    renderResults(data);
    hint.textContent = meta.total > data.length ? `Показано ${data.length} из ${meta.total} · Enter — открыть` : '↑↓ — выбор · Enter — открыть · Esc — закрыть';
  } catch {
    if (id === requestId) list.replaceChildren(h('li', { class: 'spotlight__empty' }, 'Поиск временно недоступен.'));
  }
}

function build() {
  input = h('input', {
    class: 'spotlight__input', type: 'search', placeholder: 'Поиск плагинов, DAW и подписок',
    'aria-label': 'Поиск по каталогу', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'spotlight-list', autocomplete: 'off',
  });
  list = h('ul', { class: 'spotlight__list', id: 'spotlight-list', role: 'listbox' });
  hint = h('p', { class: 'spotlight__hint' }, '↑↓ — выбор · Enter — открыть · Esc — закрыть');
  const allLink = h('a', { class: 'spotlight__all', href: '/catalog' }, 'Весь каталог', icon('arrow', { size: 14 }));

  dialog = h('dialog', { class: 'spotlight', 'aria-label': 'Поиск' },
    h('div', { class: 'spotlight__bar' }, icon('search', { size: 20 }), input, h('kbd', {}, 'esc')),
    list,
    h('div', { class: 'spotlight__foot' }, hint, allLink));
  document.body.append(dialog);

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    allLink.href = q ? `/catalog?search=${encodeURIComponent(q)}` : '/catalog';
    debounce = setTimeout(() => search(q), 160);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) go(results[active]);
      else if (input.value.trim()) window.location.href = `/catalog?search=${encodeURIComponent(input.value.trim())}`;
    }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}

export function openSpotlight() {
  if (!dialog) build();
  if (dialog.open) return;
  input.value = '';
  dialog.showModal();
  input.focus();
  search('');
}

/** Глобальные сочетания клавиш: ⌘K / Ctrl+K всегда, «/» — вне полей ввода. */
export function bindSpotlightShortcuts() {
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSpotlight();
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      openSpotlight();
    }
  });
}
