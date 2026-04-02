# SQL WebHelper

SQL WebHelper — многостраничная веб-платформа для обучения и операционной работы с SQL в формате
административного портала.

## Страницы

- `index.html` — главная страница платформы и обзор модулей.
- `theory.html` — расширенная теория по проектированию и эксплуатации БД.
- `admin.html` — рабочая SQL-консоль DBM Studio.
- `about.html` — архитектура и инженерные принципы платформы.
- `docs.html` — справочник синтаксиса SQL-команд.
- `release-notes.html` — история релизов.
- `contacts.html` — каналы поддержки и регламенты реакции.

## Возможности DBM Studio

- Работа с таблицами и динамический навигатор схем.
- Поддержка SQL-команд:
  - `SELECT ... FROM ... WHERE ... ORDER BY ... LIMIT ...`
  - `INSERT INTO ... VALUES (...)`
  - `UPDATE ... SET ... WHERE ...`
  - `DELETE FROM ... WHERE ...`
  - `CREATE TABLE`, `ALTER TABLE ADD/DROP COLUMN`
  - `SHOW TABLES`, `DESCRIBE table`
  - `TRUNCATE TABLE`, `DROP TABLE`
- Выполнение мультизапросов (несколько команд через `;`).
- Сохранение состояния БД в `localStorage`.
- Экспорт и импорт базы в формате JSON.

## Запуск

Откройте `index.html` в браузере.
