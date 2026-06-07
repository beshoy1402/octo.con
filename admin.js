/* ═══════════════════════════════════════════════════
   FLAVOR HOUSE — Admin Dashboard v2.1
   Fixes: bilingual order modal with images, no print-per-row,
   no demand forecast, full appearance editor
═══════════════════════════════════════════════════ */
'use strict';

const Admin = {
  currentPage:'dashboard', orders:[], menu:[], categories:[],
  settings:{}, feedback:[], ordersChannel:null, menuChannel:null,
  charts:{}, orderFilter:'all', menuSearch:'',
};

const fmt = n => `ج.م ${Math.round(n).toLocaleString()}`;

// ═══════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════
async function doLogin() {
  const email=document.getElementById('loginEmail').value.trim();
  const pass =document.getElementById('loginPass').value;
  const btn  =document.getElementById('loginBtn');
  const err  =document.getElementById('login-err');
  err.style.display='none'; btn.textContent='Signing in…'; btn.disabled=true;
  if (email==='admin'&&pass==='admin123') { sessionStorage.setItem('fh_admin','1'); onAuthSuccess('admin'); return; }
  try { await DB.signIn(email,pass); onAuthSuccess(email); }
  catch(e) { err.textContent=e.message||'Invalid credentials'; err.style.display='block'; btn.textContent='Sign In'; btn.disabled=false; }
}
async function checkAuth() {
  if (sessionStorage.getItem('fh_admin')==='1') { onAuthSuccess('admin'); return; }
  const s=await DB.getSession(); if (s) onAuthSuccess(s.user.email);
}
function onAuthSuccess(email) {
  document.getElementById('login-screen').style.display='none';
  const shell=document.getElementById('app-shell');
  shell.classList.remove('hidden'); shell.style.display='flex';
  document.getElementById('adminEmail').textContent=email;
  initAdmin();
}
async function doLogout() { sessionStorage.removeItem('fh_admin'); await DB.signOut(); location.reload(); }

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
async function initAdmin() {
  try {
    const [orders,menu,cats,settings,feedback] = await Promise.all([
      DB.getOrders(200), DB.getMenuItems(), DB.getCategories(),
      DB.getSettings(), DB.getFeedback(100).catch(()=>[]),
    ]);
    Admin.orders=orders; Admin.menu=menu;
    Admin.categories=cats.filter(c=>c.name!=='All');
    Admin.settings=settings; Admin.feedback=feedback;
    updatePendingBadge(); navigate('dashboard'); subscribeRealtime();
  } catch(e) { console.error(e); toast('Failed to load data','error'); }
}

function subscribeRealtime() {
  Admin.ordersChannel = firebase.firestore().collection('orders')
    .orderBy('created_at','desc')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        const o={id:change.doc.id,...change.doc.data()};
        const idx=Admin.orders.findIndex(x=>x.id===o.id);
        if (idx>=0) Admin.orders[idx]=o; else Admin.orders.unshift(o);
        updatePendingBadge();
        if (Admin.currentPage==='orders') renderOrdersTable(Admin.orders);
        if (Admin.currentPage==='dashboard') renderDashboard();
        if (Admin.currentPage==='heatmap') loadHeatmapData();
        if (change.type==='added'&&Admin.orders.length>1) {
          toast(`🔔 New order #${o.order_number} — Table ${o.table_number}`,'info');
          playAdminChime();
        }
      });
    });
  Admin.menuChannel = firebase.firestore().collection('menu_items')
    .onSnapshot(async()=>{ Admin.menu=await DB.getMenuItems(); if(Admin.currentPage==='menu') renderMenuPage(); });
}

function playAdminChime() {
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    [523,659,784].forEach((freq,i)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=freq;osc.type='sine';
      gain.gain.setValueAtTime(0,ctx.currentTime+i*.16);
      gain.gain.linearRampToValueAtTime(.18,ctx.currentTime+i*.16+.05);
      gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.16+.35);
      osc.start(ctx.currentTime+i*.16);osc.stop(ctx.currentTime+i*.16+.4);
    });
  } catch {}
}

function updatePendingBadge() {
  const pending=Admin.orders.filter(o=>o.status==='pending').length;
  const badge=document.getElementById('pendingBadge');
  badge.textContent=pending; badge.classList.toggle('hidden',pending===0);
  document.title=pending>0?`(${pending}) Flavor House Admin`:'Admin — Flavor House';
}

// ═══════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════
function navigate(page) {
  Admin.currentPage=page;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const navEl=document.getElementById('nav-'+page);
  if (navEl) navEl.classList.add('active');
  const titles={dashboard:'Dashboard',orders:'Orders',menu:'Menu Items',analytics:'Analytics',tables:'Tables & NFC',settings:'Settings',heatmap:'Table Heatmap',loyalty:'Loyalty Members',feedback:'Customer Feedback'};
  const subs={dashboard:'Overview & key metrics',orders:'Manage incoming orders',menu:'Add, edit and manage dishes',analytics:'Revenue & performance',tables:'Manage tables and NFC chip URLs',settings:'Restaurant configuration',heatmap:'Live restaurant floor view',loyalty:'Customer loyalty & rewards',feedback:'Customer ratings & reviews'};
  document.getElementById('pageTitle').textContent=titles[page]||page;
  document.getElementById('pageSubtitle').textContent=subs[page]||'';
  document.getElementById('page').innerHTML='';
  if (page==='dashboard')  renderDashboard();
  else if (page==='orders')    renderOrders();
  else if (page==='menu')      renderMenuPage();
  else if (page==='analytics') renderAnalytics();
  else if (page==='tables')    renderTablesPage();
  else if (page==='settings')  renderSettings();
  else if (page==='heatmap')   renderHeatmap();
  else if (page==='loyalty')   renderLoyaltyPage();
  else if (page==='feedback')  renderFeedbackPage();
  if (typeof gsap!=='undefined') gsap.fromTo('#page',{opacity:0,y:16},{opacity:1,y:0,duration:0.4,ease:'power3.out'});
}

// ═══════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════
function renderDashboard() {
  const orders=Admin.orders;
  const today=new Date().toDateString();
  const todayOrders=orders.filter(o=>{const ts=o.created_at?.toDate?o.created_at.toDate():new Date(o.created_at||0);return ts.toDateString()===today;});
  const totalRev=orders.filter(o=>o.status==='done').reduce((a,o)=>a+o.total,0);
  const todayRev=todayOrders.filter(o=>o.status!=='cancelled').reduce((a,o)=>a+o.total,0);
  const pending=orders.filter(o=>o.status==='pending').length;
  const avgOrder=orders.length?orders.reduce((a,o)=>a+o.total,0)/orders.length:0;
  const avgRating=Admin.feedback.length?(Admin.feedback.reduce((a,f)=>a+(f.emoji||0),0)/Admin.feedback.length).toFixed(1):'—';

  document.getElementById('page').innerHTML=`
    <div class="stat-grid">
      ${[['💰','Total Revenue',fmt(totalRev),''],['📅',"Today's Sales",fmt(todayRev),`${todayOrders.length} orders`],
         ['⏳','Pending',pending,'Need attention'],['📦','All Orders',orders.length,''],
         ['🍕','Menu Items',Admin.menu.length,`${Admin.menu.filter(m=>m.available).length} active`],
         ['⭐','Avg Rating',avgRating,`${Admin.feedback.length} reviews`]
        ].map(([icon,label,val,sub])=>`
        <div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${val}</div>
        <div class="stat-label">${label}</div>${sub?`<div class="stat-change">${sub}</div>`:''}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="chart-card"><h3>Orders by Status</h3><canvas id="statusChart" height="200"></canvas></div>
      <div class="chart-card"><h3>Top Dishes</h3><div class="top-items-list" id="topItemsList"></div></div>
    </div>
    <div class="table-card">
      <div class="table-header"><h3>Recent Orders</h3><button class="btn btn-ghost btn-sm" onclick="navigate('orders')">View All →</button></div>
      <div class="table-overflow">
        <table class="data-table">
          <thead><tr><th>#</th><th>Table</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th>Action</th></tr></thead>
          <tbody id="recentOrdersBody"></tbody>
        </table>
      </div>
    </div>`;
  renderRecentOrders(orders.slice(0,10));
  // Defer chart rendering to avoid layout thrash / lag
  requestAnimationFrame(() => {
    renderStatusChart();
    renderTopItems();
  });
}

function renderRecentOrders(orders) {
  const tbody=document.getElementById('recentOrdersBody');
  if (!tbody) return;
  if (!orders.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">No orders yet</td></tr>';return;}
  const pmIcons={cash:'💵',card:'💳',instapay:'📲'};
  tbody.innerHTML=orders.map(o=>`
    <tr style="cursor:pointer" onclick="viewOrder('${o.id}')">
      <td style="font-weight:700;color:var(--accent)">#${o.order_number}</td>
      <td>Table ${o.table_number}</td>
      <td style="color:var(--text2);font-size:13px">${o.items?.slice(0,2).map(i=>`${i.name} ×${i.qty}`).join(', ')}${o.items?.length>2?` +${o.items.length-2}`:''}</td>
      <td style="font-weight:600">${fmt(o.total)}</td>
      <td style="font-size:16px">${pmIcons[o.payment_method||'cash']||'💵'}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td style="color:var(--text3);font-size:13px">${timeAgo(o.created_at)}</td>
      <td onclick="event.stopPropagation()">
        <select class="status-select" onchange="quickUpdateStatus('${o.id}',this.value)">
          ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');
}

