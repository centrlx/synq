# Сценарий защиты курсовой работы

**Тема:** «Разработка REST API для интернет-магазина цифровых товаров для музыкального производства».
Продолжительность демонстрации — 10–12 минут. Все команды выполняются в терминале из корня проекта; сервер запущен (`npm run dev`).

## 0. Подготовка (до защиты)

```bash
npm run db:migrate                                            # схема БД актуальна
npm run admin:create -- --email admin@synq.dev --name "Администратор"
npm test                                                      # автотесты зелёные
npm run dev
```

Для удобства сохраните базовый адрес:

```bash
API=http://localhost:4000/api
```

> Для разбора JSON в примерах используется `node -pe`; можно заменить на `jq`, если он установлен.

## 1. Архитектура (1 мин)

Покажите структуру `src/`: `routes → controllers → services → Prisma`, отдельно `middleware` (`requireAuth`, `requireRole`, `validate`, `errorHandler`), `validators` (Zod), `config`. Откройте `prisma/schema.prisma` и ER-диаграмму в README.

## 2. Пустой магазин — без фейковых данных (30 с)

```bash
curl -s $API/products
# {"success":true,"data":[],"meta":{"page":1,"limit":12,"total":0,"totalPages":1}}
```

Откройте `http://localhost:4000` — показаны Empty States «Категории ещё не добавлены», «Товаров пока нет».

## 3. Регистрация и вход (1,5 мин)

```bash
# Регистрация покупателя → 201, роль USER, passwordHash отсутствует
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"student@synq.dev","name":"Студент","password":"Secret123"}'

# Повторный email → 409 EMAIL_TAKEN
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"student@synq.dev","name":"Студент","password":"Secret123"}'

# Попытка стать админом при регистрации → 400
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"hacker@synq.dev","name":"Hacker","password":"Secret123","role":"ADMIN"}'

# Вход и получение JWT
USER_TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"student@synq.dev","password":"Secret123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# Неверный пароль → 401 INVALID_CREDENTIALS
curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"student@synq.dev","password":"wrong-pass1"}'
```

## 4. Запросы без JWT → 401 (30 с)

```bash
curl -s -i $API/auth/me | head -1                 # HTTP/1.1 401
curl -s $API/orders/my                            # UNAUTHORIZED
curl -s $API/auth/me -H 'Authorization: Bearer abc.def.ghi'   # INVALID_TOKEN
```

## 5. Недостаточные права → 403 (30 с)

```bash
curl -s -X POST $API/categories -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Hack"}'     # 403 FORBIDDEN
curl -s $API/users -H "Authorization: Bearer $USER_TOKEN"      # 403 FORBIDDEN
```

## 6. Административный доступ и CRUD (3 мин)

```bash
ADMIN_TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@synq.dev","password":"<пароль администратора>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# CREATE категории и товара
CAT_ID=$(curl -s -X POST $API/categories -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"VST-плагины"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')

PRODUCT_ID=$(curl -s -X POST $API/products -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Мой синтезатор\",\"description\":\"Описание товара для защиты\",\"price\":\"49.90\",\"categoryId\":\"$CAT_ID\",\"stock\":5}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')

# READ: список (поиск, сортировка, пагинация) и по ID
curl -s "$API/products?search=синт&sort=price_asc&page=1&limit=5"
curl -s $API/products/$PRODUCT_ID

# UPDATE
curl -s -X PATCH $API/products/$PRODUCT_ID -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"price":"39.90"}'

# Валидация типов → 400 с деталями по полям
curl -s -X PATCH $API/products/$PRODUCT_ID -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"price":-1,"stock":"many"}'

# Статистика — только реальные агрегаты
curl -s $API/stats -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 7. Связанная выборка (30 с)

```bash
curl -s $API/categories/$CAT_ID/products      # категория + товары (Prisma include)
curl -s $API/products/$PRODUCT_ID             # товар + категория (include/select)
```

Покажите код: `src/services/categories.service.js` → `getCategoryProducts`.

## 8. Заказ, защита чужих данных и скачивание (2 мин)

```bash
ORDER_ID=$(curl -s -X POST $API/orders -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"productId\":\"$PRODUCT_ID\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')

# Подмена владельца → 400 (userId не принимается)
curl -s -X POST $API/orders -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODUCT_ID\",\"userId\":\"00000000-0000-4000-8000-000000000000\"}"

# Скачивание до оплаты → 403 ORDER_NOT_PAID
curl -s $API/orders/$ORDER_ID/download -H "Authorization: Bearer $USER_TOKEN"

# Администратор подтверждает оплату
curl -s -X PATCH $API/orders/$ORDER_ID/status -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"PAID"}'
```

Далее в админ-панели загрузите файл товара и покажите кнопку «Скачать» в «Моих заказах» (подписанная ссылка Supabase действует `SIGNED_URL_TTL` секунд).

## 9. DELETE и целостность (30 с)

```bash
# Товар с заказами не удаляется физически, а архивируется
curl -s -X DELETE $API/products/$PRODUCT_ID -H "Authorization: Bearer $ADMIN_TOKEN"
# Категорию с товарами удалить нельзя → 409 CATEGORY_NOT_EMPTY
curl -s -X DELETE $API/categories/$CAT_ID -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 10. Автотесты (30 с)

```bash
npm test
```

5 наборов тестов покрывают все 20 обязательных сценариев (регистрация, JWT, роли, CRUD, связанные выборки, заказы, файлы, отсутствие `passwordHash`). Тесты создают временную базу `TEST_DATABASE_URL` и удаляют её после прогона.

## Возможные вопросы

| Вопрос | Ответ |
|---|---|
| Почему роль берётся из БД, а не из JWT? | Чтобы снятие прав администратора действовало сразу, не дожидаясь истечения токена. |
| Как защищены пароли? | bcrypt (12 раундов), сравнение через `bcrypt.compare`; при несуществующем email сравнение с «пустышкой» выравнивает время ответа. |
| Почему товар с заказами не удаляется? | Иначе нарушится внешний ключ `orders.product_id` и история покупок; покупатели должны сохранить доступ к файлу. |
| Где хранятся файлы? | Supabase Storage: обложки — публичный бакет, дистрибутивы — приватный; скачивание только по краткоживущей подписанной ссылке после проверки заказа. |
| Почему JWT в localStorage? | Учебный компромисс; риск XSS снижен строгой CSP (Helmet, без inline-скриптов) и отказом от `innerHTML` с пользовательскими данными. Альтернатива — httpOnly-cookie + CSRF-токен. |
| Что такое mass assignment и как он предотвращён? | Подстановка лишних полей (`role`, `userId`, `filePath`). Zod `strictObject` отклоняет любые неописанные поля с кодом 400. |
