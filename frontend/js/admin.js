import { api } from './api.js';
import { getUser, guard, initPage } from './layout.js';
import {
  clearFieldErrors, cover, emptyState, fmt, h, icon, ORDER_STATUS_LABEL, pager, priceTag, showFieldErrors,
  statusBadge, toast, toastError, withBusy,
} from './ui.js';

/** «Красивая» цена вниз: …499 / …999 (как на сервере). */
const psychDown = (v) => (v <= 0 ? 0 : Math.max(Math.floor((v + 1) / 500), 1) * 500 - 1);

/** Дата для <input type="date"> в локальном часовом поясе. */
function toDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Конец выбранного дня (23:59:59 по местному времени) в ISO. */
const endOfDay = (value) => (value ? new Date(`${value}T23:59:59`).toISOString() : null);

const view = document.getElementById('admin-view');
const tabsRoot = document.getElementById('admin-tabs');
let storageReady = true;

const TABS = [
  { key: 'dashboard', label: 'Обзор', icon: 'gauge' },
  { key: 'products', label: 'Товары', icon: 'box' },
  { key: 'categories', label: 'Категории', icon: 'folder' },
  { key: 'discounts', label: 'Скидки', icon: 'tag' },
  { key: 'orders', label: 'Заказы', icon: 'receipt' },
  { key: 'users', label: 'Пользователи', icon: 'users' },
];

/* ───────────── Общие элементы ───────────── */
function head(title, sub, ...actions) {
  return h('header', { class: 'admin__head' },
    h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted', style: { marginTop: '6px' } }, sub) : null),
    actions.length ? h('div', { style: { display: 'flex', gap: '8px' } }, actions) : null);
}

function searchInput(value, onInput, placeholder) {
  const input = h('input', { class: 'input', type: 'search', placeholder, value: value ?? '', maxlength: '100' });
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => onInput(input.value.trim()), 250);
  });
  return h('label', { class: 'search' }, h('span', { class: 'visually-hidden' }, placeholder), icon('search'), input);
}

function segmented(options, current, onChange) {
  const root = h('div', { class: 'segmented', role: 'group' });
  for (const [value, label] of options) {
    root.append(h('button', {
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: (e) => {
        root.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        onChange(value);
      },
    }, label));
  }
  return root;
}

function loadingTable(rows = 5) {
  return h('div', { style: { display: 'grid', gap: '10px' } },
    Array.from({ length: rows }, () => h('div', { class: 'skeleton', style: { height: '56px' } })));
}

function table(headers, rows) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', { class: x.num ? 'num' : null, scope: 'col' }, x.label ?? x)))),
      h('tbody', {}, rows)));
}

/** Модальное подтверждение на нативном <dialog>. */
function confirmDialog({ title, text, confirmLabel = 'Подтвердить', danger = false }) {
  const dialog = document.getElementById('confirm-dialog');
  return new Promise((resolve) => {
    const finish = (result) => {
      dialog.close();
      resolve(result);
    };
    dialog.replaceChildren(
      h('div', { class: 'dialog__body' },
        h('h2', { class: 'dialog__title', id: 'confirm-title' }, title),
        h('p', { class: 'muted' }, text)),
      h('div', { class: 'dialog__foot' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => finish(false) }, 'Отмена'),
        h('button', { class: `btn ${danger ? 'btn--danger' : ''}`, type: 'button', onclick: () => finish(true) }, confirmLabel)));
    dialog.onclose = () => resolve(false);
    dialog.showModal();
  });
}

