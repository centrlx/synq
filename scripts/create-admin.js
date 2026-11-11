/**
 * Создание администратора SYNQ.
 *   npm run admin:create -- --email owner@example.com --name "Имя"
 * Пароль запрашивается интерактивно (ввод скрыт) или берётся из ADMIN_PASSWORD.
 * Если пользователь с таким email уже есть — ему назначается роль ADMIN (пароль не меняется).
 */
import { parseArgs } from 'node:util';
import readline from 'node:readline';
import { prisma } from '../src/config/prisma.js';
import { ensureAdmin } from './admin-core.js';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});

try {
  if (!values.email) throw new Error('Укажите --email');
  const existing = await prisma.user.findUnique({ where: { email: values.email.trim().toLowerCase() } });
  let password = 'unused-for-existing1';
  if (!existing) {
    if (!values.name) throw new Error('Для нового администратора укажите --name');
    password = process.env.ADMIN_PASSWORD || (await askHidden('Пароль администратора (мин. 8 символов, буквы и цифры): '));
  }
  const { user, created } = await ensureAdmin({ email: values.email, name: values.name ?? existing?.name, password });
  console.log(created ? `✔ Администратор создан: ${user.email}` : `✔ Пользователю ${user.email} назначена роль ADMIN`);
} catch (err) {
  const msg = err.issues ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : err.message;
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