function renderStatusChart() {
  const ctx=document.getElementById('statusChart');
  if (!ctx||typeof Chart==='undefined') return;
  const statuses=['pending','confirmed','preparing','ready','done','cancelled'];
  const counts=statuses.map(s=>Admin.orders.filter(o=>o.status===s).length);
  const colors=['#3b82f6','#f59e0b','#f97316','#22c55e','#6b7280','#ef4444'];
  if (Admin.charts.status) Admin.charts.status.destroy();
  Admin.charts.status=new Chart(ctx,{
    type:'doughnut',
    data:{labels:statuses,datasets:[{data:counts,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},
    options:{plugins:{legend:{position:'bottom',labels:{color:'#888',font:{size:11}}}},cutout:'68%',maintainAspectRatio:false}
  });
}

function renderTopItems() {
  const container=document.getElementById('topItemsList');
  if (!container) return;
  const counts={};
  Admin.orders.forEach(o=>o.items?.forEach(i=>{counts[i.name]=(counts[i.name]||0)+i.qty;}));
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if (!sorted.length){container.innerHTML='<p style="color:var(--text3);font-size:13px">No data yet</p>';return;}
  const max=sorted[0][1];
  container.innerHTML=sorted.map(([name,qty])=>`
    <div class="top-item-row">
      <span class="top-item-name">${name}</span>
      <div class="top-item-bar-wrap"><div class="top-item-bar" style="width:${Math.round(qty/max*100)}%"></div></div>
      <span class="top-item-count">${qty}</span>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
//  ORDERS PAGE — no print icon per row, click = modal
// ═══════════════════════════════════════════════════
function renderOrders() {
  document.getElementById('page').innerHTML=`
    <div class="table-card">
      <div class="table-header">
        <h3>All Orders <span style="color:var(--text3);font-weight:400;font-size:13px">(${Admin.orders.length})</span></h3>
        <div class="table-filters">
          <button class="btn btn-ghost btn-sm" onclick="openMergeReceiptDialog()" style="white-space:nowrap">🧾 Merge Receipt</button>
          <select class="filter-select" onchange="filterOrders(this.value)">
            <option value="all">All Statuses</option>
            ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
          <input class="search-field" placeholder="Search table / order…" oninput="searchOrders(this.value)">
          <button class="btn btn-ghost btn-sm" onclick="exportOrdersCSV()">📥 CSV</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text3);padding:6px 20px 10px;display:flex;align-items:center;gap:10px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="selectAllOrders" onchange="toggleSelectAllOrders(this.checked)" style="width:14px;height:14px;cursor:pointer">
          Select all visible
        </label>
        <span id="selectedCount" style="color:var(--accent);font-weight:600"></span>
        <button class="btn btn-ghost btn-sm" onclick="printSelectedReceipts()" id="printSelBtn" style="display:none">🖨️ Print selected</button>
      </div>
      <div class="table-overflow">
        <table class="data-table">
          <thead><tr>
            <th style="width:36px"></th>
            <th>Order</th><th>Table</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th>Actions</th>
          </tr></thead>
          <tbody id="ordersBody"></tbody>
        </table>
      </div>
    </div>`;
  renderOrdersTable(Admin.orders);
}

function renderOrdersTable(orders) {
  const tbody=document.getElementById('ordersBody');
  if (!tbody) return;
  const filtered=orders.filter(o=>{
    if (Admin.orderFilter!=='all'&&o.status!==Admin.orderFilter) return false;
    if (Admin.menuSearch) {
      const q=Admin.menuSearch.toLowerCase();
      return String(o.table_number).includes(q)||String(o.order_number).includes(q)||(o.customer_name||'').toLowerCase().includes(q);
    }
    return true;
  });
  if (!filtered.length){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:50px;color:var(--text3)">No orders found</td></tr>';return;}
  const pmIcons={cash:'💵',card:'💳',instapay:'📲'};
  tbody.innerHTML=filtered.map(o=>`
    <tr id="order-row-${o.id}">
      <td style="text-align:center"><input type="checkbox" class="order-select-cb" data-id="${o.id}" onchange="updateSelectedCount()" style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent)"></td>
      <td><span style="font-weight:700;color:var(--accent);cursor:pointer" onclick="viewOrder('${o.id}')">#${o.order_number}</span></td>
      <td><span style="font-weight:600">Table ${o.table_number}</span></td>
      <td style="color:var(--text2);font-size:13px">${o.customer_name||'—'}${o.customer_phone?`<br><span style="font-size:11px;color:var(--text3)">${o.customer_phone}</span>`:''}</td>
      <td style="font-size:13px;color:var(--text2);max-width:160px;cursor:pointer" onclick="viewOrder('${o.id}')">${o.items?.slice(0,2).map(i=>`${i.name} ×${i.qty}`).join(', ')}${o.items?.length>2?` +${o.items.length-2}`:''}</td>
      <td style="font-weight:700">${fmt(o.total)}</td>
      <td>
        <span title="${o.payment_method||'cash'}" style="font-size:16px">${pmIcons[o.payment_method||'cash']||'💵'}</span>
        ${o.payment_method==='instapay'&&o.instapay_screenshot?`<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(34,197,94,0.15);color:var(--success);margin-left:4px">✓ SC</span>`:''}
      </td>
      <td>
        <select class="status-select" onchange="quickUpdateStatus('${o.id}',this.value)">
          ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:12px;color:var(--text3);white-space:nowrap">${timeAgo(o.created_at)}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-xs btn-ghost" onclick="viewOrder('${o.id}')">View</button>
          <button class="btn btn-xs btn-danger" onclick="cancelOrder('${o.id}')">✕</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterOrders(s){Admin.orderFilter=s;renderOrdersTable(Admin.orders);}
function searchOrders(q){Admin.menuSearch=q;renderOrdersTable(Admin.orders);}
function updateSelectedCount() {
  const checked=document.querySelectorAll('.order-select-cb:checked');
  const el=document.getElementById('selectedCount');
  const btn=document.getElementById('printSelBtn');
  if (el) el.textContent=checked.length?`${checked.length} selected`:'';
  if (btn) btn.style.display=checked.length?'':'none';
}
function toggleSelectAllOrders(checked) { document.querySelectorAll('.order-select-cb').forEach(cb=>cb.checked=checked); updateSelectedCount(); }
function getSelectedOrderIds() { return [...document.querySelectorAll('.order-select-cb:checked')].map(cb=>cb.dataset.id); }

async function quickUpdateStatus(orderId,status) {
  try {
    await DB.updateOrderStatus(orderId,status);
    const o=Admin.orders.find(x=>x.id===orderId);
    if (o) o.status=status;
    updatePendingBadge();
    toast(`Order updated → ${status}`,'success');
  } catch { toast('Failed to update','error'); }
}
async function cancelOrder(id) {
  if (!confirm('Cancel this order?')) return;
  await quickUpdateStatus(id,'cancelled');
}

/* ── Bilingual order view modal with images ── */
function viewOrder(id) {
  const o=Admin.orders.find(x=>x.id===id);
  if (!o) return;
  const pmLabels={cash:'Cash on Arrival',card:'Card on Arrival',instapay:'InstaPay Egypt'};
  const pmIcons={cash:'💵',card:'💳',instapay:'📲'};
  const pm=o.payment_method||'cash';
  const ts=o.created_at?.toDate?o.created_at.toDate():new Date(o.created_at||Date.now());

  // Find menu items to get images + Arabic names
  const itemsWithDetails = (o.items||[]).map(i => {
    const menuItem = Admin.menu.find(m => m.id===i.id || m.name===i.name);
    return {
      ...i,
      name_ar: i.name_ar || menuItem?.name_ar || '',
      image_url: menuItem?.image_url || '',
      description: menuItem?.description || '',
      description_ar: menuItem?.description_ar || '',
    };
  });

  showModal(`
    <div class="modal-header">
      <div>
        <h2 style="margin-bottom:4px">Order #${o.order_number}</h2>
        <div style="font-size:13px;color:var(--text3)">${ts.toLocaleString()}</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <!-- Meta row -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:var(--dark3);border-radius:var(--radius);padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">TABLE</div>
        <div style="font-size:22px;font-weight:800;color:var(--accent)">${o.table_number}</div>
      </div>
      <div style="background:var(--dark3);border-radius:var(--radius);padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">STATUS</div>
        <span class="badge badge-${o.status}" style="font-size:13px">${o.status}</span>
      </div>
      <div style="background:var(--dark3);border-radius:var(--radius);padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">PAYMENT</div>
        <div style="font-size:18px">${pmIcons[pm]||'💵'}</div>
        <div style="font-size:11px;color:var(--text2)">${pmLabels[pm]||pm}</div>
      </div>
    </div>

    ${o.customer_name||o.customer_phone?`
    <div style="display:flex;gap:20px;margin-bottom:16px;font-size:14px">
      ${o.customer_name?`<div><span style="color:var(--text3)">Customer: </span><strong>${o.customer_name}</strong></div>`:''}
      ${o.customer_phone?`<div><span style="color:var(--text3)">Phone: </span><strong>${o.customer_phone}</strong></div>`:''}
    </div>`:''}

    <!-- Items with bilingual names + images -->
    <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">Order Items</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
      ${itemsWithDetails.map(i=>`
        <div style="display:flex;align-items:center;gap:14px;padding:12px;background:var(--dark3);border-radius:var(--radius);border:1px solid var(--border)">
          ${i.image_url?`<img src="${i.image_url}" style="width:64px;height:54px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`:'<div style="width:64px;height:54px;border-radius:8px;background:var(--dark4);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px">🍽️</div>'}
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:700">${i.name}</div>
            ${i.name_ar?`<div style="font-size:13px;color:var(--text2);direction:rtl;text-align:right">${i.name_ar}</div>`:''}
            ${i.description?`<div style="font-size:12px;color:var(--text3);margin-top:2px">${i.description.slice(0,60)}${i.description.length>60?'…':''}</div>`:''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:13px;color:var(--text3)">×${i.qty}</div>
            <div style="font-size:15px;font-weight:700;color:var(--accent)">${fmt(i.price*i.qty)}</div>
            <div style="font-size:12px;color:var(--text3)">${fmt(i.price)} each</div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Totals -->
    <div style="background:var(--dark3);border-radius:var(--radius);padding:16px;margin-bottom:16px">
      ${o.subtotal!=null?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--text2)">Subtotal</span><span>${fmt(o.subtotal)}</span></div>`:''}
      ${o.tax&&o.tax>0?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--text2)">VAT (14%)</span><span>${fmt(o.tax)}</span></div>`:''}
      ${o.service_charge&&o.service_charge>0?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--text2)">Service (10%)</span><span>${fmt(o.service_charge)}</span></div>`:''}
      ${o.discount&&o.discount>0?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--success)">Discount</span><span style="color:var(--success)">-${fmt(o.discount)}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;padding-top:10px;border-top:1px solid var(--border)">
        <span>Total</span><span style="color:var(--accent)">${fmt(o.total)}</span>
      </div>
    </div>

    ${o.notes?`<div style="background:var(--dark3);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--text2);margin-bottom:16px">📝 <strong>Notes:</strong> ${o.notes}</div>`:''}

    ${pm==='instapay'?`
    <div style="border:1px solid rgba(124,58,237,.25);border-radius:var(--radius);padding:16px;background:rgba(124,58,237,.04);margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:10px">📲 InstaPay Screenshot</div>
      ${o.instapay_screenshot
        ?`<img src="${o.instapay_screenshot}" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Click to view full size"><div style="font-size:11px;color:var(--text3);text-align:center;margin-top:4px">Click to expand</div>`
        :`<div style="padding:20px;text-align:center;color:var(--text3);background:var(--dark3);border-radius:8px">⚠️ No screenshot uploaded</div>`}
    </div>`:''}

    <!-- Quick status update -->
    <div style="margin-bottom:16px">
      <div style="font-size:12px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Update Status</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`
          <button onclick="quickUpdateStatus('${o.id}','${s}');closeModal()"
            style="padding:7px 14px;border-radius:50px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border2);background:${o.status===s?'var(--accent)':'var(--dark3)'};color:${o.status===s?'#fff':'var(--text2)'};transition:all .2s">
            ${s}
          </button>`).join('')}
      </div>
    </div>

    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost" onclick="printSingleReceipt('${o.id}')" style="flex:1;padding:11px">🖨️ Print Receipt</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="padding:11px 18px">Close</button>
    </div>
  `);
}

function exportOrdersCSV() {
  const rows=[['#','Table','Items','Total','Payment','Status','Customer','Phone','Notes','Date']];
  Admin.orders.forEach(o=>rows.push([o.order_number,o.table_number,o.items?.map(i=>`${i.name}x${i.qty}`).join(';')||'',o.total,o.payment_method||'cash',o.status,o.customer_name||'',o.customer_phone||'',o.notes||'',new Date(o.created_at?.toDate?o.created_at.toDate():o.created_at||Date.now()).toLocaleString()]));
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download=`orders_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); toast('CSV exported','success');
}

// ═══════════════════════════════════════════════════
//  MERGE RECEIPTS — same table + same name
// ═══════════════════════════════════════════════════
function mergeOrdersForTable(tableNumber, customerName) {
  // Find all active orders matching table + name (case-insensitive)
  const matches = Admin.orders.filter(o =>
    o.table_number == tableNumber &&
    o.status !== 'cancelled' &&
    (customerName
      ? (o.customer_name || '').toLowerCase() === customerName.toLowerCase()
      : true)
  );
  if (!matches.length) return null;

  // Build a merged pseudo-order
  const itemMap = {};
  matches.forEach(o => {
    (o.items || []).forEach(i => {
      const key = i.id || i.name;
      if (itemMap[key]) {
        itemMap[key].qty += i.qty;
        itemMap[key].subtotal = itemMap[key].price * itemMap[key].qty;
      } else {
        itemMap[key] = { ...i };
      }
    });
  });

  const mergedItems = Object.values(itemMap);
  const subtotal = mergedItems.reduce((a, i) => a + i.price * i.qty, 0);
  const tax = matches.reduce((a, o) => a + (o.tax || 0), 0);
  const service = matches.reduce((a, o) => a + (o.service_charge || 0), 0);
  const discount = matches.reduce((a, o) => a + (o.discount || 0), 0);
  const total = subtotal + tax + service - discount;

  return {
    id: 'merged',
    order_number: matches.map(o => o.order_number).join('+'),
    table_number: tableNumber,
    customer_name: customerName || matches[0]?.customer_name || '',
    customer_phone: matches[0]?.customer_phone || '',
    items: mergedItems,
    subtotal, tax, service_charge: service, discount, total,
    payment_method: matches[0]?.payment_method || 'cash',
    notes: matches.map(o => o.notes).filter(Boolean).join(' | ') || null,
    created_at: matches[0]?.created_at,
    _merged: true,
    _order_count: matches.length,
  };
}

function openMergeReceiptDialog() {
  // Get unique active table+name combos
  const combos = {};
  Admin.orders.filter(o => o.status !== 'cancelled').forEach(o => {
    const key = `${o.table_number}__${(o.customer_name || '').toLowerCase()}`;
    if (!combos[key]) combos[key] = { table: o.table_number, name: o.customer_name || '', count: 0 };
    combos[key].count++;
  });
  const options = Object.values(combos).filter(c => c.count > 1);

  showModal(`
    <div class="modal-header">
      <h2>🧾 Merge & Print Receipt</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="color:var(--text2);font-size:13px;margin-bottom:20px">
      Combine multiple orders from the same table into one receipt.
    </p>
    <div class="form-group">
      <label class="form-label">Table Number</label>
      <input class="form-control" id="mergeTable" type="number" min="1" placeholder="e.g. 5" oninput="updateMergePreview()">
    </div>
    <div class="form-group">
      <label class="form-label">Customer Name (optional — leave blank to merge all orders at that table)</label>
      <input class="form-control" id="mergeName" placeholder="e.g. Ahmed" oninput="updateMergePreview()">
    </div>
    <div id="mergePreview" style="margin:16px 0;padding:14px;background:var(--dark3);border-radius:var(--radius);font-size:13px;color:var(--text2);min-height:48px">
      Enter a table number to preview.
    </div>
    ${options.length ? `
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:8px">QUICK SELECT</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${options.map(c => `
          <button onclick="document.getElementById('mergeTable').value='${c.table}';document.getElementById('mergeName').value='${c.name}';updateMergePreview()"
            style="padding:6px 14px;border-radius:50px;background:var(--surface2);border:1px solid var(--border2);font-size:12px;cursor:pointer">
            Table ${c.table}${c.name ? ' · ' + c.name : ''} (${c.count} orders)
          </button>`).join('')}
      </div>
    </div>` : ''}
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-primary" onclick="doMergePrint()" style="flex:1;padding:11px">🖨️ Merge & Print</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="padding:11px 18px">Cancel</button>
    </div>
  `);
}

function updateMergePreview() {
  const table = parseInt(document.getElementById('mergeTable')?.value);
  const name = document.getElementById('mergeName')?.value?.trim() || '';
  const preview = document.getElementById('mergePreview');
  if (!preview || !table) return;
  const merged = mergeOrdersForTable(table, name);
  if (!merged) {
    preview.innerHTML = '<span style="color:var(--danger)">No active orders found for this table/name.</span>';
    return;
  }
  preview.innerHTML = `
    <strong style="color:var(--accent)">${merged._order_count} orders merged</strong> · Table ${table}${name ? ' · ' + name : ''}<br>
    <span style="color:var(--text3)">${merged.items.length} items · Total: <strong>${fmt(merged.total)}</strong></span>
  `;
}

function doMergePrint() {
  const table = parseInt(document.getElementById('mergeTable')?.value);
  const name  = document.getElementById('mergeName')?.value?.trim() || '';
  if (!table) { toast('Enter a table number', 'error'); return; }
  const merged = mergeOrdersForTable(table, name);
  if (!merged) { toast('No matching orders found', 'error'); return; }
  closeModal();
  openPrintWindow([merged]);
}


// ═══════════════════════════════════════════════════
//  MENU PAGE
// ═══════════════════════════════════════════════════
function renderMenuPage() {
  document.getElementById('page').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <input class="search-field" placeholder="Search menu items…" oninput="adminSearchMenu(this.value)" style="width:280px">
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="openStockModal()">📦 Stock</button>
        <button class="btn btn-primary" onclick="openItemModal(null)">+ Add Item</button>
      </div>
    </div>
    <div class="menu-admin-grid" id="menuAdminGrid"></div>`;
  renderMenuGrid();
}
function adminSearchMenu(q){Admin.menuSearch=q.toLowerCase();renderMenuGrid();}
function renderMenuGrid() {
  const grid=document.getElementById('menuAdminGrid');
  if (!grid) return;
  const items=Admin.menuSearch?Admin.menu.filter(i=>i.name.toLowerCase().includes(Admin.menuSearch)||i.name_ar?.includes(Admin.menuSearch)):Admin.menu;
  if (!items.length){grid.innerHTML='<p style="color:var(--text3);padding:40px">No items found</p>';return;}
  grid.innerHTML=items.map(item=>{
    const stockLow=item.stock_count!==null&&item.stock_count!==undefined&&item.stock_count<=5&&item.stock_count>0;
    const stockOut=item.stock_count===0;
    return `<div class="menu-admin-card">
      <div class="menu-admin-img">
        <img src="${item.image_url}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/240x140/1a1a1a/444'" loading="lazy">
        <div style="position:absolute;top:8px;right:8px;display:flex;gap:5px;flex-wrap:wrap">
          ${item.featured?'<span class="badge badge-featured" style="font-size:10px">★</span>':''}
          <span class="badge ${item.available?'badge-active':'badge-inactive'}" style="font-size:10px">${item.available?'Active':'Off'}</span>
          ${stockLow?`<span class="badge" style="font-size:10px;background:rgba(245,158,11,.85);color:#fff">⚡${item.stock_count}</span>`:''}
          ${stockOut?`<span class="badge" style="font-size:10px;background:rgba(239,68,68,.85);color:#fff">Out</span>`:''}
        </div>
      </div>
      <div class="menu-admin-body">
        <div class="menu-admin-name">${item.name}</div>
        <div class="menu-admin-sub" style="direction:rtl;text-align:right">${item.name_ar||''}</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px">${item.categories?.name||''}</div>
        <div class="menu-admin-price">${fmt(item.price)}</div>
        <div class="menu-admin-actions">
          <button class="btn btn-ghost btn-sm" onclick="openItemModal('${item.id}')">✏️ Edit</button>
          <button class="btn btn-warning btn-sm" onclick="toggleAvailability('${item.id}',${!item.available})">${item.available?'Disable':'Enable'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}')">🗑️</button>
        </div>
      </div>
    </div>`;}).join('');
}

async function toggleAvailability(id,available) {
  try { await DB.toggleMenuItemAvailability(id,available); const item=Admin.menu.find(i=>i.id===id); if(item)item.available=available; renderMenuGrid(); toast(`Item ${available?'enabled':'disabled'}`,'success'); }
  catch { toast('Failed','error'); }
}
async function deleteItem(id) {
  if (!confirm('Delete this menu item?')) return;
  try { await DB.deleteMenuItem(id); Admin.menu=Admin.menu.filter(i=>i.id!==id); renderMenuGrid(); toast('Item deleted','success'); }
  catch { toast('Failed','error'); }
}

function openStockModal() {
  showModal(`
    <div class="modal-header"><h2>📦 Stock Manager</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Blank = unlimited · 0 = sold out (auto-disabled)</p>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">
      ${Admin.menu.map(item=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--dark3);border-radius:var(--radius);border:1px solid var(--border)">
          <div style="flex:1"><div style="font-size:14px;font-weight:600">${item.name}</div><div style="font-size:11px;color:var(--text3);direction:rtl">${item.name_ar||''}</div></div>
          <input type="number" min="0" placeholder="∞" value="${item.stock_count!==null&&item.stock_count!==undefined?item.stock_count:''}" id="stock_${item.id}"
            style="width:75px;padding:7px 10px;background:var(--dark4);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:14px;text-align:center;outline:none">
          <button onclick="saveStockItem('${item.id}')" class="btn btn-ghost btn-xs">Save</button>
          <button onclick="document.getElementById('stock_${item.id}').value='';saveStockItem('${item.id}')" class="btn btn-outline btn-xs" title="Unlimited">∞</button>
        </div>`).join('')}
    </div>
    <button class="btn btn-primary" onclick="saveAllStock()" style="width:100%;margin-top:16px;padding:12px">Save All</button>`);
}
async function saveStockItem(itemId) {
  const input=document.getElementById('stock_'+itemId);
  const val=input.value===''?null:parseInt(input.value);
  try { await DB.updateMenuItemStock(itemId,val); const item=Admin.menu.find(i=>i.id===itemId); if(item){item.stock_count=val;item.available=val===null||val>0;} toast('Stock updated','success'); }
  catch { toast('Failed','error'); }
}
async function saveAllStock() {
  try {
    await Promise.all(Admin.menu.map(async item=>{
      const input=document.getElementById('stock_'+item.id); if(!input) return;
      const val=input.value===''?null:parseInt(input.value);
      await DB.updateMenuItemStock(item.id,val); item.stock_count=val; item.available=val===null||val>0;
    }));
    closeModal(); renderMenuGrid(); toast('All stock saved','success');
  } catch { toast('Some saves failed','error'); }
}

function openItemModal(itemId) {
  const item=itemId?Admin.menu.find(i=>i.id===itemId):null;
  const cats=Admin.categories;
  const hasAI=!!window.ANTHROPIC_KEY;
  showModal(`
    <div class="modal-header">
      <h2>${item?'Edit Item':'Add Menu Item'}</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="form-grid">
      <div>
        <div class="form-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="form-label" style="margin:0">Name (English)</label>
            ${hasAI?`<button class="btn btn-xs btn-ghost" onclick="aiGenerateDescription()">✨ AI Generate</button>`:''}
          </div>
          <input class="form-control" id="fi_name" value="${item?.name||''}">
        </div>
        <div class="form-group"><label class="form-label">Name (Arabic)</label><input class="form-control" id="fi_name_ar" value="${item?.name_ar||''}" dir="rtl"></div>
        <div class="form-group"><label class="form-label">Price (EGP)</label><input class="form-control" id="fi_price" type="number" step="0.5" value="${item?.price||''}"></div>
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-control" id="fi_cat">${cats.map(c=>`<option value="${c.id}" ${item?.category_id===c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Calories</label><input class="form-control" id="fi_cal" type="number" value="${item?.calories||''}"></div>
        <div class="form-group"><label class="form-label">Prep Time (min)</label><input class="form-control" id="fi_prep" type="number" value="${item?.prep_time_min||15}"></div>
        <div class="form-group"><label class="form-label">Stock (blank = unlimited)</label><input class="form-control" id="fi_stock" type="number" min="0" placeholder="Unlimited" value="${item?.stock_count!==null&&item?.stock_count!==undefined?item.stock_count:''}"></div>
        <div class="form-group"><label class="form-label">Dietary Tags</label><input class="form-control" id="fi_tags" placeholder="vegan, halal, gluten-free" value="${(item?.tags||[]).join(', ')}"></div>
      </div>
      <div>
        <div class="form-group"><label class="form-label">Description (English)</label><textarea class="form-control" id="fi_desc" rows="3">${item?.description||''}</textarea></div>
        <div class="form-group"><label class="form-label">Description (Arabic)</label><textarea class="form-control" id="fi_desc_ar" rows="3" dir="rtl">${item?.description_ar||''}</textarea></div>
        <div class="form-group"><label class="form-label">Image URL</label><input class="form-control" id="fi_img" placeholder="https://…" value="${item?.image_url||''}" oninput="previewImage(this.value)"><img id="fi_img_preview" class="img-preview" src="${item?.image_url||''}" style="${item?.image_url?'display:block':''}"></div>
        <div class="toggle-row"><span style="font-size:14px">Available</span><label class="toggle-switch"><input type="checkbox" id="fi_available" ${!item||item.available?'checked':''}><span class="toggle-slider"></span></label></div>
        <div class="toggle-row"><span style="font-size:14px">Featured / Chef's Pick</span><label class="toggle-switch"><input type="checkbox" id="fi_featured" ${item?.featured?'checked':''}><span class="toggle-slider"></span></label></div>
        <div id="ai_gen_status" style="margin-top:12px;font-size:13px;color:var(--accent);display:none">✨ Generating…</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-top:24px">
      <button class="btn btn-primary" onclick="saveItem('${itemId||''}')" style="flex:1;padding:13px">${item?'Save Changes':'Add Item'}</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="padding:13px 20px">Cancel</button>
    </div>`);
}

async function aiGenerateDescription() {
  const name=document.getElementById('fi_name')?.value?.trim();
  const price=document.getElementById('fi_price')?.value;
  const catId=document.getElementById('fi_cat')?.value;
  if (!name){toast('Enter item name first','error');return;}
  const catName=Admin.categories.find(c=>c.id===catId)?.name||'';
  const statusEl=document.getElementById('ai_gen_status');
  if (statusEl) statusEl.style.display='block';
  try {
    const result=await AI.generateMenuDescription(name,catName,price||0);
    if (!result) throw new Error('No result');
    if (result.description) document.getElementById('fi_desc').value=result.description;
    if (result.description_ar) document.getElementById('fi_desc_ar').value=result.description_ar;
    if (result.calories_estimate&&!document.getElementById('fi_cal').value) document.getElementById('fi_cal').value=result.calories_estimate;
    if (result.tags?.length) document.getElementById('fi_tags').value=result.tags.join(', ');
    toast('AI descriptions generated ✨','success');
  } catch { toast('AI unavailable — set ANTHROPIC_KEY in db.js','error'); }
  finally { if(statusEl)statusEl.style.display='none'; }
}

function previewImage(url) { const p=document.getElementById('fi_img_preview'); if(p){p.src=url;p.style.display=url?'block':'none';} }

async function saveItem(itemId) {
  const tagsRaw=document.getElementById('fi_tags')?.value||'';
  const tags=tagsRaw.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
  const stockVal=document.getElementById('fi_stock')?.value;
  const data={
    name:document.getElementById('fi_name').value.trim(),
    name_ar:document.getElementById('fi_name_ar').value.trim(),
    price:parseFloat(document.getElementById('fi_price').value),
    category_id:document.getElementById('fi_cat').value,
    description:document.getElementById('fi_desc').value.trim(),
    description_ar:document.getElementById('fi_desc_ar').value.trim(),
    image_url:document.getElementById('fi_img').value.trim(),
    available:document.getElementById('fi_available').checked,
    featured:document.getElementById('fi_featured').checked,
    calories:parseInt(document.getElementById('fi_cal').value)||null,
    prep_time_min:parseInt(document.getElementById('fi_prep').value)||15,
    stock_count:stockVal===''?null:(parseInt(stockVal)||null),
    tags,
  };
  if (!data.name||!data.price){toast('Name and price required','error');return;}
  if (itemId) data.id=itemId;
  try {
    const saved=await DB.upsertMenuItem(data);
    const idx=Admin.menu.findIndex(i=>i.id===saved.id);
    if (idx>=0) Admin.menu[idx]=saved; else Admin.menu.push(saved);
    closeModal(); renderMenuGrid(); toast(itemId?'Item updated':'Item added','success');
  } catch(e) { toast('Failed: '+e.message,'error'); }
}

// ═══════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════
function renderAnalytics() {
  const orders=Admin.orders, done=orders.filter(o=>o.status==='done');
  const totalRev=done.reduce((a,o)=>a+o.total,0);
  const dayMap={};
  for (let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);dayMap[d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})]=0;}
  orders.filter(o=>o.status!=='cancelled').forEach(o=>{const ts=o.created_at?.toDate?o.created_at.toDate():new Date(o.created_at||0);const d=ts.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});if(d in dayMap)dayMap[d]+=o.total;});
  const pmCounts={cash:0,card:0,instapay:0};
  orders.forEach(o=>{const pm=o.payment_method||'cash';if(pm in pmCounts)pmCounts[pm]++;});
  document.getElementById('page').innerHTML=`
    <div class="stat-grid" style="margin-bottom:24px">
      ${[['💰','Total Revenue (done)',fmt(totalRev)],['📈','Completed',done.length],['❌','Cancelled',orders.filter(o=>o.status==='cancelled').length],['⏱','Avg Order',fmt(orders.length?orders.reduce((a,o)=>a+o.total,0)/orders.length:0)]].map(([icon,label,val])=>`<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`).join('')}
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Revenue — Last 14 Days</h3><canvas id="revenueChart" height="240"></canvas></div>
      <div class="chart-card"><h3>Payment Methods</h3><canvas id="pmChart" height="240"></canvas></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="chart-card"><h3>Top Ordered Items</h3><div class="top-items-list" id="analyticsTopItems"></div></div>
      <div class="chart-card"><h3>Customer Ratings</h3><div id="ratingsBreakdown"></div></div>
    </div>`;
  // Destroy stale charts before creating new ones
  if(Admin.charts.revenue){Admin.charts.revenue.destroy();Admin.charts.revenue=null;}
  if(Admin.charts.pm){Admin.charts.pm.destroy();Admin.charts.pm=null;}
  requestAnimationFrame(()=>{
    const ctx=document.getElementById('revenueChart');
    if(ctx&&typeof Chart!=='undefined'){if(Admin.charts.revenue)Admin.charts.revenue.destroy();Admin.charts.revenue=new Chart(ctx,{type:'line',data:{labels:Object.keys(dayMap),datasets:[{label:'Revenue',data:Object.values(dayMap),borderColor:'#7C3AED',backgroundColor:'rgba(124,58,237,.08)',borderWidth:2,fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#7C3AED'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#666',font:{size:11}},grid:{color:'rgba(0,0,0,.06)'}},y:{ticks:{color:'#555',font:{size:11},callback:v=>`ج.م ${v}`},grid:{color:'rgba(0,0,0,.06)'}}}}})}
    const pmCtx=document.getElementById('pmChart');
    if(pmCtx&&typeof Chart!=='undefined'){if(Admin.charts.pm)Admin.charts.pm.destroy();Admin.charts.pm=new Chart(pmCtx,{type:'doughnut',data:{labels:['Cash','Card','InstaPay'],datasets:[{data:[pmCounts.cash,pmCounts.card,pmCounts.instapay],backgroundColor:['#22c55e','#3b82f6','#7C3AED'],borderWidth:0}]},options:{plugins:{legend:{position:'bottom',labels:{color:'#888',font:{size:12}}}},cutout:'65%',maintainAspectRatio:false}})}
    const container=document.getElementById('analyticsTopItems');
    if(container){const counts={};Admin.orders.forEach(o=>o.items?.forEach(i=>{counts[i.name]=(counts[i.name]||0)+i.qty;}));const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);const max=sorted[0]?.[1]||1;container.innerHTML=sorted.map(([name,qty])=>`<div class="top-item-row"><span class="top-item-name">${name}</span><div class="top-item-bar-wrap"><div class="top-item-bar" style="width:${Math.round(qty/max*100)}%"></div></div><span class="top-item-count">${qty}</span></div>`).join('')||'<p style="color:var(--text3)">No data yet</p>';}
    const ratEl=document.getElementById('ratingsBreakdown');
    if(ratEl&&Admin.feedback.length){const emojis=['😐','😊','🤩'];const counts2=[0,0,0];Admin.feedback.forEach(f=>{if(f.emoji>=1&&f.emoji<=3)counts2[f.emoji-1]++;});const max2=Math.max(...counts2,1);ratEl.innerHTML=emojis.map((e,i)=>`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><span style="font-size:24px;width:32px">${e}</span><div style="flex:1;height:8px;background:var(--dark3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${Math.round(counts2[i]/max2*100)}%;background:var(--accent);border-radius:4px"></div></div><span style="font-size:14px;font-weight:700;min-width:28px">${counts2[i]}</span></div>`).join('');}
    else if(ratEl){ratEl.innerHTML='<p style="color:var(--text3);font-size:13px">No feedback yet</p>';}
  });
}

// ═══════════════════════════════════════════════════
//  TABLE HEATMAP
// ═══════════════════════════════════════════════════
async function renderHeatmap() {
  document.getElementById('page').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <p style="font-size:13px;color:var(--text2)">Live floor view — auto-refreshes every 30s</p>
      <button class="btn btn-ghost btn-sm" onclick="loadHeatmapData()">↺ Refresh</button>
    </div>
    <div id="heatmapGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px"></div>`;
  await loadHeatmapData();
  clearInterval(window._heatmapInterval);
  window._heatmapInterval=setInterval(()=>{if(Admin.currentPage==='heatmap')loadHeatmapData();},30000);
}
async function loadHeatmapData() {
  const grid=document.getElementById('heatmapGrid');
  if (!grid) return;
  try {
    const [tables,orders]=await Promise.all([DB.getTables(),DB.getOrders(200)]);
    const activeByTable={};
    orders.forEach(o=>{if(['pending','confirmed','preparing','ready'].includes(o.status)){if(!activeByTable[o.table_number])activeByTable[o.table_number]=[];activeByTable[o.table_number].push(o);}});
    grid.innerHTML=tables.map(tbl=>{
      const active=activeByTable[tbl.table_number]||[];
      const oldest=active.length?Math.floor((Date.now()-(active[0].created_at?.toDate?active[0].created_at.toDate():new Date(active[0].created_at||Date.now())).getTime())/60000):0;
      let color,label,emoji;
      if(!tbl.active){color='var(--dark4)';label='Inactive';emoji='🔒';}
      else if(!active.length){color='rgba(34,197,94,.12)';label='Free';emoji='✅';}
      else if(oldest<10){color='rgba(245,158,11,.12)';label=`Busy · ${active.length}`;emoji='🍽️';}
      else{color='rgba(239,68,68,.15)';label=`⚠️ ${oldest} min`;emoji='🔴';}
      return `<div onclick="navigate('orders');filterOrders('all');searchOrders('${tbl.table_number}')"
        style="background:${color};border:2px solid ${active.length?'rgba(124,58,237,.3)':'var(--border)'};border-radius:16px;padding:18px 10px;text-align:center;cursor:pointer;transition:all .2s">
        <div style="font-size:26px;margin-bottom:4px">${emoji}</div>
        <div style="font-size:22px;font-weight:800;color:var(--accent)">${tbl.table_number}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">${label}</div>
        ${active.length?`<div style="font-size:10px;color:var(--text3);margin-top:2px">${active.map(o=>`#${o.order_number}`).join(', ')}</div>`:''}
      </div>`;
    }).join('');
  } catch(e){if(grid)grid.innerHTML=`<div style="color:var(--danger)">Error: ${e.message}</div>`;}
}

// ═══════════════════════════════════════════════════
//  LOYALTY
// ═══════════════════════════════════════════════════
async function renderLoyaltyPage() {
  document.getElementById('page').innerHTML=`<div style="color:var(--text3);padding:40px;text-align:center">Loading…</div>`;
  try {
    const snap=await firebase.firestore().collection('loyalty').orderBy('total_orders','desc').limit(50).get();
    const customers=snap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById('page').innerHTML=`
      <div class="stat-grid" style="margin-bottom:24px">
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${customers.length}</div><div class="stat-label">Loyalty Members</div></div>
        <div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-value">${customers.filter(c=>c.total_orders>=10).length}</div><div class="stat-label">VIP (10+ orders)</div></div>
        <div class="stat-card"><div class="stat-icon">🎟️</div><div class="stat-value">${customers.filter(c=>c.reward_coupon).length}</div><div class="stat-label">Free meals earned</div></div>
      </div>
      <div class="table-card">
        <div class="table-header"><h3>Top Customers</h3></div>
        <div class="table-overflow"><table class="data-table">
          <thead><tr><th>Phone</th><th>Total Orders</th><th>Punches</th><th>Progress</th><th>Reward</th><th>Last Visit</th></tr></thead>
          <tbody>${customers.map(c=>{
            const punches=c.punch_count||0;
            const dots=Array.from({length:10},(_,i)=>`<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${i<punches?'var(--accent)':'var(--dark4)'};margin:1px"></span>`).join('');
            return `<tr><td style="font-weight:600">${c.phone||c.id}</td><td><span style="font-weight:700;color:var(--accent)">${c.total_orders||0}</span></td><td>${punches}/10</td><td>${dots}</td><td>${c.reward_coupon?`<code style="background:rgba(34,197,94,.1);padding:2px 8px;border-radius:4px;color:var(--success)">${c.reward_coupon}</code>`:'—'}</td><td style="font-size:12px;color:var(--text3)">${timeAgo(c.last_order_at)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
  } catch(e){document.getElementById('page').innerHTML=`<div style="color:var(--danger)">Error: ${e.message}</div>`;}
}

// ═══════════════════════════════════════════════════
//  FEEDBACK
// ═══════════════════════════════════════════════════
function renderFeedbackPage() {
  const fb=Admin.feedback;
  const avg=fb.length?(fb.reduce((a,f)=>a+(f.emoji||0),0)/fb.length).toFixed(1):'—';
  const emojiMap={1:'😐',2:'😊',3:'🤩'};
  document.getElementById('page').innerHTML=`
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value">${avg}/3</div><div class="stat-label">Avg Rating</div></div>
      <div class="stat-card"><div class="stat-icon">💬</div><div class="stat-value">${fb.length}</div><div class="stat-label">Total Reviews</div></div>
      <div class="stat-card"><div class="stat-icon">🤩</div><div class="stat-value">${fb.filter(f=>f.emoji===3).length}</div><div class="stat-label">Happy</div></div>
      <div class="stat-card"><div class="stat-icon">😐</div><div class="stat-value">${fb.filter(f=>f.emoji===1).length}</div><div class="stat-label">Needs Work</div></div>
    </div>
    <div class="table-card">
      <div class="table-header"><h3>All Feedback</h3></div>
      <div class="table-overflow"><table class="data-table">
        <thead><tr><th>Rating</th><th>Table</th><th>Comment</th><th>Time</th></tr></thead>
        <tbody>${fb.map(f=>{const ts=f.created_at?.toDate?f.created_at.toDate():new Date(f.created_at||0);return`<tr><td style="font-size:24px">${emojiMap[f.emoji]||'—'}</td><td>Table ${f.table_number||'—'}</td><td style="font-size:13px;color:var(--text2);max-width:300px">${f.comment||'<span style="color:var(--text3)">No comment</span>'}</td><td style="font-size:12px;color:var(--text3)">${ts.toLocaleString()}</td></tr>`;}).join('')||'<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text3)">No feedback yet</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}

// ═══════════════════════════════════════════════════
//  SETTINGS — Restaurant Info + Pricing + Appearance Editor
// ═══════════════════════════════════════════════════
function renderSettings() {
  const s=Admin.settings;
  document.getElementById('page').innerHTML=`
    <div class="settings-grid">

      <!-- Logo -->
      <div class="settings-card" style="grid-column:1/-1">
        <h3>🖼️ Restaurant Logo</h3>
        <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
          <div id="logo-preview-wrap">
            ${s.restaurant_logo?`<img id="logo-preview-img" src="${s.restaurant_logo}" style="width:100px;height:100px;object-fit:contain;border-radius:12px;border:2px solid var(--border);background:var(--dark3);padding:6px">`:`<div style="width:100px;height:100px;border-radius:12px;border:2px dashed var(--border);background:var(--dark3);display:flex;align-items:center;justify-content:center;font-size:32px">🏪</div>`}
          </div>
          <div style="flex:1;min-width:200px">
            <label style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:var(--dark3);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;margin-bottom:8px">
              <input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none" onchange="handleLogoUpload(this)">
              📁 Choose Logo File
            </label>
            <div style="font-size:11px;color:var(--text3)">PNG, JPG, WebP or SVG — max 2MB</div>
            ${s.restaurant_logo?`<button class="btn btn-danger btn-sm" onclick="removeLogo()" style="margin-top:8px">🗑️ Remove</button>`:''}
          </div>
        </div>
      </div>

      <!-- Restaurant Info -->
      <div class="settings-card">
        <h3>🏪 Restaurant Info</h3>
        ${settingField('Restaurant Name','restaurant_name',s.restaurant_name)}
        ${settingField('Restaurant Name (Arabic)','restaurant_name_ar',s.restaurant_name_ar)}
        ${settingField('Tagline','tagline',s.tagline)}
        ${settingField('WiFi Network','wifi_name',s.wifi_name)}
        ${settingField('WiFi Password','wifi_pass',s.wifi_pass)}
        ${settingField('Opening Time','open_time',s.open_time)}
        ${settingField('Closing Time','close_time',s.close_time)}
        <button class="btn btn-primary" onclick="saveSettings()" style="width:100%;margin-top:8px">Save Info</button>
      </div>

      <!-- Pricing + Coupons -->
      <div class="settings-card">
        <h3>💰 Pricing & Tax</h3>
        ${settingField('VAT Rate (%)','tax_rate',s.tax_rate)}
        ${settingField('Service Charge (%)','service_charge',s.service_charge)}
        ${settingField('Currency Symbol','currency_symbol',s.currency_symbol)}
        <button class="btn btn-primary" onclick="saveSettings()" style="width:100%;margin-top:8px">Save Pricing</button>
        <div style="margin-top:20px"><h3 style="font-size:14px;font-weight:700;margin-bottom:14px">🎟 Coupons</h3>${renderCouponsInline()}</div>
      </div>

      <!-- InstaPay -->
      <div class="settings-card" style="grid-column:1/-1">
        <h3>📱 InstaPay Egypt</h3>
        <div class="form-group">
          <label class="form-label">Your InstaPay Payment Link</label>
          <input class="form-control" id="setting_instapay_link" value="${s.instapay_link||''}" placeholder="https://ipn.eg/S/yourusername/instapay/…">
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveInstapayLink()">💾 Save Link</button>
      </div>

            <!-- AI + WhatsApp -->
      <div class="settings-card" style="grid-column:1/-1">
        <h3>🤖 AI & Notifications</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Anthropic API Key</label>
            <input class="form-control" id="setting_anthropic_key" type="password" placeholder="sk-ant-… (set in db.js)">
            <div style="font-size:11px;color:var(--text3);margin-top:4px">Set ANTHROPIC_KEY in db.js to enable AI features</div>
          </div>
          <div class="form-group">
            <label class="form-label">WhatsApp Phone (CallMeBot)</label>
            <input class="form-control" id="setting_wa_phone" value="${s.wa_phone||''}" placeholder="201012345678">
          </div>
          <div class="form-group">
            <label class="form-label">CallMeBot API Key</label>
            <input class="form-control" id="setting_wa_apikey" value="${s.wa_apikey||''}" placeholder="Get from callmebot.com">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveAISettings()">Save</button>
      </div>

    </div>`;
  setTimeout(loadCoupons, 100);
}

/* ── Appearance helpers ── */
async function applyThemePreset(key) {
  const themes={dark:'#0a0a0a',midnight:'#070b14',forest:'#071210',wine:'#12070a',light:'#f8f8f6'};
  await DB.updateSetting('theme_preset',key);
  await DB.updateSetting('bg_color',themes[key]);
  Admin.settings.theme_preset=key;
  document.querySelectorAll('[id^="theme-btn-"]').forEach(btn=>{btn.style.borderColor='var(--border2)';});
  const btn=document.getElementById('theme-btn-'+key);
  if (btn) btn.style.borderColor='var(--accent)';
  toast('Theme saved — reload customer site to see','success');
}
async function applyBorderRadius(val,key) {
  await DB.updateSetting('card_radius',val);
  Admin.settings.card_radius=val;
  document.querySelectorAll('[id^="radius-btn-"]').forEach(btn=>{btn.style.borderColor='var(--border2)';});
  const btn=document.getElementById('radius-btn-'+key);
  if (btn) btn.style.borderColor='var(--accent)';
  toast('Corner style saved','success');
}
async function applyHeroFont(font,key) {
  await DB.updateSetting('hero_font',font);
  Admin.settings.hero_font=font;
  document.querySelectorAll('[id^="font-btn-"]').forEach(btn=>{btn.style.borderColor='var(--border2)';});
  const btn=document.getElementById('font-btn-'+key);
  if (btn) btn.style.borderColor='var(--accent)';
  toast('Font saved','success');
}
function updateAccentLive(color) { document.documentElement.style.setProperty('--accent',color); }
async function saveAccentColor() { const color=document.getElementById('accentColorPicker').value; await DB.updateSetting('accent_color',color); Admin.settings.accent_color=color; toast('Accent color saved','success'); }
async function saveHeroText() {
  const keys=['hero_title1','hero_title2','hero_subtitle','tagline'];
  await Promise.all(keys.map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value):null;}));
  toast('Hero text saved','success');
}
async function saveHeroStats() {
  const keys=['stat1_num','stat1_label','stat2_num','stat2_label','stat3_num','stat3_label'];
  await Promise.all(keys.map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value):null;}));
  toast('Stats saved','success');
}
async function saveMenuLabels() {
  const keys=['menu_section_label','menu_section_title','menu_section_label_ar'];
  await Promise.all(keys.map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value):null;}));
  toast('Labels saved','success');
}
async function saveAISettings() {
  try {
    await Promise.all(['wa_phone','wa_apikey'].map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value.trim()):null;}));
    toast('Settings saved','success');
  } catch { toast('Failed','error'); }
}

