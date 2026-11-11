# ER-диаграмма базы данных SYNQ

СУБД — PostgreSQL, схема описана в [`prisma/schema.prisma`](../prisma/schema.prisma), миграция — [`prisma/migrations`](../prisma/migrations).

```mermaid
erDiagram
    USERS ||--o{ ORDERS : "оформляет"
    CATEGORIES ||--o{ PRODUCTS : "содержит"
    PRODUCTS ||--o{ ORDERS : "входит в"
    USERS ||--o{ REVIEWS : "пишет"
    PRODUCTS ||--o{ REVIEWS : "получает"

    USERS {
        uuid id PK
        varchar email UK "уникальный, нижний регистр"
        varchar name
        text password_hash "bcrypt, 12 раундов; в API не выдаётся"
        enum role "USER | ADMIN, по умолчанию USER"
        timestamp created_at
        timestamp updated_at
    }

    CATEGORIES {
        uuid id PK
        varchar name UK
        varchar slug UK
        varchar description "nullable"
        timestamp created_at
        timestamp updated_at
    }

    PRODUCTS {
        uuid id PK
        varchar name
        varchar slug UK
        text description
        decimal price "Decimal(10,2), тенге"
        decimal sale_price "цена со скидкой, nullable"
        timestamp sale_ends_at "окончание скидки, nullable = бессрочно"
        varchar developer "характеристика, nullable"
        varchar version "характеристика, nullable"
        text_array formats "VST3, AU, WAV…"
        text_array platforms "macOS, Windows, Linux"
        int stock "остаток лицензий; NULL = без ограничений"
        text image_url "публичный URL Supabase Storage"
        text image_path "путь в бакете product-images"
        text file_path "путь в приватном бакете product-files"
        varchar file_name
        int file_size
        boolean is_active "мягкое удаление"
        int views_count "просмотры страницы товара"
        uuid category_id FK "→ categories.id, ON DELETE RESTRICT"
        timestamp created_at
        timestamp updated_at
    }

    ORDERS {
        uuid id PK
        uuid user_id FK "→ users.id, ON DELETE RESTRICT"
        uuid product_id FK "→ products.id, ON DELETE RESTRICT"
        decimal price_at_purchase "Decimal(10,2), цена на момент заказа"
        enum status "PENDING | PAID | CANCELLED"
        timestamp paid_at "момент оплаты"
        varchar payment_ref "номер транзакции шлюза"
        varchar card_brand "платёжная система"
        varchar card_last4 "последние 4 цифры карты"
        timestamp created_at
        timestamp updated_at
    }

    REVIEWS {
        uuid id PK
        uuid user_id FK "→ users.id, ON DELETE CASCADE"
        uuid product_id FK "→ products.id, ON DELETE CASCADE"
        smallint rating "CHECK 1–5"
        varchar text "до 2000 символов"
        timestamp created_at
        timestamp updated_at
    }
```

## Связи

| Связь | Тип | Внешний ключ | Поведение при удалении |
|---|---|---|---|
| `users` → `orders` | 1 : N | `orders.user_id` → `users.id` | `RESTRICT` — история заказов неприкосновенна |
| `categories` → `products` | 1 : N | `products.category_id` → `categories.id` | `RESTRICT` — API возвращает `409 CATEGORY_NOT_EMPTY` |
| `users` → `reviews` | 1 : N | `reviews.user_id` → `users.id` | `CASCADE` |
| `products` → `reviews` | 1 : N | `reviews.product_id` → `products.id` | `CASCADE` |
| `products` → `orders` | 1 : N | `orders.product_id` → `products.id` | `RESTRICT` — товар с заказами архивируется (`is_active = false`) |

## Индексы и ограничения

| Таблица | Индекс / ограничение | Назначение |
|---|---|---|
| `users` | `UNIQUE(email)` | Один аккаунт на email (409 `EMAIL_TAKEN`) |
| `categories` | `UNIQUE(name)`, `UNIQUE(slug)` | Человекочитаемые URL каталога |
| `products` | `UNIQUE(slug)` | Уникальные URL товаров |
| `products` | `INDEX(category_id)` | Выборка товаров категории |
| `products` | `INDEX(is_active, created_at)` | Витрина: активные товары, сортировка «сначала новые» |
| `products` | `INDEX(name)` | Сортировка по названию |
| `orders` | `INDEX(user_id, created_at)` | «Мои заказы» |
| `reviews` | `UNIQUE(user_id, product_id)`, `CHECK(rating BETWEEN 1 AND 5)` | Один отзыв на товар, корректная оценка |
| `reviews` | `INDEX(product_id, created_at)`, `INDEX(rating)` | Отзывы товара, фильтр по оценке |
| `orders` | `INDEX(product_id)`, `INDEX(status)` | Статистика и фильтры админ-панели |

## Почему так

* **Скидки.** `sale_price` действует, пока не наступил `sale_ends_at`; заказ фиксирует действующую цену (со скидкой).
* **Отзывы только от покупателей:** создать отзыв можно при наличии заказа со статусом `PAID`; уникальный индекс не даёт написать второй.
* **«Самое популярное»** считается как `оплаченные заказы × 20 + views_count`.
* **Цена фиксируется в заказе** (`price_at_purchase`): изменение цены товара не меняет уже оформленные заказы и выручку.
* **Мягкое удаление товара.** Если по товару есть заказы, `DELETE /api/products/:id` переводит его в архив: из витрины он исчезает, а покупатели сохраняют доступ к скачиванию.
* **Остатки (`stock`)** — число доступных лицензий. Резервирование при заказе выполняется атомарным условным `UPDATE … WHERE stock > 0`, отмена заказа возвращает лицензию.
* **Характеристики** цифрового товара (разработчик, версия, форматы, платформы) хранятся в самой таблице `products`: набор полей фиксирован и используется для фильтрации (`platform`).
