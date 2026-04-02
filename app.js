const STORAGE_KEY = "sql_webhelper_db_v2";
const META_KEY = "sql_webhelper_meta_v2";

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

const seedMeta = () => ({
  users: [
    { name: "id", type: "INT" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "role", type: "VARCHAR(64)" }
  ],
  orders: [
    { name: "id", type: "INT" },
    { name: "user_id", type: "INT" },
    { name: "total", type: "DECIMAL(10,2)" }
  ],
  products: [
    { name: "id", type: "INT" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "price", type: "DECIMAL(10,2)" }
  ]
});

let db = loadDb();
let meta = loadMeta();
let currentTable = Object.keys(db)[0] || "users";

const tableNameEl = document.getElementById("table-name");
const tableOutputEl = document.getElementById("table-output");
const sqlInputEl = document.getElementById("sql-input");
const sqlLogEl = document.getElementById("sql-log");
const tableListEl = document.getElementById("table-list");
const exportBtn = document.getElementById("export-db");
const importInput = document.getElementById("import-db");
const explainBtn = document.getElementById("run-explain");
const explainOutputEl = document.getElementById("explain-output");

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDb();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return seedDb();
    return parsed;
  } catch {
    return seedDb();
  }
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return seedMeta();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return seedMeta();
    return parsed;
  } catch {
    return seedMeta();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function inferColumns(table) {
  if (meta[table]?.length) return meta[table].map((c) => c.name);
  const row = db[table]?.[0];
  if (!row) return [];
  return Object.keys(row);
}

function splitCsv(input) {
  const out = [];
  let cur = "";
  let quote = null;
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if ((ch === "'" || ch === '"') && input[i - 1] !== "\\") {
      if (!quote) quote = ch;
      else if (quote === ch) quote = null;
      cur += ch;
      continue;
    }
    if (!quote) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim().length) out.push(cur.trim());
  return out;
}

function splitStatements(sql) {
  const out = [];
  let cur = "";
  let quote = null;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if ((ch === "'" || ch === '"') && sql[i - 1] !== "\\") {
      if (!quote) quote = ch;
      else if (quote === ch) quote = null;
      cur += ch;
      continue;
    }
    if (ch === ";" && !quote) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function findKeywordOutsideScopes(input, keyword, fromIndex = 0) {
  const upperInput = input.toUpperCase();
  const upperKeyword = keyword.toUpperCase();
  let quote = null;
  let depth = 0;

  for (let i = fromIndex; i <= upperInput.length - upperKeyword.length; i += 1) {
    const ch = input[i];
    if ((ch === "'" || ch === '"') && input[i - 1] !== "\\") {
      if (!quote) quote = ch;
      else if (quote === ch) quote = null;
      continue;
    }
    if (!quote) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (depth === 0 && upperInput.slice(i, i + upperKeyword.length) === upperKeyword) {
        const before = i === 0 ? " " : upperInput[i - 1];
        const after = upperInput[i + upperKeyword.length] ?? " ";
        const isBeforeBoundary = /[^A-Z0-9_]/.test(before);
        const isAfterBoundary = /[^A-Z0-9_]/.test(after);
        if (isBeforeBoundary && isAfterBoundary) return i;
      }
    }
  }
  return -1;
}

function parseValue(raw) {
  const v = raw.trim();
  if (/^null$/i.test(v)) return null;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  const num = Number(v);
  if (!Number.isNaN(num)) return num;
  return v;
}