function closeOnBackdrop(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

/* ═════════════ Обзор (реальная статистика) ═════════════ */
async function dashboard() {
  view.replaceChildren(head('Обзор', 'Актуальные показатели магазина из PostgreSQL.'), loadingTable(3));
  let s;
  try {
    s = (await api.stats()).data;
  } catch (err) {
    view.replaceChildren(head('Обзор'), emptyState({ title: 'Не удалось загрузить статистику', text: err.message }));
    return;
  }

  const stat = (label, value, sub, ink = false) => h('div', { class: `stat${ink ? ' stat--ink' : ''}` },
    h('span', { class: 'stat__label' }, label),
    h('span', { class: 'stat__value' }, value),
    sub ? h('span', { class: 'stat__sub' }, sub) : null);

  const total = s.orders.total;
  const split = h('div', { class: 'bar-split', role: 'img', 'aria-label': 'Распределение заказов по статусам' });
  const COLORS = { PAID: '#0a0a0b', PENDING: '#a1a1a6', CANCELLED: '#dcdce0' };
  if (total > 0) {
    for (const key of ['PAID', 'PENDING', 'CANCELLED']) {
      if (!s.orders[key]) continue;
      split.append(h('i', { style: { width: `${(s.orders[key] / total) * 100}%`, background: COLORS[key] } }));
    }
  }

  const recent = s.recentOrders.length
    ? h('div', { class: 'mini-list' }, s.recentOrders.map((o) => h('div', {},
      h('div', {}, h('div', { class: 'cell-title' }, o.product.name), h('div', { class: 'cell-sub' }, `${o.user.name} · ${fmt.dateTime(o.createdAt)}`)),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, h('span', { class: 'tabular' }, fmt.price(o.priceAtPurchase)), statusBadge(o.status)))))
    : h('p', { class: 'mini-empty' }, 'Заказов пока нет.');

  const top = s.topProducts.length
    ? h('div', { class: 'mini-list' }, s.topProducts.map((p, i) => h('div', {},
      h('span', {}, h('span', { class: 'muted tabular', style: { marginRight: '10px' } }, String(i + 1).padStart(2, '0')), p.name),
      h('span', { class: 'tabular' }, `${fmt.count(p.sales, ['продажа', 'продажи', 'продаж'])} · ${fmt.price(p.revenue)}`))))
    : h('p', { class: 'mini-empty' }, 'Продаж пока нет — список появится после первой оплаты.');

  view.replaceChildren(
    head('Обзор', 'Актуальные показатели магазина из PostgreSQL.'),
    ...(storageReady ? [] : [h('p', { class: 'notice', style: { marginBottom: '16px' } }, 'Supabase Storage не настроен: загрузка изображений и файлов недоступна. Укажите SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env и перезапустите сервер.')]),
    h('div', { class: 'stats stagger' },
      stat('Выручка', fmt.price(s.revenue) === 'Бесплатно' ? '0 ₸' : fmt.price(s.revenue), 'Сумма оплаченных заказов', true),
      stat('Заказы', s.orders.total, `${s.orders.PAID} оплачено · ${s.orders.PENDING} ожидают`),
      stat('Товары', s.products.active, `${s.products.archived} в архиве · ${fmt.count(s.categories.total, ['категория', 'категории', 'категорий'])}`),
      stat('Пользователи', s.users.total, `${fmt.count(s.users.admins, ['администратор', 'администратора', 'администраторов'])}`)),
    h('div', { class: 'dash-grid' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Последние заказы'), h('a', { class: 'link-arrow', href: '#orders' }, 'Все', icon('arrow'))),
        recent),
      h('div', { class: 'stack' },
        h('section', { class: 'panel' },
          h('h2', { class: 'panel__title' }, 'Статусы заказов'),
          split,
          h('div', { class: 'legend' }, ['PAID', 'PENDING', 'CANCELLED'].map((k) => h('div', {},
            h('i', { style: { background: COLORS[k] } }), h('span', {}, ORDER_STATUS_LABEL[k]), h('span', {}, s.orders[k]))))),
        h('section', { class: 'panel' }, h('h2', { class: 'panel__title' }, 'Лидеры продаж'), top))),
  );
}

/* ═════════════ Товары ═════════════ */
const productState = { search: '', status: 'all', category: '', page: 1 };
let categoriesCache = [];

async function refreshCategories() {
  categoriesCache = (await api.categories()).data;
  return categoriesCache;
}

async function products(editId) {
  const list = h('div');
  const pagerRoot = h('div');
  const categorySelect = h('select', { class: 'select', style: { width: 'auto', minHeight: '38px', paddingBlock: '7px', fontSize: '0.875rem' } },
    h('option', { value: '' }, 'Все категории'));

  view.replaceChildren(
    head('Товары', 'Каталог, цены, остатки и файлы.',
      h('button', { class: 'btn', type: 'button', onclick: () => openProductSheet(null, load) }, icon('plus', { size: 16 }), 'Новый товар')),
    h('div', { class: 'admin__filters' },
      searchInput(productState.search, (v) => { productState.search = v; productState.page = 1; load(); }, 'Поиск по названию'),
      segmented([['all', 'Все'], ['active', 'В продаже'], ['archived', 'Архив']], productState.status, (v) => {
        productState.status = v;
        productState.page = 1;
        load();
      }),
      categorySelect),
    list,
    pagerRoot);

  try {
    await refreshCategories();
    categorySelect.append(...categoriesCache.map((c) => h('option', { value: c.slug }, c.name)));
    categorySelect.value = productState.category;
  } catch (err) {
    toastError(err);
  }
  categorySelect.addEventListener('change', () => { productState.category = categorySelect.value; productState.page = 1; load(); });

  async function load() {
    list.replaceChildren(loadingTable());
    try {
      const { data, meta } = await api.products({ ...productState, limit: 12, sort: 'newest' });
      if (data.length === 0) {
        const pristine = !productState.search && !productState.category && productState.status === 'all';
        list.replaceChildren(emptyState(pristine
          ? {
            title: 'Товаров пока нет',
            text: categoriesCache.length ? 'Добавьте первый товар — он сразу появится в каталоге.' : 'Сначала создайте хотя бы одну категорию, затем добавьте товар.',
            action: categoriesCache.length
              ? h('button', { class: 'btn', type: 'button', onclick: () => openProductSheet(null, load) }, 'Добавить товар')
              : h('a', { class: 'btn', href: '#categories' }, 'Перейти к категориям'),
          }
          : { title: 'Ничего не найдено', text: 'Измените условия поиска.' }));
        pagerRoot.replaceChildren();
        return;
      }
      list.replaceChildren(table(
        ['Товар', 'Категория', { label: 'Цена', num: true }, { label: 'Остаток', num: true }, 'Файл', 'Статус', ''],
        data.map((p) => h('tr', {},
          h('td', {}, h('div', { class: 'cell-product' }, cover(p),
            h('div', {}, h('div', { class: 'cell-title' }, p.name), h('div', { class: 'cell-sub' }, p.slug)))),
          h('td', {}, p.category?.name ?? '—'),
          h('td', { class: 'num' }, priceTag(p)),
          h('td', { class: 'num' }, p.stock === null ? '∞' : p.stock),
          h('td', {}, p.hasFile ? h('span', { class: 'badge badge--ok' }, 'Загружен') : h('span', { class: 'badge' }, 'Нет')),
          h('td', {}, p.isActive ? h('span', { class: 'badge badge--ok' }, 'В продаже') : h('span', { class: 'badge' }, 'Архив')),
          h('td', { class: 'num' },
            h('div', { style: { display: 'inline-flex', gap: '4px' } },
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Редактировать ${p.name}`, onclick: () => openProductSheet(p.id, load) }, icon('edit')),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Удалить ${p.name}`, onclick: () => removeProduct(p, load) }, icon('trash')))))),
      ));
      pagerRoot.replaceChildren(pager(meta, (pg) => { productState.page = pg; load(); }));
    } catch (err) {
      list.replaceChildren(emptyState({ title: 'Не удалось загрузить товары', text: err.message }));
    }
  }

  await load();
  if (editId) openProductSheet(editId, load);
}

