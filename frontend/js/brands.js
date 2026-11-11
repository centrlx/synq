import { api } from './api.js';
import { initPage } from './layout.js';
import { emptyState, fmt, h, toastError } from './ui.js';

/** Буква раздела: латиница/кириллица — сама буква, цифры и прочее — «0–9». */
const letterOf = (name) => {
  const ch = name.trim()[0]?.toUpperCase() ?? '#';
  return /[A-ZА-ЯЁ]/.test(ch) ? ch : '0–9';
};

const catalogUrl = (name) => `/catalog?developer=${encodeURIComponent(name)}`;
const countLabel = (n) => fmt.count(n, ['товар', 'товара', 'товаров']);

/** Веер из обложек товаров бренда; без обложек — монограмма. */
function fan(brand) {
  if (!brand.images.length) {
    return h('div', { class: 'brand-fan brand-fan--empty', 'aria-hidden': 'true' },
      h('span', {}, brand.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()));
  }
  return h('div', { class: `brand-fan brand-fan--${brand.images.length}`, 'aria-hidden': 'true' },
    brand.images.map((src) => h('img', { src, alt: '', loading: 'lazy', decoding: 'async' })));
}

function brandCard(brand, { large = false } = {}) {
  return h('a', { class: `brand-card${large ? ' brand-card--lg' : ''}`, href: catalogUrl(brand.name), 'data-name': brand.name.toLowerCase() },
    fan(brand),
    h('div', { class: 'brand-card__body' },
      h('span', { class: 'brand-card__name' }, brand.name),
      h('span', { class: 'brand-card__count' }, countLabel(brand.productsCount))));
}

async function init() {
  await initPage({ active: 'brands' });
  const list = document.getElementById('brands-list');
  const search = document.getElementById('brand-search');
  const alphabet = document.getElementById('alphabet');
  const toolbar = document.getElementById('toolbar');

  // Тень под липкой панелью — только когда она прилипла
  const sentinel = h('div', { 'aria-hidden': 'true' });
  toolbar.before(sentinel);
  new IntersectionObserver(([e]) => { toolbar.dataset.stuck = String(!e.isIntersecting); }, { rootMargin: '-57px 0px 0px 0px' }).observe(sentinel);

  list.replaceChildren(h('div', { class: 'brands-grid' },
    Array.from({ length: 12 }, () => h('div', { class: 'skeleton', style: { height: '180px', borderRadius: '20px' } }))));

  let brands;
  try {
    brands = (await api.brands()).data;
  } catch (err) {
    toastError(err);
    list.replaceChildren(emptyState({ title: 'Не удалось загрузить бренды', text: err.message }));
    return;
  }

  if (brands.length === 0) {
    list.replaceChildren(emptyState({ title: 'Брендов пока нет', text: 'Бренды появятся, когда в каталоге будут товары с указанным разработчиком.' }));
    alphabet.hidden = true;
    return;
  }

  const total = brands.reduce((s, b) => s + b.productsCount, 0);
  document.getElementById('brands-sub').textContent =
    `${fmt.count(brands.length, ['разработчик', 'разработчика', 'разработчиков'])} и ${countLabel(total)} в каталоге.`;

  // Крупные карточки для брендов с наибольшим числом товаров
  const featured = [...brands].sort((a, b) => b.productsCount - a.productsCount).slice(0, 4);
  document.getElementById('featured-grid').replaceChildren(...featured.map((b) => brandCard(b, { large: true })));
  document.getElementById('featured').hidden = false;

  // Секции по буквам
  const groups = new Map();
  for (const b of brands) {
    const key = letterOf(b.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const letters = [...groups.keys()].sort((a, b) => {
    const rank = (x) => (x === '0–9' ? 2 : /[А-ЯЁ]/.test(x) ? 1 : 0);
    return rank(a) - rank(b) || a.localeCompare(b, 'ru');
  });

  const sections = letters.map((letter) => h('section', { class: 'brands-section', id: `letter-${letter}`, 'data-letter': letter },
    h('h2', { class: 'brands-section__letter' }, letter),
    h('div', { class: 'brands-grid' }, groups.get(letter).map((b) => brandCard(b)))));
  const empty = emptyState({ title: 'Ничего не найдено', text: 'Попробуйте другое название бренда.' });
  empty.hidden = true;
  list.replaceChildren(...sections, empty);

  alphabet.replaceChildren(...letters.map((letter) => h('a', { class: 'alphabet__link', href: `#letter-${letter}` }, letter)));

  // Подсветка текущей буквы при прокрутке
  const links = [...alphabet.querySelectorAll('a')];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.setAttribute('aria-current', String(a.hash === `#${e.target.id}`)));
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach((s) => io.observe(s));

  // Поиск по названию
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    for (const section of sections) {
      let shown = 0;
      for (const card of section.querySelectorAll('.brand-card')) {
        const match = !q || card.dataset.name.includes(q);
        card.hidden = !match;
        if (match) shown += 1;
      }
      section.hidden = shown === 0;
      visible += shown;
      links.find((a) => a.hash === `#${section.id}`)?.classList.toggle('alphabet__link--off', shown === 0);
    }
    empty.hidden = visible > 0;
    document.getElementById('featured').hidden = Boolean(q);
  });
}

init().catch((err) => {
  console.error(err);
  toastError(err);
});
