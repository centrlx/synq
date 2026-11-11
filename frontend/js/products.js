import { api } from './api.js';
import { downloadOrder } from './actions.js';
import { openCheckout } from './checkout.js';
import { initPage, loginUrl } from './layout.js';
import {
  cover, emptyState, fmt, formatRating, h, icon, observeReveal, pager, params, priceTag, productCard, ratingSummary, reviewCard, stars,
  saleBadge, skeletonGrid, statusBadge, toast, toastError, withBusy,
} from './ui.js';

const page = document.body.dataset.page;

/* ═════════════════════════ Главная ═════════════════════════ */
async function home() {
  const user = await initPage({ active: 'home', tone: 'dark' });

  // Заголовок «материализуется» по словам — один раз, при первом визите на главную
  const title = document.getElementById('hero-title');
  const words = title.textContent.split(/\s+/);
  title.replaceChildren(...words.flatMap((word, i) => {
    const span = h('span', { class: 'word' }, word);
    span.style.setProperty('--w', i);
    return i < words.length - 1 ? [span, ' '] : [span];
  }));
  heroWall();

  const latestRoot = document.getElementById('latest');
  latestRoot.replaceChildren(...skeletonGrid(4));

  const [categoriesRes, productsRes] = await Promise.allSettled([
    api.categories(),
    api.products({ limit: 8, sort: 'newest' }),
  ]);

  // Реальные счётчики каталога
  const stats = document.getElementById('hero-stats');
  if (categoriesRes.status === 'fulfilled' && productsRes.status === 'fulfilled') {
    const total = productsRes.value.meta.total;
    const cats = categoriesRes.value.data.length;
    stats.replaceChildren(
      total > 0
        ? h('div', {}, h('strong', {}, total), fmt.plural(total, ['товар в каталоге', 'товара в каталоге', 'товаров в каталоге']))
        : h('div', {}, h('strong', {}, 'Скоро'), 'Каталог готовится к запуску'),
      h('div', {}, h('strong', {}, cats), fmt.plural(cats, ['категория', 'категории', 'категорий'])),
    );
  }

  renderCategoryRail(categoriesRes, user);
  renderPopular();
  renderLatest(productsRes, latestRoot, user);
  observeReveal();
}

/**
 * Оформление основных разделов каталога: коллаж иллюстраций для каждой категории.
 * Позиция (--x/--rx/--y/--by), ширина (--w), поворот (--r) и слой (--z) — в процентах от плитки.
 */
const A = '/assets/categories/';
// Координаты — в процентах от блока коллажа (.bento__art), а не от всей плитки:
// блок масштабируется по высоте плитки, поэтому композиция сохраняется на любой ширине.
/* ═════════════ Hero: «живая стена» из обложек товаров ═════════════ */
const WALL_TILES = 9;
const WALL_INTERVAL = 1900;

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const preload = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => (img.decode ? img.decode().catch(() => {}).then(resolve) : resolve());
  img.onerror = resolve;
  img.src = src;
});

