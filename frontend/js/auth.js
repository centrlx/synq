import { api, tokenStore } from './api.js';
import { initPage } from './layout.js';
import { clearFieldErrors, equalizer, params, showFieldErrors, withBusy } from './ui.js';

const page = document.body.dataset.page;

/** Разрешаем возврат только на внутренние страницы (защита от open redirect). */
function nextUrl() {
  const next = params().get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function alertBox(form) {
  return form.querySelector('.form-alert');
}

function showAlert(form, message) {
  const box = alertBox(form);
  box.textContent = message;
  box.hidden = false;
}

function validateClient(form, rules) {
  const errors = [];
  for (const [field, check] of Object.entries(rules)) {
    const message = check(form.elements[field].value);
    if (message) errors.push({ field, message });
  }
  return errors;
}

const rules = {
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Введите корректный email'),
  name: (v) => (v.trim().length >= 2 ? '' : 'Имя должно содержать не менее 2 символов'),
  password: (v) => {
    if (v.length < 8) return 'Не менее 8 символов';
    if (!/[A-Za-zА-Яа-яЁё]/.test(v)) return 'Добавьте хотя бы одну букву';
    if (!/\d/.test(v)) return 'Добавьте хотя бы одну цифру';
    return '';
  },
  loginPassword: (v) => (v ? '' : 'Введите пароль'),
};

async function submit(form, rulesSet, call) {
  clearFieldErrors(form);
  alertBox(form).hidden = true;

  const errors = validateClient(form, rulesSet);
  if (errors.length) {
    showFieldErrors(form, errors);
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  await withBusy(button, async () => {
    try {
      const { data } = await call();
      tokenStore.set(data.token);
      window.location.replace(nextUrl());
    } catch (err) {
      if (!(err.details && showFieldErrors(form, err.details))) showAlert(form, err.message);
    }
  });
}

async function init() {
  // Вход и регистрация — без шапки и футера: только форма и логотип для возврата на главную
  const user = await initPage({ header: false, footer: false });
  if (user) {
    window.location.replace(nextUrl());
    return;
  }

  document.getElementById('auth-aside').prepend(equalizer(40));

  // Сохраняем параметр next при переключении между входом и регистрацией
  const next = params().get('next');
  if (next) {
    const link = document.getElementById('switch-link');
    link.href = `${link.getAttribute('href')}?next=${encodeURIComponent(next)}`;
  }

  if (page === 'login') {
    const form = document.getElementById('login-form');
    form.email.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(form, { email: rules.email, password: rules.loginPassword }, () =>
        api.login({ email: form.email.value.trim(), password: form.password.value }));
    });
  }

  if (page === 'register') {
    const form = document.getElementById('register-form');
    const meter = document.getElementById('strength');
    form.name.focus();

    form.password.addEventListener('input', () => {
      const v = form.password.value;
      let level = 0;
      if (v.length >= 8) level += 1;
      if (/[A-Za-zА-Яа-яЁё]/.test(v) && /\d/.test(v)) level += 1;
      if (v.length >= 12) level += 1;
      if (/[^A-Za-zА-Яа-яЁё0-9]/.test(v) || /[a-z]/.test(v) && /[A-Z]/.test(v)) level += 1;
      meter.dataset.level = String(v ? Math.max(level, 1) : 0);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(form, { name: rules.name, email: rules.email, password: rules.password }, () =>
        api.register({ name: form.name.value.trim(), email: form.email.value.trim(), password: form.password.value }));
    });
  }

  // Ошибка поля исчезает, как только пользователь начинает его исправлять
  document.querySelector('form').addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid')) {
      e.target.removeAttribute('aria-invalid');
      const err = e.target.closest('.field')?.querySelector('.field__error');
      if (err) err.textContent = '';
    }
  });
}

init().catch((err) => console.error(err));

