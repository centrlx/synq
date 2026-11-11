import { api } from './api.js';
import { downloadOrder } from './actions.js';
import { cover, fmt, h } from './ui.js';

/**
 * Оформление оплаты картой.
 * Полный номер, срок и CVV проверяются только в браузере и на сервер не отправляются:
 * платёжному шлюзу SYNQ передаются платёжная система и последние 4 цифры.
 */

const BRANDS = {
  visa: { label: 'VISA', test: /^4/ },
  mastercard: { label: 'Mastercard', test: /^(5[1-5]|2(2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720))/ },
  mir: { label: 'МИР', test: /^220[0-4]/ },
  amex: { label: 'AMEX', test: /^3[47]/ },
  unionpay: { label: 'UnionPay', test: /^62/ },
};

function detectBrand(digits) {
  for (const [key, b] of Object.entries(BRANDS)) if (b.test.test(digits)) return key;
  return 'card';
}

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

const onlyDigits = (v) => v.replace(/\D/g, '');

function formatNumber(digits, brand) {
  if (brand === 'amex') return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
  return digits.slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

/** Логотип платёжной системы на лицевой стороне карты. */
function brandMark(brand) {
  if (brand === 'mastercard') {
    return h('span', { class: 'cc-brand cc-brand--mc', 'aria-hidden': 'true' }, h('i'), h('i'));
  }
  return h('span', { class: 'cc-brand' }, BRANDS[brand]?.label ?? '');
}

const PROCESS_STEPS = ['Связываемся с банком…', 'Подтверждение 3-D Secure…', 'Проводим платёж…'];
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

let dialog;

/**
 * Открыть оплату заказа.
 * @param {object} order — заказ (id, priceAtPurchase, product)
 * @param {object} product — товар для сводки (name, imageUrl, category…)
 * @param {Function} onPaid — вызывается с оплаченным заказом
 */
export function openCheckout(order, product, onPaid) {
  if (!dialog) {
    dialog = h('dialog', { class: 'dialog checkout', 'aria-labelledby': 'checkout-title' });
    document.body.append(dialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog && !dialog.dataset.busy) dialog.close(); });
    // Во время проведения платежа окно закрыть нельзя
    dialog.addEventListener('cancel', (e) => { if (dialog.dataset.busy) e.preventDefault(); });
  }

  const amount = fmt.price(order.priceAtPurchase);

  // ── Визуальная карта
  const ccNumber = h('div', { class: 'cc-number' }, '•••• •••• •••• ••••');
  const ccName = h('div', { class: 'cc-value' }, 'ИМЯ ВЛАДЕЛЬЦА');
  const ccExp = h('div', { class: 'cc-value' }, 'ММ/ГГ');
  const ccCvc = h('div', { class: 'cc-cvc-value' }, '•••');
  const brandSlot = h('div', { class: 'cc-brand-slot' });
  const card = h('div', { class: 'cc', 'aria-hidden': 'true' },
    h('div', { class: 'cc__inner' },
      h('div', { class: 'cc__face cc__front' },
        h('div', { class: 'cc-top' },
          h('span', { class: 'cc-bank' }, 'SYNQ Pay'),
          h('span', { class: 'cc-contactless' }, h('i'), h('i'), h('i'))),
        h('div', { class: 'cc-chip' }),
        ccNumber,
        h('div', { class: 'cc-bottom' },
          h('div', {}, h('div', { class: 'cc-label' }, 'Владелец'), ccName),
          h('div', {}, h('div', { class: 'cc-label' }, 'Срок'), ccExp),
          brandSlot)),
      h('div', { class: 'cc__face cc__back' },
        h('div', { class: 'cc-stripe' }),
        h('div', { class: 'cc-sign' }, h('span', { class: 'cc-label' }, 'CVC'), ccCvc),
        h('p', { class: 'cc-note' }, 'Данные карты защищены и не сохраняются в магазине.'))));

  // ── Форма
  const field = (label, input, extra) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), input, extra);
  const number = h('input', { class: 'input', name: 'cc-number', inputmode: 'numeric', autocomplete: 'cc-number', placeholder: '0000 0000 0000 0000', maxlength: '19', required: true });
  const holder = h('input', { class: 'input', name: 'cc-name', autocomplete: 'cc-name', placeholder: 'IVAN IVANOV', maxlength: '40', spellcheck: false });
  const exp = h('input', { class: 'input', name: 'cc-exp', inputmode: 'numeric', autocomplete: 'cc-exp', placeholder: 'ММ/ГГ', maxlength: '5' });
  const cvc = h('input', { class: 'input', name: 'cc-csc', inputmode: 'numeric', autocomplete: 'cc-csc', placeholder: '•••', maxlength: '4', type: 'password' });
  const alert = h('div', { class: 'form-alert', role: 'alert', hidden: true });
  const payBtn = h('button', { class: 'btn btn--lg btn--block', type: 'submit' }, `Оплатить ${amount}`);
  const status = h('p', { class: 'checkout__status', 'aria-live': 'polite' });

  const form = h('form', { class: 'checkout__form', novalidate: true, autocomplete: 'on' },
    alert,
    field('Номер карты', number),
    field('Имя на карте', holder),
    h('div', { class: 'checkout__row' }, field('Срок действия', exp), field('CVC', cvc)),
    payBtn,
    status,
    h('p', { class: 'checkout__secure' }, h('span', { class: 'checkout__lock', 'aria-hidden': 'true' }), 'Защищённое соединение · 3-D Secure'));

  let brand = 'card';
  const render = () => {
    const digits = onlyDigits(number.value);
    brand = detectBrand(digits);
    card.dataset.brand = brand;
    ccNumber.textContent = digits ? formatNumber(digits.padEnd(brand === 'amex' ? 15 : 16, '•'), brand) : '•••• •••• •••• ••••';
    ccName.textContent = holder.value.trim().toUpperCase() || 'ИМЯ ВЛАДЕЛЬЦА';
    ccExp.textContent = exp.value || 'ММ/ГГ';
    ccCvc.textContent = cvc.value ? '•'.repeat(cvc.value.length) : '•••';
    brandSlot.replaceChildren(brandMark(brand));
  };

  number.addEventListener('input', () => {
    const digits = onlyDigits(number.value).slice(0, 19);
    number.value = formatNumber(digits, detectBrand(digits));
    render();
  });
  holder.addEventListener('input', () => { holder.value = holder.value.replace(/[^A-Za-z\s-]/g, '').toUpperCase(); render(); });
  exp.addEventListener('input', () => {
    const d = onlyDigits(exp.value).slice(0, 4);
    exp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    render();
  });
  cvc.addEventListener('input', () => { cvc.value = onlyDigits(cvc.value).slice(0, 4); render(); });
  // Переворот карты при вводе CVC
  cvc.addEventListener('focus', () => card.classList.add('is-flipped'));
  cvc.addEventListener('blur', () => card.classList.remove('is-flipped'));

  const markInvalid = (input, bad) => input.setAttribute('aria-invalid', String(bad));

  function validate() {
    const digits = onlyDigits(number.value);
    const [mm, yy] = exp.value.split('/').map(Number);
    const now = new Date();
    const expOk = mm >= 1 && mm <= 12 && yy >= 0
      && new Date(2000 + yy, mm, 0, 23, 59, 59) >= now;
    const checks = [
      [number, luhn(digits), 'Проверьте номер карты'],
      [holder, holder.value.trim().length >= 2, 'Укажите имя владельца, как на карте'],
      [exp, expOk, 'Срок действия карты истёк или указан неверно'],
      [cvc, cvc.value.length === (brand === 'amex' ? 4 : 3), 'Проверьте CVC'],
    ];
    for (const [input, ok] of checks) markInvalid(input, !ok);
    return checks.find(([, ok]) => !ok)?.[2] ?? null;
  }

  // ── Экран успеха
  function success(paid) {
    const actions = h('div', { class: 'checkout__actions' });
    if (paid.product?.hasFile) {
      const dl = h('button', { class: 'btn btn--lg', type: 'button' }, 'Скачать');
      dl.addEventListener('click', () => downloadOrder(paid.id, dl));
      actions.append(dl);
    }
    actions.append(h('a', { class: 'btn btn--ghost btn--lg', href: '/orders' }, 'Мои заказы'));

    dialog.replaceChildren(h('div', { class: 'checkout__success' },
      h('button', { class: 'icon-btn checkout__close', type: 'button', 'aria-label': 'Закрыть', onclick: () => dialog.close() }, '×'),
      h('svg', { class: 'checkmark', viewBox: '0 0 52 52', 'aria-hidden': 'true' }),
      h('h2', { class: 'checkout__title', id: 'checkout-title' }, 'Оплата прошла успешно'),
      h('p', { class: 'muted' }, `${amount} · ${BRANDS[paid.cardBrand]?.label ?? 'Карта'} •••• ${paid.cardLast4}`),
      h('div', { class: 'checkout__product' }, cover(product), h('div', {},
        h('div', { class: 'cell-title' }, product.name),
        h('div', { class: 'cell-sub' }, `Транзакция ${paid.paymentRef} · ${fmt.dateTime(paid.paidAt)}`))),
      actions));
    // SVG-галочка собирается вручную: h() создаёт HTML-элементы
    const svg = dialog.querySelector('.checkmark');
    svg.outerHTML = '<svg class="checkmark" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert.hidden = true;
    const error = validate();
    if (error) {
      alert.textContent = error;
      alert.hidden = false;
      return;
    }

    const digits = onlyDigits(number.value);
    dialog.dataset.busy = 'true';
    form.classList.add('is-busy');
    payBtn.disabled = true;
    payBtn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Обработка…');

    // Шаги обработки идут параллельно с запросом к платёжному шлюзу
    let step = 0;
    status.textContent = PROCESS_STEPS[0];
    const ticker = setInterval(() => { step = Math.min(step + 1, PROCESS_STEPS.length - 1); status.textContent = PROCESS_STEPS[step]; }, 900);

    try {
      const [res] = await Promise.all([
        api.payOrder(order.id, { cardBrand: brand, cardLast4: digits.slice(-4) }),
        sleep(2400),
      ]);
      form.reset(); // данные карты стираются сразу после успешной оплаты
      render();
      success(res.data);
      onPaid?.(res.data);
    } catch (err) {
      alert.textContent = err.message;
      alert.hidden = false;
      payBtn.disabled = false;
      payBtn.replaceChildren(`Оплатить ${amount}`);
    } finally {
      clearInterval(ticker);
      status.textContent = '';
      delete dialog.dataset.busy;
      form.classList.remove('is-busy');
    }
  });

  render();
  dialog.replaceChildren(
    h('div', { class: 'checkout__grid' },
      h('aside', { class: 'checkout__summary' },
        h('p', { class: 'eyebrow' }, 'Ваш заказ'),
        cover(product),
        h('div', {},
          h('h2', { class: 'checkout__title', id: 'checkout-title' }, product.name),
          product.developer ? h('p', { class: 'muted' }, product.developer) : null),
        h('dl', { class: 'kv' },
          h('div', {}, h('dt', {}, 'Товар'), h('dd', {}, amount)),
          h('div', {}, h('dt', {}, 'Доставка'), h('dd', {}, 'Цифровая, мгновенно')),
          h('div', { class: 'checkout__total' }, h('dt', {}, 'Итого'), h('dd', {}, amount)))),
      h('section', { class: 'checkout__pay' },
        h('div', { class: 'checkout__head' },
          h('h3', { class: 'checkout__subtitle' }, 'Оплата картой'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть', onclick: () => { if (!dialog.dataset.busy) dialog.close(); } }, '×')),
        card,
        form)));

  dialog.showModal();
  number.focus();
}