function valueToText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function buildTable(columns, rows) {
  if (!rows.length) return "<p>Результат пуст.</p>";
  const header = columns.map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((h) => `<td>${valueToText(row[h])}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<table class="db-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderTable(tableName) {
  currentTable = tableName;
  tableNameEl.textContent = tableName;
  const rows = db[tableName] || [];
  const cols = inferColumns(tableName);
  if (!cols.length && rows.length) {
    tableOutputEl.innerHTML = buildTable(Object.keys(rows[0]), rows);
    return;
  }
  if (!cols.length) {
    tableOutputEl.innerHTML = "<p>Таблица пуста.</p>";
    return;
  }
  tableOutputEl.innerHTML = buildTable(cols, rows);
}

function renderResult(title, rows) {
  tableNameEl.textContent = title;
  if (!rows.length) {
    tableOutputEl.innerHTML = "<p>Результат пуст.</p>";
    return;
  }
  tableOutputEl.innerHTML = buildTable(Object.keys(rows[0]), rows);
}

function renderExplain(planSteps) {
  if (!explainOutputEl) return;
  if (!planSteps?.length) {
    explainOutputEl.innerHTML = '<p class="hint">План не сформирован.</p>';
    return;
  }
  const list = planSteps
    .map(
      (step, index) =>
        `<li class="explain-item"><strong>Шаг ${index + 1}. ${step.title}</strong><br />${step.details}</li>`
    )
    .join("");
  explainOutputEl.innerHTML = `<ol class="explain-list">${list}</ol>`;
}

function renderSidebar() {
  tableListEl.innerHTML = "";
  Object.keys(db).forEach((table) => {
    const item = document.createElement("li");
    item.className = `table-item${table === currentTable ? " active" : ""}`;
    item.dataset.table = table;
    item.textContent = table;
    tableListEl.appendChild(item);
  });
}

function assertTable(table) {
  if (!db[table]) {
    throw new Error(`Таблица ${table} не найдена.`);
  }
}

function getFieldValue(row, fieldName) {
  if (fieldName in row) return row[fieldName];
  if (fieldName.includes(".")) {
    const fallback = fieldName.split(".").at(-1);
    if (fallback && fallback in row) return row[fallback];
  }
  if (!fieldName.includes(".")) {
    const matches = Object.keys(row).filter((key) => key.endsWith(`.${fieldName}`));
    if (matches.length === 1) return row[matches[0]];
  }
  return undefined;
}

function normalizeIdentifier(id) {
  return id.replace(/`/g, "").trim();
}

function parseOperand(token, row) {
  const trimmed = token.trim();
  const isString = /^(["']).*\1$/.test(trimmed);
  const isNumber = /^-?\d+(\.\d+)?$/.test(trimmed);
  const isBooleanOrNull = /^(true|false|null)$/i.test(trimmed);
  if (isString || isNumber || isBooleanOrNull) return parseValue(trimmed);
  const fieldValue = getFieldValue(row, normalizeIdentifier(trimmed));
  if (fieldValue !== undefined) return fieldValue;
  return parseValue(trimmed);
}

function parseWhere(whereRaw) {
  if (!whereRaw) return () => true;
  const parts = whereRaw.split(/\s+(AND|OR)\s+/i).filter(Boolean);
  const conditions = [];
  const links = [];

  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      links.push(part.toUpperCase());
      return;
    }
    const inMatch = part.match(/^([\w.]+)\s+IN\s*\((.+)\)$/i);
    if (inMatch) {
      const [, col, valuesRaw] = inMatch;
      const set = splitCsv(valuesRaw).map(parseValue);
      conditions.push((row) => set.some((v) => getFieldValue(row, col) === v));
      return;
    }

    const match = part.match(/^([\w.]+)\s*(=|!=|<>|>=|<=|>|<|LIKE)\s*(.+)$/i);
    if (!match) {
      throw new Error(`Не удалось разобрать условие WHERE: ${part}`);
    }
    const [, col, opRaw, valRaw] = match;
    const op = opRaw.toUpperCase();

    conditions.push((row) => {
      const left = getFieldValue(row, col);
      const right = parseOperand(valRaw, row);
      if (op === "=") return left === right;
      if (op === "!=" || op === "<>") return left !== right;
      if (op === ">") return left > right;
      if (op === "<") return left < right;
      if (op === ">=") return left >= right;
      if (op === "<=") return left <= right;
      if (op === "LIKE") {
        const escaped = String(right ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`^${escaped.replace(/%/g, ".*")}$`, "i");
        return regex.test(String(left ?? ""));
      }
      return false;
    });
  });

  return (row) => {
    let result = conditions[0](row);
    for (let i = 0; i < links.length; i += 1) {
      if (links[i] === "AND") result = result && conditions[i + 1](row);
      else result = result || conditions[i + 1](row);
    }
    return result;
  };
}