async function heroWall() {
  const wall = document.getElementById('hero-wall');
  let pool;
  try {
    // Случайная страница каталога — каждый визит стена собирается из разных товаров
    const first = await api.products({ limit: 1 });
    const pages = Math.max(1, Math.floor(first.meta.total / 60));
    const { data } = await api.products({ limit: 60, page: 1 + Math.floor(Math.random() * pages) });
    pool = shuffle(data.filter((p) => p.imageUrl));
  } catch {
    return; // стена — украшение: без неё hero остаётся одноколоночным
  }
  if (pool.length < WALL_TILES) return;

  const shown = pool.slice(0, WALL_TILES);
  let cursor = WALL_TILES;

  const tiles = shown.map((p, i) => {
    const img = h('img', { src: p.imageUrl, alt: '', decoding: 'async', class: 'is-front' });
    const tile = h('a', { class: 'wall-tile', href: `/product?id=${p.id}`, tabindex: '-1' }, img);
    tile.style.setProperty('--i', i);
    return tile;
  });
  wall.replaceChildren(...tiles);
  wall.hidden = false;
  document.querySelector('.hero__inner').classList.add('hero__inner--wall');

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Плитки по очереди сменяют товар: следующая обложка предзагружается, затем плавно проявляется
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(wall);
  const recent = [];

  async function swap() {
    if (visible && !document.hidden) {
      const candidates = tiles.map((_, i) => i).filter((i) => !recent.includes(i));
      const index = candidates[Math.floor(Math.random() * candidates.length)];
      recent.push(index);
      if (recent.length > 4) recent.shift();

      const next = pool[cursor % pool.length];
      cursor += 1;
      await preload(next.imageUrl);

      const tile = tiles[index];
      const old = tile.querySelector('img.is-front');
      const img = h('img', { src: next.imageUrl, alt: '', decoding: 'async' });
      tile.append(img);
      tile.href = `/product?id=${next.id}`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.classList.add('is-front');
        old?.classList.remove('is-front');
        setTimeout(() => old?.remove(), 1100);
      }));
    }
    setTimeout(swap, WALL_INTERVAL);
  }
  setTimeout(swap, 2400);
}

const CATEGORY_ART = {
  plugins: [
    { src: 'plug-glue.webp', rx: '2%', y: '0%', w: '30%', r: '8deg', z: 1 },
    { src: 'plug-diva.webp', x: '0%', by: '10%', w: '62%', r: '-9deg', z: 1 },
    { src: 'plug-proq.webp', rx: '-4%', by: '6%', w: '58%', r: '6deg', z: 2 },
    { src: 'plug-serum.webp', x: '16%', by: '-4%', w: '64%', r: '-1deg', z: 3 },
  ],
  daw: [
    { src: 'daw-ableton.webp', rx: '6%', y: '10%', w: '17%', r: '0deg', z: 4 },
    { src: 'daw-screen.webp', x: '0%', by: '0%', w: '64%', r: '-5deg', z: 1 },
    { src: 'daw-fl.webp', rx: '25%', by: '2%', w: '25%', r: '-7deg', z: 3 },
    { src: 'daw-fender.webp', rx: '0%', by: '-2%', w: '28%', r: '8deg', z: 2 },
  ],
  subscriptions: [
    { src: 'sub-star.webp', x: '-2%', by: '0%', w: '50%', r: '-12deg', z: 1 },
    { src: 'sub-logo-blue.webp', rx: '-2%', by: '0%', w: '50%', r: '10deg', z: 1 },
    { src: 'sub-splice.webp', x: '35%', by: '8%', w: '31%', r: '-2deg', z: 2 },
  ],
};
const CATEGORY_ORDER = ['plugins', 'daw', 'subscriptions'];

function artFor(slug) {
  const items = CATEGORY_ART[slug];
  if (!items) return null;
  return h('div', { class: 'bento__art', 'aria-hidden': 'true' }, items.map((it) => {
    const img = h('img', { src: A + it.src, alt: '', loading: 'lazy', decoding: 'async' });
    for (const [key, prop] of [['x', '--x'], ['rx', '--rx'], ['y', '--y'], ['by', '--by'], ['w', '--w'], ['r', '--r'], ['z', '--z']]) {
      if (it[key] !== undefined) img.style.setProperty(prop, String(it[key]));
    }
    return img;
  }));
}

