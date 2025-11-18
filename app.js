// Keys
const AUTH_KEY = 'pm_auth_v1';
const DB_KEY = 'pm_demo_v3';
const USERS_KEY = 'pm_users_v2';

// Helpers
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(31,h)+s.charCodeAt(i))|0;return (h>>>0).toString(16);}
function fmt$(n){return '$' + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function uid(p='id_'){return p+Math.random().toString(36).slice(2,9);}

function loadAuth(){const raw=localStorage.getItem(AUTH_KEY);return raw?JSON.parse(raw):null;}
function saveAuth(u){localStorage.setItem(AUTH_KEY, JSON.stringify(u));}
function logout(){localStorage.removeItem(AUTH_KEY);location.href='signin.html';}

// Demo DB
function ensureDemo(){
  const raw = localStorage.getItem(DB_KEY);
  if(raw) return JSON.parse(raw);
  const data = {
    properties:[
      {id:'p1', address:'12 Oak St, Apt 1', status:'vacant', defaultRent:1200},
      {id:'p2', address:'34 Maple Ave', status:'occupied', defaultRent:1500},
      {id:'p3', address:'18 Cedar Ct', status:'occupied', defaultRent:1350}
    ],
    tenants:[
      {id:'t1', name:'John Doe', contact:'john@example.com', ownerId:'u_demo', sharedId:'demo'},
      {id:'t2', name:'Ava Smith', contact:'ava@example.com', ownerId:'u_demo', sharedId:'demo'}
    ],
    leases:[
      {id:'l1', propertyId:'p2', tenantId:'t1', start:'2025-01-01', end:'2025-12-31', rent:1500},
      {id:'l2', propertyId:'p3', tenantId:'t2', start:'2025-07-01', end:'2026-06-30', rent:1350}
    ],
    payments:[
      {id:'pay1', leaseId:'l1', month:'2025-09', amount:1500, paid:true},
      {id:'pay2', leaseId:'l1', month:'2025-10', amount:1500, paid:false},
      {id:'pay3', leaseId:'l2', month:'2025-10', amount:1350, paid:true}
    ]
  };
  localStorage.setItem(DB_KEY, JSON.stringify(data));
  return data;
}
function saveDB(db){localStorage.setItem(DB_KEY, JSON.stringify(db));}

// Gate
function gate(roleRequired){
  const u = loadAuth();
  if(!u){location.href='signin.html';return null;}
  if(roleRequired && u.role !== roleRequired){
    location.href = (u.role==='tenant' ? 'tenant.html' : 'index.html'); return null;
  }
  const navUser = document.getElementById('navUser');
  if(navUser) navUser.textContent = `${u.email} • ${u.role}`;
  return u;
}

// OWNER
function renderOwner(){
  const u = gate('owner'); if(!u) return;
  const db = ensureDemo();

  const occ = db.properties.filter(p=>p.status==='occupied').length;
  const vac = db.properties.filter(p=>p.status==='vacant').length;
  const unpaid = db.payments.filter(p=>!p.paid).length;
  setText('kpiProps', db.properties.length);
  setText('kpiOcc', occ);
  setText('kpiVac', vac);
  setText('kpiUnpaid', unpaid);

  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t=>t.addEventListener('click',()=>{
    tabs.forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    showTab(t.dataset.tab);
  }));
  showTab('properties');
  document.getElementById('tab-properties').classList.add('active');
}

function setText(id, val){const el=document.getElementById(id); if(el) el.textContent = val;}

function showTab(name){
  const panels = document.querySelectorAll('.panel'); panels.forEach(p=>p.style.display='none');
  const el = document.getElementById('panel-'+name); if(el) el.style.display='block';
  if(name==='properties') renderProperties();
  if(name==='tenants') renderTenants();
  if(name==='leases') renderLeases();
  if(name==='payments') renderPayments();
}

function dbGet(){ return JSON.parse(localStorage.getItem(DB_KEY)); }