function parseSelectParts(sql) {
  const query = sql.trim().replace(/;$/, "");
  if (!/^select\s+/i.test(query)) {
    throw new Error("Ожидался SELECT-запрос.");
  }

  const fromPos = findKeywordOutsideScopes(query, "FROM");
  if (fromPos < 0) throw new Error("В SELECT отсутствует FROM.");

  const selectRaw = query.slice(6, fromPos).trim();
  const tail = query.slice(fromPos + 4).trim();

  const clauses = ["WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT"];
  const positions = clauses
    .map((clause) => ({ clause, idx: findKeywordOutsideScopes(tail, clause) }))
    .filter((item) => item.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  const firstClause = positions[0];
  const fromRaw = firstClause ? tail.slice(0, firstClause.idx).trim() : tail;
  const parts = {
    selectRaw,
    fromRaw,
    whereRaw: "",
    groupByRaw: "",
    havingRaw: "",
    orderByRaw: "",
    limitRaw: ""
  };

  positions.forEach((entry, index) => {
    const next = positions[index + 1];
    const start = entry.idx + entry.clause.length;
    const end = next ? next.idx : tail.length;
    const value = tail.slice(start, end).trim();
    if (entry.clause === "WHERE") parts.whereRaw = value;
    if (entry.clause === "GROUP BY") parts.groupByRaw = value;
    if (entry.clause === "HAVING") parts.havingRaw = value;
    if (entry.clause === "ORDER BY") parts.orderByRaw = value;
    if (entry.clause === "LIMIT") parts.limitRaw = value;
  });

  return parts;
}

function parseFromBlock(fromRaw) {
  const source = fromRaw.trim();
  const baseMatch = source.match(/^(\w+)(?:\s+(\w+))?(.*)$/i);
  if (!baseMatch) throw new Error("Не удалось разобрать FROM-блок.");

  const baseTable = baseMatch[1];
  let baseAlias = baseMatch[2] || baseTable;
  let rest = baseMatch[3] || "";

  if (/^(inner|join|where|group|having|order|limit)$/i.test(baseAlias)) {
    baseAlias = baseTable;
    rest = ` ${baseMatch[2] || ""}${rest}`;
  }

  const joins = [];
  while (rest.trim()) {
    const joinMatch = rest.match(
      /^\s*(?:INNER\s+)?JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+([\w.]+)\s*=\s*([\w.]+)\s*(.*)$/i
    );
    if (!joinMatch) {
      throw new Error(`Не удалось разобрать JOIN-блок: ${rest.trim()}`);
    }
    const [, table, aliasMaybe, leftField, rightField, nextRest] = joinMatch;
    const alias = aliasMaybe && !/^(ON|JOIN|WHERE|GROUP|HAVING|ORDER|LIMIT)$/i.test(aliasMaybe)
      ? aliasMaybe
      : table;
    joins.push({
      table,
      alias,
      leftField: normalizeIdentifier(leftField),
      rightField: normalizeIdentifier(rightField)
    });
    rest = nextRest || "";
  }

  return { baseTable, baseAlias, joins };
}

function qualifyRow(tableName, alias, row) {
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    out[`${tableName}.${key}`] = value;
    out[`${alias}.${key}`] = value;
    if (!(key in out)) out[key] = value;
  });
  return out;
}

function mergeRows(left, right) {
  const merged = { ...left };
  Object.entries(right).forEach(([key, value]) => {
    if (key.includes(".")) merged[key] = value;
    else if (!(key in merged)) merged[key] = value;
  });
  return merged;
}

function buildJoinedRows(fromModel) {
  assertTable(fromModel.baseTable);
  let workingRows = (db[fromModel.baseTable] || []).map((row) =>
    qualifyRow(fromModel.baseTable, fromModel.baseAlias, row)
  );

  fromModel.joins.forEach((join) => {
    assertTable(join.table);
    const rightRows = (db[join.table] || []).map((row) => qualifyRow(join.table, join.alias, row));
    const nextRows = [];
    workingRows.forEach((leftRow) => {
      rightRows.forEach((rightRow) => {
        const merged = mergeRows(leftRow, rightRow);
        if (getFieldValue(merged, join.leftField) === getFieldValue(merged, join.rightField)) {
          nextRows.push(merged);
        }
      });
    });
    workingRows = nextRows;
  });

  return workingRows;
}