function renderCategoryRail(result, user) {
  const root = document.getElementById('categories-rail');
  if (result.status === 'rejected') {
    root.replaceChildren(emptyState({ title: 'Не удалось загрузить категории', text: result.reason.message }));
    return;
  }
  const categories = [...result.value.data].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.slug);
    const ib = CATEGORY_ORDER.indexOf(b.slug);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  if (categories.length === 0) {
    root.replaceChildren(emptyState({
      title: 'Категории ещё не добавлены',
      text: 'Как только администратор создаст первые категории, они появятся здесь.',
      action: user?.role === 'ADMIN' ? h('a', { class: 'btn', href: '/admin#categories' }, 'Добавить категорию') : null,
    }));
    return;
  }

  root.replaceChildren(h('div', { class: 'bento stagger' },
    categories.map((c, i) => {
      const known = CATEGORY_ART[c.slug] ? ` bento-tile--${c.slug}` : '';
      const tile = h('a', { class: `bento-tile${known}`, href: `/catalog?category=${encodeURIComponent(c.slug)}` },
        h('h3', { class: 'bento__title' }, c.name),
        c.description ? h('p', { class: 'bento__desc' }, c.description) : null,
        artFor(c.slug));
      tile.style.setProperty('--i', i);
      return tile;
    })));
}

/** Чарт «Самое популярное»: реальный рейтинг по покупкам и просмотрам. */
async function renderPopular() {
  let items;
  try {
    items = (await api.popular(8)).data;
  } catch {
    return;
  }
  if (!items.length) return; // ни покупок, ни просмотров — раздел не показываем

  const chart = document.getElementById('popular-chart');
  chart.replaceChildren(...items.map((p, i) => {
    const row = h('li', {},
      h('a', { class: 'chart__row', href: `/product?id=${p.id}` },
        h('span', { class: 'chart__rank', 'aria-label': `${i + 1} место` }, String(i + 1)),
        cover(p),
        h('span', { class: 'chart__info' },
          h('span', { class: 'chart__name' }, p.name),
          h('span', { class: 'chart__meta' },
            p.developer ?? '',
            p.reviewsCount > 0 ? h('span', { class: 'chart__rating' }, ` · ★ ${formatRating(p.ratingAvg)}`) : null,
            p.salesCount > 0 ? h('span', {}, ` · ${fmt.count(p.salesCount, ['покупка', 'покупки', 'покупок'])}`) : null)),
        h('span', { class: 'chart__price' }, priceTag(p))));
    row.style.setProperty('--i', i);
    return row;
  }));
  chart.classList.add('stagger');
  document.getElementById('popular').hidden = false;
  observeReveal();
}

function renderLatest(result, root, user) {
  if (result.status === 'rejected') {
    root.replaceChildren(emptyState({ title: 'Не удалось загрузить товары', text: result.reason.message }));
    root.style.display = 'block';
    return;
  }
  const items = result.value.data;
  if (items.length === 0) {
    root.style.display = 'block';
    document.getElementById('all-link').hidden = true;
    root.replaceChildren(emptyState({
      title: 'Товаров пока нет',
      text: 'Каталог наполняется администратором магазина. Загляните чуть позже.',
      action: user?.role === 'ADMIN' ? h('a', { class: 'btn', href: '/admin#products' }, 'Добавить товар') : null,
    }));
    return;
  }
  root.classList.add('stagger');
  root.replaceChildren(...items.map(productCard));
  document.getElementById('all-link').append(icon('arrow'));
}

