# SQL WebHelper

Многостраничное современное веб-приложение для администрирования баз данных с упором на UX и обучение.

## Страницы

- `index.html` — главная лендинг-страница.
- `theory.html` — большой теоретический блок по администрированию БД.
- `admin.html` — интерактивная панель **DBM Studio** (подобие mini MySQL DBM).
- `about.html` — архитектура и план развития.

## Возможности DBM Studio

- Просмотр демо-схемы `demo_shop` и таблиц `users`, `orders`, `products`.
- Встроенная SQL-консоль с базовой поддержкой:
  - `SELECT * FROM table;`
  - `INSERT INTO table (a,b) VALUES (1,'x');`
  - `UPDATE table SET a=2 WHERE id=1;`
  - `DELETE FROM table WHERE id=1;`
- Сброс демо-БД к начальному состоянию.

## Запуск

Откройте `index.html` в браузере.