function parseSelectItems(selectRaw) {
  const rawItems = splitCsv(selectRaw);
  return rawItems.map((raw) => {
    const withAlias = raw.match(/^(.*?)(?:\s+AS\s+(\w+))$/i);
    const expression = (withAlias ? withAlias[1] : raw).trim();
    const alias = (withAlias ? withAlias[2] : "").trim();
    const aggregateMatch = expression.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(\*|[\w.]+)\s*\)$/i);

    if (aggregateMatch) {
      return {
        type: "aggregate",
        func: aggregateMatch[1].toUpperCase(),
        field: normalizeIdentifier(aggregateMatch[2]),
        alias: alias || `${aggregateMatch[1].toLowerCase()}_${aggregateMatch[2].replace(".", "_")}`
      };
    }

    if (expression === "*") return { type: "star", alias: "*" };
    return {
      type: "column",
      field: normalizeIdentifier(expression),
      alias: alias || normalizeIdentifier(expression)
    };
  });
}

function computeAggregate(func, field, rows) {
  const values = field === "*" ? rows.map(() => 1) : rows.map((row) => getFieldValue(row, field));
  if (func === "COUNT") {
    if (field === "*") return rows.length;
    return values.filter((v) => v !== undefined && v !== null).length;
  }
  const numeric = values.map(Number).filter((v) => !Number.isNaN(v));
  if (func === "SUM") return numeric.reduce((acc, v) => acc + v, 0);
  if (func === "AVG") return numeric.length ? numeric.reduce((acc, v) => acc + v, 0) / numeric.length : null;
  if (func === "MIN") return values.filter((v) => v !== undefined).sort((a, b) => (a > b ? 1 : -1))[0] ?? null;
  if (func === "MAX") {
    const sorted = values.filter((v) => v !== undefined).sort((a, b) => (a > b ? 1 : -1));
    return sorted.length ? sorted[sorted.length - 1] : null;
  }
  return null;
}

function applyOrderAndLimit(rows, orderByRaw, limitRaw) {
  let out = [...rows];
  if (orderByRaw) {
    const match = orderByRaw.match(/^([\w.]+)(?:\s+(ASC|DESC))?$/i);
    if (!match) throw new Error(`Некорректный ORDER BY: ${orderByRaw}`);
    const [, field, dirRaw] = match;
    const dir = (dirRaw || "ASC").toUpperCase();
    out.sort((a, b) => {
      const left = getFieldValue(a, field);
      const right = getFieldValue(b, field);
      if (left === right) return 0;
      if (left === undefined || left === null) return 1;
      if (right === undefined || right === null) return -1;
      if (left > right) return dir === "DESC" ? -1 : 1;
      return dir === "DESC" ? 1 : -1;
    });
  }
  if (limitRaw) {
    const n = Number(limitRaw);
    if (Number.isNaN(n) || n < 0) throw new Error("LIMIT должен быть неотрицательным числом.");
    out = out.slice(0, n);
  }
  return out;
}