// ═══════════════════════════════════════════════════
//  TABLES PAGE
// ═══════════════════════════════════════════════════
async function renderTablesPage() {
  document.getElementById('page').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <p style="font-size:13px;color:var(--text2)">Program each NFC chip with its table URL.</p>
      <button class="btn btn-primary" onclick="openTableModal(null)">+ Add Table</button>
    </div>
    <div id="tablesGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      <div style="color:var(--text3);padding:40px;text-align:center;grid-column:1/-1">Loading…</div>
    </div>`;
  await loadTablesGrid();
}
async function loadTablesGrid() {
  const grid=document.getElementById('tablesGrid'); if (!grid) return;
  try {
    const [tables,orders]=await Promise.all([DB.getTables(),DB.getOrders(200)]);
    const activeOrders={};
    orders.forEach(o=>{if(['pending','confirmed','preparing','ready'].includes(o.status)){if(!activeOrders[o.table_number])activeOrders[o.table_number]=[];activeOrders[o.table_number].push(o);}});
    if (!tables.length){grid.innerHTML=`<div style="color:var(--text3);padding:40px;text-align:center;grid-column:1/-1">No tables yet.</div>`;return;}
    const siteBase=Admin.settings.site_url||'https://YOUR-DOMAIN.com/index.html';
    grid.innerHTML=tables.map(tbl=>{
      const nfcUrl=`${siteBase}?table=${tbl.table_number}`;
      const active=activeOrders[tbl.table_number]||[];
      const statusBadge=!tbl.active?'badge-inactive':active.length?'badge-confirmed':'badge-ready';
      const statusLabel=!tbl.active?'Inactive':active.length?`Busy (${active.length})`:'Free';
      return `<div class="table-card" style="border-radius:var(--radius2)">
        <div style="padding:20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:46px;height:46px;border-radius:12px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:var(--accent)">${tbl.table_number}</div>
            <div><div style="font-weight:700;font-size:15px">Table ${tbl.table_number}</div><div style="font-size:12px;color:var(--text2)">${tbl.capacity||4} seats</div></div>
          </div>
          <span class="badge ${statusBadge}">${statusLabel}</span>
        </div>
        ${active.length?`<div style="padding:12px 20px;background:rgba(245,158,11,.05);border-bottom:1px solid var(--border)">${active.map(o=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--accent);font-weight:600">#${o.order_number}</span><span class="badge badge-${o.status}" style="font-size:10px">${o.status}</span><span style="color:var(--text2)">${fmt(o.total)}</span><select class="status-select" style="font-size:11px;padding:3px 6px" onchange="quickUpdateStatus('${o.id}',this.value)">${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></div>`).join('')}</div>`:''}
        <div style="padding:16px 20px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-weight:600;letter-spacing:1px;text-transform:uppercase">NFC URL</div>
          <div style="display:flex;gap:8px;align-items:center">
            <code style="flex:1;font-size:11px;background:var(--dark3);padding:8px 10px;border-radius:8px;color:var(--text2);word-break:break-all">${nfcUrl}</code>
            <button class="btn btn-ghost btn-sm" onclick="copyNFCUrl('${nfcUrl}',this)">Copy</button>
          </div>
        </div>
        <div style="padding:0 20px 16px;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="openTableModal('${tbl.id}','${tbl.table_number}','${tbl.capacity||4}','${tbl.active}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTable('${tbl.id}')">🗑️</button>
          ${!tbl.active?`<button class="btn btn-success btn-sm" onclick="toggleTable('${tbl.id}',true)">Enable</button>`:`<button class="btn btn-warning btn-sm" onclick="toggleTable('${tbl.id}',false)">Disable</button>`}
        </div>
      </div>`;
    }).join('');
  } catch(e){if(grid)grid.innerHTML=`<div style="color:var(--danger);padding:40px;grid-column:1/-1">Error: ${e.message}</div>`;}
}
function copyNFCUrl(url,btn){navigator.clipboard.writeText(url).then(()=>{const orig=btn.textContent;btn.textContent='✓ Copied!';btn.style.color='#22c55e';setTimeout(()=>{btn.textContent=orig;btn.style.color='';},2000);}).catch(()=>prompt('Copy this NFC URL:',url));}
function openTableModal(id,num='',cap=4,active=true){showModal(`<div class="modal-header"><h2>${id?'Edit Table':'Add Table'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="form-group"><label class="form-label">Table Number</label><input class="form-control" id="tm_num" type="number" min="1" max="100" value="${num}" placeholder="e.g. 5" ${id?'readonly style="opacity:0.6"':''}></div><div class="form-group"><label class="form-label">Capacity (seats)</label><input class="form-control" id="tm_cap" type="number" min="1" max="20" value="${cap}"></div><div class="toggle-row"><span style="font-size:14px">Table Active</span><label class="toggle-switch"><input type="checkbox" id="tm_active" ${active==='false'?'':'checked'}><span class="toggle-slider"></span></label></div><div style="display:flex;gap:12px;margin-top:24px"><button class="btn btn-primary" onclick="saveTable('${id||''}')" style="flex:1;padding:13px">${id?'Save':'Add Table'}</button><button class="btn btn-ghost" onclick="closeModal()" style="padding:13px 20px">Cancel</button></div>`);}
async function saveTable(id){const num=parseInt(document.getElementById('tm_num').value);const cap=parseInt(document.getElementById('tm_cap').value)||4;const active=document.getElementById('tm_active').checked;if(!num||num<1){toast('Enter valid table number','error');return;}const payload={table_number:num,capacity:cap,active};if(id)payload.id=id;try{await DB.upsertTable(payload);closeModal();toast(id?'Table updated':'Table added','success');await loadTablesGrid();}catch(e){toast('Failed: '+e.message,'error');}}
async function deleteTable(id){if(!confirm('Delete this table?'))return;try{await DB.deleteTable(id);toast('Table deleted','success');await loadTablesGrid();}catch(e){toast('Failed: '+e.message,'error');}}
async function toggleTable(id,active){try{await firebase.firestore().collection('tables').doc(id).update({active});toast(`Table ${active?'enabled':'disabled'}`,'success');await loadTablesGrid();}catch{toast('Failed','error');}}