async function removeProduct(product, reload) {
  const ok = await confirmDialog({
    title: `Удалить «${product.name}»?`,
    text: 'Если по товару уже есть заказы, он будет перенесён в архив, чтобы сохранить историю покупок и доступ покупателей к файлам.',
    confirmLabel: 'Удалить',
    danger: true,
  });
  if (!ok) return;
  try {
    const { data } = await api.deleteProduct(product.id);
    toast(data.archived ? 'По товару есть заказы — он перенесён в архив' : 'Товар удалён');
    reload();
  } catch (err) {
    toastError(err);
  }
}

const PLATFORMS = ['macOS', 'Windows', 'Linux'];

function field(label, input, hint) {
  return h('div', { class: 'field' },
    h('label', { class: 'field__label', for: input.id }, label),
    input,
    hint ? h('span', { class: 'field__hint' }, hint) : null,
    h('span', { class: 'field__error' }));
}

/** Боковой шит создания/редактирования товара с загрузкой изображения и файла. */
async function openProductSheet(productId, reload) {
  const sheet = document.getElementById('product-sheet');
  let product = null;

  if (!categoriesCache.length) {
    try {
      await refreshCategories();
    } catch (err) {
      toastError(err);
    }
  }

  if (productId) {
    try {
      product = (await api.product(productId)).data;
    } catch (err) {
      toastError(err);
      return;
    }
  }

  const input = (name, attrs = {}) => h('input', { class: 'input', id: `pf-${name}`, name, ...attrs });

  const render = () => {
    const isNew = !product;
    const form = h('form', { id: 'product-form', novalidate: true });
    const alert = h('div', { class: 'form-alert', role: 'alert', hidden: true });

    const categorySelect = h('select', { class: 'select', id: 'pf-categoryId', name: 'categoryId', required: true },
      h('option', { value: '' }, 'Выберите категорию'),
      categoriesCache.map((c) => h('option', { value: c.id }, c.name)));
    categorySelect.value = product?.category?.id ?? '';

    const platforms = h('div', { class: 'check-row', role: 'group', 'aria-label': 'Платформы' },
      PLATFORMS.map((p) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', name: 'platforms', value: p, checked: product?.platforms?.includes(p) ?? false }), p)));

    const description = h('textarea', { class: 'textarea', id: 'pf-description', name: 'description', required: true, minlength: '10', maxlength: '5000' });
    description.value = product?.description ?? '';

    form.append(
      h('div', { class: 'dialog__body' },
        alert,
        !categoriesCache.length ? h('p', { class: 'notice' }, 'Нет ни одной категории. Создайте категорию в разделе «Категории».') : null,
        h('div', { class: 'form-grid' },
          h('div', { class: 'full' }, field('Название', input('name', { required: true, maxlength: '120', value: product?.name ?? '' }))),
          field('Категория', categorySelect),
          field('Цена, ₸', input('price', { inputmode: 'numeric', required: true, value: product ? String(Math.round(product.price)) : '', placeholder: '4999' })),
          field('Разработчик', input('developer', { maxlength: '80', value: product?.developer ?? '' })),
          field('Версия', input('version', { maxlength: '30', value: product?.version ?? '', placeholder: '1.0.0' })),
          field('Форматы', input('formats', { value: product?.formats?.join(', ') ?? '', placeholder: 'VST3, AU, AAX, WAV' }), 'Через запятую'),
          field('Остаток лицензий', input('stock', { type: 'number', min: '0', step: '1', value: product?.stock ?? '' }), 'Пусто — без ограничений'),
          h('div', { class: 'full field' }, h('span', { class: 'field__label' }, 'Платформы'), platforms),
          h('div', { class: 'full' }, field('Описание', description, 'Не менее 10 символов')),
          h('div', { class: 'full' }, field('Slug', input('slug', { maxlength: '140', value: product?.slug ?? '', placeholder: 'формируется из названия' }), 'Латиница, цифры и дефисы')),
          h('label', { class: 'check full' },
            h('input', { type: 'checkbox', name: 'isActive', checked: product ? product.isActive : true }), 'Товар в продаже')),
        discountSection(),
        mediaSection()),
      h('div', { class: 'dialog__foot' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => sheet.close() }, 'Закрыть'),
        h('button', { class: 'btn', type: 'submit' }, isNew ? 'Создать товар' : 'Сохранить')));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      alert.hidden = true;
      const f = form.elements;
      const body = {
        name: f.name.value.trim(),
        categoryId: f.categoryId.value,
        price: f.price.value.trim().replace(',', '.'),
        description: f.description.value.trim(),
        developer: f.developer.value.trim() || null,
        version: f.version.value.trim() || null,
        formats: f.formats.value.split(',').map((x) => x.trim()).filter(Boolean),
        platforms: [...form.querySelectorAll('input[name="platforms"]:checked')].map((x) => x.value),
        stock: f.stock.value === '' ? null : Number(f.stock.value),
        isActive: f.isActive.checked,
        salePrice: f.salePrice.value.trim() === '' ? null : f.salePrice.value.trim().replace(',', '.'),
        saleEndsAt: f.salePrice.value.trim() === '' ? null : endOfDay(f.saleEndsAt.value),
      };
      const slug = f.slug.value.trim();
      if (slug && slug !== product?.slug) body.slug = slug;

      withBusy(form.querySelector('button[type="submit"]'), async () => {
        try {
          const wasNew = !product;
          product = wasNew ? (await api.createProduct(body)).data : (await api.updateProduct(product.id, body)).data;
          toast(wasNew ? 'Товар создан. Теперь можно загрузить обложку и файл.' : 'Изменения сохранены');
          reload();
          render();
          if (wasNew) sheet.querySelector('.upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
          if (!(err.details && showFieldErrors(form, err.details))) {
            alert.textContent = err.message;
            alert.hidden = false;
            alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    });

    sheet.replaceChildren(
      h('div', { class: 'dialog__head' },
        h('h2', { class: 'dialog__title', id: 'product-sheet-title' }, isNew ? 'Новый товар' : product.name),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть', onclick: () => sheet.close() }, icon('x'))),
      form);
  };

  /** Скидка на товар: цена со скидкой, срок и быстрые проценты. */
  function discountSection() {
    const sale = h('input', {
      class: 'input', id: 'pf-salePrice', name: 'salePrice', inputmode: 'numeric', placeholder: 'Без скидки',
      value: product?.salePrice ? String(Math.round(product.salePrice)) : '',
    });
    const ends = h('input', { class: 'input', id: 'pf-saleEndsAt', name: 'saleEndsAt', type: 'date', value: toDateInput(product?.saleEndsAt) });
    const status = h('span', { class: 'field__hint' });

    const updateStatus = () => {
      const price = Number(document.getElementById('pf-price')?.value.replace(',', '.') || product?.price || 0);
      const value = Number(sale.value.replace(',', '.'));
      if (!sale.value.trim()) status.textContent = 'Скидка не действует';
      else if (!price || value >= price) status.textContent = 'Цена со скидкой должна быть меньше обычной';
      else status.textContent = `Скидка ${Math.round((1 - value / price) * 100)}%`;
    };
    sale.addEventListener('input', updateStatus);

    const quick = h('div', { class: 'check-row' },
      [10, 20, 30, 50].map((pct) => h('button', {
        class: 'chip', type: 'button',
        onclick: () => {
          const price = Number(document.getElementById('pf-price').value.replace(',', '.'));
          if (!price) { toast('Сначала укажите цену', { type: 'error' }); return; }
          sale.value = String(psychDown(price * (1 - pct / 100)));
          updateStatus();
        },
      }, `−${pct}%`)),
      h('button', { class: 'chip', type: 'button', onclick: () => { sale.value = ''; ends.value = ''; updateStatus(); } }, 'Без скидки'));

    queueMicrotask(updateStatus);
    return h('div', { class: 'stack' },
      h('h3', { class: 'field__label', style: { fontSize: '1rem' } }, 'Скидка'),
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pf-salePrice' }, 'Цена со скидкой, ₸'), sale, status, h('span', { class: 'field__error' })),
        field('Скидка действует до', ends, 'Пусто — бессрочно'),
        h('div', { class: 'full' }, quick)));
  }

  /** Загрузка в Supabase Storage: изображение (публичный бакет) и файл (приватный). */
  function mediaSection() {
    const wrap = h('div', { class: 'stack' }, h('h3', { class: 'field__label', style: { fontSize: '1rem' } }, 'Медиа и файлы'));
    if (!product) {
      wrap.append(h('p', { class: 'notice' }, 'Сохраните товар, чтобы загрузить обложку и цифровой файл.'));
      return wrap;
    }
    if (!storageReady) {
      wrap.append(h('p', { class: 'notice' }, 'Supabase Storage не настроен — загрузка файлов недоступна.'));
    }

    const picker = (accept, onFile) => {
      const inputEl = h('input', { type: 'file', accept, hidden: true });
      inputEl.addEventListener('change', () => {
        if (inputEl.files[0]) onFile(inputEl.files[0]);
        inputEl.value = '';
      });
      return inputEl;
    };

    const imageInput = picker('image/jpeg,image/png,image/webp', (file) => upload(api.uploadImage, file, imageBtn));
    const imageBtn = h('button', { class: 'btn btn--sm', type: 'button', disabled: !storageReady, onclick: () => imageInput.click() },
      icon('upload', { size: 15 }), product.imageUrl ? 'Заменить' : 'Загрузить');
    const imageDel = product.imageUrl
      ? h('button', { class: 'btn btn--sm btn--danger', type: 'button', onclick: (e) => removeMedia(api.deleteImage, 'Обложка удалена', e.currentTarget) }, 'Удалить')
      : null;

    const fileInput = picker('', (file) => upload(api.uploadFile, file, fileBtn));
    const fileBtn = h('button', { class: 'btn btn--sm', type: 'button', disabled: !storageReady, onclick: () => fileInput.click() },
      icon('upload', { size: 15 }), product.hasFile ? 'Заменить' : 'Загрузить');
    const fileDel = product.hasFile
      ? h('button', { class: 'btn btn--sm btn--danger', type: 'button', onclick: (e) => removeMedia(api.deleteFile, 'Файл удалён', e.currentTarget) }, 'Удалить')
      : null;

    wrap.append(
      h('div', { class: 'upload' },
        cover(product),
        h('div', { class: 'upload__info' },
          h('span', { class: 'upload__name' }, 'Обложка'),
          h('span', { class: 'field__hint' }, product.imageUrl ? 'Публичное изображение в бакете product-images' : 'JPG, PNG или WEBP до 5 МБ'),
          h('div', { class: 'upload__actions' }, imageBtn, imageDel, imageInput))),
      h('div', { class: 'upload' },
        h('div', { class: 'upload__file-icon' }, icon('file')),
        h('div', { class: 'upload__info' },
          h('span', { class: 'upload__name' }, product.fileName ?? 'Цифровой файл'),
          h('span', { class: 'field__hint' }, product.hasFile
            ? `${fmt.bytes(product.fileSize)} · приватный бакет, выдаётся только по оплаченному заказу`
            : 'Архив, установщик, аудио или лицензия .txt до 50 МБ'),
          h('div', { class: 'upload__actions' }, fileBtn, fileDel, fileInput))));
    return wrap;
  }

  async function upload(call, file, button) {
    await withBusy(button, async () => {
      try {
        product = (await call(product.id, file)).data;
        toast('Файл загружен в Supabase Storage');
        reload();
        render();
      } catch (err) {
        toastError(err);
      }
    });
  }

  async function removeMedia(call, message, button) {
    await withBusy(button, async () => {
      try {
        product = (await call(product.id)).data;
        toast(message);
        reload();
        render();
      } catch (err) {
        toastError(err);
      }
    });
  }

  render();
  if (!sheet.open) sheet.showModal();
}

/* ═════════════ Категории ═════════════ */
async function categories() {
  const list = h('div');
  view.replaceChildren(
    head('Категории', 'Структура каталога.',
      h('button', { class: 'btn', type: 'button', onclick: () => openCategoryDialog(null, load) }, icon('plus', { size: 16 }), 'Новая категория')),
    list);

  async function load() {
    list.replaceChildren(loadingTable(3));
    try {
      const data = await refreshCategories();
      if (data.length === 0) {
        list.replaceChildren(emptyState({
          title: 'Категории ещё не добавлены',
          text: 'Категории помогают покупателям ориентироваться: например, «VST-плагины», «DAW», «Подписки».',
          action: h('button', { class: 'btn', type: 'button', onclick: () => openCategoryDialog(null, load) }, 'Создать категорию'),
        }));
        return;
      }
      list.replaceChildren(table(
        ['Название', 'Slug', 'Описание', { label: 'Товаров', num: true }, ''],
        data.map((c) => h('tr', {},
          h('td', { class: 'cell-title' }, c.name),
          h('td', { class: 'cell-sub' }, c.slug),
          h('td', { class: 'muted', style: { maxWidth: '360px' } }, c.description ?? '—'),
          h('td', { class: 'num' }, c.productsCount),
          h('td', { class: 'num' },
            h('div', { style: { display: 'inline-flex', gap: '4px' } },
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Редактировать ${c.name}`, onclick: () => openCategoryDialog(c, load) }, icon('edit')),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Удалить ${c.name}`, onclick: () => removeCategory(c, load) }, icon('trash')))))),
      ));
    } catch (err) {
      list.replaceChildren(emptyState({ title: 'Не удалось загрузить категории', text: err.message }));
    }
  }
  load();
}

async function removeCategory(category, reload) {
  const ok = await confirmDialog({
    title: `Удалить категорию «${category.name}»?`,
    text: 'Категорию можно удалить, только если в ней нет товаров (включая архивные).',
    confirmLabel: 'Удалить',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteCategory(category.id);
    toast('Категория удалена');
    reload();
  } catch (err) {
    toastError(err);
  }
}

function openCategoryDialog(category, reload) {
  const dialog = document.getElementById('category-dialog');
  const alert = h('div', { class: 'form-alert', role: 'alert', hidden: true });
  const name = h('input', { class: 'input', id: 'cf-name', name: 'name', required: true, maxlength: '80', value: category?.name ?? '' });
  const slug = h('input', { class: 'input', id: 'cf-slug', name: 'slug', maxlength: '100', value: category?.slug ?? '', placeholder: 'формируется из названия' });
  const description = h('textarea', { class: 'textarea', id: 'cf-description', name: 'description', maxlength: '1000', style: { minHeight: '96px' } });
  description.value = category?.description ?? '';

  const form = h('form', { novalidate: true },
    h('div', { class: 'dialog__head' },
      h('h2', { class: 'dialog__title', id: 'category-dialog-title' }, category ? 'Редактировать категорию' : 'Новая категория'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть', onclick: () => dialog.close() }, icon('x'))),
    h('div', { class: 'dialog__body' }, alert, field('Название', name), field('Slug', slug, 'Латиница, цифры и дефисы'), field('Описание', description)),
    h('div', { class: 'dialog__foot' },
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => dialog.close() }, 'Отмена'),
      h('button', { class: 'btn', type: 'submit' }, category ? 'Сохранить' : 'Создать')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    alert.hidden = true;
    const body = { name: name.value.trim(), description: description.value.trim() || null };
    if (slug.value.trim() && slug.value.trim() !== category?.slug) body.slug = slug.value.trim();
    withBusy(form.querySelector('button[type="submit"]'), async () => {
      try {
        if (category) await api.updateCategory(category.id, body);
        else await api.createCategory(body);
        toast(category ? 'Категория обновлена' : 'Категория создана');
        dialog.close();
        reload();
      } catch (err) {
        if (!(err.details && showFieldErrors(form, err.details))) {
          alert.textContent = err.message;
          alert.hidden = false;
        }
      }
    });
  });

  dialog.replaceChildren(form);
  dialog.showModal();
  name.focus();
}

/* ═════════════ Скидки ═════════════ */
const discountState = { page: 1 };

async function discounts() {
  try {
    await refreshCategories();
  } catch (err) {
    toastError(err);
  }

  const scope = h('select', { class: 'select', id: 'dc-scope', name: 'categoryId' },
    h('option', { value: '' }, 'Весь каталог'),
    categoriesCache.map((c) => h('option', { value: c.id }, `${c.name} (${c.productsCount})`)));
  const percent = h('input', { class: 'input', id: 'dc-percent', name: 'percent', type: 'number', min: '1', max: '95', step: '1', value: '20' });
  const ends = h('input', { class: 'input', id: 'dc-ends', name: 'endsAt', type: 'date' });
  const alert = h('div', { class: 'form-alert', role: 'alert', hidden: true });
  const applyBtn = h('button', { class: 'btn', type: 'submit' }, icon('tag', { size: 16 }), 'Применить скидку');
  const clearBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Снять скидки');

  const form = h('form', { class: 'panel stack', novalidate: true },
    h('h2', { class: 'panel__title', style: { margin: 0 } }, 'Массовая скидка'),
    h('p', { class: 'muted', style: { marginTop: '-8px' } }, 'Процент применяется к обычной цене; цена со скидкой округляется вниз до …499 или …999.'),
    alert,
    h('div', { class: 'form-grid' },
      field('Товары', scope),
      field('Скидка, %', percent, 'От 1 до 95'),
      field('Действует до', ends, 'Пусто — бессрочно')),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, applyBtn, clearBtn));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alert.hidden = true;
    withBusy(applyBtn, async () => {
      try {
        const { data } = await api.bulkDiscount({
          percent: Number(percent.value),
          categoryId: scope.value || null,
          endsAt: endOfDay(ends.value),
        });
        toast(`Скидка применена к ${fmt.count(data.updated, ['товару', 'товарам', 'товарам'])}`);
        load();
      } catch (err) {
        alert.textContent = err.details?.[0]?.message ?? err.message;
        alert.hidden = false;
      }
    });
  });

  clearBtn.addEventListener('click', async () => {
    const label = scope.value ? `в категории «${scope.selectedOptions[0].textContent.replace(/ \(\d+\)$/, '')}»` : 'во всём каталоге';
    const ok = await confirmDialog({ title: 'Снять скидки?', text: `Все скидки ${label} будут отменены.`, confirmLabel: 'Снять скидки', danger: true });
    if (!ok) return;
    await withBusy(clearBtn, async () => {
      try {
        const { data } = await api.clearDiscounts(scope.value || undefined);
        toast(`Скидки сняты: ${data.cleared}`);
        load();
      } catch (err) {
        toastError(err);
      }
    });
  });

  const list = h('div');
  const pagerRoot = h('div');
  view.replaceChildren(
    head('Скидки', 'Акции на отдельные товары и целые категории.'),
    form,
    h('h2', { class: 'panel__title', style: { margin: '32px 0 16px' } }, 'Товары со скидкой'),
    list,
    pagerRoot);

  async function load() {
    list.replaceChildren(loadingTable(3));
    try {
      const { data, meta } = await api.products({ onSale: 'true', status: 'all', page: discountState.page, limit: 15, sort: 'name_asc' });
      if (data.length === 0) {
        list.replaceChildren(emptyState({ title: 'Скидок пока нет', text: 'Примените массовую скидку выше или задайте цену со скидкой в карточке товара.' }));
        pagerRoot.replaceChildren();
        return;
      }
      list.replaceChildren(table(
        ['Товар', { label: 'Цена', num: true }, { label: 'Скидка', num: true }, 'Действует до', ''],
        data.map((p) => h('tr', {},
          h('td', {}, h('div', { class: 'cell-product' }, cover(p), h('div', {}, h('div', { class: 'cell-title' }, p.name), h('div', { class: 'cell-sub' }, p.category?.name ?? '')))),
          h('td', { class: 'num' }, priceTag(p)),
          h('td', { class: 'num' }, `−${p.discountPercent}%`),
          h('td', { class: 'cell-sub' }, p.saleEndsAt ? fmt.date(p.saleEndsAt) : 'Бессрочно'),
          h('td', { class: 'num' },
            h('div', { style: { display: 'inline-flex', gap: '4px' } },
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Изменить ${p.name}`, onclick: () => openProductSheet(p.id, load) }, icon('edit')),
              h('button', {
                class: 'btn btn--sm btn--ghost', type: 'button',
                onclick: async (e) => {
                  const btn = e.currentTarget;
                  await withBusy(btn, async () => {
                    try {
                      await api.updateProduct(p.id, { salePrice: null });
                      toast('Скидка снята');
                      load();
                    } catch (err) {
                      toastError(err);
                    }
                  });
                },
              }, 'Снять')))))));
      pagerRoot.replaceChildren(pager(meta, (pg) => { discountState.page = pg; load(); }));
    } catch (err) {
      list.replaceChildren(emptyState({ title: 'Не удалось загрузить скидки', text: err.message }));
    }
  }
  load();
}

/* ═════════════ Заказы ═════════════ */
const TRANSITIONS = { PENDING: ['PAID', 'CANCELLED'], PAID: ['CANCELLED'], CANCELLED: [] };
const orderState = { status: '', page: 1 };

async function orders() {
  const list = h('div');
  const pagerRoot = h('div');
  view.replaceChildren(
    head('Заказы', 'Покупатели оплачивают заказы картой; при необходимости оплату можно подтвердить вручную.'),
    h('div', { class: 'admin__filters' },
      segmented([['', 'Все'], ['PENDING', 'Ожидают'], ['PAID', 'Оплачены'], ['CANCELLED', 'Отменены']], orderState.status, (v) => {
        orderState.status = v;
        orderState.page = 1;
        load();
      })),
    list,
    pagerRoot);

  async function changeStatus(order, status, select) {
    if (status === 'CANCELLED') {
      const ok = await confirmDialog({
        title: 'Отменить заказ?',
        text: order.status === 'PAID' ? 'Покупатель потеряет доступ к скачиванию файла. Отмена необратима.' : 'Отмена необратима.',
        confirmLabel: 'Отменить заказ',
        danger: true,
      });
      if (!ok) {
        select.value = order.status;
        return;
      }
    }
    select.disabled = true;
    try {
      await api.setOrderStatus(order.id, status);
      toast(`Статус: ${ORDER_STATUS_LABEL[status]}`);
      load();
    } catch (err) {
      toastError(err);
      select.value = order.status;
      select.disabled = false;
    }
  }

  async function load() {
    list.replaceChildren(loadingTable());
    try {
      const { data, meta } = await api.orders({ status: orderState.status || undefined, page: orderState.page, limit: 15 });
      if (data.length === 0) {
        list.replaceChildren(emptyState(orderState.status
          ? { title: 'Нет заказов с таким статусом', text: 'Выберите другой фильтр.' }
          : { title: 'Заказов пока нет', text: 'Когда покупатели оформят заказы, они появятся здесь.' }));
        pagerRoot.replaceChildren();
        return;
      }
      list.replaceChildren(table(
        ['Заказ', 'Покупатель', 'Товар', { label: 'Сумма', num: true }, 'Дата', 'Статус'],
        data.map((o) => {
          let control = statusBadge(o.status);
          if (TRANSITIONS[o.status].length) {
            const select = h('select', { class: 'select', 'aria-label': 'Статус заказа', style: { minHeight: '34px', paddingBlock: '5px', fontSize: '0.8125rem', width: 'auto' } },
              h('option', { value: o.status }, ORDER_STATUS_LABEL[o.status]),
              TRANSITIONS[o.status].map((s) => h('option', { value: s }, s === 'PAID' ? 'Подтвердить оплату' : 'Отменить')));
            select.addEventListener('change', () => changeStatus(o, select.value, select));
            control = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, statusBadge(o.status), select);
          }
          return h('tr', {},
            h('td', { class: 'cell-sub tabular' }, `#${o.id.slice(0, 8)}`),
            h('td', {}, h('div', { class: 'cell-title' }, o.user.name), h('div', { class: 'cell-sub' }, o.user.email)),
            h('td', {}, o.product.name),
            h('td', { class: 'num' }, fmt.price(o.priceAtPurchase),
              o.paymentRef ? h('div', { class: 'cell-sub' }, o.cardLast4 ? `${(o.cardBrand ?? 'card').toUpperCase()} •••• ${o.cardLast4}` : 'Вручную') : null),
            h('td', { class: 'cell-sub' }, fmt.dateTime(o.createdAt)),
            h('td', {}, control));
        }),
      ));
      pagerRoot.replaceChildren(pager(meta, (p) => { orderState.page = p; load(); }));
    } catch (err) {
      list.replaceChildren(emptyState({ title: 'Не удалось загрузить заказы', text: err.message }));
    }
  }
  load();
}

/* ═════════════ Пользователи ═════════════ */
const userState = { search: '', page: 1 };

async function users() {
  const me = getUser();
  const list = h('div');
  const pagerRoot = h('div');
  view.replaceChildren(
    head('Пользователи', 'Покупатели и администраторы. Публичная регистрация создаёт только роль USER.'),
    h('div', { class: 'admin__filters' },
      searchInput(userState.search, (v) => { userState.search = v; userState.page = 1; load(); }, 'Имя или email')),
    list,
    pagerRoot);

  async function toggleRole(u, button) {
    const role = u.role === 'ADMIN' ? 'USER' : 'ADMIN';
    const ok = await confirmDialog({
      title: role === 'ADMIN' ? `Назначить ${u.name} администратором?` : `Снять права администратора с ${u.name}?`,
      text: role === 'ADMIN' ? 'Администратор получит полный доступ к товарам, заказам и пользователям.' : 'Пользователь станет обычным покупателем.',
      confirmLabel: role === 'ADMIN' ? 'Назначить' : 'Снять права',
      danger: role === 'USER',
    });
    if (!ok) return;
    await withBusy(button, async () => {
      try {
        await api.setRole(u.id, role);
        toast('Роль обновлена');
        load();
      } catch (err) {
        toastError(err);
      }
    });
  }

  async function load() {
    list.replaceChildren(loadingTable());
    try {
      const { data, meta } = await api.users({ search: userState.search || undefined, page: userState.page, limit: 20 });
      if (data.length === 0) {
        list.replaceChildren(emptyState({ title: 'Пользователи не найдены', text: 'Измените условия поиска.' }));
        pagerRoot.replaceChildren();
        return;
      }
      list.replaceChildren(table(
        ['Пользователь', 'Роль', { label: 'Заказов', num: true }, 'Регистрация', ''],
        data.map((u) => {
          const btn = u.id === me.id
            ? h('span', { class: 'cell-sub' }, 'Это вы')
            : h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, u.role === 'ADMIN' ? 'Сделать USER' : 'Сделать ADMIN');
          if (u.id !== me.id) btn.addEventListener('click', () => toggleRole(u, btn));
          return h('tr', {},
            h('td', {}, h('div', { class: 'cell-title' }, u.name), h('div', { class: 'cell-sub' }, u.email)),
            h('td', {}, h('span', { class: `badge badge--${u.role}` }, u.role)),
            h('td', { class: 'num' }, u._count.orders),
            h('td', { class: 'cell-sub' }, fmt.date(u.createdAt)),
            h('td', { class: 'num' }, btn));
        }),
      ));
      pagerRoot.replaceChildren(pager(meta, (p) => { userState.page = p; load(); }));
    } catch (err) {
      list.replaceChildren(emptyState({ title: 'Не удалось загрузить пользователей', text: err.message }));
    }
  }
  load();
}