function executeSelectQuery(selectSql) {
  const parts = parseSelectParts(selectSql);
  const fromModel = parseFromBlock(parts.fromRaw);
  const selectItems = parseSelectItems(parts.selectRaw);
  const hasAggregate = selectItems.some((item) => item.type === "aggregate");
  const wherePredicate = parseWhere(parts.whereRaw);
  const havingPredicate = parseWhere(parts.havingRaw);
  const groupFields = parts.groupByRaw ? splitCsv(parts.groupByRaw).map(normalizeIdentifier) : [];

  const sourceRows = buildJoinedRows(fromModel);
  let rows = sourceRows.filter(wherePredicate);

  let resultRows = [];
  if (hasAggregate || groupFields.length) {
    const groups = new Map();
    if (!groupFields.length) {
      groups.set("__all__", rows);
    } else {
      rows.forEach((row) => {
        const key = groupFields.map((f) => valueToText(getFieldValue(row, f))).join("|");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
    }

    groups.forEach((groupRows) => {
      const out = {};
      selectItems.forEach((item) => {
        if (item.type === "aggregate") {
          out[item.alias] = computeAggregate(item.func, item.field, groupRows);
        } else if (item.type === "column") {
          out[item.alias] = getFieldValue(groupRows[0] || {}, item.field);
        } else if (item.type === "star") {
          Object.assign(out, groupRows[0] || {});
        }
      });
      resultRows.push(out);
    });

    resultRows = resultRows.filter(havingPredicate);
  } else {
    if (selectItems.length === 1 && selectItems[0].type === "star") {
      resultRows = rows.map((row) => ({ ...row }));
    } else {
      resultRows = rows.map((row) => {
        const out = {};
        selectItems.forEach((item) => {
          if (item.type === "column") out[item.alias] = getFieldValue(row, item.field);
        });
        return out;
      });
    }
  }

  resultRows = applyOrderAndLimit(resultRows, parts.orderByRaw, parts.limitRaw);

  const plan = [];
  plan.push({
    title: "Источник данных",
    details: `Базовая таблица: ${fromModel.baseTable}, исходных строк: ${sourceRows.length}.`
  });
  if (fromModel.joins.length) {
    fromModel.joins.forEach((join) => {
      plan.push({
        title: `JOIN ${join.table}`,
        details: `Соединение по условию ${join.leftField} = ${join.rightField}.`
      });
    });
  }
  if (parts.whereRaw) {
    plan.push({
      title: "Фильтрация WHERE",
      details: `Условие: ${parts.whereRaw}.`
    });
  }
  if (groupFields.length || hasAggregate) {
    plan.push({
      title: "Агрегация",
      details: groupFields.length
        ? `GROUP BY: ${groupFields.join(", ")}.`
        : "Агрегация без группировки."
    });
  }
  if (parts.havingRaw) {
    plan.push({
      title: "Фильтрация HAVING",
      details: `Условие: ${parts.havingRaw}.`
    });
  }
  if (parts.orderByRaw) {
    plan.push({
      title: "Сортировка",
      details: `ORDER BY ${parts.orderByRaw}.`
    });
  }
  if (parts.limitRaw) {
    plan.push({
      title: "Ограничение",
      details: `LIMIT ${parts.limitRaw}.`
    });
  }
  plan.push({
    title: "Итог",
    details: `Результирующих строк: ${resultRows.length}.`
  });

  return {
    rows: resultRows,
    plan
  };
}

function parseCreateColumns(defRaw) {
  return splitCsv(defRaw).map((def) => {
    const m = def.match(/^(\w+)\s*(.*)$/);
    if (!m) throw new Error(`Некорректное описание колонки: ${def}`);
    return {
      name: m[1],
      type: (m[2] || "TEXT").trim() || "TEXT"
    };
  });
}

function parseValueTuples(raw) {
  const tuples = [];
  let cur = "";
  let depth = 0;
  let quote = null;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if ((ch === "'" || ch === '"') && raw[i - 1] !== "\\") {
      if (!quote) quote = ch;
      else if (quote === ch) quote = null;
    }
    if (!quote) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
    }
    cur += ch;
    if (depth === 0 && cur.trim()) {
      tuples.push(cur.trim().replace(/^,\s*/, ""));
      cur = "";
    }
  }

  return tuples
    .filter(Boolean)
    .map((tuple) => {
      const m = tuple.match(/^\((.*)\)$/);
      if (!m) throw new Error(`Некорректный блок VALUES: ${tuple}`);
      return splitCsv(m[1]).map(parseValue);
    });
}

