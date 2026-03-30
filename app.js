const seedDb = () => ({
  users: [
    { id: 1, name: "Анна", role: "DBA" },
    { id: 2, name: "Игорь", role: "Analyst" },
    { id: 3, name: "Мария", role: "Developer" }
  ],
  orders: [
    { id: 101, user_id: 1, total: 1200 },
    { id: 102, user_id: 2, total: 450 },
    { id: 103, user_id: 3, total: 700 }
  ],
  products: [
    { id: 501, name: "SSD", price: 9800 },
    { id: 502, name: "CPU", price: 21000 },
    { id: 503, name: "RAM", price: 7400 }
  ]
});

let db = seedDb();
let currentTable = "users";
const history = [];

const tableNameEl = document.getElementById("table-name");
const tableOutputEl = document.getElementById("table-output");
const sqlInputEl = document.getElementById("sql-input");
const sqlLogEl = document.getElementById("sql-log");
const historyListEl = document.getElementById("history-list");

function renderHistory() {
  if (!historyListEl) return;
  historyListEl.innerHTML = history
    .slice(-10)
    .reverse()
    .map((item) => `<li>${item}</li>`)
    .join("");
}

function renderTable(table) {
  currentTable = table;
  tableNameEl.textContent = table;
  const rows = db[table] || [];

  if (!rows.length) {
    tableOutputEl.innerHTML = "<p>Таблица пуста.</p>";
    return;
  }

  const headers = Object.keys(rows[0]);
  const headHtml = headers.map((h) => `<th>${h}</th>`).join("");
  const bodyHtml = rows
    .map((row) => `<tr>${headers.map((h) => `<td>${row[h]}</td>`).join("")}</tr>`)
    .join("");

  tableOutputEl.innerHTML = `<table class="db-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function parseValue(v) {
  const cleaned = v.trim().replace(/^['"]|['"]$/g, "");
  return Number.isNaN(Number(cleaned)) ? cleaned : Number(cleaned);
}

function executeSql(rawSql) {
  const sql = rawSql.trim().replace(/;$/, "");
  if (!sql) return "Ошибка: пустой SQL-запрос.";

  const selectMatch = sql.match(/^select\s+\*\s+from\s+(\w+)$/i);
  if (selectMatch) {
    const table = selectMatch[1];
    if (!db[table]) return `Ошибка: таблица ${table} не найдена.`;
    renderTable(table);
    return `OK: выбрано ${db[table].length} строк из ${table}.`;
  }

  const insertMatch = sql.match(/^insert\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)$/i);
  if (insertMatch) {
    const [, table, cols, vals] = insertMatch;
    if (!db[table]) return `Ошибка: таблица ${table} не найдена.`;
    const columns = cols.split(",").map((c) => c.trim());
    const values = vals.split(",").map((v) => parseValue(v));
    if (columns.length !== values.length) {
      return "Ошибка: число колонок и значений не совпадает.";
    }

    const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
    db[table].push(row);
    renderTable(table);
    return `OK: строка добавлена в ${table}.`;
  }

  const updateMatch = sql.match(/^update\s+(\w+)\s+set\s+(\w+)\s*=\s*([^\s]+)\s+where\s+(\w+)\s*=\s*([^\s]+)$/i);
  if (updateMatch) {
    const [, table, setCol, setVal, whereCol, whereVal] = updateMatch;
    if (!db[table]) return `Ошибка: таблица ${table} не найдена.`;

    const parsedSet = parseValue(setVal);
    const parsedWhere = parseValue(whereVal);
    let updated = 0;

    db[table] = db[table].map((row) => {
      if (row[whereCol] === parsedWhere) {
        updated += 1;
        return { ...row, [setCol]: parsedSet };
      }
      return row;
    });

    renderTable(table);
    return `OK: обновлено ${updated} строк в ${table}.`;
  }

  const deleteMatch = sql.match(/^delete\s+from\s+(\w+)\s+where\s+(\w+)\s*=\s*([^\s]+)$/i);
  if (deleteMatch) {
    const [, table, whereCol, whereVal] = deleteMatch;
    if (!db[table]) return `Ошибка: таблица ${table} не найдена.`;

    const parsedWhere = parseValue(whereVal);
    const before = db[table].length;
    db[table] = db[table].filter((row) => row[whereCol] !== parsedWhere);
    const deleted = before - db[table].length;

    renderTable(table);
    return `OK: удалено ${deleted} строк из ${table}.`;
  }

  return "Ошибка: неподдерживаемый SQL-запрос. Используйте подсказку mini-DBM.";
}

function logAndStore(sql, result) {
  const entry = `${new Date().toLocaleTimeString("ru-RU")} • ${sql} → ${result}`;
  history.push(entry);
  renderHistory();
}

document.querySelectorAll(".table-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".table-item").forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    renderTable(item.dataset.table);
  });
});

document.getElementById("run-sql").addEventListener("click", () => {
  const sql = sqlInputEl.value.trim();
  const result = executeSql(sql);
  sqlLogEl.textContent = result;
  logAndStore(sql || "<empty>", result);
});

document.getElementById("reset-db").addEventListener("click", () => {
  db = seedDb();
  renderTable(currentTable);
  const result = "OK: демо-БД сброшена к начальному состоянию.";
  sqlLogEl.textContent = result;
  logAndStore("RESET DATABASE", result);
});

document.getElementById("copy-log").addEventListener("click", async () => {
  const text = sqlLogEl.textContent;
  try {
    await navigator.clipboard.writeText(text);
    const result = "OK: лог скопирован в буфер обмена.";
    sqlLogEl.textContent = result;
    logAndStore("COPY LOG", result);
  } catch {
    const result = "Ошибка: не удалось скопировать лог (ограничения браузера).";
    sqlLogEl.textContent = result;
    logAndStore("COPY LOG", result);
  }
});

renderTable(currentTable);
renderHistory();
