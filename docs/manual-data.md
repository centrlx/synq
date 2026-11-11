# Как наполнить магазин данными

SYNQ **не создаёт** демонстрационные товары, категории, заказы или пользователей ни при запуске, ни через сид. После установки каталог пуст — так и задумано. Ниже — порядок ручного наполнения настоящими данными.

## 1. Создать администратора

Публичная регистрация всегда выдаёт роль `USER`, поэтому первый администратор создаётся из консоли:

```bash
npm run admin:create -- --email you@example.com --name "Ваше имя"
```

Пароль запрашивается скрыто (или берётся из переменной `ADMIN_PASSWORD`). Если пользователь с таким email уже зарегистрирован через сайт, ему просто назначается роль `ADMIN`.

Альтернатива — `npm run db:seed` с заданными в `.env` переменными `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`.

## 2. Через админ-панель (рекомендуется)

1. Войдите на `http://localhost:4000/login` и откройте **Админ-панель**.
2. **Категории → Новая категория** — например, «VST-плагины», «DAW», «Подписки».
3. **Товары → Новый товар** — заполните название, категорию, цену, характеристики и описание, нажмите «Создать товар».
4. В том же окне загрузите **обложку** (JPG/PNG/WEBP до 5 МБ) и **цифровой файл** (до 50 МБ). Для этого должен быть настроен Supabase Storage (`npm run storage:setup`).

## 3. Через REST API (curl)

```bash
# Вход администратора и сохранение токена
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"ВАШ_ПАРОЛЬ"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# Категория
curl -s -X POST http://localhost:4000/api/categories \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"VST-плагины","description":"Инструменты и эффекты в форматах VST3, AU и AAX"}'

# Товар (categoryId — из ответа выше)
curl -s -X POST http://localhost:4000/api/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"…","description":"…","price":"49.90","categoryId":"<uuid>","formats":["VST3","AU"],"platforms":["macOS","Windows"]}'

# Обложка и файл товара (multipart/form-data)
curl -s -X POST http://localhost:4000/api/uploads/product-image \
  -H "Authorization: Bearer $TOKEN" -F productId=<uuid> -F file=@cover.png
curl -s -X POST http://localhost:4000/api/uploads/product-file \
  -H "Authorization: Bearer $TOKEN" -F productId=<uuid> -F file=@distribution.zip
```

## 4. Автотесты

Автотесты (`npm test`) работают **только во временной базе** `TEST_DATABASE_URL`: она создаётся перед прогоном и удаляется после него. Рабочая база тестами не затрагивается: при совпадении адресов тесты не запустятся.
