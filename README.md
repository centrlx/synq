# SYNQ

**REST API и интернет-магазин цифровых товаров для музыкального производства** — VST-плагины, DAW и подписки на сервисы для музыкантов.

Курсовая работа на тему «Разработка REST API для интернет-магазина цифровых товаров для музыкального производства».

**Цель:** спроектировать и реализовать работающее, документированное серверное приложение на Node.js, Express, PostgreSQL и Prisma ORM. В нём должны быть полный CRUD, регистрация и вход, JWT-аутентификация, авторизация по ролям, централизованная обработка ошибок, хранение файлов в Supabase Storage и автотесты.

> Магазин запускается **пустым**: нет демонстрационных товаров, пользователей, заказов и статистики. Категории и товары добавляет администратор через админ-панель или API ([docs/manual-data.md](docs/manual-data.md)).

---

## Содержание

1. [Технологии](#технологии)
2. [Архитектура](#архитектура)
3. [Структура директорий](#структура-директорий)
4. [База данных и ER-диаграмма](#база-данных-и-er-диаграмма)
5. [Установка и запуск](#установка-и-запуск)
6. [Supabase Storage](#supabase-storage)
7. [Frontend](#frontend)
8. [Работа с API: JWT, CRUD, роли](#работа-с-api-jwt-crud-роли)
9. [Таблица маршрутов](#таблица-маршрутов)
10. [Тестирование](#тестирование)
11. [Безопасность](#безопасность)
12. [Документация](#документация)

---

## Технологии

| Слой | Технологии |
|---|---|
| Runtime | Node.js ≥ 20.19 (разработка на 24 LTS), JavaScript ES Modules |
| HTTP | Express 5, Helmet, CORS, express-rate-limit |
| База данных | PostgreSQL 16+, Prisma ORM 7 (драйвер-адаптер `@prisma/adapter-pg`) |
| Аутентификация | JWT (`jsonwebtoken`, HS256), bcrypt |
| Валидация | Zod 4 (русские сообщения об ошибках) |
| Файлы | Supabase Storage (`@supabase/supabase-js`), Multer |
| Тесты | Jest 30, Supertest |
| Frontend | HTML5, CSS3, Vanilla JS (ES-модули), Google Fonts (Onest) |

## Архитектура

```
HTTP-запрос
   │
   ▼
routes/        ← URL, HTTP-метод, цепочка middleware
   │   requireAuth → requireRole → validate (Zod)
   ▼
controllers/   ← разбор req, формирование JSON-ответа { success, data, meta }
   ▼
services/      ← бизнес-логика, транзакции, Prisma, Supabase Storage
   ▼
PostgreSQL / Supabase Storage

Любая ошибка → middleware/errorHandler → { success: false, error: { code, message } }
```

* **routes** — только описание маршрутов и middleware.
* **controllers** — тонкий слой: берут проверенные данные (`req.valid`, `req.user`), вызывают сервис, отдают ответ.
* **services** — вся логика: проверка владельца, переходы статусов, резервирование остатков, мягкое удаление, работа с файлами.
* **middleware** — аутентификация, роли, валидация, загрузка файлов, 404 и централизованная обработка ошибок.
* **config** — загрузка и проверка `.env` (Zod), клиенты Prisma и Supabase.

## Структура директорий

```
synq/
├── prisma/
│   ├── schema.prisma          # модели User, Category, Product, Order
│   ├── migrations/            # SQL-миграции
│   └── seed.js                # создаёт ТОЛЬКО администратора из ADMIN_* (если заданы)
├── src/
│   ├── app.js                 # Express-приложение (Helmet, CORS, JSON, маршруты, статика)
│   ├── server.js              # запуск, проверка БД, graceful shutdown
│   ├── config/                # env.js, prisma.js, supabase.js
│   ├── routes/                # auth, users, categories, products, orders, uploads, stats
│   ├── controllers/
│   ├── services/              # бизнес-логика + selects.js (проекции без passwordHash)
│   ├── middleware/            # requireAuth, requireRole, validate, upload, errorHandler, notFound
│   ├── validators/            # Zod-схемы
│   ├── utils/                 # AppError, jwt, pagination, slugify, response
│   └── constants/roles.js
├── frontend/                  # витрина, кабинет и админ-панель (HTML + CSS + JS)
├── tests/                     # Jest + Supertest (отдельная тестовая БД)
├── docs/                      # api.md, openapi.yaml, er-diagram.md, permissions.md, defense.md
├── scripts/                   # create-admin.js, setup-storage.js
├── .env.example
├── prisma.config.ts           # конфигурация Prisma 7 (строка подключения, миграции, сид)
└── jest.config.js
```

## База данных и ER-диаграмма

```mermaid
erDiagram
    USERS ||--o{ ORDERS : "оформляет"
    CATEGORIES ||--o{ PRODUCTS : "содержит"
    PRODUCTS ||--o{ ORDERS : "входит в"
    USERS ||--o{ REVIEWS : "пишет"
    PRODUCTS ||--o{ REVIEWS : "получает"

    USERS {
        uuid id PK
        varchar email UK
        varchar name
        text password_hash "bcrypt"
        enum role "USER | ADMIN"
        timestamp created_at
        timestamp updated_at
    }
    CATEGORIES {
        uuid id PK
        varchar name UK
        varchar slug UK
        varchar description
        timestamp created_at
        timestamp updated_at
    }
    PRODUCTS {
        uuid id PK
        varchar name
        varchar slug UK
        text description
        decimal price "Decimal(10,2), тенге"
        decimal sale_price "цена со скидкой"
        timestamp sale_ends_at "окончание скидки"
        varchar developer
        varchar version
        text_array formats
        text_array platforms
        int stock "NULL = без ограничений"
        text image_url
        text image_path
        text file_path "приватный бакет"
        varchar file_name
        int file_size
        boolean is_active
        int views_count "просмотры для «Самого популярного»"
        uuid category_id FK
        timestamp created_at
        timestamp updated_at
    }
    ORDERS {
        uuid id PK
        uuid user_id FK
        uuid product_id FK
        decimal price_at_purchase "Decimal(10,2)"
        enum status "PENDING | PAID | CANCELLED"
        timestamp paid_at
        varchar payment_ref "номер транзакции"
        varchar card_brand
        varchar card_last4
        timestamp created_at
        timestamp updated_at
    }
    REVIEWS {
        uuid id PK
        uuid user_id FK
        uuid product_id FK
        smallint rating "1–5, CHECK"
        varchar text "до 2000 символов"
        timestamp created_at
        timestamp updated_at
    }
```

| Сущность | Назначение |
|---|---|
| **User** | Покупатель или администратор. `email` уникален, пароль хранится только как bcrypt-хеш, роль по умолчанию `USER`. |
| **Category** | Раздел каталога («Плагины», «DAW», «Подписки»). Уникальные `name` и `slug`. |
| **Product** | Цифровой товар: цена в тенге `Decimal(10,2)`, скидка (`salePrice`, `saleEndsAt`), характеристики (разработчик, версия, форматы, платформы), остаток лицензий `stock`, обложка и приватный файл в Supabase Storage, флаг `isActive` для мягкого удаления. |
| **Review** | Отзыв покупателя: оценка 1–5 и текст. Только после оплаченного заказа, один на товар (`UNIQUE(user_id, product_id)`). |
| **Order** | Покупка одного товара пользователем. Цена фиксируется в `priceAtPurchase`, статус `PENDING → PAID / CANCELLED`. |

Внешние ключи: `products.category_id → categories.id`, `orders.user_id → users.id`, `orders.product_id → products.id`, все с `ON DELETE RESTRICT`. Подробнее об индексах и решениях — в [docs/er-diagram.md](docs/er-diagram.md).

## Установка и запуск

### 1. Node.js

Нужен Node.js **20.19+** (рекомендуется 24 LTS) и npm.

```bash
# macOS (Homebrew)
brew install node
# Windows / Linux — установщик с https://nodejs.org или nvm
node -v
```

### 2. PostgreSQL

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16
# Ubuntu / Debian
sudo apt install postgresql && sudo systemctl start postgresql
# Windows — установщик EDB: https://www.postgresql.org/download/windows/
```

Создайте рабочую базу. Отдельную тестовую базу создавать не нужно: `npm test` сам создаёт временную базу и удаляет её после прогона.

```bash
createdb synq
```

### 3. Зависимости

```bash
npm install          # также выполняет prisma generate
```

### 4. Файл `.env`

```bash
cp .env.example .env
```

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | Строка подключения к рабочей БД, например `postgresql://user:pass@localhost:5432/synq?schema=public` |
| `TEST_DATABASE_URL` | Адрес **временной** БД для тестов: имя должно оканчиваться на `_test`; база создаётся перед тестами и удаляется после |
| `JWT_SECRET` | Случайная строка ≥ 32 символов: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Срок жизни токена (`12h`) |
| `CORS_ORIGIN` | Разрешённые origin через запятую |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Проект Supabase (см. ниже); ключ используется только на сервере |
| `SIGNED_URL_TTL` | Время жизни ссылки на скачивание, секунд (по умолчанию 120) |

При ошибке в конфигурации сервер не запустится и покажет, какая переменная некорректна.

### 5. Prisma и миграции

```bash
npm run db:migrate     # prisma migrate dev — создаёт таблицы
# в production: npm run db:deploy
npm run db:studio      # (необязательно) просмотр БД в браузере
```

### 6. Администратор

Публичная регистрация выдаёт только роль `USER`. Первого администратора создайте командой:

```bash
npm run admin:create -- --email you@example.com --name "Ваше имя"
```

Пароль вводится скрыто. Если пользователь уже зарегистрировался на сайте, ему просто назначится роль `ADMIN`. Альтернатива — `npm run db:seed` с переменными `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`. Сид **не создаёт** товары, категории и заказы.

### 7. Запуск

```bash
npm run dev     # разработка (nodemon)
npm start       # production
```

* API: `http://localhost:4000/api` (проверка — `GET /api/health`)
* Магазин: `http://localhost:4000`

## Деплой на Vercel

Продакшен: **https://synq-weld.vercel.app**

| Компонент | Где |
|---|---|
| Frontend (`frontend/`) | Vercel CDN, чистые адреса (`/catalog`, `/brands`) |
| REST API | Serverless-функция `api/index.js` (Express-приложение из `src/app.js`) |
| PostgreSQL | Neon (Vercel Marketplace, регион Франкфурт); `DATABASE_URL` подключён автоматически |
| Файлы | Supabase Storage (бакеты `product-images`, `product-files`) |

Конфигурация — в `vercel.json`: статика из `frontend/`, `/api/*` и неизвестные адреса → функция (404 отдаёт Express), заголовки безопасности (CSP, HSTS и др.).

```bash
npx vercel link                       # привязать папку к проекту
npx vercel env add JWT_SECRET production   # и остальные переменные из .env.example
DATABASE_URL="<DATABASE_URL_UNPOOLED>" npx prisma migrate deploy   # миграции в Neon
npx vercel deploy --prod
```

## Supabase Storage

1. Создайте проект на [supabase.com](https://supabase.com).
2. В **Project Settings → API** скопируйте `Project URL` в `SUPABASE_URL`, а `service_role` key — в `SUPABASE_SERVICE_ROLE_KEY`.
3. Создайте бакеты:

```bash
npm run storage:setup
```

| Бакет | Доступ | Содержимое | Ограничения |
|---|---|---|---|
| `product-images` | публичный | Обложки товаров | JPG / PNG / WEBP, ≤ 5 МБ |
| `product-files` | **приватный** | Дистрибутивы и контент | ≤ 50 МБ, разрешённые расширения |

Покупатель никогда не получает прямую ссылку на платный файл. После оплаты `GET /api/orders/:id/download` проверяет владельца и статус и выдаёт подписанную ссылку, которая действует `SIGNED_URL_TTL` секунд.

Без настроенного Supabase магазин работает, но загрузка и скачивание файлов возвращают `503 STORAGE_NOT_CONFIGURED`.

## Frontend

Frontend раздаётся тем же Express-сервером (`frontend/`), отдельный запуск не нужен. Все данные он получает из REST API через Fetch.

| Страница | URL | Доступ |
|---|---|---|
| Главная | `/` | все |
| Каталог (поиск, фильтры, сортировка, пагинация) | `/catalog` | все |
| Товар | `/product?id=<uuid>` | все |
| Бренды: алфавит, поиск, переход в каталог бренда | `/brands` | все |
| Отзывы покупателей: сводка, фильтры, лента | `/reviews` | все |
| Вход / регистрация | `/login`, `/register` | гость |
| Личный кабинет | `/account` | USER, ADMIN |
| Мои заказы и загрузки | `/orders` | USER, ADMIN |
| Админ-панель: обзор, товары, категории, заказы, пользователи | `/admin` | ADMIN |
| Публичная оферта | `/offer` | все |
| Политика конфиденциальности | `/privacy` | все |

Быстрый поиск Spotlight открывается сочетанием ⌘K / Ctrl+K или клавишей «/» на любой странице. Дизайн: чёрно-белая палитра, шрифт Onest, полупрозрачная навигация, генеративные обложки для товаров без изображения, Empty States для пустых разделов. Анимации учитывают `prefers-reduced-motion`.

> **JWT хранится в `localStorage`** — это учебный компромисс. Риск: при XSS вредоносный скрипт сможет прочитать токен. Меры: строгая CSP через Helmet (без inline-скриптов, только собственные скрипты), все данные вставляются через `textContent` (без `innerHTML`), ограниченный срок жизни токена. Более защищённый вариант — httpOnly-cookie с CSRF-токеном.

## Работа с API: JWT, CRUD, роли

```bash
API=http://localhost:4000/api

# Регистрация (роль всегда USER) и вход
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"buyer@example.com","name":"Анна","password":"Secret123"}'

TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"buyer@example.com","password":"Secret123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# Использование JWT
curl -s $API/auth/me -H "Authorization: Bearer $TOKEN"
```

CRUD товаров (токен администратора — `ADMIN_TOKEN`):

```bash
# Create
curl -s -X POST $API/products -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"…","description":"…","price":"49.90","categoryId":"<uuid>"}'
# Read
curl -s "$API/products?search=…&category=<slug>&sort=price_asc&page=1&limit=12"
curl -s $API/products/<uuid>
# Update
curl -s -X PATCH $API/products/<uuid> -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"price":"39.90"}'
# Delete (с заказами — архивирование)
curl -s -X DELETE $API/products/<uuid> -H "Authorization: Bearer $ADMIN_TOKEN"
# Связанная выборка
curl -s $API/categories/<uuid>/products
```

Проверка прав:

```bash
curl -s $API/orders/my                                         # без JWT → 401
curl -s $API/users -H "Authorization: Bearer $TOKEN"           # USER → 403
curl -s $API/users -H "Authorization: Bearer $ADMIN_TOKEN"     # ADMIN → 200
```

Полный сценарий демонстрации — в [docs/defense.md](docs/defense.md).

## Таблица маршрутов

| Метод | URL | Назначение | Доступ | Успех | Типичные ошибки |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | Регистрация | guest | 201 | 400, 409, 429 |
| POST | `/api/auth/login` | Вход, выдача JWT | guest | 200 | 400, 401, 429 |
| GET | `/api/auth/me` | Текущий пользователь | user | 200 | 401 |
| GET | `/api/users` | Список пользователей | admin | 200 | 401, 403 |
| GET | `/api/users/:id` | Профиль с заказами | свой / admin | 200 | 400, 401, 403, 404 |
| PATCH | `/api/users/me` | Изменить имя / пароль | user | 200 | 400, 401 |
| PATCH | `/api/users/:id/role` | Назначить роль | admin | 200 | 400, 401, 403, 404, 409 |
| GET | `/api/categories` | Список категорий | все | 200 | — |
| GET | `/api/categories/:id` | Категория | все | 200 | 400, 404 |
| GET | `/api/categories/:id/products` | Категория + товары | все | 200 | 400, 404 |
| POST | `/api/categories` | Создать категорию | admin | 201 | 400, 401, 403, 409 |
| PATCH | `/api/categories/:id` | Изменить категорию | admin | 200 | 400, 401, 403, 404, 409 |
| DELETE | `/api/categories/:id` | Удалить пустую категорию | admin | 200 | 401, 403, 404, 409 |
| GET | `/api/products` | Каталог: поиск, фильтры, сортировка, пагинация | все | 200 | 400 |
| GET | `/api/products/:id` | Товар с категорией | все | 200 | 400, 404 |
| POST | `/api/products` | Создать товар | admin | 201 | 400, 401, 403, 404, 409 |
| PATCH | `/api/products/:id` | Изменить товар | admin | 200 | 400, 401, 403, 404, 409 |
| DELETE | `/api/products/:id` | Удалить / архивировать | admin | 200 | 401, 403, 404 |
| POST | `/api/products/discounts` | Массовая скидка (% на категорию или каталог) | admin | 200 | 400, 401, 403, 404 |
| DELETE | `/api/products/discounts` | Снять скидки | admin | 200 | 400, 401, 403 |
| POST | `/api/orders` | Оформить заказ | user | 201 | 400, 401, 404, 409 |
| GET | `/api/orders/my` | Мои заказы | user | 200 | 401 |
| GET | `/api/orders` | Все заказы | admin | 200 | 401, 403 |
| GET | `/api/orders/:id` | Заказ | владелец / admin | 200 | 400, 401, 403, 404 |
| PATCH | `/api/orders/:id/status` | Сменить статус | admin (user — отмена своего) | 200 | 400, 401, 403, 404, 409 |
| POST | `/api/orders/:id/pay` | Оплата заказа картой (платёжный шлюз) | владелец | 200 | 400, 401, 402, 403, 404, 409 |
| GET | `/api/orders/:id/download` | Подписанная ссылка на файл | владелец PAID / admin | 200 | 401, 403, 404, 503 |
| POST | `/api/uploads/product-image` | Загрузить обложку | admin | 201 | 400, 401, 403, 404, 413, 503 |
| POST | `/api/uploads/product-file` | Загрузить цифровой файл | admin | 201 | 400, 401, 403, 404, 413, 503 |
| DELETE | `/api/uploads/product-image/:productId` | Удалить обложку | admin | 200 | 401, 403, 404, 503 |
| DELETE | `/api/uploads/product-file/:productId` | Удалить файл | admin | 200 | 401, 403, 404, 503 |
| GET | `/api/products/popular` | «Самое популярное»: покупки × 20 + просмотры | все | 200 | 400 |
| POST | `/api/products/:id/view` | Учёт просмотра товара | все | 200 | 400, 404 |
| GET | `/api/products/:id/reviews` | Отзывы товара + сводка рейтинга | все | 200 | 400, 404 |
| GET | `/api/products/:id/reviews/me` | Может ли пользователь оставить отзыв, его отзыв | user | 200 | 401 |
| POST | `/api/products/:id/reviews` | Оставить отзыв (после покупки) | user | 201 | 400, 401, 403, 404, 409 |
| GET | `/api/reviews` | Лента всех отзывов + сводка | все | 200 | 400 |
| PATCH | `/api/reviews/:id` | Изменить свой отзыв | автор | 200 | 400, 401, 403, 404 |
| DELETE | `/api/reviews/:id` | Удалить отзыв | автор / admin | 200 | 401, 403, 404 |
| GET | `/api/brands` | Бренды (разработчики) с количеством товаров | все | 200 | — |
| GET | `/api/stats` | Реальная статистика | admin | 200 | 401, 403 |
| GET | `/api/health` | Состояние API и БД | все | 200 | 500 |

Для каждого маршрута параметры, заголовки, примеры Request/Response и коды ошибок описаны в [docs/api.md](docs/api.md); машиночитаемая спецификация — [docs/openapi.yaml](docs/openapi.yaml).

Единый формат ответов:

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 12, "total": 0, "totalPages": 1 } }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Описание ошибки" } }
```

## Тестирование

```bash
npm test                 # 59 тестов, 5 наборов
npm run test:coverage    # с отчётом покрытия
```

Тесты используют **только** временную базу `TEST_DATABASE_URL`: `globalSetup` создаёт её и применяет миграции, наборы очищают таблицы, а `globalTeardown` удаляет базу целиком. Постоянной тестовой базы нет; при совпадении с `DATABASE_URL` или имени без суффикса `_test` запуск прерывается. Supabase в тестах заменяется изолированным in-memory драйвером, поэтому реальное хранилище не используется.

| Файл | Проверяет |
|---|---|
| `auth.test.js` | регистрацию, повторный email (409), попытку регистрации админа, вход, неверный пароль, отсутствующий и поддельный JWT |
| `products.test.js` | список (пустой и с фильтрами), товар по ID, создание, изменение, удаление, запрет для USER (403), mass assignment, связанную выборку |
| `categories.test.js` | полный CRUD категорий, 409 при дубликате slug и при удалении непустой категории |
| `orders.test.js` | создание заказа, «мои заказы», запрет чужих заказов, запрет скачивания неоплаченного, остатки, переходы статусов, мягкое удаление |
| `permissions.test.js` | матрицу guest/user/admin, роли, смену пароля, отсутствие `passwordHash`, загрузку и валидацию файлов |

## Безопасность

* Пароли — bcrypt (12 раундов); `passwordHash` исключён из всех Prisma-проекций.
* JWT HS256 с фиксированным алгоритмом и `issuer`; роль и существование пользователя проверяются по БД при каждом запросе.
* `requireAuth` / `requireRole`, проверка владельца заказа в сервисном слое.
* Zod `strictObject`: неизвестные поля отклоняются (защита от mass assignment), владелец заказа и цена определяются сервером.
* Helmet (CSP без inline-скриптов), настраиваемый CORS, лимит JSON — 100 КБ, rate limit на `/auth/login` и `/auth/register`.
* Файлы: проверка расширения, MIME и сигнатуры изображения; приватный бакет и подписанные ссылки для платного контента.
* Централизованный `errorHandler`: корректные HTTP-статусы, никаких stack trace в ответах (в development — только `debug`-сообщение).
* `.env`, ключи и `node_modules` исключены через `.gitignore`.

## Документация

| Файл | Содержание |
|---|---|
| [docs/api.md](docs/api.md) | Описание каждого endpoint: метод, URL, параметры, доступ, заголовки, примеры, коды |
| [docs/openapi.yaml](docs/openapi.yaml) | OpenAPI 3.0 |
| [docs/er-diagram.md](docs/er-diagram.md) | ER-диаграмма, связи, индексы |
| [docs/permissions.md](docs/permissions.md) | Матрица прав guest / user / admin |
| [docs/manual-data.md](docs/manual-data.md) | Как наполнить магазин настоящими данными |
| [docs/defense.md](docs/defense.md) | Сценарий защиты |

## npm-скрипты

| Команда | Действие |
|---|---|
| `npm run dev` | Сервер с автоперезапуском |
| `npm start` | Production-запуск |
| `npm run db:migrate` | Применить / создать миграции (dev) |
| `npm run db:deploy` | Применить миграции (production) |
| `npm run db:seed` | Создать администратора из `ADMIN_*` (без тестовых данных) |
| `npm run db:studio` | Prisma Studio |
| `npm run admin:create` | Создать администратора / выдать роль ADMIN |
| `npm run storage:setup` | Создать бакеты Supabase |
| `npm test` | Автотесты |
| `npm run test:coverage` | Автотесты с покрытием |