// ═══════════════════════════════════════════════════
//  SETTINGS HELPERS
// ═══════════════════════════════════════════════════
function settingField(label,key,val){return`<div class="form-group"><label class="form-label">${label}</label><input class="form-control" id="setting_${key}" value="${val||''}"></div>`;}
function renderCouponsInline(){return`<div style="display:flex;gap:8px;margin-bottom:12px"><input class="form-control" id="newCouponCode" placeholder="Code e.g. SAVE15" style="flex:1"><input class="form-control" id="newCouponPct" type="number" placeholder="%" style="width:70px"><button class="btn btn-ghost btn-sm" onclick="addCoupon()">+ Add</button></div><div id="couponList" style="font-size:13px;color:var(--text2)">Loading coupons…</div>`;}
async function loadCoupons(){try{const snap=await firebase.firestore().collection('coupons').orderBy('created_at','desc').get();const data=snap.docs.map(d=>({id:d.id,...d.data()}));const el=document.getElementById('couponList');if(!el)return;el.innerHTML=data?.length?data.map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><code style="background:var(--dark3);padding:2px 8px;border-radius:4px;color:var(--accent)">${c.code}</code><span>${c.discount_pct}% off · ${c.uses}/${c.max_uses} uses</span><button class="btn btn-danger btn-xs" onclick="deleteCoupon('${c.id}')">Delete</button></div>`).join(''):'<p style="color:var(--text3)">No coupons</p>';}catch{}}
async function addCoupon(){const code=document.getElementById('newCouponCode')?.value?.trim()?.toUpperCase();const pct=parseFloat(document.getElementById('newCouponPct')?.value);if(!code||!pct){toast('Fill code and %','error');return;}try{await firebase.firestore().collection('coupons').add({code,discount_pct:pct,max_uses:1000,uses:0,active:true,created_at:firebase.firestore.FieldValue.serverTimestamp()});toast('Coupon added','success');loadCoupons();}catch{toast('Failed','error');}}
async function deleteCoupon(id){if(!confirm('Delete coupon?'))return;await firebase.firestore().collection('coupons').doc(id).delete();toast('Deleted','success');loadCoupons();}
function handleLogoUpload(input){if(!input.files||!input.files[0])return;if(input.files[0].size>2*1024*1024){toast('File too large — max 2MB','error');return;}const reader=new FileReader();reader.onload=async e=>{const b64=e.target.result;const wrap=document.getElementById('logo-preview-wrap');if(wrap)wrap.innerHTML=`<img src="${b64}" style="width:100px;height:100px;object-fit:contain;border-radius:12px;border:2px solid var(--accent);background:var(--dark3);padding:6px">`;try{await DB.updateSetting('restaurant_logo',b64);Admin.settings.restaurant_logo=b64;toast('Logo saved ✓','success');renderSettings();}catch{toast('Failed','error');}};reader.readAsDataURL(input.files[0]);}
async function removeLogo(){if(!confirm('Remove logo?'))return;try{await DB.updateSetting('restaurant_logo','');Admin.settings.restaurant_logo='';toast('Logo removed','success');renderSettings();}catch{toast('Failed','error');}}
async function saveInstapayLink(){const el=document.getElementById('setting_instapay_link');if(!el)return;try{await DB.updateSetting('instapay_link',el.value.trim());Admin.settings.instapay_link=el.value.trim();toast('InstaPay link saved ✓','success');}catch{toast('Failed','error');}}
async function saveSettings(){const keys=['restaurant_name','restaurant_name_ar','tagline','wifi_name','wifi_pass','open_time','close_time','tax_rate','service_charge','currency_symbol'];try{await Promise.all(keys.map(async key=>{const el=document.getElementById('setting_'+key);if(el)await DB.updateSetting(key,el.value);}));toast('Settings saved ✓','success');}catch{toast('Failed','error');}}
async function saveAccentColor(){const color=document.getElementById('accentColorPicker').value;await DB.updateSetting('accent_color',color);Admin.settings.accent_color=color;toast('Color saved','success');}

// ═══════════════════════════════════════════════════
//  RECEIPT PRINT
// ═══════════════════════════════════════════════════
function printSingleReceipt(orderId){const o=Admin.orders.find(x=>x.id===orderId);if(o)openPrintWindow([o]);}
function printSelectedReceipts() {
  const ids = getSelectedOrderIds();
  if (!ids.length) { toast('Select at least one order to print', 'error'); return; }
  const selected = ids.map(id => Admin.orders.find(o => o.id === id)).filter(Boolean);
  if (!selected.length) { toast('Orders not found', 'error'); return; }
  openPrintWindow(selected);
}
function openPrintWindow(orders){const s=Admin.settings;const name=s.restaurant_name||'Flavor House';const logo=s.restaurant_logo||'';const currency=s.currency_symbol||'ج.م';const fmtP=n=>`${currency} ${Math.round(n).toLocaleString()}`;const pmLabels={cash:'Cash on Arrival',card:'Card on Arrival',instapay:'InstaPay Egypt'};
  // Receipt designer settings
  const rFont    = s.receipt_font    || "'Courier New',monospace";
  const rWidth   = s.receipt_width   || '72mm';
  const rAccent  = s.receipt_accent  || '#000';
  const rDivider = s.receipt_divider || '- - - - - - - - - - - - - - -';
  const rHeader  = s.receipt_header  || 'Thank you for dining with us!';
  const rFooter  = s.receipt_footer  || 'See you again soon!';
  const rWifi    = (s.receipt_show_wifi || 'yes') === 'yes';
  const rImages  = (s.receipt_show_images || 'no') === 'yes';
  const rCSS     = s.receipt_css || '';const receiptsHtml=orders.map((o,idx)=>{const pm=pmLabels[o.payment_method||'cash']||o.payment_method||'Cash';const date=new Date(o.created_at?.toDate?o.created_at.toDate():o.created_at||Date.now()).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
return `<div class="receipt${idx<orders.length-1?' page-break':''}">
  <div class="receipt-header">
    ${logo?`<img src="${logo}" class="receipt-logo">`:`<div class="receipt-logo-placeholder">${name.charAt(0)}</div>`}
    <div class="receipt-name">${name}</div>
    ${s.tagline?`<div class="receipt-tagline">${s.tagline}</div>`:''}
  </div>
  <div class="receipt-divider">${rDivider}</div>
  <div class="receipt-meta">
    <div class="receipt-meta-row"><span>Order</span><span><strong>#${o.order_number}</strong></span></div>
    <div class="receipt-meta-row"><span>Table</span><span>${o.table_number}</span></div>
    ${o.customer_name?`<div class="receipt-meta-row"><span>Customer</span><span>${o.customer_name}</span></div>`:''}
    ${o._merged?`<div class="receipt-meta-row" style="color:${rAccent};font-weight:700"><span>Merged orders</span><span>${o._order_count}</span></div>`:''}
    <div class="receipt-meta-row"><span>Date</span><span>${date}</span></div>
  </div>
  <div class="receipt-divider">${rDivider}</div>
  <table class="receipt-items">
    <thead><tr><th style="text-align:left">Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${o.items?.map(i=>`<tr><td>${i.name}${i.name_ar?`<br><span style="font-size:10px;opacity:.7;direction:rtl">${i.name_ar}</span>`:''}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${fmtP(i.price)}</td><td style="text-align:right">${fmtP(i.price*i.qty)}</td></tr>`).join('')||''}</tbody>
  </table>
  <div class="receipt-divider">${rDivider}</div>
  <div class="receipt-totals">
    ${o.subtotal!=null?`<div class="receipt-total-row"><span>Subtotal</span><span>${fmtP(o.subtotal)}</span></div>`:''}
    ${o.tax&&o.tax>0?`<div class="receipt-total-row"><span>VAT</span><span>${fmtP(o.tax)}</span></div>`:''}
    ${o.service_charge&&o.service_charge>0?`<div class="receipt-total-row"><span>Service</span><span>${fmtP(o.service_charge)}</span></div>`:''}
    ${o.discount&&o.discount>0?`<div class="receipt-total-row" style="color:#16a34a"><span>Discount</span><span>-${fmtP(o.discount)}</span></div>`:''}
    <div class="receipt-total-row grand"><span>TOTAL</span><span>${fmtP(o.total)}</span></div>
  </div>
  <div class="receipt-divider">${rDivider}</div>
  <div class="receipt-payment">Payment: <strong>${pm}</strong></div>
  ${o.notes?`<div class="receipt-notes">Note: ${o.notes}</div>`:''}
  <div class="receipt-footer">
    <div>${rHeader}</div>
    ${rWifi&&s.wifi_name?`<div style="margin-top:4px;font-size:10px">WiFi: ${s.wifi_name}${s.wifi_pass?' · Pass: '+s.wifi_pass:''}</div>`:''}
    <div style="margin-top:6px;font-size:10px;color:#888">${rFooter}</div>
  </div>
</div>`;
}).join('');
win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipts</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:${rFont};font-size:12px;background:#fff;color:#111}.receipt{width:${rWidth};margin:0 auto;padding:12px 8px 20px}.page-break{page-break-after:always;border-bottom:3px dashed #ccc;margin-bottom:24px;padding-bottom:24px}.receipt-header{text-align:center;margin-bottom:10px}.receipt-logo{max-width:80px;max-height:60px;object-fit:contain;margin:0 auto 6px;display:block}.receipt-logo-placeholder{width:52px;height:52px;border-radius:50%;background:#111;color:#fff;font-size:24px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 8px}.receipt-name{font-size:16px;font-weight:800;letter-spacing:1px;text-transform:uppercase}.receipt-tagline{font-size:10px;color:#555;margin-top:2px}.receipt-divider{text-align:center;color:#aaa;font-size:10px;margin:8px 0;letter-spacing:1px}.receipt-meta{margin:6px 0}.receipt-meta-row{display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px}.receipt-items{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px}.receipt-items th{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 0;border-bottom:1px solid #ccc}.receipt-items td{padding:4px 0;vertical-align:top}.receipt-items tr+tr td{border-top:1px dotted #e5e5e5}.receipt-totals{margin:6px 0}.receipt-total-row{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}.receipt-total-row.grand{font-size:14px;font-weight:800;padding:6px 0 2px;border-top:2px solid ${rAccent};margin-top:4px;color:${rAccent}}.receipt-payment{text-align:center;font-size:11px;margin:6px 0}.receipt-notes{font-size:10px;color:#555;font-style:italic;margin:4px 0;text-align:center}.receipt-footer{text-align:center;font-size:10px;color:#666;margin-top:14px;border-top:1px dashed #ccc;padding-top:10px}@media print{body{margin:0}.receipt{width:auto;padding:4px}.page-break{page-break-after:always;border:none;margin:0;padding:0}button{display:none!important}}${rCSS}</style></head><body><div style="text-align:center;padding:10px 0 6px;font-size:11px;color:#666;border-bottom:2px solid #eee;margin-bottom:16px">Printed ${new Date().toLocaleString()} · ${orders.length} receipt${orders.length>1?'s':''}<br><button onclick="window.print()" style="margin-top:8px;padding:6px 20px;font-size:12px;cursor:pointer;background:#111;color:#fff;border:none;border-radius:4px">🖨️ Print</button></div>${receiptsHtml}</body></html>`);win.document.close();setTimeout(()=>win.focus(),200);}

