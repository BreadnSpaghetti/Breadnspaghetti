// app-sql.js – owner/tenant logic wired to DAL, with payment setup + autofill

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function fmt$(n) {
  return "$" + Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function uid(p = "id_") {
  return p + Math.random().toString(36).slice(2, 9);
}

const AUTH_KEY = "pm_auth_sql_v4";

function loadAuth() {
  const raw = localStorage.getItem(AUTH_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveAuth(u) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(u));
}

function logout() {
  localStorage.removeItem(AUTH_KEY);
  location.href = "signin.html";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

async function gate(roleRequired) {
  await DAL.ready();
  const u = loadAuth();
  if (!u) {
    location.href = "signin.html";
    return null;
  }
  if (roleRequired && u.role !== roleRequired) {
    location.href = u.role === "tenant" ? "tenant.html" : "index.html";
    return null;
  }
  const navUser = document.getElementById("navUser");
  if (navUser) navUser.textContent = `${u.email} • ${u.role}`;
  return u;
}

// ===== OWNER SIDE =====
async function renderOwner() {
  const u = await gate("owner");
  if (!u) return;

  const k = DAL.kpis(u.sharedId);
  setText("kpiProps", k.total);
  setText("kpiOcc", k.occ);
  setText("kpiVac", k.vac);
  setText("kpiUnpaid", k.unpaid);

  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      showTab(t.dataset.tab);
    })
  );

  showTab("properties");
  const first = document.getElementById("tab-properties");
  if (first) first.classList.add("active");
}

function showTab(name) {
  const panels = document.querySelectorAll(".panel");
  panels.forEach((p) => (p.style.display = "none"));
  const el = document.getElementById("panel-" + name);
  if (el) el.style.display = "block";

  if (name === "properties") renderProperties();
  if (name === "tenants") renderTenants();
  if (name === "leases") {
    ownerPopulateOptions();
    renderLeases();
  }
  if (name === "payments") {
    ownerPopulateOptions();
    renderPayments();
  }
  if (name === "paysetup") {
    renderOwnerPaySetup();
  }
}

function renderProperties() {
  const u = loadAuth();
  if (!u) return;
  const tbody = document.getElementById("tbody-properties");
  if (!tbody) return;
  tbody.innerHTML = "";

  DAL.properties_list(u.sharedId).forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.address}</td>
      <td>${
        p.status === "occupied"
          ? '<span class="badge green">Occupied</span>'
          : '<span class="badge yellow">Vacant</span>'
      }</td>
      <td>${fmt$(p.default_rent)}</td>
      <td class="table-actions">
        <button class="btn ghost" onclick="togglePropStatus('${p.id}')">Toggle</button>
        <button class="btn ghost" onclick="deleteProperty('${p.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTenants() {
  const u = loadAuth();
  if (!u) return;
  const tbody = document.getElementById("tbody-tenants");
  if (!tbody) return;
  tbody.innerHTML = "";

  DAL.tenants_list(u.sharedId).forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.contact || ""}</td>
      <td class="table-actions">
        <button class="btn ghost" onclick="deleteTenant('${t.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderLeases() {
  const u = loadAuth();
  if (!u) return;
  const tbody = document.getElementById("tbody-leases");
  if (!tbody) return;
  tbody.innerHTML = "";

  DAL.leases_list(u.sharedId).forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.property_address || "(property?)"}</td>
      <td>${l.tenant_name || "(tenant?)"}</td>
      <td>${l.start}</td>
      <td>${l.end}</td>
      <td>${fmt$(l.rent)}</td>
      <td class="table-actions">
        <button class="btn ghost" onclick="deleteLease('${l.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPayments() {
  const u = loadAuth();
  if (!u) return;
  const tbody = document.getElementById("tbody-payments");
  if (!tbody) return;
  tbody.innerHTML = "";

  DAL.payments_list(u.sharedId).forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.property_address || "(property?)"}</td>
      <td>${p.tenant_name || "(tenant?)"}</td>
      <td>${p.month}</td>
      <td>${fmt$(p.amount)}</td>
      <td>${
        p.paid
          ? '<span class="badge green">Paid</span>'
          : '<span class="badge red">Unpaid</span>'
      }</td>
      <td class="table-actions">
        <button class="btn ghost" onclick="togglePaid('${p.id}')">Toggle</button>
        <button class="btn ghost" onclick="deletePayment('${p.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function renderOwnerPaySetup() {
  const u = loadAuth();
  if (!u) return;
  await DAL.ready();
  const row = DAL.owner_pay_get(u.sharedId);
  const ta = document.getElementById("pay_instructions");
  if (ta) {
    ta.value = row && row.instructions ? row.instructions : "";
  }
  const msg = document.getElementById("ownerPayMsg");
  if (msg) msg.textContent = "";
}

function togglePropStatus(id) {
  const u = loadAuth();
  if (!u) return;
  DAL.property_toggle(id, u.sharedId);
  renderProperties();
}