function executeStatement(statement) {
  const sql = statement.trim();
  if (!sql) return "Пустой запрос пропущен.";

  const showTablesMatch = sql.match(/^show\s+tables$/i);
  if (showTablesMatch) {
    const rows = Object.keys(db).map((t) => ({ table_name: t, rows: db[t].length }));
    renderResult("SHOW TABLES", rows);
    return `OK: показано таблиц: ${rows.length}.`;
  }

  const explainMatch = sql.match(/^explain\s+(.+)$/i);
  if (explainMatch) {
    const inner = explainMatch[1].trim();
    if (!/^select\s+/i.test(inner)) throw new Error("EXPLAIN поддерживает только SELECT.");
    const { plan } = executeSelectQuery(inner);
    renderExplain(plan);
    return "OK: план выполнения сформирован.";
  }

  const describeMatch = sql.match(/^(describe|desc)\s+(\w+)$/i);
  if (describeMatch) {
    const table = describeMatch[2];
    assertTable(table);
    const rows = (meta[table] || []).map((col) => ({
      Field: col.name,
      Type: col.type
    }));
    renderResult(`DESCRIBE ${table}`, rows);
    return `OK: структура таблицы ${table}.`;
  }

  const createMatch = sql.match(/^create\s+table\s+(\w+)\s*\((.+)\)$/i);
  if (createMatch) {
    const table = createMatch[1];
    if (db[table]) throw new Error(`Таблица ${table} уже существует.`);
    meta[table] = parseCreateColumns(createMatch[2]);
    db[table] = [];
    currentTable = table;
    renderSidebar();
    renderTable(table);
    saveState();
    return `OK: таблица ${table} создана.`;
  }

  const dropMatch = sql.match(/^drop\s+table\s+(\w+)$/i);
  if (dropMatch) {
    const table = dropMatch[1];
    assertTable(table);
    delete db[table];
    delete meta[table];
    currentTable = Object.keys(db)[0] || "";
    renderSidebar();
    if (currentTable) renderTable(currentTable);
    else {
      tableNameEl.textContent = "нет таблиц";
      tableOutputEl.innerHTML = "<p>База данных пуста. Создайте таблицу командой CREATE TABLE.</p>";
    }
    saveState();
    return `OK: таблица ${table} удалена.`;
  }

  const truncateMatch = sql.match(/^truncate\s+table\s+(\w+)$/i);
  if (truncateMatch) {
    const table = truncateMatch[1];
    assertTable(table);
    db[table] = [];
    renderTable(table);
    saveState();
    return `OK: таблица ${table} очищена.`;
  }

  const alterAddMatch = sql.match(/^alter\s+table\s+(\w+)\s+add\s+column\s+(\w+)\s*(.*)$/i);
  if (alterAddMatch) {
    const [, table, column, typeRaw] = alterAddMatch;
    assertTable(table);
    const columns = inferColumns(table);
    if (columns.includes(column)) {
      throw new Error(`Колонка ${column} уже существует в ${table}.`);
    }
    if (!meta[table]) meta[table] = [];
    meta[table].push({ name: column, type: typeRaw.trim() || "TEXT" });
    db[table] = db[table].map((row) => ({ ...row, [column]: null }));
    renderTable(table);
    saveState();
    return `OK: колонка ${column} добавлена в ${table}.`;
  }

  const alterDropMatch = sql.match(/^alter\s+table\s+(\w+)\s+drop\s+column\s+(\w+)$/i);
  if (alterDropMatch) {
    const [, table, column] = alterDropMatch;
    assertTable(table);
    const cols = inferColumns(table);
    if (!cols.includes(column)) {
      throw new Error(`Колонка ${column} не найдена в ${table}.`);
    }
    if (meta[table]) {
      meta[table] = meta[table].filter((c) => c.name !== column);
    }
    db[table] = db[table].map((row) => {
      const next = { ...row };
      delete next[column];
      return next;
    });
    renderTable(table);
    saveState();
    return `OK: колонка ${column} удалена из ${table}.`;
  }

  const insertMatch = sql.match(/^insert\s+into\s+(\w+)\s*(\(([^)]+)\))?\s*values\s*(.+)$/i);
  if (insertMatch) {
    const table = insertMatch[1];
    assertTable(table);
    const colsRaw = insertMatch[3];
    const tuplesRaw = insertMatch[4];
    const tuples = parseValueTuples(tuplesRaw);
    const columns = colsRaw
      ? splitCsv(colsRaw).map((c) => c.trim())
      : inferColumns(table);

    if (!columns.length) throw new Error(`Невозможно определить колонки для INSERT в ${table}.`);
    let inserted = 0;

    tuples.forEach((vals) => {
      if (vals.length !== columns.length) {
        throw new Error("Количество значений не совпадает с количеством колонок.");
      }
      const row = {};
      columns.forEach((col, i) => {
        row[col] = vals[i];
      });
      db[table].push(row);
      inserted += 1;
    });

    renderTable(table);
    saveState();
    return `OK: добавлено строк: ${inserted}.`;
  }

  if (/^select\s+/i.test(sql)) {
    const result = executeSelectQuery(sql);
    renderResult("SELECT Result", result.rows);
    renderExplain(result.plan);
    return `OK: выбрано строк: ${result.rows.length}.`;
  }

  const updateMatch = sql.match(/^update\s+(\w+)\s+set\s+(.+?)(?:\s+where\s+(.+))?$/i);
  if (updateMatch) {
    const [, table, setRaw, whereRaw] = updateMatch;
    assertTable(table);
    const predicate = parseWhere(whereRaw);
    const assignments = splitCsv(setRaw).map((pair) => {
      const m = pair.match(/^(\w+)\s*=\s*(.+)$/);
      if (!m) throw new Error(`Некорректный SET-блок: ${pair}`);
      return { col: m[1], value: parseValue(m[2]) };
    });

    let updated = 0;
    db[table] = db[table].map((row) => {
      if (!predicate(row)) return row;
      updated += 1;
      const next = { ...row };
      assignments.forEach((a) => {
        next[a.col] = a.value;
      });
      return next;
    });

    renderTable(table);
    saveState();
    return `OK: обновлено строк: ${updated}.`;
  }

  const deleteMatch = sql.match(/^delete\s+from\s+(\w+)(?:\s+where\s+(.+))?$/i);
  if (deleteMatch) {
    const [, table, whereRaw] = deleteMatch;
    assertTable(table);
    const predicate = parseWhere(whereRaw);
    const before = db[table].length;
    db[table] = db[table].filter((row) => !predicate(row));
    const removed = before - db[table].length;
    renderTable(table);
    saveState();
    return `OK: удалено строк: ${removed}.`;
  }

  throw new Error("Неподдерживаемый SQL-запрос. Проверьте синтаксис.");
}