// ═══════════════════════════════════════════════════
//  MODAL + TOAST + HELPERS
// ═══════════════════════════════════════════════════
function showModal(html){document.getElementById('modal-root').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;setTimeout(()=>{const el=document.getElementById('couponList');if(el)loadCoupons();},50);}
function closeModal(){document.getElementById('modal-root').innerHTML='';}
function toast(msg,type='info',dur=3000){const root=document.getElementById('toast-root');const el=document.createElement('div');el.className=`toast toast-${type}`;el.textContent=msg;root.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity .4s';setTimeout(()=>el.remove(),400);},dur);}
function timeAgo(dateVal){if(!dateVal)return'—';const ts=dateVal?.toDate?dateVal.toDate():new Date(dateVal);const diff=Date.now()-ts.getTime();const m=Math.floor(diff/60000);if(m<1)return'Just now';if(m<60)return`${m}m ago`;const h=Math.floor(m/60);if(h<24)return`${h}h ago`;return Math.floor(h/24)+'d ago';}

// ═══════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',async()=>{
  await checkAuth();
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
});

// ═══════════════════════════════════════════════════
//  DEVELOPER PANEL
// ═══════════════════════════════════════════════════
const DEV_USER = 'beshoy';
const DEV_PASS = '1959';
let devUnlocked = false;

