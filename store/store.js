/* Made in Xiaolin — Store. Static storefront + Echelon checkout (charge runs on
   the xiaolin-support Cloud Run service; card data is forwarded, never stored here). */
const API = "https://xiaolin-support-804083036164.us-east1.run.app";
let ITEMS = [], MODE = "sandbox", CUR = null, QTY = 1;

const $ = s => document.querySelector(s);
const money = n => "$" + Number(n).toFixed(2);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadItems() {
  // Prefer the API (authoritative catalog + live payment mode); fall back to the static file.
  try {
    const r = await fetch(API + "/store/items", { cache: "no-store" });
    const d = await r.json();
    if (Array.isArray(d.items)) { ITEMS = d.items; MODE = d.mode || "sandbox"; return; }
  } catch (e) {}
  try {
    const r = await fetch("items.json", { cache: "no-store" });
    ITEMS = await r.json();
  } catch (e) { ITEMS = []; }
}

function renderGrid() {
  const live = ITEMS.filter(i => i && i.active !== false);
  const grid = $("#grid");
  if (!live.length) { grid.innerHTML = `<div class="loading">No items yet — check back soon.</div>`; return; }
  grid.innerHTML = live.map(i => `
    <div class="card">
      <div class="pic"><img src="${esc(i.img)}" alt="${esc(i.name)}" loading="lazy"
        onerror="this.src='https://xiaolinbudtender.cannacrypted.com/img/xiaolin-logo.png'"></div>
      <div class="body">
        <div class="nm">${esc(i.name)}</div>
        <div class="desc">${esc(i.desc || "")}</div>
        <div class="row">
          <span class="price">${money(i.price)}</span>
          <button class="btn" onclick="openCheckout('${esc(i.id)}')">Buy Now</button>
        </div>
      </div>
    </div>`).join("");
}

