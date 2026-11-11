# SYNQ REST API — справочник

* Базовый URL: `http://localhost:4000/api`
* Валюта: казахстанский тенге (₸, KZT); цены — строки с двумя знаками (`"4999.00"`).
* Формат: JSON (`Content-Type: application/json`). Исключение — загрузка файлов: `multipart/form-data`.
* Авторизация: заголовок `Authorization: Bearer <JWT>` (токен выдают `/auth/register` и `/auth/login`).
* Машиночитаемая спецификация: [`openapi.yaml`](openapi.yaml). Матрица прав: [`permissions.md`](permissions.md).

> Значения в примерах (UUID, даты, имена) иллюстрируют формат ответа и не являются данными магазина.

## Формат ответов

Успех:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 12, "total": 0, "totalPages": 1 } }
```

`meta` присутствует только у списков с пагинацией.

Ошибка:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ошибка валидации входных данных",
    "details": [{ "field": "email", "message": "Некорректный email" }]
  }
}
```

| Статус | Когда | Пример `code` |
|---|---|---|
| 200 | Успешное чтение / изменение / удаление | — |
| 201 | Ресурс создан | — |
| 400 | Невалидные поля или типы, лишние поля, некорректный JSON или UUID | `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_FILE_TYPE` |
| 401 | Нет JWT, JWT недействителен или истёк, неверный пароль | `UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` |
| 403 | Недостаточно прав, чужой ресурс, неоплаченный заказ | `FORBIDDEN`, `ORDER_NOT_PAID` |
| 404 | Ресурс или маршрут не найден | `NOT_FOUND`, `ROUTE_NOT_FOUND`, `CATEGORY_NOT_FOUND` |
| 409 | Конфликт: дубликат, нарушение связи, недопустимый переход статуса | `EMAIL_TAKEN`, `SLUG_TAKEN`, `CATEGORY_NOT_EMPTY`, `ALREADY_ORDERED`, `OUT_OF_STOCK` |
| 413 | Слишком большой файл или тело запроса | `FILE_TOO_LARGE`, `PAYLOAD_TOO_LARGE` |
| 429 | Превышен лимит попыток входа/регистрации | `TOO_MANY_REQUESTS` |
| 500 | Непредвиденная ошибка (без stack trace в ответе) | `INTERNAL_ERROR` |
| 502 / 503 | Ошибка Supabase Storage / хранилище не настроено | `STORAGE_ERROR`, `STORAGE_NOT_CONFIGURED` |

---

## Auth

### POST /api/auth/register
Регистрация покупателя. Роль всегда `USER`.

