import { api } from './api.js';
import { initPage } from './layout.js';
import { emptyState, formatRating, h, ratingSummary, reviewCard, stars, toastError, withBusy } from './ui.js';

const state = { rating: '', sort: 'newest', page: 1, items: [] };

async function init() {
  await initPage({ active: 'reviews' });
  const overview = document.getElementById('overview');
  const feed = document.getElementById('feed');
  const more = document.getElementById('more');
  const filter = document.getElementById('rating-filter');
  const sort = document.getElementById('review-sort');

  const renderFilter = (distribution) => {
    const chip = (label, value, count) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(state.rating === value),
      onclick: () => { state.rating = value; reset(); },
    }, label, count !== undefined ? h('span', { class: 'chip__count' }, count) : null);
    filter.replaceChildren(chip('Все', ''), ...[5, 4, 3, 2, 1].map((n) => chip(`${n} ★`, String(n), distribution?.[n] ?? 0)));
  };

  async function load() {
    const { data, meta } = await api.reviews({ page: state.page, limit: 12, sort: state.sort, rating: state.rating || undefined });
    const { summary } = data;
    state.items.push(...data.items);

    if (summary.count === 0) {
      overview.replaceChildren();
      filter.replaceChildren();
      feed.replaceChildren(emptyState({
        title: 'Отзывов пока нет',
        text: 'Здесь появятся впечатления покупателей. Отзыв можно оставить на странице товара после покупки.',
        action: h('a', { class: 'btn', href: '/catalog' }, 'Открыть каталог'),
      }));
      more.hidden = true;
      return;
    }

    const positive = summary.distribution[5] + summary.distribution[4];
    overview.replaceChildren(
      h('div', { class: 'reviews-overview__main' }, ratingSummary(summary, { title: 'Средняя оценка' })),
      h('div', { class: 'reviews-overview__facts' },
        h('div', { class: 'stat stat--ink' },
          h('span', { class: 'stat__label' }, 'Рекомендуют'),
          h('span', { class: 'stat__value' }, `${Math.round((positive / summary.count) * 100)}%`),
          h('span', { class: 'stat__sub' }, 'поставили 4 или 5 звёзд')),
        h('div', { class: 'stat' },
          h('span', { class: 'stat__label' }, 'Всего отзывов'),
          h('span', { class: 'stat__value' }, summary.count),
          h('span', { class: 'stat__sub' }, 'каждый подтверждён покупкой')),
        h('div', { class: 'stat' },
          h('span', { class: 'stat__label' }, 'Оценка'),
          h('span', { class: 'stat__value' }, formatRating(summary.average)),
          stars(summary.average))));
    renderFilter(summary.distribution);

    feed.replaceChildren(...(state.items.length
      ? state.items.map((r, i) => { const c = reviewCard(r, { withProduct: true }); c.style.setProperty('--i', i % 12); return c; })
      : [emptyState({ title: 'Нет отзывов с такой оценкой', text: 'Выберите другой фильтр.' })]));
    feed.classList.add('stagger');
    more.hidden = meta.page >= meta.totalPages;
  }

  function reset() {
    state.page = 1;
    state.items = [];
    load().catch((err) => { toastError(err); });
  }

  sort.addEventListener('change', () => { state.sort = sort.value; reset(); });
  more.addEventListener('click', () => withBusy(more, async () => { state.page += 1; await load(); }));
  reset();
}

init().catch((err) => console.error(err));