function openCheckout(id) {
  CUR = ITEMS.find(x => String(x.id) === String(id));
  if (!CUR) return;
  QTY = 1;
  renderCheckout();
  $("#checkout").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeCheckout() {
  $("#checkout").classList.add("hidden");
  document.body.style.overflow = "";
}
function setQty(d) { QTY = Math.max(1, Math.min(20, QTY + d)); updateTotal(); }
function total() { return (Number(CUR.price) * QTY); }
function updateTotal() {
  const t = $("#co-total-amt"); if (t) t.textContent = money(total());
  const q = $("#co-qty"); if (q) q.textContent = QTY;
}

function renderCheckout() {
  const i = CUR;
  const chip = MODE !== "live" ? `<span class="sandbox-chip">Test mode</span>` : "";
  $("#co-body").innerHTML = `
    <div class="co-head">
      <img src="${esc(i.img)}" alt="" onerror="this.src='https://xiaolinbudtender.cannacrypted.com/img/xiaolin-logo.png'">
      <div><div class="nm">${esc(i.name)}${chip}</div>
      <div class="price">${money(i.price)}</div></div>
    </div>
    <div class="qtyrow"><span class="flbl" style="margin:0">Qty</span>
      <button class="qbtn" onclick="setQty(-1)">−</button><b id="co-qty">1</b>
      <button class="qbtn" onclick="setQty(1)">+</button></div>

    <div class="sec-h">Your details</div>
    <div class="two"><div><span class="flbl">First name</span><input class="fld" id="f_first" autocomplete="given-name"></div>
      <div><span class="flbl">Last name</span><input class="fld" id="f_last" autocomplete="family-name"></div></div>
    <span class="flbl">Email</span><input class="fld" id="f_email" type="email" autocomplete="email" inputmode="email">
    <span class="flbl">Phone</span><input class="fld" id="f_phone" type="tel" autocomplete="tel" inputmode="tel">

    <div class="sec-h">Shipping address</div>
    <span class="flbl">Street</span><input class="fld" id="f_street" autocomplete="address-line1">
    <div class="two"><div><span class="flbl">City</span><input class="fld" id="f_city" autocomplete="address-level2"></div>
      <div style="max-width:84px"><span class="flbl">State</span><input class="fld" id="f_state" maxlength="2" autocomplete="address-level1"></div>
      <div style="max-width:110px"><span class="flbl">ZIP</span><input class="fld" id="f_zip" inputmode="numeric" autocomplete="postal-code"></div></div>

    <div class="sec-h">Payment</div>
    <span class="flbl">Card number</span>
    <input class="fld" id="f_card" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" oninput="fmtCard(this)">
    <div class="two">
      <div><span class="flbl">Exp. month</span><input class="fld" id="f_mm" inputmode="numeric" placeholder="MM" maxlength="2" autocomplete="cc-exp-month"></div>
      <div><span class="flbl">Exp. year</span><input class="fld" id="f_yy" inputmode="numeric" placeholder="YYYY" maxlength="4" autocomplete="cc-exp-year"></div>
      <div style="max-width:110px"><span class="flbl">CVV</span><input class="fld" id="f_cvv" inputmode="numeric" placeholder="•••" maxlength="4" autocomplete="cc-csc"></div>
    </div>
    <div class="pci">🔒 Encrypted checkout via Echelon. We never store your card.</div>

    <div class="co-total"><span>Total</span><span class="big" id="co-total-amt">${money(total())}</span></div>
    <div class="err" id="co-err"></div>
    <button class="btn block" id="payBtn" onclick="pay()">Pay ${money(total())} →</button>
    <div class="note">${MODE !== "live" ? "Test mode — use a sandbox test card; no real charge is made." : "Your card will be charged by Made in Xiaolin."}</div>`;
  updateTotal();
  syncPayBtn();
}
function syncPayBtn(){ const b=$("#payBtn"); if(b) b.textContent = "Pay " + money(total()) + " →"; }
function fmtCard(el){ let v=el.value.replace(/\D/g,"").slice(0,19); el.value=v.replace(/(.{4})/g,"$1 ").trim(); }

function showErr(m){ const e=$("#co-err"); e.textContent=m; e.classList.add("show"); }

async function pay() {
  const g = id => ($("#" + id).value || "").trim();
  const card = g("f_card").replace(/\s/g, "");
  const data = {
    item_id: CUR.id, qty: QTY,
    first_name: g("f_first"), last_name: g("f_last"), email: g("f_email"), phone: g("f_phone"),
    street: g("f_street"), city: g("f_city"), state: g("f_state"), zip: g("f_zip"),
    card, exp_month: g("f_mm"), exp_year: g("f_yy"), cvv: g("f_cvv")
  };
  $("#co-err").classList.remove("show");
  if (!data.first_name || !data.last_name || !data.email) return showErr("Please add your name and email.");
  if (card.length < 13 || !/^\d+$/.test(card)) return showErr("Enter a valid card number.");
  if (!/^\d{1,2}$/.test(data.exp_month) || +data.exp_month < 1 || +data.exp_month > 12) return showErr("Enter a valid expiry month (MM).");
  if (!/^\d{4}$/.test(data.exp_year)) return showErr("Enter a 4-digit expiry year (YYYY).");
  if (!/^\d{3,4}$/.test(data.cvv)) return showErr("Enter the 3–4 digit CVV.");

  const btn = $("#payBtn"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>Processing…`;
  try {
    const r = await fetch(API + "/store/charge", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    });
    const d = await r.json();
    if (d.success) return renderDone(d);
    showErr(d.error || "Payment declined. Check your details and try again.");
  } catch (e) {
    showErr("Connection problem — please try again.");
  }
  btn.disabled = false; syncPayBtn();
}

function renderDone(d) {
  $("#co-body").innerHTML = `
    <div class="done">
      <div class="check">✓</div>
      <h2>Order confirmed</h2>
      <p class="sub">Thank you${CUR ? " — your " + esc(CUR.name) + " is on the way" : ""}.</p>
      <div class="co-total" style="justify-content:center;gap:18px;border:0">
        <span>${esc(d.item || "")} ×${QTY}</span><span class="big">${money(d.total)}</span></div>
      ${d.last_4 ? `<div class="note">Card ending ${esc(d.last_4)} · ref ${esc(d.transaction_id || "")}</div>` : ""}
      <button class="btn block gold" style="margin-top:16px" onclick="closeCheckout()">Keep shopping</button>
    </div>`;
}

(async function init() {
  await loadItems();
  renderGrid();
})();
