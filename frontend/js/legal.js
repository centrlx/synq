import { initPage } from './layout.js';
import { h } from './ui.js';

/** Документы: оглавление строится из заголовков разделов, текущий раздел подсвечивается. */
async function init() {
  await initPage({ active: 'legal' });

  const toc = document.getElementById('toc');
  const sections = [...document.querySelectorAll('.legal__doc section[id]')];
  const links = sections.map((s) => h('a', { href: `#${s.id}` }, s.querySelector('h2').textContent));
  toc.append(h('p', { class: 'legal__toc-title' }, 'Содержание'), ...links);

  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.setAttribute('aria-current', String(a.hash === `#${e.target.id}`)));
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  sections.forEach((s) => io.observe(s));
}

init().catch((err) => console.error(err));