* **Доступ:** guest · **Заголовки:** `Content-Type: application/json`
* **Тело:**
```json
{ "email": "buyer@example.com", "name": "Анна", "password": "Secret123" }
```
* **Ответ 201:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "0b6f…", "email": "buyer@example.com", "name": "Анна", "role": "USER", "createdAt": "2026-11-10T16:00:00.000Z", "updatedAt": "2026-11-10T16:00:00.000Z" },
    "token": "eyJhbGciOiJIUzI1NiIs…"
  }
}
```
* **Ошибки:** 400 (невалидные поля; лишнее поле `role`), 409 `EMAIL_TAKEN`, 429.

### POST /api/auth/login
Вход по email и паролю, выдача JWT.

* **Доступ:** guest · **Тело:** `{ "email": "buyer@example.com", "password": "Secret123" }`
* **Ответ 200:** `{ "success": true, "data": { "user": { … }, "token": "…" } }`
* **Ошибки:** 400, 401 `INVALID_CREDENTIALS` (одинаково для неверного пароля и несуществующего email), 429.

### GET /api/auth/me
Профиль текущего пользователя.

* **Доступ:** user, admin · **Заголовки:** `Authorization: Bearer <JWT>`
* **Ответ 200:** `{ "success": true, "data": { "id": "…", "email": "…", "name": "…", "role": "USER", "createdAt": "…", "updatedAt": "…", "_count": { "orders": 2 } } }`
* **Ошибки:** 401 `UNAUTHORIZED` / `INVALID_TOKEN` / `TOKEN_EXPIRED`.

---

## Users

### GET /api/users
Список пользователей (с количеством заказов).

* **Доступ:** admin · **Query:** `page` (1), `limit` (20, ≤100), `search` (имя/email), `role` (`USER|ADMIN`)
* **Ответ 200:** `data: [{ "id", "email", "name", "role", "createdAt", "updatedAt", "_count": { "orders": 0 } }]`, `meta`
* **Ошибки:** 400, 401, 403.

### GET /api/users/:id
Профиль пользователя и 10 последних заказов (связанная выборка Prisma `select` → `orders` → `product`).

* **Доступ:** admin — любой; user — только свой · **Параметры:** `id` (UUID)
* **Ответ 200:** `data: { "id", "email", "name", "role", "_count", "orders": [{ "id", "status", "priceAtPurchase", "createdAt", "product": { "id", "name", "slug" } }] }`
* **Ошибки:** 400 (не UUID), 401, 403 (чужой профиль), 404.

### PATCH /api/users/me
Изменение имени и/или пароля.

* **Доступ:** user, admin
* **Тело:** `{ "name": "Новое имя" }` или `{ "currentPassword": "Secret123", "newPassword": "NewSecret456" }`
* **Ответ 200:** обновлённый профиль (без `passwordHash`).
* **Ошибки:** 400 (пустое тело, лишние поля, `INVALID_CURRENT_PASSWORD`), 401.

### PATCH /api/users/:id/role
Назначение роли.

* **Доступ:** admin · **Тело:** `{ "role": "ADMIN" }`
* **Ответ 200:** профиль с новой ролью.
* **Ошибки:** 400, 401, 403, 404, 409 `SELF_ROLE_CHANGE`.

---

## Categories

### GET /api/categories
Все категории с количеством активных товаров.

* **Доступ:** все
* **Ответ 200:** `data: [{ "id", "name", "slug", "description", "createdAt", "updatedAt", "productsCount": 0 }]` (пустой массив, если категорий нет)

### GET /api/categories/:id
* **Доступ:** все · **Ответ 200:** категория с `productsCount` · **Ошибки:** 400, 404.

### GET /api/categories/:id/products
Связанная выборка: категория + её товары (Prisma `include` с фильтром, сортировкой и пагинацией).

* **Доступ:** все (admin видит и архивные товары) · **Query:** `page`, `limit`
* **Ответ 200:**
```json
{ "success": true, "data": { "category": { "id": "…", "name": "VST-плагины", "slug": "vst-plaginy" }, "items": [ { "id": "…", "name": "…", "price": "49.90", "category": { "id": "…", "name": "VST-плагины", "slug": "vst-plaginy" } } ] }, "meta": { "page": 1, "limit": 12, "total": 1, "totalPages": 1 } }
```
* **Ошибки:** 400, 404.

### POST /api/categories
* **Доступ:** admin · **Тело:** `{ "name": "VST-плагины", "slug": "vst", "description": "…" }` (`slug`, `description` — необязательны; slug формируется транслитерацией)
* **Ответ 201:** созданная категория.
* **Ошибки:** 400, 401, 403, 409 `SLUG_TAKEN` / `UNIQUE_CONSTRAINT`.

### PATCH /api/categories/:id
* **Доступ:** admin · **Тело:** любые из `name`, `slug`, `description` · **Ответ 200** · **Ошибки:** 400, 401, 403, 404, 409.

### DELETE /api/categories/:id
* **Доступ:** admin · **Ответ 200:** `{ "id": "…", "deleted": true }`
* **Ошибки:** 401, 403, 404, 409 `CATEGORY_NOT_EMPTY`.

---

## Products

### GET /api/products
Каталог с пагинацией, поиском, фильтрами и сортировкой.

* **Доступ:** все
* **Query:**

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | Номер страницы |
| `limit` | 1–100 | 12 | Размер страницы |
| `search` | string | — | Поиск по названию и разработчику (без учёта регистра) |
| `category` | UUID или slug | — | Фильтр по категории |
| `platform` | `macOS\|Windows\|Linux` | — | Фильтр по платформе |
| `minPrice`, `maxPrice` | number | — | Диапазон цены |
| `sort` | `newest\|oldest\|price_asc\|price_desc\|name_asc\|name_desc` | `newest` | Сортировка |
| `status` | `active\|archived\|all` | `active` | Только для admin; гостям всегда `active` |
| `onSale` | `true` | — | Только товары с действующей скидкой |
| `developer` | string | — | Бренд (разработчик), точное совпадение без учёта регистра |

* **Ответ 200:**
```json
{
  "success": true,
  "data": [{
    "id": "…", "name": "…", "slug": "…", "description": "…", "price": "149.00",
    "developer": "…", "version": "1.2.0", "formats": ["VST3", "AU"], "platforms": ["macOS", "Windows"],
    "stock": null, "imageUrl": "https://<project>.supabase.co/storage/v1/object/public/product-images/…",
    "fileName": "…zip", "fileSize": 10485760, "hasFile": true, "isActive": true,
    "categoryId": "…", "category": { "id": "…", "name": "…", "slug": "…" },
    "createdAt": "…", "updatedAt": "…"
  }],
  "meta": { "page": 1, "limit": 12, "total": 1, "totalPages": 1 }
}
```
Пустой каталог → `data: []`, `meta.total: 0`.
* **Ошибки:** 400 (неизвестная сортировка, `minPrice > maxPrice`).

### GET /api/products/:id
* **Доступ:** все (архивный товар — только admin) · **Ответ 200:** товар с категорией (`include`) · **Ошибки:** 400, 404.

### POST /api/products
* **Доступ:** admin
* **Тело:**
```json
{
  "name": "Название", "description": "Описание не короче 10 символов", "price": "49.90",
  "categoryId": "<uuid>", "developer": "Студия", "version": "1.0.0",
  "formats": ["VST3", "AU"], "platforms": ["macOS", "Windows"], "stock": null, "isActive": true
}
```
Обязательны: `name`, `description`, `price`, `categoryId`.
* **Ответ 201:** созданный товар (для admin также `filePath`, `imagePath`).
* **Ошибки:** 400, 401, 403 (USER), 404 `CATEGORY_NOT_FOUND`, 409 `SLUG_TAKEN`.

### PATCH /api/products/:id
* **Доступ:** admin · **Тело:** любые поля из POST · **Ответ 200** · **Ошибки:** 400 (в т.ч. попытка передать `filePath`), 401, 403, 404, 409.

### Скидки на товар
Поля `salePrice` (цена со скидкой, должна быть меньше `price`; `null` — снять скидку) и `saleEndsAt` (ISO-дата окончания; `null` — бессрочно) передаются в `POST/PATCH /api/products`. В ответах товара:

```json
{ "price": "9999.00", "salePrice": "7499.00", "saleEndsAt": "2026-11-30T18:59:59.000Z", "onSale": true, "finalPrice": "7499.00", "discountPercent": 25 }
```
Покупатель видит `salePrice`, только пока скидка действует. Заказ фиксирует `finalPrice`. Ошибки: 400 `INVALID_SALE_PRICE`.

### POST /api/products/discounts
Массовая скидка в процентах на категорию или весь каталог. Цена со скидкой округляется вниз до …499 / …999.

* **Доступ:** admin · **Тело:** `{ "percent": 20, "categoryId": "<uuid> | null", "endsAt": "2026-11-30 | null" }`
* **Ответ 200:** `{ "updated": 315, "skipped": 0 }`
* **Ошибки:** 400 (процент вне 1–95), 401, 403, 404 `CATEGORY_NOT_FOUND`.

### DELETE /api/products/discounts
Снять скидки с категории (`?categoryId=<uuid>`) или со всего каталога.

* **Доступ:** admin · **Ответ 200:** `{ "cleared": 12 }` · **Ошибки:** 400, 401, 403.

### DELETE /api/products/:id
Удаление без заказов — физическое (и удаление файлов из Storage); с заказами — архивирование.

* **Доступ:** admin
* **Ответ 200:** `{ "id": "…", "deleted": true, "archived": false }` или `{ "id": "…", "deleted": false, "archived": true, "reason": "…" }`
* **Ошибки:** 401, 403, 404.

---

## Orders

### POST /api/orders
Оформление заказа. Владелец — пользователь из JWT, цена — из БД, статус — `PENDING`. При ограниченном остатке резервируется лицензия.

* **Доступ:** user, admin · **Тело:** `{ "productId": "<uuid>" }`
* **Ответ 201:**
```json
{ "success": true, "data": { "id": "…", "userId": "…", "productId": "…", "priceAtPurchase": "49.90", "status": "PENDING", "createdAt": "…", "updatedAt": "…", "product": { "id": "…", "name": "…", "hasFile": true, "category": { "id": "…", "name": "…", "slug": "…" } } } }
```
* **Ошибки:** 400 (лишнее поле `userId`), 401, 404 `PRODUCT_NOT_FOUND`, 409 `ALREADY_ORDERED` / `OUT_OF_STOCK`.

### GET /api/orders/my
* **Доступ:** user, admin · **Query:** `page`, `limit` (20), `status` · **Ответ 200:** собственные заказы с товаром и категорией.

### GET /api/orders
* **Доступ:** admin · **Query:** `page`, `limit`, `status`, `userId` · **Ответ 200:** заказы с `user: { id, name, email }` · **Ошибки:** 401, 403.

### GET /api/orders/:id
* **Доступ:** владелец, admin · **Ответ 200** · **Ошибки:** 400, 401, 403 (чужой заказ), 404.

### PATCH /api/orders/:id/status
Смена статуса. Допустимые переходы: `PENDING → PAID`, `PENDING → CANCELLED`, `PAID → CANCELLED`. Покупатель может только отменить свой неоплаченный заказ. Отмена возвращает лицензию в остаток.

* **Доступ:** admin; user — только `CANCELLED` для своего `PENDING` · **Тело:** `{ "status": "PAID" }`
* **Ответ 200:** обновлённый заказ.
* **Ошибки:** 400, 401, 403, 404, 409 `INVALID_STATUS_TRANSITION`.

### POST /api/orders/:id/pay
Оплата заказа банковской картой через платёжный шлюз SYNQ (эмуляция эквайринга). Номер карты, срок и CVV проверяются в браузере (алгоритм Луна, срок, длина CVC) и **на сервер не передаются**: шлюзу уходят только платёжная система и последние 4 цифры. Карта, оканчивающаяся на `0002`, отклоняется банком.

* **Доступ:** владелец заказа · **Тело:** `{ "cardBrand": "visa", "cardLast4": "4242" }` (`visa|mastercard|mir|amex|unionpay|card`)
* **Ответ 200:** заказ со `status: "PAID"`, `paidAt`, `paymentRef: "SQ-1C63EA1E4C2F"`, `cardBrand`, `cardLast4`
* **Ошибки:** 400 (лишние поля, например `cardNumber`/`cvc`), 401, 402 `PAYMENT_DECLINED`, 403 (чужой заказ), 404, 409 `ALREADY_PAID` / `ORDER_NOT_PENDING`.

### GET /api/orders/:id/download
Выдача краткоживущей подписанной ссылки Supabase Storage на приватный файл.

* **Доступ:** владелец оплаченного заказа, admin
* **Ответ 200:** `{ "success": true, "data": { "url": "https://<project>.supabase.co/storage/v1/object/sign/product-files/…?token=…", "expiresIn": 120, "fileName": "…zip" } }`
* **Ошибки:** 401, 403 (`FORBIDDEN` — чужой; `ORDER_NOT_PAID`), 404 (`FILE_NOT_AVAILABLE`), 503 `STORAGE_NOT_CONFIGURED`.

---

## Uploads (Supabase Storage)

Все маршруты — только admin. Файл передаётся полем `file`, товар — полем `productId` (`multipart/form-data`). Загруженный файл сразу привязывается к товару; предыдущий файл удаляется из хранилища (замена).

### POST /api/uploads/product-image
* **Ограничения:** JPG / PNG / WEBP, ≤ 5 МБ, проверяются расширение, MIME и сигнатура (magic bytes). Бакет `product-images` — публичный.
* **Ответ 201:** товар с новым `imageUrl`.
* **Ошибки:** 400 (`FILE_REQUIRED`, `INVALID_FILE_TYPE`, `INVALID_FILE_CONTENT`), 401, 403, 404, 413, 502, 503.

### POST /api/uploads/product-file
* **Ограничения:** ≤ 50 МБ; расширения `zip, rar, 7z, dmg, pkg, exe, msi, wav, aif, aiff, flac, mid, midi, fxp, fxb, vital, nmsv, als, flp, logicx, txt`. Бакет `product-files` — приватный.
* **Ответ 201:** товар с `hasFile: true`, `fileName`, `fileSize`.
* **Ошибки:** как у изображения.

### DELETE /api/uploads/product-image/:productId
### DELETE /api/uploads/product-file/:productId
* **Ответ 200:** товар без изображения / файла. **Ошибки:** 400, 401, 403, 404 (`IMAGE_NOT_FOUND` / `FILE_NOT_FOUND`), 503.

---

## Service

## Reviews

Оставить отзыв можно только после оплаченного заказа, один отзыв на товар. Публично показывается только имя автора.

### GET /api/products/:id/reviews
* **Доступ:** все · **Query:** `page`, `limit` (12), `rating` (1–5), `sort` (`newest|best|worst`)
* **Ответ 200:** `{ "items": [{ "id", "rating": 5, "text", "createdAt", "user": { "id", "name" }, "product": { "id", "name", "imageUrl" } }], "summary": { "average": 4.5, "count": 2, "distribution": { "5": 1, "4": 1, "3": 0, "2": 0, "1": 0 } } }`, `meta`

### GET /api/products/:id/reviews/me
* **Доступ:** user · **Ответ 200:** `{ "purchased": true, "canReview": true, "review": null }`

### POST /api/products/:id/reviews
* **Доступ:** user (купивший товар) · **Тело:** `{ "rating": 5, "text": "От 10 до 2000 символов" }`
* **Ответ 201:** созданный отзыв · **Ошибки:** 400, 401, 403 `REVIEW_REQUIRES_PURCHASE`, 404, 409 `ALREADY_REVIEWED`

### GET /api/reviews
Лента всех отзывов магазина со сводкой — для страницы «Отзывы». Параметры как у отзывов товара.

### PATCH /api/reviews/:id · DELETE /api/reviews/:id
Изменить может автор; удалить — автор или администратор. **Ошибки:** 400, 401, 403, 404.

## Популярное и просмотры

### GET /api/products/popular
«Самое популярное»: `score = оплаченные заказы × 20 + просмотры`. Товары без покупок и просмотров не попадают.
* **Доступ:** все · **Query:** `limit` (8, ≤ 24) · **Ответ 200:** товары с полями `salesCount`, `ratingAvg`, `reviewsCount`

### POST /api/products/:id/view
Учёт просмотра страницы товара (frontend вызывает один раз за сессию). **Ответ 200:** `{ "id", "counted": true }` · **Ошибки:** 400, 404.

### GET /api/brands
Бренды (разработчики) активных товаров: название, количество товаров и до трёх обложек для превью. Отсортированы по алфавиту.

* **Доступ:** все
* **Ответ 200:** `{ "success": true, "data": [{ "name": "FabFilter", "productsCount": 13, "images": ["https://…/product-images/…"] }] }`

### GET /api/stats
Реальная статистика магазина (только агрегаты PostgreSQL).

* **Доступ:** admin
* **Ответ 200:**
```json
{ "success": true, "data": {
  "users": { "total": 1, "admins": 1 }, "categories": { "total": 0 },
  "products": { "active": 0, "archived": 0, "total": 0 },
  "orders": { "PENDING": 0, "PAID": 0, "CANCELLED": 0, "total": 0 },
  "revenue": "0.00", "recentOrders": [], "topProducts": []
} }
```

### GET /api/health
Проверка API и подключения к БД: `{ "success": true, "data": { "status": "ok", "database": "connected", "storage": "configured" } }`.
