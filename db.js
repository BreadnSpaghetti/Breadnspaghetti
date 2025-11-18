// db.js – SQLite + owner scoping + KPIs + owner payment info

const SQL_WASM_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm";
const SQL_JS_CDN   = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js";
const DB_LS_KEY    = "pmgt_sqlite_db_v4";

let SQL;
let db;
let dbReady = initDb();

async function loadSqlJsIfNeeded() {
  if (window.initSqlJs && window.SQL) {
    SQL = window.SQL;
    return;
  }
  if (!window.initSqlJs) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SQL_JS_CDN;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  SQL = await initSqlJs({ locateFile: () => SQL_WASM_CDN });
}

function u8ToBase64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function base64ToU8(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

function persistDb() {
  const data = db.export();
  const b64 = u8ToBase64(data);
  localStorage.setItem(DB_LS_KEY, b64);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

function execRun(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {}
  stmt.free();
  persistDb();
}

async function initDb() {
  await loadSqlJsIfNeeded();

  const saved = localStorage.getItem(DB_LS_KEY);
  db = saved ? new SQL.Database(base64ToU8(saved)) : new SQL.Database();

  db.run("PRAGMA foreign_keys = ON;");

  db.run(`
    CREATE TABLE IF NOT EXISTS users(
      email     TEXT PRIMARY KEY,
      pass_hash TEXT NOT NULL,
      role      TEXT NOT NULL CHECK(role IN ('owner','tenant')),
      shared_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS properties(
      id           TEXT PRIMARY KEY,
      address      TEXT NOT NULL,
      status       TEXT NOT NULL CHECK(status IN ('occupied','vacant')),
      default_rent REAL NOT NULL,
      owner_id     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenants(
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      contact   TEXT,
      owner_id  TEXT NOT NULL,
      shared_id TEXT
    );

    CREATE TABLE IF NOT EXISTS leases(
      id          TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      start       TEXT NOT NULL,
      "end"       TEXT NOT NULL,
      rent        REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments(
      id       TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
      month    TEXT NOT NULL,
      amount   REAL NOT NULL,
      paid     INTEGER NOT NULL CHECK(paid IN (0,1))
    );

    CREATE TABLE IF NOT EXISTS owner_payment_info(
      owner_id     TEXT PRIMARY KEY,
      instructions TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_properties_owner_status ON properties(owner_id,status);
    CREATE INDEX IF NOT EXISTS idx_tenants_contact ON tenants(contact);
    CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payments_lease ON payments(lease_id);
  `);

  const c = queryOne("SELECT COUNT(*) as c FROM properties");
  if (!c || !c.c) {
    db.run(`
      INSERT INTO properties (id,address,status,default_rent,owner_id) VALUES
      ('p1','12 Oak St, Apt 1','vacant',1200,'u_demo'),
      ('p2','34 Maple Ave','occupied',1500,'u_demo'),
      ('p3','18 Cedar Ct','occupied',1350,'u_demo');

      INSERT INTO tenants (id,name,contact,owner_id,shared_id) VALUES
      ('t1','John Doe','john@example.com','u_demo','demo'),
      ('t2','Ava Smith','ava@example.com','u_demo','demo');

      INSERT INTO leases (id,property_id,tenant_id,start,"end",rent) VALUES
      ('l1','p2','t1','2025-01-01','2025-12-31',1500),
      ('l2','p3','t2','2025-07-01','2026-06-30',1350);

      INSERT INTO payments (id,lease_id,month,amount,paid) VALUES
      ('pay1','l1','2025-09',1500,1),
      ('pay2','l1','2025-10',1500,0),
      ('pay3','l2','2025-10',1350,1);

      INSERT INTO owner_payment_info (owner_id,instructions) VALUES
      ('u_demo','Send rent via Zelle to demo@pmgt.test or mail a check to 34 Maple Ave, Suite 100.');
    `);
    persistDb();
  }

  return true;
}

window.DAL = {
  ready: () => dbReady,

  kpis(ownerId) {
    const total = queryOne(
      "SELECT COUNT(*) AS c FROM properties WHERE owner_id=?",
      [ownerId]
    ).c;

    const occ = queryOne(
      "SELECT COUNT(*) AS c FROM properties WHERE owner_id=? AND status='occupied'",
      [ownerId]
    ).c;

    const vac = queryOne(
      "SELECT COUNT(*) AS c FROM properties WHERE owner_id=? AND status='vacant'",
      [ownerId]
    ).c;

    const unpaidRow = queryOne(`
      SELECT COUNT(*) AS c
      FROM payments p
      JOIN leases   l  ON l.id = p.lease_id
      JOIN properties pr ON pr.id = l.property_id
      JOIN tenants  t  ON t.id = l.tenant_id
      WHERE p.paid = 0
        AND pr.owner_id = ?
        AND t.owner_id  = ?
    `, [ownerId, ownerId]);
    const unpaid = unpaidRow ? unpaidRow.c : 0;

    return { total, occ, vac, unpaid };
  },

  properties_list(ownerId) {
    return queryAll(
      "SELECT * FROM properties WHERE owner_id=? ORDER BY address",
      [ownerId]
    );
  },

  property_add(id, address, rent, ownerId) {
    execRun(
      "INSERT INTO properties(id,address,status,default_rent,owner_id) VALUES(?,?, 'vacant', ?, ?)",
      [id, address, rent, ownerId]
    );
  },

  property_toggle(id, ownerId) {
    const row = queryOne(
      "SELECT status FROM properties WHERE id=? AND owner_id=?",
      [id, ownerId]
    );
    if (!row) return;
    const next = row.status === "occupied" ? "vacant" : "occupied";
    execRun(
      "UPDATE properties SET status=? WHERE id=? AND owner_id=?",
      [next, id, ownerId]
    );
  },

  property_delete(id, ownerId) {
    execRun("DELETE FROM properties WHERE id=? AND owner_id=?", [id, ownerId]);
  },

  properties_for_select(ownerId) {
    return queryAll(
      "SELECT id,address,status,default_rent FROM properties WHERE owner_id=? ORDER BY address",
      [ownerId]
    );
  },

  tenants_list(ownerId) {
    return queryAll(
      "SELECT * FROM tenants WHERE owner_id=? ORDER BY name",
      [ownerId]
    );
  },

  tenant_add(id, name, contact, ownerId, sharedId) {
    execRun(
      "INSERT INTO tenants(id,name,contact,owner_id,shared_id) VALUES(?,?,?,?,?)",
      [id, name, contact, ownerId, sharedId]
    );
  },

  tenant_delete(id, ownerId) {
    execRun("DELETE FROM tenants WHERE id=? AND owner_id=?", [id, ownerId]);
  },

  tenant_exists_by_email(email) {
    const r = queryOne(
      "SELECT COUNT(*) AS c FROM tenants WHERE lower(contact)=lower(?)",
      [email]
    );
    return r && r.c > 0;
  },

  tenant_by_email(email) {
    return queryOne(
      "SELECT * FROM tenants WHERE lower(contact)=lower(?)",
      [email]
    );
  },

  leases_list(ownerId) {
    return queryAll(`
      SELECT l.id, l.property_id, l.tenant_id, l.start, l."end", l.rent,
             pr.address AS property_address,
             t.name     AS tenant_name
      FROM leases l
      JOIN properties pr ON pr.id = l.property_id
      JOIN tenants    t  ON t.id = l.tenant_id
      WHERE pr.owner_id = ?
        AND t.owner_id  = ?
      ORDER BY pr.address, t.name
    `, [ownerId, ownerId]);
  },

  lease_add(id, propertyId, tenantId, start, end, rent) {
    execRun(
      "INSERT INTO leases(id,property_id,tenant_id,start,\"end\",rent) VALUES(?,?,?,?,?,?)",
      [id, propertyId, tenantId, start, end, rent]
    );
    execRun(
      "UPDATE properties SET status='occupied' WHERE id=?",
      [propertyId]
    );
  },

  lease_delete(id) {
    execRun("DELETE FROM leases WHERE id=?", [id]);
  },

  leases_for_select(ownerId) {
    return queryAll(`
      SELECT l.id,
             pr.address AS property_address,
             t.name     AS tenant_name,
             l.rent
      FROM leases l
      JOIN properties pr ON pr.id = l.property_id
      JOIN tenants    t  ON t.id = l.tenant_id
      WHERE pr.owner_id = ?
        AND t.owner_id  = ?
      ORDER BY pr.address, t.name
    `, [ownerId, ownerId]);
  },

  payments_list(ownerId) {
    return queryAll(`
      SELECT p.id, p.lease_id, p.month, p.amount, p.paid,
             pr.address AS property_address,
             t.name     AS tenant_name
      FROM payments p
      JOIN leases     l  ON l.id = p.lease_id
      JOIN properties pr ON pr.id = l.property_id
      JOIN tenants    t  ON t.id = l.tenant_id
      WHERE pr.owner_id = ?
        AND t.owner_id  = ?
      ORDER BY substr(p.month,1,4) DESC, substr(p.month,6,2) DESC
    `, [ownerId, ownerId]);
  },

  payments_for_lease(leaseId) {
    return queryAll(
      "SELECT * FROM payments WHERE lease_id=? ORDER BY substr(month,1,4), substr(month,6,2)",
      [leaseId]
    );
  },

  payment_add(id, leaseId, month, amount, paid) {
    execRun(
      "INSERT INTO payments(id,lease_id,month,amount,paid) VALUES(?,?,?,?,?)",
      [id, leaseId, month, amount, paid ? 1 : 0]
    );
  },

  payment_delete(id) {
    execRun("DELETE FROM payments WHERE id=?", [id]);
  },

  payment_toggle(id) {
    const r = queryOne("SELECT paid FROM payments WHERE id=?", [id]);
    if (!r) return;
    const next = r.paid ? 0 : 1;
    execRun("UPDATE payments SET paid=? WHERE id=?", [next, id]);
  },

  user_get(email) {
    return queryOne("SELECT * FROM users WHERE email=?", [email]) || null;
  },

  user_create(email, passHash, role, sharedId) {
    execRun(
      "INSERT INTO users(email,pass_hash,role,shared_id) VALUES(?,?,?,?)",
      [email, passHash, role, sharedId]
    );
  },

  owner_pay_get(ownerId) {
    return queryOne(
      "SELECT instructions FROM owner_payment_info WHERE owner_id=?",
      [ownerId]
    );
  },

  owner_pay_set(ownerId, instructions) {
    execRun(
      "INSERT INTO owner_payment_info(owner_id,instructions) VALUES(?,?) \
ON CONFLICT(owner_id) DO UPDATE SET instructions=excluded.instructions",
      [ownerId, instructions]
    );
  }
};