function deleteProperty(id) {
  const u = loadAuth();
  if (!u) return;
  DAL.property_delete(id, u.sharedId);
  renderProperties();
  renderLeases();
  renderPayments();
}

function deleteTenant(id) {
  const u = loadAuth();
  if (!u) return;
  DAL.tenant_delete(id, u.sharedId);
  renderTenants();
  renderLeases();
  renderPayments();
}

function deleteLease(id) {
  DAL.lease_delete(id);
  renderLeases();
  renderPayments();
}

function deletePayment(id) {
  DAL.payment_delete(id);
  renderPayments();
}

function togglePaid(id) {
  DAL.payment_toggle(id);
  renderPayments();
}

function addProperty(e) {
  e.preventDefault();
  const f = e.target;
  const address = f.ap_address.value.trim();
  const rent = Number(f.ap_rent.value) || 0;
  if (!address) return alert("Address required");
  const u = loadAuth();
  if (!u) return;
  DAL.property_add(uid("p_"), address, rent, u.sharedId);
  f.reset();
  renderProperties();
  ownerPopulateOptions();
}

function addTenant(e) {
  e.preventDefault();
  const f = e.target;
  const name = f.at_name.value.trim();
  const contact = (f.at_contact.value || "").trim().toLowerCase();
  if (!name) return alert("Name required");
  const u = loadAuth();
  if (!u) return;
  DAL.tenant_add(uid("t_"), name, contact, u.sharedId, u.sharedId);
  f.reset();
  renderTenants();
  ownerPopulateOptions();
}

function addLease(e) {
  e.preventDefault();
  const f = e.target;
  const prop = f.al_property.value;
  const ten = f.al_tenant.value;
  const start = f.al_start.value;
  const end = f.al_end.value;
  const rent = Number(f.al_rent.value) || 0;
  if (!prop || !ten || !start || !end) return alert("Complete all fields");
  DAL.lease_add(uid("l_"), prop, ten, start, end, rent);
  f.reset();
  renderLeases();
  renderProperties();
  ownerPopulateOptions();
}

function addPayment(e) {
  e.preventDefault();
  const f = e.target;
  const lease = f.pay_lease.value;
  const month = f.pay_month.value;
  const amount = Number(f.pay_amount.value) || 0;
  const paid = f.pay_paid.value === "true";
  if (!lease || !month) return alert("Lease and month required");
  DAL.payment_add(uid("pay_"), lease, month, amount, paid);
  f.reset();
  renderPayments();
  ownerPopulateOptions();
}

function saveOwnerPaymentInfo(e) {
  e.preventDefault();
  const ta = document.getElementById("pay_instructions");
  const msg = document.getElementById("ownerPayMsg");
  const u = loadAuth();
  if (!u || !ta) return;
  DAL.owner_pay_set(u.sharedId, ta.value.trim());
  if (msg) msg.textContent = "Payment instructions saved.";
}

window.addProperty = addProperty;
window.addTenant = addTenant;
window.addLease = addLease;
window.addPayment = addPayment;
window.saveOwnerPaymentInfo = saveOwnerPaymentInfo;

function syncLeaseRentFromProperty() {
  const sel = document.getElementById("al_property");
  const rentInput = document.querySelector('input[name="al_rent"]');
  if (!sel || !rentInput) return;
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.rent !== undefined) {
    rentInput.value = opt.dataset.rent;
  }
}

function syncPaymentAmountFromLease() {
  const sel = document.getElementById("pay_lease");
  const amountInput = document.querySelector('input[name="pay_amount"]');
  if (!sel || !amountInput) return;
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.rent !== undefined) {
    amountInput.value = opt.dataset.rent;
  }
}

