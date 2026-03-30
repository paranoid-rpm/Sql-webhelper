const seedDb = () => ({
  users: [
    { id: 1, name: "Анна", role: "DBA", region: "EU" },
    { id: 2, name: "Игорь", role: "Analyst", region: "US" },
    { id: 3, name: "Мария", role: "Developer", region: "APAC" }
  ],
  orders: [
    { id: 101, user_id: 1, total: 1200, status: "done" },
    { id: 102, user_id: 2, total: 450, status: "pending" },
    { id: 103, user_id: 3, total: 700, status: "done" }
  ],
  products: [
    { id: 501, name: "SSD", price: 9800, stock: 16 },
    { id: 502, name: "CPU", price: 21000, stock: 8 },
    { id: 503, name: "RAM", price: 7400, stock: 34 }
  ]
});

let db = seedDb();
let currentTable = "users";
let currentFilter = "";
let sortState = { column: null, direction: "asc" };
const history = [];

const tableNameEl = document.getElementById("table-name");
const tableMetaEl = document.getElementById("table-meta");
const tableOutputEl = document.getElementById("table-output");
const sqlInputEl = document.getElementById("sql-input");
const sqlLogEl = document.getElementById("sql-log");
const historyListEl = document.getElementById("history-list");
const filterInputEl = document.getElementById("table-filter");
const kpiRowsEl = document.getElementById("kpi-rows");
const kpiColumnsEl = document.getElementById("kpi-columns");
const kpiHistoryEl = document.getElementById("kpi-history");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateKpi(rows) {
  if (!kpiRowsEl || !kpiColumnsEl || !kpiHistoryEl) return;
  const firstRow = rows[0] || {};
  kpiRowsEl.textContent = String(rows.length);
  kpiColumnsEl.textContent = String(Object.keys(firstRow).length || 0);
  kpiHistoryEl.textContent = String(history.length);
}

function renderHistory() {
  if (!historyListEl) return;
  historyListEl.innerHTML = history
    .slice(-10)
    .reverse()
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  updateKpi(getProcessedRows(currentTable));
}

function getProcessedRows(table) {
  const rows = [...(db[table] || [])];
  let filtered = rows;

  if (currentFilter) {
    const needle = currentFilter.toLowerCase();
    filtered = rows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(needle))
    );
  }

  if (sortState.column) {
    filtered.sort((a, b) => {
      const av = a[sortState.column];
      const bv = b[sortState.column];
      if (av === bv) return 0;
      const direction = sortState.direction === "asc" ? 1 : -1;
      return av > bv ? direction : -direction;
    });
  }

  return filtered;
}

function getSortIndicator(column) {
  if (sortState.column !== column) return "↕";
  return sortState.direction === "asc" ? "↑" : "↓";
}

function renderTable(table) {
  currentTable = table;
  tableNameEl.textContent = table;

  const baseRows = db[table] || [];
  const rows = getProcessedRows(table);

  if (!baseRows.length) {
    tableOutputEl.innerHTML = "<p>Таблица пуста.</p>";
    tableMetaEl.textContent = "0 строк";
    updateKpi(rows);
    return;
  }

  const headers = Object.keys(baseRows[0]);
  const headHtml = headers
    .map(
      (h) =>
        `<th><button class="sort-btn" data-column="${escapeHtml(h)}">${escapeHtml(h)} <span>${getSortIndicator(h)}</span></button></th>`
    )
    .join("");

  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`
    )
    .join("");

  tableOutputEl.innerHTML = `<table class="db-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml || '<tr><td colspan="100%">Ничего не найдено по фильтру.</td></tr>'}</tbody></table>`;
  tableMetaEl.textContent = `${rows.length} из ${baseRows.length} строк`;
  updateKpi(rows);

  tableOutputEl.querySelectorAll(".sort-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const column = button.dataset.column;
      if (sortState.column === column) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState = { column, direction: "asc" };
      }
      renderTable(currentTable);
    });
  });
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
    sortState = { column: null, direction: "asc" };
    currentFilter = "";
    if (filterInputEl) filterInputEl.value = "";
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
  sortState = { column: null, direction: "asc" };
  currentFilter = "";
  if (filterInputEl) filterInputEl.value = "";
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

if (filterInputEl) {
  filterInputEl.addEventListener("input", () => {
    currentFilter = filterInputEl.value.trim();
    renderTable(currentTable);
  });
}

document.getElementById("clear-filter")?.addEventListener("click", () => {
  currentFilter = "";
  if (filterInputEl) filterInputEl.value = "";
  renderTable(currentTable);
});

renderTable(currentTable);
renderHistory();