/* ═════════════════════════ Каталог ═════════════════════════ */
async function catalog() {
  await initPage({ active: 'catalog' });

  const form = document.getElementById('filters');
  const results = document.getElementById('results');
  const pagerRoot = document.getElementById('pager');
  const countEl = document.getElementById('catalog-count');
  const chipsRoot = document.getElementById('category-chips');
  const toolbar = document.getElementById('toolbar');

  const q = params();
  const state = {
    search: q.get('search') ?? '',
    category: q.get('category') ?? '',
    platform: q.get('platform') ?? '',
    sort: q.get('sort') ?? 'newest',
    onSale: q.get('onSale') === 'true' ? 'true' : '',
    developer: q.get('developer') ?? '',
    page: Number(q.get('page')) || 1,
  };
  form.search.value = state.search;
  form.platform.value = state.platform;
  form.sort.value = state.sort;

  // Тень под липкой панелью — только когда она реально прилипла
  const sentinel = h('div', { 'aria-hidden': 'true' });
  toolbar.before(sentinel);
  new IntersectionObserver(([e]) => { toolbar.dataset.stuck = String(!e.isIntersecting); }, { rootMargin: '-57px 0px 0px 0px' }).observe(sentinel);

  if (window.location.hash === '#search') form.search.focus();

  let categories = [];
  try {
    categories = (await api.categories()).data;
  } catch (err) {
    toastError(err);
  }

  const renderChips = () => {
    const chip = (label, value, count) => h('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(state.category === value),
      onclick: () => {
        state.category = value;
        state.page = 1;
        renderChips();
        load();
      },
    }, label, count !== undefined ? h('span', { class: 'chip__count' }, count) : null);
    // Активный фильтр по бренду — отдельный чип с крестиком
    const brandChip = state.developer
      ? h('button', {
        class: 'chip', type: 'button', 'aria-pressed': 'true', 'aria-label': `Сбросить бренд ${state.developer}`,
        onclick: () => { state.developer = ''; state.page = 1; renderChips(); load(); },
      }, state.developer, icon('x', { size: 14 }))
      : null;
    chipsRoot.replaceChildren(...(brandChip ? [brandChip] : []), chip('Все', ''), ...categories.map((c) => chip(c.name, c.slug, c.productsCount)));
  };
  renderChips();

  const hasFilters = () => Boolean(state.search || state.category || state.platform || state.onSale || state.developer);

  // Переключатель «Со скидкой»
  const saleToggle = document.getElementById('sale-toggle');
  saleToggle.setAttribute('aria-pressed', String(state.onSale === 'true'));
  saleToggle.addEventListener('click', () => {
    state.onSale = state.onSale ? '' : 'true';
    saleToggle.setAttribute('aria-pressed', String(Boolean(state.onSale)));
    state.page = 1;
    load();
  });
  let requestId = 0;

  async function load({ scroll = false } = {}) {
    const id = (requestId += 1);
    const query = { ...state, limit: 12 };
    const url = new URLSearchParams(Object.entries(state).filter(([k, v]) => v && !(k === 'sort' && v === 'newest') && !(k === 'page' && v === 1)));
    history.replaceState(null, '', `/catalog${url.toString() ? `?${url}` : ''}`);

    results.style.display = '';
    results.classList.remove('stagger');
    results.replaceChildren(...skeletonGrid(8));
    results.setAttribute('aria-busy', 'true');

    try {
      const { data, meta } = await api.products(query);
      if (id !== requestId) return; // устаревший ответ
      results.removeAttribute('aria-busy');
      countEl.textContent = fmt.count(meta.total, ['товар', 'товара', 'товаров']);

      const activeCat = categories.find((c) => c.slug === state.category);
      document.getElementById('catalog-sub').textContent = state.developer
        ? `Товары ${state.developer}${activeCat ? ` в разделе «${activeCat.name}»` : ''}.`
        : activeCat?.description || activeCat?.name || 'VST-плагины, DAW и подписки для музыкантов.';

      if (data.length === 0) {
        results.style.display = 'block';
        results.replaceChildren(hasFilters()
          ? emptyState({
            title: 'Ничего не найдено',
            text: 'Попробуйте изменить запрос или сбросить фильтры.',
            action: h('button', {
              class: 'btn btn--ghost',
              type: 'button',
              onclick: () => {
                Object.assign(state, { search: '', category: '', platform: '', onSale: '', developer: '', page: 1 });
                form.search.value = '';
                form.platform.value = '';
                saleToggle.setAttribute('aria-pressed', 'false');
                renderChips();
                load();
              },
            }, 'Сбросить фильтры'),
          })
          : emptyState({ title: 'Товаров пока нет', text: 'Каталог наполняется администратором магазина. Загляните чуть позже.' }));
        pagerRoot.replaceChildren();
        return;
      }

      results.classList.add('stagger');
      results.replaceChildren(...data.map(productCard));
      pagerRoot.replaceChildren(pager(meta, (p) => {
        state.page = p;
        load({ scroll: true });
      }));
      if (scroll) toolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      if (id !== requestId) return;
      results.style.display = 'block';
      results.replaceChildren(emptyState({ title: 'Не удалось загрузить каталог', text: err.message }));
      countEl.textContent = '';
    }
  }

  let debounce;
  form.search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.search = form.search.value.trim();
      state.page = 1;
      load();
    }, 250);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', (e) => {
    if (e.target.name === 'platform' || e.target.name === 'sort') {
      state[e.target.name] = e.target.value;
      state.page = 1;
      load();
    }
  });

  load();
}

