import { api } from './api.js';
import { downloadOrder } from './actions.js';
import { openCheckout } from './checkout.js';
import { guard, initPage } from './layout.js';
import {
  clearFieldErrors, cover, emptyState, fmt, h, icon, pager, showFieldErrors, statusBadge, toast, toastError, withBusy,
} from './ui.js';

const page = document.body.dataset.page;

/** Строка заказа с действиями: скачать (PAID), отменить (PENDING). */
function orderRow(order, onChange) {
  const actions = h('div', { class: 'order__actions' });

  if (order.status === 'PAID') {
    if (order.product.hasFile) {
      const dl = h('button', { class: 'btn btn--sm', type: 'button' }, icon('download', { size: 15 }), 'Скачать');
      dl.addEventListener('click', () => downloadOrder(order.id, dl));
      actions.append(dl);
    } else {
      actions.append(h('span', { class: 'badge' }, 'Файл готовится продавцом'));
    }
  }

  if (order.status === 'PENDING') {
    const pay = h('button', { class: 'btn btn--sm', type: 'button' }, 'Оплатить');
    pay.addEventListener('click', () => openCheckout(order, order.product, onChange));
    actions.append(pay);
    const cancel = h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, 'Отменить');
    cancel.addEventListener('click', () => withBusy(cancel, async () => {
      try {
        await api.setOrderStatus(order.id, 'CANCELLED');
        toast('Заказ отменён');
        onChange();
      } catch (err) {
        toastError(err);
      }
    }));
    actions.append(cancel);
  }

  const link = order.product.isActive ? `/product?id=${order.product.id}` : null;
  const title = link ? h('a', { class: 'order__title', href: link }, order.product.name) : h('span', { class: 'order__title' }, order.product.name);

  return h('article', { class: 'order' },
    cover(order.product),
    h('div', {},
      title,
      h('div', { class: 'order__meta' },
        statusBadge(order.status),
        h('span', { class: 'tabular' }, fmt.price(order.priceAtPurchase)),
        h('span', {}, fmt.dateTime(order.createdAt)),
        order.product.category ? h('span', {}, order.product.category.name) : null)),
    actions);
}

/* ═════════════ Аккаунт ═════════════ */
async function account() {
  const user = await initPage({ active: 'account' });
  if (!guard(user)) return;

  const hero = document.getElementById('account-hero');
  const renderHero = (u) => hero.replaceChildren(
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, u.name.trim()[0]?.toUpperCase() ?? '•'),
    h('div', {},
      h('h1', {}, u.name),
      h('p', { class: 'muted' }, u.role === 'ADMIN' ? 'Администратор магазина' : 'Покупатель')),
  );

  const kv = document.getElementById('profile-kv');
  const renderProfile = (u) => kv.replaceChildren(
    ...[
      ['Email', u.email],
      ['Заказов', String(u._count?.orders ?? 0)],
      ['С нами с', fmt.date(u.createdAt)],
    ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
  );

  renderHero(user);
  renderProfile(user);

  const form = document.getElementById('profile-form');
  form.name.value = user.name;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const alert = form.querySelector('.form-alert');
    alert.hidden = true;

    const body = {};
    if (form.name.value.trim() && form.name.value.trim() !== user.name) body.name = form.name.value.trim();
    if (form.newPassword.value) {
      body.newPassword = form.newPassword.value;
      body.currentPassword = form.currentPassword.value;
    }
    if (Object.keys(body).length === 0) {
      alert.className = 'form-alert';
      alert.textContent = 'Нет изменений для сохранения.';
      alert.hidden = false;
      return;
    }

    withBusy(form.querySelector('button[type="submit"]'), async () => {
      try {
        const { data } = await api.updateMe(body);
        Object.assign(user, data);
        renderHero(user);
        renderProfile(user);
        form.currentPassword.value = '';
        form.newPassword.value = '';
        alert.className = 'form-alert form-alert--ok';
        alert.textContent = body.newPassword ? 'Пароль и данные профиля обновлены.' : 'Профиль обновлён.';
        alert.hidden = false;
      } catch (err) {
        if (!(err.details && showFieldErrors(form, err.details))) {
          alert.className = 'form-alert';
          alert.textContent = err.message;
          alert.hidden = false;
        }
      }
    });
  });

  document.querySelector('.panel__head .link-arrow')?.append(icon('arrow'));
  const recent = document.getElementById('recent-orders');
  const loadRecent = async () => {
    try {
      const { data } = await api.myOrders({ limit: 5 });
      if (data.length === 0) {
        recent.replaceChildren(emptyState({
          title: 'У вас пока нет заказов',
          text: 'Выберите инструмент в каталоге — заказ появится здесь.',
          action: h('a', { class: 'btn', href: '/catalog' }, 'Открыть каталог'),
        }));
        return;
      }
      recent.replaceChildren(h('div', { class: 'order-list stagger' }, data.map((o) => orderRow(o, loadRecent))));
    } catch (err) {
      recent.replaceChildren(emptyState({ title: 'Не удалось загрузить заказы', text: err.message }));
    }
  };
  loadRecent();
}

/* ═════════════ Мои заказы ═════════════ */
async function orders() {
  const user = await initPage({ active: 'orders' });
  if (!guard(user)) return;

  const list = document.getElementById('orders-list');
  const pagerRoot = document.getElementById('pager');
  const filter = document.getElementById('status-filter');
  const state = { status: '', page: 1 };

  const load = async () => {
    list.replaceChildren(h('div', { style: { display: 'grid', gap: '16px' } },
      [1, 2, 3].map(() => h('div', { class: 'skeleton', style: { height: '64px' } }))));
    try {
      const { data, meta } = await api.myOrders({ status: state.status || undefined, page: state.page, limit: 10 });
      if (data.length === 0) {
        list.replaceChildren(emptyState(state.status
          ? { title: 'Нет заказов с таким статусом', text: 'Выберите другой фильтр.' }
          : {
            title: 'У вас пока нет заказов',
            text: 'Когда вы оформите заказ, здесь появятся его статус и ссылка на скачивание.',
            action: h('a', { class: 'btn', href: '/catalog' }, 'Открыть каталог'),
          }));
        pagerRoot.replaceChildren();
        return;
      }
      list.replaceChildren(h('div', { class: 'order-list stagger' }, data.map((o) => orderRow(o, load))));
      pagerRoot.replaceChildren(pager(meta, (p) => { state.page = p; load(); }));
    } catch (err) {
      list.replaceChildren(emptyState({ title: 'Не удалось загрузить заказы', text: err.message }));
    }
  };

  filter.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    filter.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    state.status = btn.dataset.status;
    state.page = 1;
    load();
  });

  load();
}

const handlers = { account, orders };
handlers[page]?.().catch((err) => {
  console.error(err);
  toastError(err);
});