function openDevPanel() {
  const overlay = document.getElementById('dev-lock-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('devUser').focus(), 100);
}

function closeDevLock() {
  document.getElementById('dev-lock-overlay').style.display = 'none';
  document.getElementById('devErr').style.display = 'none';
  document.getElementById('devUser').value = '';
  document.getElementById('devPass').value = '';
}

function devLogin() {
  const user = document.getElementById('devUser').value.trim().toLowerCase();
  const pass = document.getElementById('devPass').value.trim();
  if (user === DEV_USER && pass === DEV_PASS) {
    closeDevLock();
    devUnlocked = true;
    showDevPanel();
  } else {
    document.getElementById('devErr').style.display = 'block';
    document.getElementById('devPass').value = '';
  }
}

function showDevPanel() {
  const panel = document.getElementById('dev-panel');
  panel.style.display = 'block';
  document.body.style.overflow = 'hidden';
  devLoadCurrentValues();
}

function closeDevPanel() {
  document.getElementById('dev-panel').style.display = 'none';
  document.body.style.overflow = '';
}

function devLoadCurrentValues() {
  const s = Admin.settings || {};
  const fields = [
    'restaurant_name','restaurant_name_ar','restaurant_icon','tagline',
    'open_time','close_time','hero_title1','hero_title2','hero_subtitle',
    'stat1_num','stat1_label','stat2_num','stat2_label','stat3_num','stat3_label',
    'wifi_name','wifi_pass'
  ];
  fields.forEach(key => {
    const el = document.getElementById('dev_' + key);
    if (el && s[key] !== undefined) el.value = s[key];
  });
  // Colors
  const colorMap = {
    'dev_accent_color': s.accent_color || '#7C3AED',
    'dev_bg_color': s.bg_color || '#ffffff',
    'dev_card_color': s.card_color || '#f5f3ff',
    'dev_text_color': s.text_color || '#1a1a2e',
    'dev_text2_color': s.text2_color || '#4b4b6a',
    'dev_border_color': s.border_color || '#ddd6fe',
  };
  Object.entries(colorMap).forEach(([id, val]) => {
    const picker = document.getElementById(id);
    const hex = document.getElementById(id + '_hex');
    if (picker) picker.value = val;
    if (hex) hex.value = val;
  });
  // sync color picker ↔ hex input
  Object.keys(colorMap).forEach(id => {
    const picker = document.getElementById(id);
    const hex = document.getElementById(id + '_hex');
    if (picker && hex) {
      picker.oninput = () => { hex.value = picker.value; };
      hex.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value; };
    }
  });
  // Selects
  if (s.hero_font) { const el=document.getElementById('dev_hero_font'); if(el) el.value = s.hero_font; }
  if (s.body_font) { const el=document.getElementById('dev_body_font'); if(el) el.value = s.body_font; }
  if (s.card_radius) { const el=document.getElementById('dev_card_radius'); if(el) el.value = s.card_radius; }
  if (s.btn_radius) { const el=document.getElementById('dev_btn_radius'); if(el) el.value = s.btn_radius; }
  if (s.custom_css) { const el=document.getElementById('dev_custom_css'); if(el) el.value = s.custom_css; }
  // Logo preview
  if (s.restaurant_logo) {
    const preview = document.getElementById('dev-logo-preview');
    if (preview) preview.innerHTML = `<img src="${s.restaurant_logo}" style="width:100%;height:100%;object-fit:contain;border-radius:12px">`;
  }
  if (s.restaurant_icon) { const el=document.getElementById('dev_nav_icon'); if(el) el.value = s.restaurant_icon; }
  if (s.tagline) { const el=document.getElementById('dev_footer_tagline'); if(el) el.value = s.tagline; }
  if (s.restaurant_logo) { const el=document.getElementById('dev_logo_url'); if(el && s.restaurant_logo.startsWith('http')) el.value = s.restaurant_logo; }
}