/* ═════════════ Маршрутизация по hash ═════════════ */
const ROUTES = { dashboard, products, categories, discounts, orders, users };

function route() {
  const [key, param] = window.location.hash.replace(/^#/, '').split('/');
  const current = ROUTES[key] ? key : 'dashboard';
  tabsRoot.querySelectorAll('.admin__tab').forEach((a) => {
    a.setAttribute('aria-current', a.dataset.key === current ? 'page' : 'false');
  });
  document.title = `${TABS.find((t) => t.key === current).label} — Админ-панель SYNQ`;
  ROUTES[current](param).catch(toastError);
}

async function init() {
  const user = await initPage({ active: 'admin' });
  if (!guard(user, 'ADMIN')) return;

  try {
    storageReady = (await api.health()).data.storage === 'configured';
  } catch {
    storageReady = false;
  }

  tabsRoot.append(...TABS.map((t) => h('a', { class: 'admin__tab', href: `#${t.key}`, 'data-key': t.key }, icon(t.icon), t.label)));
  ['product-sheet', 'category-dialog', 'confirm-dialog'].forEach((id) => closeOnBackdrop(document.getElementById(id)));
  document.getElementById('product-sheet').addEventListener('close', () => {
    if (window.location.hash.startsWith('#products/')) history.replaceState(null, '', '#products');
  });

  window.addEventListener('hashchange', route);
  route();
}

init().catch((err) => {
  console.error(err);
  toastError(err);
});
