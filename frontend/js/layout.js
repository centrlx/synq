import { api, tokenStore } from './api.js';
import { bindSpotlightShortcuts, openSpotlight } from './spotlight.js';
import { h, icon } from './ui.js';

/* ───────────── Сессия ───────────── */
let currentUser = null;

export async function loadSession() {
  if (!tokenStore.get()) return null;
  try {
    const { data } = await api.me();
    currentUser = data;
  } catch {
    tokenStore.clear();
    currentUser = null;
  }
  return currentUser;
}

export const getUser = () => currentUser;

export function logout() {
  tokenStore.clear();
  currentUser = null;
  window.location.href = '/';
}

export function loginUrl() {
  const next = window.location.pathname + window.location.search;
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Охрана страниц: без входа — на /login, без нужной роли — на главную. */
export function guard(user, role) {
  if (!user) {
    window.location.replace(loginUrl());
    return false;
  }
  if (role && user.role !== role) {
    window.location.replace('/');
    return false;
  }
  return true;
}

/* ───────────── Header ───────────── */
const LINKS = [
  { href: '/', label: 'Главная', key: 'home' },
  { href: '/catalog', label: 'Каталог', key: 'catalog' },
  { href: '/brands', label: 'Бренды', key: 'brands' },
  { href: '/reviews', label: 'Отзывы', key: 'reviews' },
];

function logo(tone) {
  return h('a', { class: 'logo', href: '/', 'aria-label': 'SYNQ — на главную', 'data-tone': tone },
    h('span', { class: 'logo__mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
    'SYNQ');
}

function userMenu(user) {
  const items = [];
  const mobileLinks = h('div', { class: 'menu__links-mobile' },
    LINKS.map((l) => h('a', { class: 'menu__item', href: l.href }, l.label)));

  if (user) {
    items.push(
      h('div', { class: 'menu__head' },
        h('div', { class: 'menu__name' }, user.name),
        h('div', { class: 'menu__email' }, user.email)),
      mobileLinks,
      h('a', { class: 'menu__item', href: '/account' }, icon('user', { size: 16 }), 'Аккаунт'),
      h('a', { class: 'menu__item', href: '/orders' }, icon('receipt', { size: 16 }), 'Мои заказы'),
    );
    if (user.role === 'ADMIN') {
      items.push(h('a', { class: 'menu__item', href: '/admin' }, icon('gauge', { size: 16 }), 'Админ-панель'));
    }
    items.push(h('button', { class: 'menu__item menu__item--danger', type: 'button', onclick: logout }, icon('logout', { size: 16 }), 'Выйти'));
  } else {
    items.push(
      mobileLinks,
      h('a', { class: 'menu__item', href: loginUrl() }, icon('user', { size: 16 }), 'Войти'),
      h('a', { class: 'menu__item', href: '/register' }, icon('plus', { size: 16 }), 'Создать аккаунт'),
    );
  }
  return h('div', { class: 'menu', id: 'user-menu', popover: 'auto' }, items);
}

export function renderHeader({ active, tone = 'light' } = {}) {
  const user = currentUser;
  const nav = h('header', { class: 'nav', 'data-tone': tone },
    h('div', { class: 'container nav__inner' },
      logo(tone),
      h('nav', { class: 'nav__links', 'aria-label': 'Основная навигация' },
        LINKS.map((l) => h('a', { class: 'nav__link', href: l.href, 'aria-current': l.key === active ? 'page' : null }, l.label)),
        user?.role === 'ADMIN'
          ? h('a', { class: 'nav__link', href: '/admin', 'aria-current': active === 'admin' ? 'page' : null }, 'Админ-панель')
          : null),
      h('div', { class: 'nav__actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Поиск по каталогу (⌘K)', 'aria-keyshortcuts': 'Meta+K Control+K /', onclick: openSpotlight }, icon('search')),
        user
          ? h('a', { class: 'icon-btn', href: '/orders', 'aria-label': 'Мои заказы' }, icon('bag'))
          : h('a', { class: 'nav__link', href: loginUrl(), style: { opacity: 1 } }, 'Войти'),
        h('button', {
          class: user ? 'icon-btn' : 'icon-btn nav__menu-btn',
          type: 'button',
          popovertarget: 'user-menu',
          'aria-label': user ? `Меню пользователя ${user.name}` : 'Меню',
        }, user ? h('span', { class: 'avatar' }, user.name.trim()[0]?.toUpperCase() ?? '•') : icon('menu')))),
    userMenu(user));

  // Над тёмным hero навигация тёмная, ниже — светлая;
  // тень под навигацией появляется только когда контент уходит под неё.
  const darkZone = tone === 'dark' ? document.querySelector('[data-dark-zone]') : null;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      nav.dataset.scrolled = String(window.scrollY > 4);
      if (darkZone) nav.dataset.tone = darkZone.getBoundingClientRect().bottom > nav.offsetHeight ? 'dark' : 'light';
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.body.prepend(nav);
  document.body.prepend(h('a', { class: 'skip-link', href: '#main' }, 'Перейти к содержимому'));
  return nav;
}

export function renderFooter() {
  const year = new Date().getFullYear();
  const isAdmin = currentUser?.role === 'ADMIN';
  const footer = h('footer', { class: 'footer' },
    h('div', { class: 'container' },
      h('div', { class: `footer__grid${isAdmin ? ' footer__grid--admin' : ''}` },
        h('div', { class: 'footer__brand' },
          logo('light'),
          h('p', {}, 'Магазин VST-плагинов, DAW и подписок на сервисы для музыкантов.')),
        h('div', {},
          h('p', { class: 'footer__title' }, 'Магазин'),
          h('ul', { class: 'footer__list' },
            h('li', {}, h('a', { href: '/catalog' }, 'Каталог')),
            h('li', {}, h('a', { href: '/#categories' }, 'Категории')),
            h('li', {}, h('a', { href: '/brands' }, 'Бренды')),
            h('li', {}, h('a', { href: '/reviews' }, 'Отзывы')))),
        h('div', {},
          h('p', { class: 'footer__title' }, 'Аккаунт'),
          h('ul', { class: 'footer__list' },
            currentUser
              ? [h('li', {}, h('a', { href: '/account' }, 'Профиль')), h('li', {}, h('a', { href: '/orders' }, 'Заказы и загрузки'))]
              : [h('li', {}, h('a', { href: '/login' }, 'Вход')), h('li', {}, h('a', { href: '/register' }, 'Регистрация'))])),
        // Служебные ссылки видит только администратор
        isAdmin
          ? h('div', {},
            h('p', { class: 'footer__title' }, 'Администратору'),
            h('ul', { class: 'footer__list' },
              h('li', {}, h('a', { href: '/admin' }, 'Админ-панель')),
              h('li', {}, h('a', { href: '/api/health' }, 'Статус API')),
              h('li', {}, h('a', { href: '/api/products' }, 'REST API: товары'))))
          : null),
      h('div', { class: 'footer__legal' },
        h('span', {}, `© ${year} SYNQ. Все права защищены.`),
        h('span', { class: 'footer__docs' },
          h('a', { href: '/offer' }, 'Публичная оферта'),
          h('a', { href: '/privacy' }, 'Политика конфиденциальности')))));
  document.body.append(footer);
  return footer;
}

/** Общая инициализация страницы: сессия → header → footer. */
export async function initPage({ active, tone = 'light', header = true, footer = true } = {}) {
  const user = await loadSession();
  if (header) {
    renderHeader({ active, tone });
    bindSpotlightShortcuts();
  }
  if (footer) renderFooter();
  window.addEventListener('synq:logout', () => window.location.replace(loginUrl()), { once: true });
  return user;
}
