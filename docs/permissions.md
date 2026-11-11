# Матрица прав доступа

Роли: **guest** (без JWT), **user** (`USER`), **admin** (`ADMIN`).
Роль проверяется middleware `requireRole` и всегда берётся **из базы данных** по `sub` из JWT, а не из самого токена: понижение или повышение роли вступает в силу сразу.

| Маршрут | guest | user | admin | Примечание |
|---|:-:|:-:|:-:|---|
| `POST /api/auth/register` | ✅ | ✅ | ✅ | Всегда создаёт `USER`; поле `role` отклоняется (400) |
| `POST /api/auth/login` | ✅ | ✅ | ✅ | Rate limit: 20 попыток / 15 мин |
| `GET /api/auth/me` | 401 | ✅ | ✅ | |
| `GET /api/users` | 401 | 403 | ✅ | |
| `GET /api/users/:id` | 401 | только свой | ✅ | Чужой профиль → 403 |
| `PATCH /api/users/me` | 401 | ✅ | ✅ | Только `name`, смена пароля с `currentPassword` |
| `PATCH /api/users/:id/role` | 401 | 403 | ✅ | Свою роль менять нельзя (409) |
| `GET /api/categories`, `GET /api/categories/:id` | ✅ | ✅ | ✅ | |
| `GET /api/categories/:id/products` | ✅ | ✅ | ✅ | admin видит и архивные товары |
| `POST/PATCH/DELETE /api/categories…` | 401 | 403 | ✅ | |
| `GET /api/products`, `GET /api/products/:id` | ✅ | ✅ | ✅ | guest/user — только `isActive=true`; `status=archived|all` — только admin |
| `POST/PATCH/DELETE /api/products…` | 401 | 403 | ✅ | |
| `POST /api/orders` | 401 | ✅ | ✅ | Владелец — из JWT; `userId` в теле → 400 |
| `GET /api/orders/my` | 401 | ✅ | ✅ | Только собственные заказы |
| `GET /api/orders` | 401 | 403 | ✅ | Все заказы с данными покупателя |
| `GET /api/orders/:id` | 401 | только свой | ✅ | Чужой → 403 |
| `PATCH /api/orders/:id/status` | 401 | только `PENDING → CANCELLED` своего | ✅ | Покупатель не может отметить заказ оплаченным (403) |
| `POST /api/orders/:id/pay` | 401 | только свой `PENDING` | только свой | Сервер получает лишь бренд и последние 4 цифры карты |
| `GET /api/orders/:id/download` | 401 | свой и `PAID` | ✅ | Неоплаченный → 403 `ORDER_NOT_PAID` |
| `POST/DELETE /api/uploads/…` | 401 | 403 | ✅ | |
| `GET /api/stats` | 401 | 403 | ✅ | |
| `GET /api/products/popular`, `POST /api/products/:id/view` | ✅ | ✅ | ✅ | Просмотр учитывается раз за сессию на стороне frontend |
| `GET /api/reviews`, `GET /api/products/:id/reviews` | ✅ | ✅ | ✅ | Публично показывается только имя автора |
| `POST /api/products/:id/reviews` | 401 | после оплаты, один раз | после оплаты | Без покупки → 403 `REVIEW_REQUIRES_PURCHASE` |
| `PATCH /api/reviews/:id` | 401 | только свой | только свой | |
| `DELETE /api/reviews/:id` | 401 | только свой | ✅ (модерация) | |
| `GET /api/brands` | ✅ | ✅ | ✅ | Только активные товары |
| `GET /api/health` | ✅ | ✅ | ✅ | |

## Дополнительные правила безопасности

* `passwordHash` не входит ни в одну Prisma-проекцию (`select`), поэтому физически не может попасть в ответ.
* Все тела запросов валидируются Zod-схемами `strictObject`: неизвестные поля (`role`, `userId`, `filePath`, `passwordHash`…) → **400**. Это защита от mass assignment.
* Цена заказа берётся из БД, а не от клиента.
* Путь к приватному файлу (`filePath`) виден только администратору; покупатель получает лишь `hasFile` и краткоживущую подписанную ссылку.
* JWT подписывается HS256 с фиксированным алгоритмом и `issuer`, срок жизни — `JWT_EXPIRES_IN`.