function executeSqlBatch(rawSql) {
  const statements = splitStatements(rawSql);
  if (!statements.length) return "Введите SQL-запрос.";
  const logs = [];
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i];
    try {
      const message = executeStatement(stmt);
      logs.push(`[${i + 1}] ${message}`);
    } catch (error) {
      logs.push(`[${i + 1}] Ошибка: ${error.message}`);
      break;
    }
  }
  return logs.join("\n");
}

function runExplainOnly(rawSql) {
  const statements = splitStatements(rawSql);
  if (!statements.length) return "Введите SQL-запрос.";
  const sql = statements[0];
  const selectSql = /^explain\s+/i.test(sql) ? sql.replace(/^explain\s+/i, "") : sql;
  if (!/^select\s+/i.test(selectSql.trim())) {
    return "EXPLAIN работает только с SELECT-запросами.";
  }
  try {
    const { plan } = executeSelectQuery(selectSql);
    renderExplain(plan);
    return "OK: визуальный план построен.";
  } catch (error) {
    return `Ошибка EXPLAIN: ${error.message}`;
  }
}

function resetDb() {
  db = seedDb();
  meta = seedMeta();
  currentTable = "users";
  saveState();
  renderSidebar();
  renderTable(currentTable);
}

function exportDb() {
  const payload = {
    db,
    meta,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sql-webhelper-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importDb(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (!parsed.db || typeof parsed.db !== "object") {
        throw new Error("Невалидный JSON: отсутствует объект db.");
      }
      db = parsed.db;
      meta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};
      currentTable = Object.keys(db)[0] || "";
      saveState();
      renderSidebar();
      if (currentTable) renderTable(currentTable);
      else {
        tableNameEl.textContent = "нет таблиц";
        tableOutputEl.innerHTML = "<p>Импорт завершен. База не содержит таблиц.</p>";
      }
      sqlLogEl.textContent = "OK: база данных импортирована.";
    } catch (error) {
      sqlLogEl.textContent = `Ошибка импорта: ${error.message}`;
    } finally {
      importInput.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

tableListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("table-item")) return;
  currentTable = target.dataset.table || currentTable;
  renderSidebar();
  renderTable(currentTable);
});

document.getElementById("run-sql").addEventListener("click", () => {
  const result = executeSqlBatch(sqlInputEl.value);
  sqlLogEl.textContent = result;
});

if (explainBtn) {
  explainBtn.addEventListener("click", () => {
    const result = runExplainOnly(sqlInputEl.value);
    sqlLogEl.textContent = result;
  });
}

document.getElementById("reset-db").addEventListener("click", () => {
  resetDb();
  sqlLogEl.textContent = "OK: база данных сброшена к начальному состоянию.";
});

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportDb();
    sqlLogEl.textContent = "OK: экспорт базы данных выполнен.";
  });
}

if (importInput) {
  importInput.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.files || !input.files[0]) return;
    importDb(input.files[0]);
  });
}

renderSidebar();
if (currentTable) {
  renderTable(currentTable);
} else {
  tableNameEl.textContent = "нет таблиц";
  tableOutputEl.innerHTML = "<p>База данных пуста. Создайте таблицу командой CREATE TABLE.</p>";
}