async function ownerPopulateOptions() {
  await DAL.ready();
  const u = loadAuth();
  if (!u) return;

  const propSel = document.getElementById("al_property");
  if (propSel) {
    propSel.innerHTML = "";
    DAL.properties_for_select(u.sharedId).forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.address} (${p.status})`;
      o.dataset.rent = p.default_rent;
      propSel.appendChild(o);
    });
    if (!propSel.dataset.pmgtBound) {
      propSel.addEventListener("change", syncLeaseRentFromProperty);
      propSel.dataset.pmgtBound = "1";
    }
    syncLeaseRentFromProperty();
  }

  const tenSel = document.getElementById("al_tenant");
  if (tenSel) {
    tenSel.innerHTML = "";
    DAL.tenants_list(u.sharedId).forEach((t) => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name + (t.contact ? ` — ${t.contact}` : "");
      tenSel.appendChild(o);
    });
  }

  const paySel = document.getElementById("pay_lease");
  if (paySel) {
    paySel.innerHTML = "";
    DAL.leases_for_select(u.sharedId).forEach((l) => {
      const o = document.createElement("option");
      o.value = l.id;
      o.textContent = `${l.property_address || "(prop?)"} — ${
        l.tenant_name || "(tenant?)"
      } ($${l.rent})`;
      o.dataset.rent = l.rent;
      paySel.appendChild(o);
    });
    if (!paySel.dataset.pmgtBound) {
      paySel.addEventListener("change", syncPaymentAmountFromLease);
      paySel.dataset.pmgtBound = "1";
    }
    syncPaymentAmountFromLease();
  }
}

window.renderOwner = renderOwner;
window.ownerPopulateOptions = ownerPopulateOptions;

// ===== TENANT SIDE =====
async function renderTenant() {
  const u = await gate("tenant");
  if (!u) return;
  await DAL.ready();

  const tenant = DAL.tenant_by_email(u.email.toLowerCase());
  if (!tenant) {
    document.body.innerHTML =
      '<div class="center"><div class="form"><h2>No tenant record</h2><p class="notice">Please contact your landlord to add your email.</p></div></div>';
    return;
  }

  const allLeases = DAL.leases_list(tenant.owner_id);
  const lease = allLeases.find((l) => l.tenant_name === tenant.name);
  if (!lease) {
    document.body.innerHTML =
      '<div class="center"><div class="form"><h2>No lease found</h2><p class="notice">Your landlord has not assigned a lease yet.</p></div></div>';
    return;
  }

  setText("leaseProperty", lease.property_address || "");
  setText("leaseTenant", tenant.name || "");
  setText("leaseStart", lease.start);
  setText("leaseEnd", lease.end);
  setText("leaseRent", fmt$(lease.rent));

  const payments = DAL.payments_for_lease(lease.id);
  const tbody = document.getElementById("tenantPayments");
  if (!tbody) return;
  tbody.innerHTML = "";
  payments.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.month}</td>
      <td>${fmt$(p.amount)}</td>
      <td>${
        p.paid
          ? '<span class="badge green">Paid</span>'
          : '<span class="badge red">Unpaid</span>'
      }</td>
    `;
    tbody.appendChild(tr);
  });
}

async function showPaymentInfo() {
  const u = await gate("tenant");
  if (!u) return;
  await DAL.ready();

  const tenant = DAL.tenant_by_email(u.email.toLowerCase());
  const section = document.getElementById("tenantPaymentInfoSection");
  const text = document.getElementById("tenantPaymentInfoText");
  if (!tenant || !section || !text) {
    alert("No tenant record or payment info section not found.");
    return;
  }

  const row = DAL.owner_pay_get(tenant.owner_id);
  if (row && row.instructions) {
    text.textContent = row.instructions;
  } else {
    text.textContent =
      "Your landlord has not provided payment instructions yet. Please contact them directly.";
  }
  section.style.display = "block";
  section.scrollIntoView({ behavior: "smooth" });
}

window.renderTenant = renderTenant;
window.showPaymentInfo = showPaymentInfo;

// ===== AUTH =====
async function signin(e) {
  e.preventDefault();
  await DAL.ready();
  const email = document.getElementById("si_email").value.trim().toLowerCase();
  const pass = document.getElementById("si_pass").value;
  const msgEl = document.getElementById("signinMsg");

  const u = DAL.user_get(email);
  if (!u) {
    msgEl.textContent = "No account for this email.";
    return;
  }
  if (u.pass_hash !== hash(pass)) {
    msgEl.textContent = "Incorrect password.";
    return;
  }

  if (u.role === "tenant" && !DAL.tenant_exists_by_email(email)) {
    msgEl.textContent =
      "Your email is not registered by the landlord. Please contact your landlord.";
    return;
  }

  saveAuth({
    email,
    id: u.shared_id,
    sharedId: u.shared_id,
    role: u.role
  });

  location.href = u.role === "tenant" ? "tenant.html" : "index.html";
}

async function signup(e) {
  e.preventDefault();
  await DAL.ready();
  const email = document.getElementById("su_email").value.trim().toLowerCase();
  const pass = document.getElementById("su_pass").value;
  const pass2 = document.getElementById("su_pass2").value;
  const role = document.getElementById("su_role").value;
  const msgEl = document.getElementById("signupMsg");

  if (pass.length < 6) {
    msgEl.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (pass !== pass2) {
    msgEl.textContent = "Passwords do not match.";
    return;
  }
  if (DAL.user_get(email)) {
    msgEl.textContent = "Account already exists. Try signing in.";
    return;
  }

  if (role === "tenant" && !DAL.tenant_exists_by_email(email)) {
    msgEl.textContent =
      "This email is not registered by the landlord. Please contact your landlord.";
    return;
  }

  const shared = Math.random().toString(36).slice(2, 12);
  DAL.user_create(email, hash(pass), role, shared);

  saveAuth({
    email,
    id: shared,
    sharedId: shared,
    role
  });

  location.href = role === "tenant" ? "tenant.html" : "index.html";
}

window.signin = signin;
window.signup = signup;
window.logout = logout;