/* ═════════════════════════ Страница товара ═════════════════════════ */
async function productPage() {
  const user = await initPage({ active: 'catalog' });
  const root = document.getElementById('product-root');
  const crumbs = document.getElementById('crumbs');
  const id = params().get('id');

  const notFound = (text) => {
    crumbs.replaceChildren();
    root.replaceChildren(h('div', { style: { paddingBlock: '4rem' } },
      emptyState({ title: 'Товар не найден', text, action: h('a', { class: 'btn', href: '/catalog' }, 'Вернуться в каталог') })));
  };

  if (!id) return notFound('В ссылке не указан идентификатор товара.');

  root.replaceChildren(h('div', { class: 'pdp', 'aria-busy': 'true' },
    h('div', { class: 'skeleton skeleton--cover' }),
    h('div', { class: 'pdp__info' },
      h('div', { class: 'skeleton skeleton--line', style: { width: '30%' } }),
      h('div', { class: 'skeleton', style: { height: '64px', width: '80%' } }),
      h('div', { class: 'skeleton', style: { height: '160px' } }))));

  let product;
  try {
    product = (await api.product(id)).data;
  } catch (err) {
    return notFound(err.status === 404 || err.status === 400 ? 'Возможно, он снят с продажи или ссылка устарела.' : err.message);
  }

  document.title = `${product.name} — SYNQ`;
  crumbs.replaceChildren(
    h('a', { href: '/catalog' }, 'Каталог'), h('span', { 'aria-hidden': 'true' }, '/'),
    h('a', { href: `/catalog?category=${encodeURIComponent(product.category.slug)}` }, product.category.name),
    h('span', { 'aria-hidden': 'true' }, '/'),
    h('span', { 'aria-current': 'page' }, product.name));

  const buyBox = h('div', { class: 'pdp__buy' });

  const specRow = (label, value) => (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    ? null
    : h('div', { class: 'specs__row' }, h('dt', {}, label), h('dd', {}, value)));

  root.replaceChildren(h('div', { class: 'pdp' },
    h('div', { class: 'pdp__media' }, (() => { const c = cover(product, { eager: true }); const b = saleBadge(product); if (b) c.append(b); return c; })()),
    h('div', { class: 'pdp__info stagger' },
      h('div', {},
        h('a', { class: 'eyebrow', href: `/catalog?category=${encodeURIComponent(product.category.slug)}` }, product.category.name),
        h('h1', { class: 'pdp__title', style: { marginTop: '10px' } }, product.name),
        product.developer
          ? h('p', { class: 'pdp__dev' }, h('a', { class: 'link-arrow', href: `/catalog?developer=${encodeURIComponent(product.developer)}` }, product.developer, icon('arrow')))
          : null,
        product.reviewsCount > 0
          ? h('a', { class: 'pdp__rating', href: '#reviews' }, stars(product.ratingAvg), h('span', {}, formatRating(product.ratingAvg)),
            h('span', { class: 'muted' }, fmt.count(product.reviewsCount, ['отзыв', 'отзыва', 'отзывов'])))
          : null,
        !product.isActive ? h('p', { style: { marginTop: '12px' } }, h('span', { class: 'badge badge--warn' }, 'В архиве — виден только администратору')) : null),
      buyBox,
      h('dl', { class: 'specs' },
        specRow('Разработчик', product.developer),
        specRow('Версия', product.version),
        specRow('Форматы', product.formats.map((f) => h('span', { class: 'tag' }, f))),
        specRow('Платформы', product.platforms.map((p) => h('span', { class: 'tag' }, p))),
        specRow('Лицензии', product.stock === null ? 'Без ограничений' : fmt.count(product.stock, ['лицензия доступна', 'лицензии доступны', 'лицензий доступно'])),
        /\.txt$/i.test(product.fileName ?? '')
          ? specRow('Формат выдачи', 'Лицензионный ключ')
          : specRow('Размер загрузки', product.fileSize ? fmt.bytes(product.fileSize) : null),
        specRow('Добавлен', fmt.date(product.createdAt))),
      h('div', {},
        h('h2', { class: 'eyebrow', style: { marginBottom: '12px' } }, 'Описание'),
        h('p', { class: 'pdp__desc' }, product.description)))));

  renderBuyBox(buyBox, product, user);

  // Просмотр засчитывается один раз за сессию браузера
  try {
    const key = `synq.viewed.${product.id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      api.registerView(product.id).catch(() => {});
    }
  } catch {
    /* sessionStorage недоступен — просмотр не учитываем */
  }

  const reviewsSection = h('section', { class: 'pdp-section', id: 'reviews', 'aria-labelledby': 'reviews-title' });
  const similarSection = h('section', { class: 'pdp-section', 'aria-labelledby': 'similar-title', hidden: true });
  root.append(reviewsSection, similarSection);
  renderReviews(reviewsSection, product, user);
  renderSimilar(similarSection, product);
}

/* ── Отзывы на странице товара ── */
function starInput(name, value = 0) {
  const group = h('fieldset', { class: 'star-input' }, h('legend', { class: 'visually-hidden' }, 'Оценка'));
  for (let n = 5; n >= 1; n -= 1) {
    const id = `${name}-${n}`;
    group.append(
      h('input', { type: 'radio', name, id, value: String(n), checked: n === value, required: true }),
      h('label', { for: id, title: fmt.count(n, ['звезда', 'звезды', 'звёзд']) }, h('span', { class: 'visually-hidden' }, `${n} из 5`), '★'));
  }
  return group;
}

function reviewForm(product, { review, onDone }) {
  const alert = h('div', { class: 'form-alert', role: 'alert', hidden: true });
  const text = h('textarea', { class: 'textarea', name: 'text', maxlength: '2000', placeholder: 'Что понравилось, что можно улучшить, как используете в работе?' });
  text.value = review?.text ?? '';
  const submit = h('button', { class: 'btn', type: 'submit' }, review ? 'Сохранить отзыв' : 'Опубликовать отзыв');
  const form = h('form', { class: 'review-form', novalidate: true },
    h('h3', { class: 'review-form__title' }, review ? 'Изменить отзыв' : 'Оцените покупку'),
    starInput('rating', review?.rating ?? 0),
    alert, text,
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, submit,
      review ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => onDone() }, 'Отмена') : null));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alert.hidden = true;
    const rating = Number(form.querySelector('input[name="rating"]:checked')?.value);
    if (!rating) { alert.textContent = 'Поставьте оценку от 1 до 5'; alert.hidden = false; return; }
    if (text.value.trim().length < 10) { alert.textContent = 'Напишите хотя бы пару предложений — от 10 символов'; alert.hidden = false; return; }
    withBusy(submit, async () => {
      try {
        if (review) await api.updateReview(review.id, { rating, text: text.value.trim() });
        else await api.createReview(product.id, { rating, text: text.value.trim() });
        toast(review ? 'Отзыв обновлён' : 'Спасибо! Отзыв опубликован');
        onDone();
      } catch (err) {
        alert.textContent = err.message;
        alert.hidden = false;
      }
    });
  });
  return form;
}

async function renderReviews(section, product, user) {
  const state = { page: 1, items: [], editing: false };
  const listRoot = h('div', { class: 'review-list' });
  const moreBtn = h('button', { class: 'btn btn--ghost', type: 'button', hidden: true }, 'Показать ещё');
  const formRoot = h('div');
  const summaryRoot = h('div');

  section.replaceChildren(
    h('div', { class: 'pdp-section__head' }, h('h2', { class: 'section__title', id: 'reviews-title' }, 'Отзывы')),
    h('div', { class: 'reviews-layout' },
      h('div', { class: 'reviews-layout__side' }, summaryRoot, formRoot),
      h('div', {}, listRoot, h('div', { class: 'review-more' }, moreBtn))));

  async function renderForm() {
    if (!user) {
      formRoot.replaceChildren(h('p', { class: 'notice' }, h('a', { class: 'link-underline', href: loginUrl() }, 'Войдите'), ', чтобы оставить отзыв после покупки.'));
      return;
    }
    let mine;
    try {
      mine = (await api.myReview(product.id)).data;
    } catch {
      formRoot.replaceChildren();
      return;
    }
    if (mine.review && !state.editing) {
      formRoot.replaceChildren(h('div', { class: 'review-own' },
        h('p', { class: 'eyebrow' }, 'Ваш отзыв'),
        reviewCard(mine.review, {
          actions: h('div', { class: 'review-card__actions' },
            h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => { state.editing = mine.review; renderForm(); } }, 'Изменить'),
            h('button', {
              class: 'btn btn--sm btn--danger', type: 'button',
              onclick: async (e) => {
                await withBusy(e.currentTarget, async () => {
                  try {
                    await api.deleteReview(mine.review.id);
                    toast('Отзыв удалён');
                    reload();
                  } catch (err) { toastError(err); }
                });
              },
            }, 'Удалить')),
        })));
      return;
    }
    if (state.editing || mine.canReview) {
      formRoot.replaceChildren(reviewForm(product, { review: state.editing || null, onDone: () => { state.editing = false; reload(); } }));
      return;
    }
    formRoot.replaceChildren(h('p', { class: 'notice' }, 'Отзыв можно оставить после покупки товара — так все отзывы на SYNQ подтверждены покупкой.'));
  }

  async function loadPage() {
    const { data, meta } = await api.productReviews(product.id, { page: state.page, limit: 6 });
    state.items.push(...data.items);
    summaryRoot.replaceChildren(data.summary.count ? ratingSummary(data.summary) : h('div', { class: 'rating-summary rating-summary--empty' },
      h('p', { class: 'rating-summary__value' }, '—'), h('p', { class: 'muted' }, 'Отзывов пока нет. Станьте первым, кто поделится впечатлениями.')));
    listRoot.replaceChildren(...(state.items.length
      ? state.items.map((r) => reviewCard(r))
      : [emptyState({ title: 'Отзывов пока нет', text: 'Здесь появятся впечатления покупателей.' })]));
    moreBtn.hidden = meta.page >= meta.totalPages;
  }

  async function reload() {
    state.page = 1;
    state.items = [];
    await Promise.all([loadPage(), renderForm()]);
  }

  moreBtn.addEventListener('click', () => withBusy(moreBtn, async () => { state.page += 1; await loadPage(); }));
  reload().catch((err) => listRoot.replaceChildren(emptyState({ title: 'Не удалось загрузить отзывы', text: err.message })));
}

/** «Похожие товары»: та же категория, сначала от того же разработчика. */
async function renderSimilar(section, product) {
  try {
    const [same, sameDev] = await Promise.all([
      api.products({ category: product.category.slug, limit: 12 }),
      product.developer ? api.products({ developer: product.developer, limit: 6 }) : Promise.resolve({ data: [] }),
    ]);
    const seen = new Set([product.id]);
    const picks = [...sameDev.data, ...same.data].filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, 4);
    if (!picks.length) return;
    section.replaceChildren(
      h('div', { class: 'pdp-section__head' }, h('h2', { class: 'section__title', id: 'similar-title' }, 'Похожие товары')),
      h('div', { class: 'product-grid stagger' }, picks.map(productCard)));
    section.hidden = false;
  } catch {
    /* блок необязательный */
  }
}

async function renderBuyBox(box, product, user) {
  const price = h('div', { class: 'pdp__price' },
    priceTag(product, { size: 'lg' }),
    product.onSale
      ? h('p', { class: 'pdp__sale' }, `Скидка ${product.discountPercent}%${product.saleEndsAt ? ` до ${fmt.date(product.saleEndsAt)}` : ''}`)
      : null);
  // replaceChildren() выводит null как текст, поэтому необязательный элемент — массив
  const adminLink = user?.role === 'ADMIN'
    ? [h('a', { class: 'btn btn--ghost btn--block', href: `/admin#products/${product.id}` }, icon('edit', { size: 16 }), 'Редактировать в админ-панели')]
    : [];

  if (!user) {
    box.replaceChildren(price,
      h('a', { class: 'btn btn--lg btn--block', href: loginUrl() }, 'Войти, чтобы купить'),
      h('p', { class: 'pdp__note' }, 'Для оформления заказа нужен аккаунт SYNQ — так файлы будут привязаны к вам.'));
    return;
  }

  // Есть ли у пользователя активный заказ на этот товар
  let existing = null;
  try {
    const { data } = await api.myOrders({ limit: 100 });
    existing = data.find((o) => o.productId === product.id && o.status !== 'CANCELLED') ?? null;
  } catch {
    /* список заказов не критичен для отображения */
  }

  if (existing?.status === 'PAID') {
    const dl = h('button', { class: 'btn btn--lg btn--block', type: 'button', disabled: !product.hasFile }, icon('download', { size: 18 }), 'Скачать');
    dl.addEventListener('click', () => downloadOrder(existing.id, dl));
    box.replaceChildren(
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } }, price, statusBadge('PAID')),
      dl,
      h('p', { class: 'pdp__note' }, product.hasFile ? 'Ссылка на скачивание создаётся при нажатии и действует несколько минут.' : 'Продавец ещё не загрузил файл — он появится здесь автоматически.'),
      ...adminLink);
    return;
  }

  const afterPaid = () => renderBuyBox(box, product, user);

  if (existing?.status === 'PENDING') {
    const pay = h('button', { class: 'btn btn--lg btn--block', type: 'button' }, `Оплатить ${fmt.price(existing.priceAtPurchase)}`);
    pay.addEventListener('click', () => openCheckout(existing, product, afterPaid));
    box.replaceChildren(
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } }, price, statusBadge('PENDING')),
      pay,
      h('p', { class: 'pdp__note' }, 'Заказ оформлен — осталось оплатить. Цена закреплена за вами.'),
      ...adminLink);
    return;
  }

  const soldOut = product.stock === 0;
  const buy = h('button', { class: 'btn btn--lg btn--block', type: 'button', disabled: soldOut || !product.isActive },
    soldOut ? 'Лицензии закончились' : 'Оформить заказ');
  buy.addEventListener('click', () => withBusy(buy, async () => {
    try {
      const { data: order } = await api.createOrder(product.id);
      if (product.stock !== null) product.stock -= 1;
      await renderBuyBox(box, product, user);
      openCheckout(order, product, afterPaid);
    } catch (err) {
      toastError(err);
    }
  }));

  buy.textContent = soldOut ? 'Лицензии закончились' : 'Купить';
  box.replaceChildren(price, buy,
    h('p', { class: 'pdp__note' }, 'Оплата картой онлайн. Сразу после оплаты товар станет доступен для скачивания. Оформляя заказ, вы принимаете условия ',
      h('a', { href: '/offer', class: 'link-underline' }, 'публичной оферты'), '.'),
    ...adminLink);
}

/* ═════════════════════════ Маршрутизация по странице ═════════════════════════ */
const handlers = { home, catalog, product: productPage };
handlers[page]?.().catch((err) => {
  console.error(err);
  toastError(err);
});