function renderProperties(){
  const db = dbGet();
  const tbody = document.getElementById('tbody-properties'); tbody.innerHTML='';
  db.properties.forEach(p=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.address}</td>
      <td>${p.status==='occupied'?'<span class="badge green">Occupied</span>':'<span class="badge yellow">Vacant</span>'}</td>
      <td>${fmt$(p.defaultRent)}</td>
      <td class="table-actions">
        <button class="btn ghost" onclick="togglePropStatus('${p.id}')">Toggle</button>
        <button class="btn ghost" onclick="deleteProperty('${p.id}')">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function renderTenants(){
  const db = dbGet();
  const tbody = document.getElementById('tbody-tenants'); tbody.innerHTML='';
  db.tenants.forEach(t=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t.name}</td><td>${t.contact||''}</td>
    <td class="table-actions"><button class="btn ghost" onclick="deleteTenant('${t.id}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderLeases(){
  const db = dbGet();
  const tbody = document.getElementById('tbody-leases'); tbody.innerHTML='';
  db.leases.forEach(l=>{
    const pr = db.properties.find(p=>p.id===l.propertyId);
    const tn = db.tenants.find(t=>t.id===l.tenantId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${pr?.address||'(property?)'}</td><td>${tn?.name||'(tenant?)'}</td>
    <td>${l.start}</td><td>${l.end}</td><td>${fmt$(l.rent)}</td>
    <td class="table-actions"><button class="btn ghost" onclick="deleteLease('${l.id}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderPayments(){
  const db = dbGet();
  const tbody = document.getElementById('tbody-payments'); tbody.innerHTML='';
  db.payments.slice().reverse().forEach(p=>{
    const l = db.leases.find(x=>x.id===p.leaseId);
    const pr = db.properties.find(x=>x.id===l?.propertyId);
    const tn = db.tenants.find(x=>x.id===l?.tenantId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${pr?.address||'(property?)'}</td><td>${tn?.name||'(tenant?)'}</td>
    <td>${p.month}</td><td>${fmt$(p.amount)}</td>
    <td>${p.paid?'<span class="badge green">Paid</span>':'<span class="badge red">Unpaid</span>'}</td>
    <td class="table-actions"><button class="btn ghost" onclick="togglePaid('${p.id}')">Toggle</button><button class="btn ghost" onclick="deletePayment('${p.id}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

// Actions
function togglePropStatus(id){
  const db = dbGet();
  const p = db.properties.find(x=>x.id===id); if(!p) return;
  p.status = (p.status==='occupied'?'vacant':'occupied');
  saveDB(db); renderProperties();
}
function deleteProperty(id){
  const db = dbGet();
  const leasesToRemove = db.leases.filter(l=>l.propertyId===id).map(l=>l.id);
  db.properties = db.properties.filter(p=>p.id!==id);
  db.leases = db.leases.filter(l=>l.propertyId!==id);
  db.payments = db.payments.filter(pay=>!leasesToRemove.includes(pay.leaseId));
  saveDB(db); renderProperties(); renderLeases(); renderPayments();
}
function deleteTenant(id){
  const db = dbGet();
  const leasesToRemove = db.leases.filter(l=>l.tenantId===id).map(l=>l.id);
  db.tenants = db.tenants.filter(t=>t.id!==id);
  db.leases = db.leases.filter(l=>l.tenantId!==id);
  db.payments = db.payments.filter(pay=>!leasesToRemove.includes(pay.leaseId));
  saveDB(db); renderTenants(); renderLeases(); renderPayments();
}
function deleteLease(id){
  const db = dbGet();
  db.leases = db.leases.filter(l=>l.id!==id);
  db.payments = db.payments.filter(p=>p.leaseId!==id);
  saveDB(db); renderLeases(); renderPayments();
}
function deletePayment(id){
  const db = dbGet();
  db.payments = db.payments.filter(p=>p.id!==id);
  saveDB(db); renderPayments();
}
function togglePaid(id){
  const db = dbGet();
  const p = db.payments.find(pp=>pp.id===id); if(!p) return;
  p.paid = !p.paid; saveDB(db); renderPayments();
}

// Add forms
function addProperty(e){e.preventDefault();
  const f=e.target; const address=f.ap_address.value.trim(); const rent=Number(f.ap_rent.value)||0;
  if(!address) return alert('Address required');
  const db=dbGet(); db.properties.push({id:uid('p_'),address,status:'vacant',defaultRent:rent});
  saveDB(db); f.reset(); renderProperties();
}
function addTenant(e){e.preventDefault();
  const f=e.target; const name=f.at_name.value.trim(); const contact=(f.at_contact.value||'').trim().toLowerCase();
  if(!name) return alert('Name required');
  const u=loadAuth(); const db=dbGet(); db.tenants.push({id:uid('t_'),name,contact,ownerId:u.id,sharedId:u.sharedId});
  saveDB(db); f.reset(); renderTenants();
}
function addLease(e){e.preventDefault();
  const f=e.target; const prop=f.al_property.value; const ten=f.al_tenant.value; const start=f.al_start.value; const end=f.al_end.value; const rent=Number(f.al_rent.value)||0;
  if(!prop||!ten||!start||!end) return alert('Complete all fields');
  const db=dbGet(); db.leases.push({id:uid('l_'),propertyId:prop,tenantId:ten,start,end,rent});
  const p=db.properties.find(x=>x.id===prop); if(p) p.status='occupied';
  saveDB(db); f.reset(); renderLeases(); renderProperties();
}
function addPayment(e){e.preventDefault();
  const f=e.target; const lease=f.pay_lease.value; const month=f.pay_month.value; const amount=Number(f.pay_amount.value)||0; const paid=f.pay_paid.value==='true';
  if(!lease||!month) return alert('Lease and month required');
  const db=dbGet(); db.payments.push({id:uid('pay_'),leaseId:lease,month,amount,paid});
  saveDB(db); f.reset(); renderPayments();
}

window.addProperty=addProperty; window.addTenant=addTenant; window.addLease=addLease; window.addPayment=addPayment;

function ownerPopulateOptions(){
  const db=dbGet();
  const propSel = document.getElementById('al_property'); if(propSel){propSel.innerHTML=''; db.properties.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=`${p.address} (${p.status})`; propSel.appendChild(o); });}
  const tenSel = document.getElementById('al_tenant'); if(tenSel){tenSel.innerHTML=''; db.tenants.forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.name + (t.contact?` — ${t.contact}`:''); tenSel.appendChild(o); });}
  const paySel = document.getElementById('pay_lease'); if(paySel){paySel.innerHTML=''; db.leases.forEach(l=>{ const pr=db.properties.find(p=>p.id===l.propertyId); const tn=db.tenants.find(t=>t.id===l.tenantId); const o=document.createElement('option'); o.value=l.id; o.textContent=`${pr?.address||'(prop?)'} — ${tn?.name||'(tenant?)'} ($${l.rent})`; paySel.appendChild(o); });}
}

// TENANT
function renderTenant(){
  const u = gate('tenant'); if(!u) return;
  const db = ensureDemo();
  const myTenant = db.tenants.find(t => (t.contact||'').toLowerCase() === u.email.toLowerCase());
  if(!myTenant){ document.body.innerHTML='<div class="center"><div class="form"><h2>No tenant record</h2><p class="notice">Please contact your landlord to add your email.</p></div></div>'; return; }
  const l = db.leases.find(x=>x.tenantId===myTenant.id);
  if(!l){ document.body.innerHTML='<div class="center"><div class="form"><h2>No lease found</h2><p class="notice">Your landlord has not assigned a lease yet.</p></div></div>'; return; }
  const pr = db.properties.find(p=>p.id===l.propertyId);

  setText('leaseProperty', pr?.address||'');
  setText('leaseTenant', myTenant?.name||'');
  setText('leaseStart', l.start);
  setText('leaseEnd', l.end);
  setText('leaseRent', fmt$(l.rent));

  const payments = db.payments.filter(p=>p.leaseId===l.id);
  const tbody = document.getElementById('tenantPayments'); if(!tbody) return; tbody.innerHTML='';
  payments.forEach(p=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${p.month}</td><td>${fmt$(p.amount)}</td><td>${p.paid?'<span class="badge green">Paid</span>':'<span class="badge red">Unpaid</span>'}</td>`;
    tbody.appendChild(tr);
  });
}

function makePaymentStub(){ alert('Payment processing is a stub in this demo.'); }
window.makePaymentStub = makePaymentStub;

// Auth with tenant email enforcement
function signin(e){
  e.preventDefault();
  const email = document.getElementById('si_email').value.trim().toLowerCase();
  const pass = document.getElementById('si_pass').value;
  const users = JSON.parse(localStorage.getItem(USERS_KEY)||'{}');
  const u = users[email];
  if(!u) return showMsg('signinMsg','No account for this email.');
  if(u.passHash !== hash(pass)) return showMsg('signinMsg','Incorrect password.');

  if(u.role === 'tenant'){
    const db = ensureDemo();
    const exists = db.tenants.some(t => (t.contact||'').toLowerCase() === email);
    if(!exists) return showMsg('signinMsg','Your email is not registered by the landlord. Please contact your landlord.');
  }

  saveAuth({ email, id:u.id, sharedId:u.sharedId, role:u.role });
  location.href = (u.role==='tenant' ? 'tenant.html' : 'index.html');
}

function signup(e){
  e.preventDefault();
  const email = document.getElementById('su_email').value.trim().toLowerCase();
  const pass = document.getElementById('su_pass').value;
  const pass2 = document.getElementById('su_pass2').value;
  const role = document.getElementById('su_role').value;
  if(pass.length<6) return showMsg('signupMsg','Password must be at least 6 characters.');
  if(pass!==pass2) return showMsg('signupMsg','Passwords do not match.');
  const users = JSON.parse(localStorage.getItem(USERS_KEY)||'{}');
  if(users[email]) return showMsg('signupMsg','Account already exists. Try signing in.');

  if(role === 'tenant'){
    const db = ensureDemo();
    const exists = db.tenants.some(t => (t.contact||'').toLowerCase() === email);
    if(!exists) return showMsg('signupMsg','This email is not registered by the landlord. Please contact your landlord.');
  }

  const sharedId = Math.random().toString(36).slice(2,12);
  users[email] = { id:'u_'+sharedId, passHash:hash(pass), sharedId, role };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  saveAuth({ email, id: users[email].id, sharedId, role });
  location.href = (role==='tenant' ? 'tenant.html' : 'index.html');
}

function showMsg(id, msg){const el=document.getElementById(id); if(!el) return; el.textContent=msg; el.style.opacity=1; setTimeout(()=>el.style.opacity=.85,30);}

window.renderOwner = renderOwner;
window.ownerPopulateOptions = ownerPopulateOptions;
window.renderTenant = renderTenant;
window.signin = signin;
window.signup = signup;
window.logout = logout;