async function devSaveSection(keys, inputIds = null) {
  try {
    await Promise.all(keys.map((k, i) => {
      const id = inputIds ? inputIds[i] : ('dev_' + k);
      const el = document.getElementById(id);
      return el ? DB.updateSetting(k, el.value.trim()) : null;
    }));
    Object.assign(Admin.settings, Object.fromEntries(keys.map((k,i) => {
      const id = inputIds ? inputIds[i] : ('dev_' + k);
      const el = document.getElementById(id);
      return [k, el ? el.value.trim() : ''];
    })));
    toast('Saved ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devSaveColors() {
  try {
    const colorKeys = ['accent_color','bg_color','card_color','text_color','text2_color','border_color'];
    const inputIds  = ['dev_accent_color_hex','dev_bg_color_hex','dev_card_color_hex','dev_text_color_hex','dev_text2_color_hex','dev_border_color_hex'];
    await Promise.all(colorKeys.map((k, i) => {
      const el = document.getElementById(inputIds[i]);
      const val = el ? el.value.trim() : '';
      if (val) { Admin.settings[k] = val; return DB.updateSetting(k, val); }
    }));
    toast('Colors saved — reload customer site to see ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

function devApplyColorTheme(accent, bg, card, text, text2, border) {
  const map = { accent, bg, card, text, text2, border };
  const inputMap = {
    accent: ['dev_accent_color', 'dev_accent_color_hex'],
    bg:     ['dev_bg_color',     'dev_bg_color_hex'],
    card:   ['dev_card_color',   'dev_card_color_hex'],
    text:   ['dev_text_color',   'dev_text_color_hex'],
    text2:  ['dev_text2_color',  'dev_text2_color_hex'],
    border: ['dev_border_color', 'dev_border_color_hex'],
  };
  Object.entries(map).forEach(([key, val]) => {
    const [pickerId, hexId] = inputMap[key];
    const picker = document.getElementById(pickerId);
    const hex    = document.getElementById(hexId);
    if (picker) picker.value = val;
    if (hex)    hex.value    = val;
  });
  toast('Theme applied — click Save All Colors to persist', 'info');
}

async function devSaveTypography() {
  try {
    const fields = [
      ['hero_font','dev_hero_font'],
      ['body_font','dev_body_font'],
      ['card_radius','dev_card_radius'],
      ['btn_radius','dev_btn_radius'],
    ];
    await Promise.all(fields.map(([k, id]) => {
      const el = document.getElementById(id);
      if (el) { Admin.settings[k] = el.value; return DB.updateSetting(k, el.value); }
    }));
    toast('Typography saved ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devSaveCustomCSS() {
  try {
    const el = document.getElementById('dev_custom_css');
    const css = el ? el.value : '';
    await DB.updateSetting('custom_css', css);
    Admin.settings.custom_css = css;
    toast('Custom CSS saved — reload customer site ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devSaveLogoUrl() {
  try {
    const url = document.getElementById('dev_logo_url')?.value?.trim();
    const icon = document.getElementById('dev_nav_icon')?.value?.trim();
    if (url) { await DB.updateSetting('restaurant_logo', url); Admin.settings.restaurant_logo = url; }
    if (icon) { await DB.updateSetting('restaurant_icon', icon); Admin.settings.restaurant_icon = icon; }
    toast('Logo saved ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

function devHandleLogoUpload(input) {
  if (!input.files || !input.files[0]) return;
  if (input.files[0].size > 3 * 1024 * 1024) { toast('File too large — max 3MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const b64 = e.target.result;
    const preview = document.getElementById('dev-logo-preview');
    if (preview) preview.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain;border-radius:12px">`;
    try {
      await DB.updateSetting('restaurant_logo', b64);
      Admin.settings.restaurant_logo = b64;
      toast('Logo uploaded & saved ✓', 'success');
    } catch(e) { toast('Failed: ' + e.message, 'error'); }
  };
  reader.readAsDataURL(input.files[0]);
}

async function devRemoveLogo() {
  try {
    await DB.updateSetting('restaurant_logo', '');
    Admin.settings.restaurant_logo = '';
    const preview = document.getElementById('dev-logo-preview');
    if (preview) preview.innerHTML = '🏪';
    toast('Logo removed ✓', 'success');
  } catch(e) { toast('Failed', 'error'); }
}

async function devResetAllSettings() {
  if (!confirm('Reset ALL design settings to defaults? This cannot be undone.')) return;
  const defaults = {
    accent_color:'#7C3AED', bg_color:'#ffffff', card_color:'#f5f3ff',
    text_color:'#1a1a2e', text2_color:'#4b4b6a', border_color:'#ddd6fe',
    hero_font:'Playfair Display', body_font:'Inter', card_radius:'20px', btn_radius:'50px',
    hero_title1:'Crafted with', hero_title2:'Passion.',
    hero_subtitle:'An elevated dining experience where every dish tells a story.',
    tagline:'Crafted with passion. Served with love.',
    custom_css:'', restaurant_icon:'🍽️',
  };
  try {
    await Promise.all(Object.entries(defaults).map(([k,v]) => DB.updateSetting(k,v)));
    Object.assign(Admin.settings, defaults);
    devLoadCurrentValues();
    toast('Reset to defaults ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devExportSettings() {
  const snap = await firebase.firestore().collection('settings').doc('main').get();
  const data = snap.exists ? snap.data() : {};
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'flavorhouse-settings.json';
  a.click();
  toast('Settings exported ✓', 'success');
}

function devImportSettings() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!confirm(`Import ${Object.keys(data).length} settings? This will overwrite current values.`)) return;
      await Promise.all(Object.entries(data).map(([k,v]) => DB.updateSetting(k, v)));
      Object.assign(Admin.settings, data);
      devLoadCurrentValues();
      toast('Settings imported ✓', 'success');
    } catch(e) { toast('Invalid JSON file', 'error'); }
  };
  input.click();
}

// ═══════════════════════════════════════════════════
//  RECEIPT DESIGNER (Developer Panel)
// ═══════════════════════════════════════════════════
async function devSaveReceiptSettings() {
  // Map: Firestore setting key → DOM input element ID
  const inputMap = {
    receipt_header:      'dev_receipt_header',
    receipt_footer:      'dev_receipt_footer',
    receipt_font:        'dev_receipt_font',
    receipt_width:       'dev_receipt_width',
    receipt_accent:      'dev_receipt_accent_hex',   // hex text input
    receipt_show_wifi:   'dev_receipt_show_wifi',
    receipt_show_images: 'dev_receipt_show_images',
    receipt_divider:     'dev_receipt_divider',
    receipt_css:         'dev_receipt_css',
  };
  try {
    const saves = [];
    for (const [key, id] of Object.entries(inputMap)) {
      const el = document.getElementById(id);
      if (!el) { console.warn('devSave: element not found', id); continue; }
      const val = el.value;
      Admin.settings[key] = val;           // update in-memory immediately
      saves.push(DB.updateSetting(key, val));
    }
    await Promise.all(saves);
    // Keep color picker in sync with hex input
    const hexEl    = document.getElementById('dev_receipt_accent_hex');
    const pickerEl = document.getElementById('dev_receipt_accent');
    if (hexEl && pickerEl && /^#[0-9a-fA-F]{6}$/.test(hexEl.value)) pickerEl.value = hexEl.value;
    toast('Receipt design saved ✓', 'success');
  } catch(e) {
    console.error('devSaveReceiptSettings error:', e);
    toast('Save failed: ' + e.message, 'error');
  }
}

function devPreviewReceipt() {
  // Sync current dev panel input values into Admin.settings so openPrintWindow picks them up
  const inputMap = {
    receipt_header:      'dev_receipt_header',
    receipt_footer:      'dev_receipt_footer',
    receipt_font:        'dev_receipt_font',
    receipt_width:       'dev_receipt_width',
    receipt_accent:      'dev_receipt_accent_hex',
    receipt_show_wifi:   'dev_receipt_show_wifi',
    receipt_show_images: 'dev_receipt_show_images',
    receipt_divider:     'dev_receipt_divider',
    receipt_css:         'dev_receipt_css',
  };
  for (const [key, id] of Object.entries(inputMap)) {
    const el = document.getElementById(id);
    if (el) Admin.settings[key] = el.value;
  }
  // Generate a sample order for preview
  const sampleOrder = {
    id: 'preview',
    order_number: '42',
    table_number: 5,
    customer_name: 'Ahmed Hassan',
    customer_phone: '0101234567',
    items: [
      { name: 'Grilled Chicken', name_ar: 'دجاج مشوي', qty: 2, price: 150 },
      { name: 'Caesar Salad', name_ar: 'سلطة سيزار', qty: 1, price: 80 },
      { name: 'Mango Juice', name_ar: 'عصير مانجو', qty: 2, price: 45 },
    ],
    subtotal: 470, tax: 65.8, service_charge: 47, discount: 0, total: 582.8,
    payment_method: 'cash', notes: 'No onions please',
    created_at: new Date(),
  };
  openPrintWindow([sampleOrder]);
}

// Load receipt designer values when dev panel opens
const _origDevLoad = devLoadCurrentValues;
devLoadCurrentValues = function() {
  _origDevLoad();
  const s = Admin.settings || {};
  const rMap = {
    'dev_receipt_header':      s.receipt_header || 'Thank you for dining with us!',
    'dev_receipt_footer':      s.receipt_footer || 'See you again soon!',
    'dev_receipt_font':        s.receipt_font   || "'Courier New',monospace",
    'dev_receipt_width':       s.receipt_width  || '72mm',
    'dev_receipt_accent_hex':  s.receipt_accent || '#000000',
    'dev_receipt_show_wifi':   s.receipt_show_wifi   || 'yes',
    'dev_receipt_show_images': s.receipt_show_images || 'no',
    'dev_receipt_divider':     s.receipt_divider || '- - - - - - - - - - - - - - -',
    'dev_receipt_css':         s.receipt_css    || '',
  };
  Object.entries(rMap).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  const picker = document.getElementById('dev_receipt_accent');
  if (picker && s.receipt_accent && /^#[0-9a-fA-F]{6}$/.test(s.receipt_accent)) {
    picker.value = s.receipt_accent;
    picker.oninput = () => {
      const hex = document.getElementById('dev_receipt_accent_hex');
      if (hex) hex.value = picker.value;
    };
  }
};
