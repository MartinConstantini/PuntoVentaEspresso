import "./styles.css";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db, firebaseReady, missingFirebaseKeys } from "./firebase.js";
import { seedDefaultProducts } from "./productsSeed.js";

const appEl = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastEl = document.querySelector("#toast");

let products = [];
let activeTickets = [];
let currentFinanceTickets = [];
let currentFinanceDate = getDateKey(new Date());
let currentPeriodTickets = [];
let financePeriodType = "semana";
let financePeriodDate = getDateKey(new Date());
let financeChart = null;
let paymentChart = null;
let unsubscribeProducts = null;
let unsubscribeActiveTickets = null;

const SESSION_KEY = "esspreso_jwt";
const USER_KEY = "esspreso_user";
const PUBLIC_ROUTES = ["menu", "login"];
const TOKEN_HOURS = 10;
const DEV_USERS = {
  andrea: "andreaSpre",
  ximena: "ximenaSpre"
};

let authUser = getSavedUser();

const categoryBase = [
  "Ensaladas", "Sandwich", "Hamburguesas", "Combos", "Bowl", "Tortas", "Baguette",
  "Bebidas calientes", "Bebidas frias", "Base horchata", "Otras bebidas", "Malteadas",
  "Frappe", "Crepas", "Waffles", "Extras"
];

const menuSections = [
  { id: "brunchdy", label: "Brunchdy", detail: "Manana y tarde" },
  { id: "espresso", label: "Espresso", detail: "Noche" }
];

const espressoCategories = new Set([
  "Bebidas calientes",
  "Bebidas frias",
  "Base horchata",
  "Otras bebidas",
  "Malteadas",
  "Frappe"
]);

const imageMap = {
  latte: "/assets/latte.svg",
  crepa: "/assets/crepa.svg",
  sandwich: "/assets/sandwich.svg",
  bowl: "/assets/bowl.svg"
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0
});

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return money.format(Number(value || 0));
}
function normalizeOptions(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function renderItemOptions(item, className = "item-options") {
  const options = normalizeOptions(item?.options || item?.notes || item?.kitchenNotes || "");
  if (!options) return "";

  return `<span class="${className}">Indicaciones: ${escapeHtml(options)}</span>`;
}

function normalizeMenuSection(value = "") {
  const cleanValue = String(value || "").trim().toLowerCase();
  return menuSections.some((section) => section.id === cleanValue) ? cleanValue : "";
}

function inferMenuSection(product = {}) {
  const selected = normalizeMenuSection(product.menuSection);
  if (selected) return selected;

  const category = product.category || "";
  return espressoCategories.has(category) ? "espresso" : "brunchdy";
}

function menuSectionLabel(value = "") {
  const id = normalizeMenuSection(value) || "brunchdy";
  return menuSections.find((section) => section.id === id)?.label || "Brunchdy";
}

function menuSectionDetail(value = "") {
  const id = normalizeMenuSection(value) || "brunchdy";
  return menuSections.find((section) => section.id === id)?.detail || "Manana y tarde";
}

function normalizeProductForMenu(product = {}) {
  return {
    ...product,
    menuSection: inferMenuSection(product)
  };
}


function getDateKey(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function displayDate(date = new Date()) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function makeTicketName(alias) {
  const cleanAlias = String(alias || "Cliente")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-ÁÉÍÓÚÜÑáéíóúüñ]/g, "") || "Cliente";
  return `${displayDate(new Date())}_${cleanAlias}`;
}

function getRoute() {
  return (location.hash.replace("#", "") || "inicio").toLowerCase();
}

function routeTitle(route) {
  const names = {
    inicio: "Inicio",
    venta: "Venta",
    productos: "Productos",
    cocina: "Cocina",
    finanzas: "Finanzas",
    menu: "Menu",
    login: "Login"
  };
  return names[route] || "Inicio";
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toastEl.classList.remove("show"), 2300);
}

function base64UrlToJson(value = "") {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
    return JSON.parse(decodeURIComponent(escape(window.atob(padded))));
  } catch (error) {
    return null;
  }
}

function decodeJwt(token = "") {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  return base64UrlToJson(parts[1]);
}

function getStoredToken() {
  return localStorage.getItem(SESSION_KEY) || "";
}

function getSavedUser() {
  const token = getStoredToken();
  const payload = decodeJwt(token);

  if (!payload?.exp || payload.exp * 1000 <= Date.now()) {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    return null;
  }

  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null") || { username: payload.username };
  } catch (error) {
    return { username: payload.username };
  }
}

function isAuthenticated() {
  authUser = getSavedUser();
  return Boolean(authUser);
}

function saveSession(token, user) {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  authUser = user || decodeJwt(token);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  authUser = null;
}

function makeLocalDevJwt(username) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    username,
    name: username === "andrea" ? "Andrea" : "Ximena",
    role: "staff",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_HOURS * 60 * 60
  };
  const encode = (data) => window.btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${encode(header)}.${encode(payload)}.dev`;
}

function canUseLocalDevLogin() {
  return ["localhost", "127.0.0.1"].includes(location.hostname) || location.hostname.startsWith("192.168.");
}

function redirectToLogin() {
  if (getRoute() !== "login") location.hash = "login";
}

function logout() {
  clearSession();
  stopFirestoreListeners();
  closeModal();
  showToast("Sesion cerrada");
  location.hash = "login";
  render();
}

async function loginUser() {
  const username = document.querySelector("#login-user")?.value.trim().toLowerCase();
  const password = document.querySelector("#login-pass")?.value || "";
  const errorBox = document.querySelector("#login-error");

  if (errorBox) errorBox.textContent = "";
  if (!username || !password) {
    if (errorBox) errorBox.textContent = "Escribe usuario y contrasena.";
    return;
  }

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Usuario o contrasena incorrectos");

    saveSession(data.token, data.user);
    showToast(`Bienvenida ${data.user?.name || username}`);
    location.hash = "inicio";
    render();
  } catch (error) {
    if (canUseLocalDevLogin() && DEV_USERS[username] === password) {
      const token = makeLocalDevJwt(username);
      const user = { username, name: username === "andrea" ? "Andrea" : "Ximena", role: "staff" };
      saveSession(token, user);
      showToast(`Bienvenida ${user.name}`);
      location.hash = "inicio";
      render();
      return;
    }

    if (errorBox) errorBox.textContent = error.message || "No se pudo iniciar sesion.";
  }
}

function openModal(title, body, footer = "") {
  modalRoot.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="modal-header">
        <h2>${escapeHtml(title)}</h2>
        <button class="icon-btn" data-action="close-modal" aria-label="Cerrar">×</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}
    </section>
  `;
  modalRoot.classList.add("show");
  modalRoot.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalRoot.classList.remove("show");
  modalRoot.setAttribute("aria-hidden", "true");
  modalRoot.innerHTML = "";
}

function baseLayout(content) {
  const route = getRoute();
  const isHome = route === "inicio";
  const isPublicMenu = route === "menu";
  const isLogin = route === "login";

  appEl.innerHTML = `
    <main class="app-shell ${isHome ? "home-shell" : ""} ${isPublicMenu ? "public-menu-shell" : ""} ${isLogin ? "login-shell" : ""}">
      ${
        !isHome && !isPublicMenu && !isLogin
          ? `
            <header class="page-topbar page-topbar-short">
              <button class="btn btn-outline btn-home" data-route="inicio">← Inicio</button>

              <img 
                src="/assets/logo-esspreso.png" 
                alt="Logo esspreso cafe y sabor" 
                class="page-logo-center"
              >

              <button class="btn btn-outline btn-logout" data-action="logout">Salir</button>
            </header>
          `
          : ""
      }

      ${!isPublicMenu && !isLogin ? configWarning() : ""}
      ${content}
    </main>
  `;
}




function navButton(route, label, currentRoute) {
  return `<button class="nav-btn ${currentRoute === route ? "active" : ""}" data-route="${route}">${label}</button>`;
}

function configWarning() {
  if (firebaseReady) return "";
  return `
    <div class="alert">
      Falta configurar Firebase Web. Llena el archivo <strong>.env</strong> usando <strong>.env.example</strong>.
      Campos faltantes: ${missingFirebaseKeys.map(escapeHtml).join(", ")}.
    </div>
  `;
}

function startFirestoreListeners() {
  if (!firebaseReady || !db) return;
  unsubscribeProducts?.();
  unsubscribeActiveTickets?.();

  unsubscribeProducts = onSnapshot(collection(db, "products"), (snapshot) => {
    products = snapshot.docs
      .map((item) => normalizeProductForMenu({ id: item.id, ...item.data() }))
      .sort((a, b) => `${inferMenuSection(a)}-${a.category}-${a.name}`.localeCompare(`${inferMenuSection(b)}-${b.category}-${b.name}`, "es"));
    render();
  }, (error) => showToast(`Error productos: ${error.message}`));

  unsubscribeActiveTickets = onSnapshot(query(collection(db, "tickets"), where("status", "==", "activo")), (snapshot) => {
    activeTickets = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0));
    render();
  }, (error) => showToast(`Error tickets: ${error.message}`));
}

function render() {
  const route = getRoute();

  if (route === "menu") return renderMenu();
  if (route === "login") return renderLogin();

  if (!isAuthenticated()) return renderLogin();

  if (route === "venta") return renderSales();
  if (route === "productos") return renderProducts();
  if (route === "cocina") return renderKitchen();
  if (route === "finanzas") return renderFinance();
  return renderHome();
}

function renderLogin() {
  clearSession();
  baseLayout(`
    <section class="login-page">
      <div class="login-card card">
        <div class="login-logo">
          <img src="/assets/logo-esspreso.png" alt="Logo esspreso cafe y sabor">
        </div>

        <div class="login-title">
          <h1>Inicio de sesion</h1>
          <p>Ingresa para usar venta, productos, cocina y finanzas.</p>
        </div>

        <form class="login-form" id="login-form">
          <div class="form-group">
            <label for="login-user">Usuario</label>
            <input id="login-user" autocomplete="username" placeholder="andrea o ximena">
          </div>

          <div class="form-group">
            <label for="login-pass">Contrasena</label>
            <input id="login-pass" type="password" autocomplete="current-password" placeholder="Contrasena">
          </div>

          <p class="login-error" id="login-error" aria-live="polite"></p>

          <button class="btn btn-primary" type="submit">Entrar</button>
        </form>

        <p class="login-note">La sesion caduca despues de ${TOKEN_HOURS} horas.</p>
      </div>
    </section>
  `);
}

function renderHome() {
  baseLayout(`
    <section class="home-start home-start-clean">
      <div class="home-user-bar">
        <span>Sesion: ${escapeHtml(authUser?.name || authUser?.username || "Usuario")}</span>
        <button class="btn btn-outline btn-small" data-action="logout">Salir</button>
      </div>

      <header class="home-logo-header">
        <img src="/assets/logo-esspreso.png" alt="Logo esspreso cafe y sabor">
      </header>

      <div class="home-cards-clean">
        ${homeSimpleCard(
          "venta",
          "☕",
          "Venta",
          "Abre mesas, tickets para llevar, agrega productos y finaliza cobros."
        )}

        ${homeSimpleCard(
          "productos",
          "🧁",
          "Productos",
          "Agrega, modifica o elimina productos y precios guardados en Firebase."
        )}

        ${homeSimpleCard(
          "cocina",
          "👩‍🍳",
          "Cocina",
          "Revisa ordenes activas y marca productos como preparados."
        )}

        ${homeSimpleCard(
          "finanzas",
          "💰",
          "Finanzas",
          "Consulta ventas por dia, formas de pago, reportes e impresion en PDF."
        )}
      </div>
    </section>
  `);
}


function homeSimpleCard(route, icon, title, text) {
  return `
    <button class="home-clean-card" data-route="${route}">
      <span class="home-clean-icon">${icon}</span>
      <span class="home-clean-arrow">→</span>

      <div class="home-clean-content">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
      </div>

      <span class="home-clean-blob" aria-hidden="true"></span>
    </button>
  `;
}


function renderSales() {
  const totalActive = activeTickets.reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
  baseLayout(`
    <section class="card panel">
      <div class="toolbar">
        <div class="toolbar-left">
          <div>
            <h2 style="margin:0; letter-spacing:-.04em;">Venta</h2>
            <p style="margin:4px 0 0; color:var(--color-600);">Mesas y tickets activos: ${activeTickets.length} · Total activo: ${formatMoney(totalActive)}</p>
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" data-action="new-ticket">+ Nuevo ticket/mesa</button>
        </div>
      </div>
      ${products.length === 0 ? `<div class="alert">Primero carga o registra productos en la seccion Productos.</div>` : ""}
      <div class="ticket-grid">
        ${activeTickets.length ? activeTickets.map(ticketCard).join("") : `<div class="empty-state">No hay mesas o tickets activos. Crea uno nuevo para comenzar.</div>`}
      </div>
    </section>
  `);
}

function ticketCard(ticket) {
  const count = (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  return `
    <article class="ticket-card">
      <h3>${escapeHtml(ticket.name || ticket.alias || "Ticket")}</h3>
      <p>${escapeHtml(ticket.type || "mesa")} · ${count} producto(s)</p>
      <div class="ticket-meta">
        <span class="badge badge-dark">Activo</span>
        <span class="badge">${escapeHtml(displayTicketDate(ticket.createdAt))}</span>
      </div>
      <div class="total-line"><span>Total</span><strong>${formatMoney(ticket.total)}</strong></div>
      <button class="btn btn-primary" data-action="open-ticket" data-id="${ticket.id}">Abrir orden</button>
    </article>
  `;
}

function displayTicketDate(timestamp) {
  if (!timestamp?.seconds) return displayDate(new Date());
  return displayDate(new Date(timestamp.seconds * 1000));
}

function itemKitchenStatus(item) {
  return item?.kitchenStatus || "preparacion";
}

function isItemPrepared(item) {
  return itemKitchenStatus(item) === "preparado";
}

function hasPreparedItems(ticket) {
  return (ticket?.items || []).some(isItemPrepared);
}

function kitchenStatusLabel(status) {
  return status === "preparado" ? "Preparado" : "Preparacion";
}

function kitchenStatusClass(status) {
  return status === "preparado" ? "status-prepared" : "status-preparation";
}

function makeLineId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOnlineMenuUrl() {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return `${baseUrl}#menu`;
}

function getQrImageUrl(size = 360) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(getOnlineMenuUrl())}`;
}

function renderProducts() {
  const groupedSections = groupProductsByMenuSection(products);
  baseLayout(`
    <section class="card panel">
      <div class="toolbar">
        <div class="toolbar-left">
          <div>
            <h2 style="margin:0; letter-spacing:-.04em;">Productos</h2>
            <p style="margin:4px 0 0; color:var(--color-600);">${products.length} productos guardados en Firebase.</p>
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-outline" data-action="view-menu-online">Ver menu online</button>
          <button class="btn btn-soft" data-action="show-menu-qr">Codigo QR</button>
          <button class="btn btn-soft" data-action="export-products-pdf">Exportar PDF</button>
          <button class="btn btn-outline" data-action="seed-products">Cargar productos base</button>
          <button class="btn btn-primary" data-action="new-product">+ Nuevo producto</button>
        </div>
      </div>

      <div class="product-section-list">
        ${products.length ? groupedSections.map(productMenuSectionGroup).join("") : `<div class="empty-state">Aun no tienes productos. Puedes cargarlos desde el menu base o crear uno manual.</div>`}
      </div>
    </section>
  `);
}

function groupProducts(list) {
  const map = new Map();
  list.forEach((product) => {
    const category = product.category || "Sin categoria";
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(product);
  });
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}

function groupProductsByMenuSection(list) {
  return menuSections
    .map((section) => {
      const items = list
        .map(normalizeProductForMenu)
        .filter((product) => inferMenuSection(product) === section.id);

      return {
        ...section,
        groups: groupProducts(items)
      };
    })
    .filter((section) => section.groups.length > 0);
}

function productMenuSectionGroup(section) {
  return `
    <section class="product-menu-section product-menu-section-${escapeHtml(section.id)}">
      <div class="product-menu-section-title">
        <div>
          <h3>${escapeHtml(section.label)}</h3>
          <p>${escapeHtml(section.detail)}</p>
        </div>
        <span class="badge badge-dark">${section.groups.reduce((sum, group) => sum + group.items.length, 0)} producto(s)</span>
      </div>

      <div class="product-grid">
        ${section.groups.map(productGroup).join("")}
      </div>
    </section>
  `;
}

function productGroup(group) {
  return `
    <section class="product-card">
      <div class="ticket-meta"><span class="badge badge-dark">${escapeHtml(group.category)}</span><span class="badge">${group.items.length} producto(s)</span></div>
      ${group.items.map(productRowMini).join("")}
    </section>
  `;
}

function productRowMini(product) {
  const image = imageMap[product.imageTag] || imageMap.latte;
  return `
    <div style="display:grid; grid-template-columns:54px 1fr auto; gap:10px; align-items:center; padding:10px 0; border-top:1px solid rgba(61,82,65,.08);">
      <img src="${image}" alt="" style="width:54px;height:44px;object-fit:cover;border-radius:14px;background:#fff;">
      <div>
        <h3 style="font-size:15px; margin:0;">${escapeHtml(product.name)}</h3>
        <p style="margin:2px 0 0; font-size:13px;">${formatMoney(product.price)} · ${escapeHtml(menuSectionLabel(product.menuSection))} ${product.active === false ? "· Inactivo" : ""}</p>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="icon-btn" title="Editar" data-action="edit-product" data-id="${product.id}">✎</button>
        <button class="icon-btn" title="Eliminar" data-action="delete-product" data-id="${product.id}">🗑</button>
      </div>
    </div>
  `;
}


function renderKitchen() {
  const ticketsWithItems = activeTickets.filter((ticket) => (ticket.items || []).length > 0);
  const totalItems = ticketsWithItems.reduce((sum, ticket) => sum + (ticket.items || []).reduce((itemSum, item) => itemSum + Number(item.qty || 0), 0), 0);
  const pendingItems = ticketsWithItems.reduce((sum, ticket) => sum + (ticket.items || []).filter((item) => !isItemPrepared(item)).length, 0);
  const preparedItems = ticketsWithItems.reduce((sum, ticket) => sum + (ticket.items || []).filter(isItemPrepared).length, 0);

  baseLayout(`
    <section class="card panel kitchen-panel">
      <div class="toolbar">
        <div class="toolbar-left">
          <div>
            <h2 style="margin:0; letter-spacing:-.04em;">Cocina</h2>
            <p style="margin:4px 0 0; color:var(--color-600);">Ordenes activas en tiempo real.</p>
          </div>
        </div>
        <div class="toolbar-right kitchen-toolbar-info">
          <span class="badge badge-red">${pendingItems} en preparacion</span>
          <span class="badge badge-green">${preparedItems} preparados</span>
          <span class="badge">${totalItems} producto(s)</span>
        </div>
      </div>

      <div class="kitchen-board">
        ${ticketsWithItems.length ? ticketsWithItems.map(kitchenTicketCard).join("") : `<div class="empty-state">No hay ordenes activas para cocina.</div>`}
      </div>
    </section>
  `);
}

function kitchenTicketCard(ticket) {
  const items = ticket.items || [];
  const pending = items.filter((item) => !isItemPrepared(item)).length;
  const prepared = items.filter(isItemPrepared).length;

  return `
    <article class="kitchen-ticket card">
      <header class="kitchen-ticket-header">
        <div>
          <span class="badge badge-dark">${escapeHtml(ticket.type || "mesa")}</span>
          <h3>${escapeHtml(ticket.name || ticket.alias || "Ticket")}</h3>
          <p>${escapeHtml(displayTicketDate(ticket.createdAt))} · ${items.length} linea(s)</p>
        </div>
        <div class="kitchen-counts">
          <span class="badge badge-red">${pending} pendientes</span>
          <span class="badge badge-green">${prepared} listos</span>
        </div>
      </header>

      <div class="kitchen-items">
        ${items.map((item, index) => kitchenItemRow(ticket, item, index)).join("")}
      </div>
    </article>
  `;
}

function kitchenItemRow(ticket, item, index) {
  const status = itemKitchenStatus(item);
  const prepared = isItemPrepared(item);

  return `
    <div class="kitchen-item ${kitchenStatusClass(status)}">
      <div class="kitchen-item-main">
        <strong>${Number(item.qty || 0)} x ${escapeHtml(item.name || "Producto")}</strong>
        <span>${escapeHtml(item.category || "Sin categoria")}</span>
        ${renderItemOptions(item, "kitchen-item-options")}
      </div>
      <div class="kitchen-item-actions">
        <span class="kitchen-status-pill ${kitchenStatusClass(status)}">${kitchenStatusLabel(status)}</span>
        ${prepared
          ? `<button class="btn btn-small btn-outline" disabled>Listo</button>`
          : `<button class="btn btn-small btn-primary" data-action="mark-item-prepared" data-id="${ticket.id}" data-index="${index}">Marcar preparado</button>`
        }
      </div>
    </div>
  `;
}

function renderOnlineMenu() {
  const activeProducts = products.filter((product) => product.active !== false);
  const groupedSections = groupProductsByMenuSection(activeProducts);

  baseLayout(`
    <section class="card panel online-menu-panel">
      <div class="online-menu-logo">
        <img src="/assets/logo-esspreso.png" alt="Logo esspreso cafe y sabor">
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <div>
            <h2 style="margin:0; letter-spacing:-.04em;">Menu en linea</h2>
            <p style="margin:4px 0 0; color:var(--color-600);">Productos actualizados desde Firebase.</p>
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-soft" data-action="show-menu-qr">Codigo QR</button>
          <button class="btn btn-primary" data-action="export-products-pdf">Guardar PDF</button>
        </div>
      </div>

      <div class="online-menu-grid">
        ${groupedSections.length ? groupedSections.map((section) => `
          <section class="online-menu-section">
            <div class="public-menu-section-heading">
              <h1>${escapeHtml(section.label)}</h1>
              <p>${escapeHtml(section.detail)}</p>
            </div>
            ${section.groups.map(onlineMenuGroup).join("")}
          </section>
        `).join("") : `<div class="empty-state">No hay productos activos para mostrar.</div>`}
      </div>
    </section>
  `);
}

function onlineMenuGroup(group) {
  return `
    <section class="online-menu-group">
      <h3>${escapeHtml(group.category)}</h3>
      <div class="online-menu-items">
        ${group.items.map((product) => `
          <article class="online-menu-item">
            <div>
              <strong>${escapeHtml(product.name || "Producto")}</strong>
              ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
            </div>
            <span>${formatMoney(product.price)}</span>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFinance() {
  baseLayout(`
    <section class="card panel" id="finance-panel">
      <div class="finance-header-clean">
        <div class="finance-title-clean">
          <h2>Finanzas</h2>
          <p>Contable</p>
        </div>

        <div class="finance-actions-clean">
          <input 
            type="date" 
            id="finance-date" 
            value="${escapeHtml(currentFinanceDate)}" 
            data-action="finance-date"
            class="finance-date-input"
          >

          <button class="btn btn-outline finance-btn" data-action="print-report">
            Imprimir reporte diario
          </button>

          <button class="btn btn-primary finance-btn" data-action="pdf-report">
            Guardar PDF diario
          </button>
        </div>
      </div>

      <div id="finance-content">
        <div class="empty-state">Cargando ventas del dia...</div>
      </div>

      <section class="period-report-panel">
        <div class="period-report-header">
          <div>
            <h2>Reportes por periodo</h2>
            <p>Genera reportes semanales, mensuales o anuales con metricas contables.</p>
          </div>

          <div class="period-report-actions">
            <select id="period-report-type" data-action="period-report-type">
              <option value="semana" ${financePeriodType === "semana" ? "selected" : ""}>Semanal</option>
              <option value="mes" ${financePeriodType === "mes" ? "selected" : ""}>Mensual</option>
              <option value="ano" ${financePeriodType === "ano" ? "selected" : ""}>Anual</option>
            </select>

            <input 
              type="date" 
              id="period-report-date" 
              value="${escapeHtml(financePeriodDate)}" 
              data-action="period-report-date"
            >

            <button class="btn btn-soft" data-action="load-period-report">Consultar</button>
            <button class="btn btn-outline" data-action="print-period-report">Imprimir</button>
            <button class="btn btn-primary" data-action="pdf-period-report">Guardar PDF</button>
          </div>
        </div>

        <div id="period-report-content">
          <div class="empty-state">Selecciona un periodo y presiona Consultar.</div>
        </div>
      </section>
    </section>
  `);

  loadFinance(currentFinanceDate);
  loadPeriodFinance();
}

async function renderMenu() {
  baseLayout(`
    <section class="public-menu-page">
      <header class="public-menu-header">
        <img src="/assets/logo-esspreso.png" alt="Logo esspreso cafe y sabor">
        <p>Menu en linea</p>
      </header>

      <div id="public-menu-content">
        <div class="empty-state">Cargando menu...</div>
      </div>
    </section>
  `);

  await loadPublicMenuFromNetlify();
}

async function loadPublicMenuFromNetlify() {
  const content = document.querySelector("#public-menu-content");
  if (!content) return;

  try {
    const response = await fetch("/.netlify/functions/public-menu", {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "No se pudo cargar el menu");
    }

    paintPublicMenu(data.products || [], data.updatedAt);
  } catch (error) {
    content.innerHTML = `
      <div class="alert">
        No se pudo cargar el menu en linea. Intenta actualizar la pagina.
        <br>
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

function paintPublicMenu(menuProducts, updatedAt = "") {
  const content = document.querySelector("#public-menu-content");
  if (!content) return;

  if (!menuProducts.length) {
    content.innerHTML = `
      <div class="empty-state">
        Por el momento no hay productos disponibles.
      </div>
    `;
    return;
  }

  const groupedSections = groupProductsByMenuSection(menuProducts);

  content.innerHTML = `
    <div class="public-menu-updated">
      Actualizado: ${escapeHtml(formatPublicMenuDate(updatedAt))}
    </div>

    <div class="public-menu-sections">
      ${groupedSections.map((section) => `
        <section class="public-menu-section public-menu-section-${escapeHtml(section.id)}">
          <div class="public-menu-section-heading">
            <h1>${escapeHtml(section.label)}</h1>
            <p>${escapeHtml(section.detail)}</p>
          </div>

          <div class="public-menu-groups">
            ${section.groups.map((group) => `
              <section class="public-menu-group">
                <h2>${escapeHtml(group.category)}</h2>

                <div class="public-menu-items">
                  ${group.items.map((product) => `
                    <article class="public-menu-item">
                      <div>
                        <strong>${escapeHtml(product.name)}</strong>
                        ${
                          product.description
                            ? `<p>${escapeHtml(product.description)}</p>`
                            : ""
                        }
                      </div>

                      <span>${formatMoney(product.price)}</span>
                    </article>
                  `).join("")}
                </div>
              </section>
            `).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function formatPublicMenuDate(value) {
  if (!value) return "hoy";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "hoy";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}


function getPeriodRange(type = "semana", value = getDateKey(new Date())) {
  const safeValue = value || getDateKey(new Date());
  const anchor = new Date(`${safeValue}T12:00:00`);

  if (Number.isNaN(anchor.getTime())) {
    return getPeriodRange("semana", getDateKey(new Date()));
  }

  const start = new Date(anchor);
  const end = new Date(anchor);

  if (type === "ano") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  } else if (type === "mes") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else {
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  }

  return {
    startKey: getDateKey(start),
    endKey: getDateKey(end),
    label: periodLabel(type, start, end)
  };
}

function periodLabel(type, start, end) {
  const format = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  if (type === "ano") {
    return `Anual ${start.getFullYear()}`;
  }

  if (type === "mes") {
    return new Intl.DateTimeFormat("es-MX", {
      month: "long",
      year: "numeric"
    }).format(start);
  }

  return `Semana ${format.format(start)} - ${format.format(end)}`;
}

async function loadPeriodFinance() {
  const content = document.querySelector("#period-report-content");
  if (!content || !firebaseReady || !db) return;

  const range = getPeriodRange(financePeriodType, financePeriodDate);

  content.innerHTML = `<div class="empty-state">Cargando reporte ${escapeHtml(range.label)}...</div>`;

  try {
    const snapshot = await getDocs(query(
      collection(db, "tickets"),
      where("status", "==", "finalizado"),
      where("dateKey", ">=", range.startKey),
      where("dateKey", "<=", range.endKey)
    ));

    currentPeriodTickets = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.dateKey || "").localeCompare(String(b.dateKey || "")));

    paintPeriodFinance(currentPeriodTickets, range);
  } catch (error) {
    content.innerHTML = `<div class="alert">Error al leer reporte por periodo: ${escapeHtml(error.message)}</div>`;
  }
}

function paintPeriodFinance(tickets, range) {
  const content = document.querySelector("#period-report-content");
  if (!content) return;

  const summary = getFinanceSummary(tickets);
  const dailyRows = getFinanceDailyRows(tickets);
  const productRows = getFinanceProductRows(tickets);
  const digitalTotal = summary.card + summary.transfer;

  content.innerHTML = `
    <div class="period-report-resume">
      <div>
        <span>Periodo</span>
        <strong>${escapeHtml(range.label)}</strong>
        <small>${escapeHtml(range.startKey)} a ${escapeHtml(range.endKey)}</small>
      </div>

      <div>
        <span>Ingreso total</span>
        <strong>${formatMoney(summary.total)}</strong>
        <small>Ventas finalizadas</small>
      </div>

      <div>
        <span>Caja efectivo</span>
        <strong>${formatMoney(summary.cash)}</strong>
        <small>${percentage(summary.cash, summary.total)} del ingreso</small>
      </div>

      <div>
        <span>Cobro digital</span>
        <strong>${formatMoney(digitalTotal)}</strong>
        <small>Tarjeta + transferencia</small>
      </div>
    </div>

    <div class="finance-summary-grid period-metrics-grid">
      ${financeMetricCard("Tickets cerrados", summary.ticketCount, `${summary.mesaCount} mesas · ${summary.llevarCount} para llevar`)}
      ${financeMetricCard("Ticket promedio", formatMoney(summary.averageTicket), "Promedio por venta")}
      ${financeMetricCard("Productos vendidos", summary.items, `${summary.averageItems} por ticket`)}
      ${financeMetricCard("Producto top", summary.topProductName, `${summary.topProductQty} vendido(s)`)}
      ${financeMetricCard("Mayor venta", formatMoney(summary.highestTicketTotal), summary.highestTicketName)}
      ${financeMetricCard("Dias con venta", dailyRows.length, "Dias con tickets cerrados")}
    </div>

    <div class="finance-accounting-layout">
      <section class="finance-accounting-card card">
        <h3>Resumen contable</h3>
        ${financeSimpleRow("Ingreso bruto", formatMoney(summary.total), "Total del periodo")}
        ${financeSimpleRow("Efectivo", formatMoney(summary.cash), percentage(summary.cash, summary.total))}
        ${financeSimpleRow("Tarjeta", formatMoney(summary.card), percentage(summary.card, summary.total))}
        ${financeSimpleRow("Transferencia", formatMoney(summary.transfer), percentage(summary.transfer, summary.total))}
      </section>

      <section class="finance-accounting-card card">
        <h3>Ventas por dia</h3>
        ${dailyRows.length
          ? dailyRows.slice(0, 8).map((row) => financeSimpleRow(row.dateKey, formatMoney(row.total), `${row.count} ticket(s)`)).join("")
          : `<p class="finance-empty-small">Sin ventas en este periodo.</p>`
        }
      </section>

      <section class="finance-accounting-card card">
        <h3>Productos mas vendidos</h3>
        ${productRows.length
          ? productRows.slice(0, 8).map((row) => financeSimpleRow(row.name, `${row.qty} pza(s)`, formatMoney(row.total))).join("")
          : `<p class="finance-empty-small">Sin productos vendidos.</p>`
        }
      </section>
    </div>

    <div class="table-wrap finance-table-wrap period-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Ticket</th>
            <th>Tipo</th>
            <th>Pago</th>
            <th>Productos</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.length
            ? tickets.map((ticket) => {
                const items = (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
                return `
                  <tr>
                    <td>${escapeHtml(ticket.dateKey || "")}</td>
                    <td><strong>${escapeHtml(ticket.name || ticket.alias || "Ticket")}</strong></td>
                    <td>${escapeHtml(ticket.type || "mesa")}</td>
                    <td>${escapeHtml(paymentLabel(ticket.paymentMethod || ""))}</td>
                    <td>${items}</td>
                    <td><strong>${formatMoney(ticket.total)}</strong></td>
                  </tr>
                `;
              }).join("")
            : `<tr><td colspan="6">No hay ventas finalizadas para este periodo.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function getFinanceDailyRows(tickets) {
  const map = new Map();

  tickets.forEach((ticket) => {
    const key = ticket.dateKey || getDateKey(new Date());
    if (!map.has(key)) {
      map.set(key, { dateKey: key, count: 0, total: 0, items: 0 });
    }

    const row = map.get(key);
    row.count += 1;
    row.total += Number(ticket.total || 0);
    row.items += (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  });

  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function openDeleteFinanceTicketModal(ticketId) {
  const ticket = getFinishedTicket(ticketId) || currentPeriodTickets.find((item) => item.id === ticketId);

  if (!ticket) {
    showToast("No se encontro el ticket");
    return;
  }

  openModal("Eliminar ticket finalizado", `
    <div class="alert">
      Esta accion eliminara el ticket de Finanzas y ya no aparecera en reportes.
      <br><br>
      <strong>Ticket:</strong> ${escapeHtml(ticket.name || ticket.alias || "Ticket")}
      <br>
      <strong>Total:</strong> ${formatMoney(ticket.total)}
    </div>
  `, `
    <button class="btn btn-outline" data-action="close-modal">Cancelar</button>
    <button class="btn btn-danger" data-action="confirm-delete-finance-ticket" data-id="${ticket.id}">Eliminar definitivamente</button>
  `);
}

async function deleteFinanceTicket(ticketId) {
  if (!firebaseReady || !db) return showToast("Configura Firebase primero");

  await deleteDoc(doc(db, "tickets", ticketId));

  currentFinanceTickets = currentFinanceTickets.filter((ticket) => ticket.id !== ticketId);
  currentPeriodTickets = currentPeriodTickets.filter((ticket) => ticket.id !== ticketId);

  closeModal();
  showToast("Ticket eliminado de finanzas");

  await loadFinance(currentFinanceDate);
  await loadPeriodFinance();
}

function printPeriodReport() {
  if (!currentPeriodTickets.length) {
    showToast("Primero consulta un periodo con ventas");
    return;
  }

  const printWindow = window.open("", "_blank", "width=920,height=720");

  if (!printWindow) {
    showToast("Permite ventanas emergentes para imprimir");
    return;
  }

  const range = getPeriodRange(financePeriodType, financePeriodDate);

  printWindow.document.open();
  printWindow.document.write(buildPeriodPrintableReportHtml(currentPeriodTickets, range));
  printWindow.document.close();
  printWindow.focus();
}

function savePeriodPdfReport() {
  if (!window.jspdf) return showToast("No se pudo cargar jsPDF");
  if (!currentPeriodTickets.length) return showToast("Primero consulta un periodo con ventas");

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const pageHeight = docPdf.internal.pageSize.getHeight();
  const margin = 12;
  const range = getPeriodRange(financePeriodType, financePeriodDate);
  const summary = getFinanceSummary(currentPeriodTickets);
  const productRows = getFinanceProductRows(currentPeriodTickets);
  const dailyRows = getFinanceDailyRows(currentPeriodTickets);

  let y = 12;

  drawFinancePdfHeader(docPdf, pageWidth, margin, y);
  y += 28;

  docPdf.setTextColor(11, 15, 12);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.text(`Periodo: ${range.label}`, margin, y);
  docPdf.text(`Generado: ${formatTicketDateTimeFromDate(new Date())}`, pageWidth - margin, y, { align: "right" });
  y += 8;

  y = drawFinancePdfMetrics(docPdf, summary, margin, y, pageWidth);
  y += 8;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.setTextColor(30, 41, 32);
  docPdf.text("Ventas por dia", margin, y);
  y += 7;

  y = drawSimplePdfRows(docPdf, dailyRows.map((row) => [
    row.dateKey,
    `${row.count} ticket(s)`,
    `${row.items} productos`,
    formatMoney(row.total)
  ]), ["Fecha", "Tickets", "Productos", "Total"], margin, y, pageWidth, pageHeight);

  if (y > pageHeight - 58) {
    docPdf.addPage();
    y = 16;
  }

  y += 8;
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.setTextColor(30, 41, 32);
  docPdf.text("Productos mas vendidos", margin, y);
  y += 7;

  y = drawFinancePdfProductTable(docPdf, productRows.slice(0, 12), margin, y, pageWidth, pageHeight);

  if (y > pageHeight - 58) {
    docPdf.addPage();
    y = 16;
  }

  y += 8;
  y = drawFinancePdfTicketTable(docPdf, currentPeriodTickets, margin, y, pageWidth, pageHeight);

  addFinancePdfFooters(docPdf, pageWidth, pageHeight, margin);
  docPdf.save(`reporte_${financePeriodType}_esspreso_${range.startKey}_${range.endKey}.pdf`);
}

function buildPeriodPrintableReportHtml(tickets, range) {
  const summary = getFinanceSummary(tickets);
  const productRows = getFinanceProductRows(tickets);
  const dailyRows = getFinanceDailyRows(tickets);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Reporte ${escapeHtml(range.label)} esspreso</title>
        <style>
          @page { size: letter; margin: 12mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; color: #0B0F0C; background: #ffffff; }
          .header { padding: 12px 14px; border-radius: 14px; background: #1E2920; color: #F0F4F1; }
          .header h1 { margin: 0; font-size: 22px; }
          .header p { margin: 4px 0 0; color: #D6E1D8; font-size: 12px; }
          .meta { display: flex; justify-content: space-between; gap: 12px; margin: 12px 0; font-size: 12px; color: #3D5241; font-weight: 700; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 12px; }
          .metric { min-height: 58px; padding: 8px; border: 1px solid #D6E1D8; border-radius: 10px; background: #F0F4F1; }
          .metric span { display: block; font-size: 10px; color: #59785F; font-weight: 700; }
          .metric strong { display: block; margin-top: 4px; font-size: 16px; }
          .metric small { display: block; margin-top: 3px; font-size: 9px; color: #59785F; }
          h2 { margin: 12px 0 6px; font-size: 14px; color: #1E2920; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          th { padding: 6px; background: #D6E1D8; color: #1E2920; text-align: left; border: 1px solid #BCCDBF; }
          td { padding: 6px; border: 1px solid #D6E1D8; vertical-align: top; }
          .money { text-align: right; }
          .note { margin-top: 10px; font-size: 10px; color: #59785F; text-align: center; }
        </style>
      </head>

      <body>
        <header class="header">
          <h1>Reporte ${escapeHtml(financePeriodType)}</h1>
          <p>esspreso cafe y sabor · ${escapeHtml(range.label)}</p>
        </header>

        <div class="meta">
          <span>Periodo: ${escapeHtml(range.startKey)} a ${escapeHtml(range.endKey)}</span>
          <span>Generado: ${escapeHtml(formatTicketDateTimeFromDate(new Date()))}</span>
        </div>

        <section class="metrics">
          ${printMetric("Ingreso total", formatMoney(summary.total), "Ingreso bruto")}
          ${printMetric("Efectivo", formatMoney(summary.cash), "Caja")}
          ${printMetric("Tarjeta", formatMoney(summary.card), "Terminal")}
          ${printMetric("Transferencia", formatMoney(summary.transfer), "Banco")}
          ${printMetric("Tickets", summary.ticketCount, `${summary.mesaCount} mesas · ${summary.llevarCount} llevar`)}
          ${printMetric("Promedio", formatMoney(summary.averageTicket), "Ticket promedio")}
          ${printMetric("Productos", summary.items, `${summary.averageItems} por ticket`)}
          ${printMetric("Top", summary.topProductName, `${summary.topProductQty} vendido(s)`)}
        </section>

        <h2>Ventas por dia</h2>
        ${periodPrintableDailyTable(dailyRows)}

        <h2>Productos mas vendidos</h2>
        ${financePrintableProductTable(productRows.slice(0, 12))}

        <h2>Detalle de tickets</h2>
        ${financePrintableTicketTable(tickets)}

        <p class="note">Reporte generado desde el punto de venta esspreso.</p>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
    </html>
  `;
}

function periodPrintableDailyTable(rows) {
  if (!rows.length) {
    return `<p>No hay ventas en este periodo.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tickets</th>
          <th>Productos</th>
          <th class="money">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.dateKey)}</td>
            <td>${row.count}</td>
            <td>${row.items}</td>
            <td class="money">${formatMoney(row.total)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function drawSimplePdfRows(docPdf, rows, headers, margin, y, pageWidth, pageHeight) {
  const usableWidth = pageWidth - margin * 2;
  const colWidth = usableWidth / headers.length;

  function drawHeader() {
    docPdf.setFillColor(214, 225, 216);
    docPdf.rect(margin, y, usableWidth, 7, "F");
    docPdf.setTextColor(30, 41, 32);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(7.5);

    headers.forEach((header, index) => {
      docPdf.text(header, margin + index * colWidth + 2, y + 4.7);
    });

    y += 8;
  }

  drawHeader();

  rows.forEach((row) => {
    if (y > pageHeight - 20) {
      docPdf.addPage();
      y = 16;
      drawHeader();
    }

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(8);
    docPdf.setTextColor(11, 15, 12);

    row.forEach((value, index) => {
      const align = index === row.length - 1 ? "right" : "left";
      const x = align === "right" ? margin + (index + 1) * colWidth - 2 : margin + index * colWidth + 2;
      docPdf.text(String(value), x, y + 5, { align });
    });

    docPdf.setDrawColor(214, 225, 216);
    docPdf.line(margin, y + 8, pageWidth - margin, y + 8);
    y += 9;
  });

  return y;
}

async function loadFinance(dateKey) {
  if (!firebaseReady || !db) return;
  try {
    const snapshot = await getDocs(query(
      collection(db, "tickets"),
      where("status", "==", "finalizado"),
      where("dateKey", "==", dateKey)
    ));
    currentFinanceTickets = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    paintFinance(currentFinanceTickets);
  } catch (error) {
    document.querySelector("#finance-content").innerHTML = `<div class="alert">Error al leer finanzas: ${escapeHtml(error.message)}</div>`;
  }
}

function paintFinance(tickets) {
  const content = document.querySelector("#finance-content");
  if (!content) return;

  const summary = getFinanceSummary(tickets);
  const productRows = getFinanceProductRows(tickets);
  const ticketTypeRows = getFinanceTypeRows(tickets);

  content.innerHTML = `
    <div class="finance-summary-grid">
      ${financeMetricCard("Venta total", formatMoney(summary.total), "Ingreso bruto del dia")}
      ${financeMetricCard("Efectivo", formatMoney(summary.cash), "Caja recibida")}
      ${financeMetricCard("Tarjeta", formatMoney(summary.card), "Cobros con terminal")}
      ${financeMetricCard("Transferencia", formatMoney(summary.transfer), "Pagos bancarios")}
      ${financeMetricCard("Tickets cerrados", summary.ticketCount, `${summary.mesaCount} mesas · ${summary.llevarCount} para llevar`)}
      ${financeMetricCard("Ticket promedio", formatMoney(summary.averageTicket), "Venta promedio por orden")}
      ${financeMetricCard("Productos vendidos", summary.items, `${summary.averageItems} productos por ticket`)}
      ${financeMetricCard("Producto top", summary.topProductName, `${summary.topProductQty} vendido(s)`)}
    </div>

    <div class="finance-accounting-layout">
      <section class="finance-accounting-card card">
        <h3>Resumen de cobros</h3>
        ${financeSimpleRow("Efectivo", formatMoney(summary.cash), percentage(summary.cash, summary.total))}
        ${financeSimpleRow("Tarjeta", formatMoney(summary.card), percentage(summary.card, summary.total))}
        ${financeSimpleRow("Transferencia", formatMoney(summary.transfer), percentage(summary.transfer, summary.total))}
        <div class="finance-accounting-total">
          <span>Total cobrado</span>
          <strong>${formatMoney(summary.total)}</strong>
        </div>
      </section>

      <section class="finance-accounting-card card">
        <h3>Operacion del dia</h3>
        ${financeSimpleRow("Mesas", `${summary.mesaCount} ticket(s)`, formatMoney(summary.mesaTotal))}
        ${financeSimpleRow("Para llevar", `${summary.llevarCount} ticket(s)`, formatMoney(summary.llevarTotal))}
        ${financeSimpleRow("Mayor venta", formatMoney(summary.highestTicketTotal), escapeHtml(summary.highestTicketName))}
        ${financeSimpleRow("Lineas vendidas", summary.lines, `${summary.items} piezas`)}
      </section>

      <section class="finance-accounting-card card">
        <h3>Productos mas vendidos</h3>
        ${productRows.length
          ? productRows.slice(0, 5).map((row) => financeSimpleRow(row.name, `${row.qty} pza(s)`, formatMoney(row.total))).join("")
          : `<p class="finance-empty-small">Sin productos vendidos.</p>`
        }
      </section>
    </div>

    <div class="finance-layout finance-layout-compact">
      <section class="chart-card card">
        <h3>Ventas por metodo de pago</h3>
        <canvas id="payment-chart"></canvas>
      </section>

      <section class="chart-card card">
        <h3>Ventas por ticket</h3>
        <canvas id="finance-chart"></canvas>
      </section>
    </div>

    <div class="section-title finance-table-title">
      <div>
        <h2 style="font-size:28px;">Tickets finalizados</h2>
        <p>${escapeHtml(currentFinanceDate)} · ${tickets.length} ticket(s)</p>
      </div>
    </div>

    <div class="table-wrap finance-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Tipo</th>
            <th>Pago</th>
            <th>Productos</th>
            <th>Total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${
            tickets.length
              ? tickets.map(ticketFinanceRow).join("")
              : `<tr><td colspan="6">No hay ventas finalizadas para esta fecha.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  drawPaymentChart([summary.cash, summary.card, summary.transfer]);
  drawFinanceChart(tickets);
}

function financeMetricCard(label, value, detail = "") {
  return `
    <article class="metric-card finance-metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </article>
  `;
}

function metricCard(label, value) {
  return financeMetricCard(label, value);
}

function financeSimpleRow(label, value, detail = "") {
  return `
    <div class="finance-simple-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
}

function sumByPayment(tickets, method) {
  return tickets
    .filter((ticket) => ticket.paymentMethod === method)
    .reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
}

function percentage(value, total) {
  const number = total ? Math.round((Number(value || 0) / Number(total || 0)) * 100) : 0;
  return `${number}%`;
}

function getFinanceSummary(tickets) {
  const total = tickets.reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
  const cash = sumByPayment(tickets, "efectivo");
  const card = sumByPayment(tickets, "tarjeta");
  const transfer = sumByPayment(tickets, "transferencia");
  const ticketCount = tickets.length;
  const items = tickets.reduce((sum, ticket) => sum + (ticket.items || []).reduce((s, item) => s + Number(item.qty || 0), 0), 0);
  const lines = tickets.reduce((sum, ticket) => sum + (ticket.items || []).length, 0);
  const mesaTickets = tickets.filter((ticket) => (ticket.type || "mesa") === "mesa");
  const llevarTickets = tickets.filter((ticket) => (ticket.type || "") === "llevar");
  const mesaTotal = mesaTickets.reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
  const llevarTotal = llevarTickets.reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
  const productRows = getFinanceProductRows(tickets);
  const topProduct = productRows[0];
  const highestTicket = [...tickets].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];

  return {
    total,
    cash,
    card,
    transfer,
    ticketCount,
    items,
    lines,
    mesaCount: mesaTickets.length,
    llevarCount: llevarTickets.length,
    mesaTotal,
    llevarTotal,
    averageTicket: ticketCount ? total / ticketCount : 0,
    averageItems: ticketCount ? (items / ticketCount).toFixed(1) : "0",
    topProductName: topProduct?.name || "Sin ventas",
    topProductQty: topProduct?.qty || 0,
    highestTicketName: highestTicket?.name || highestTicket?.alias || "Sin ventas",
    highestTicketTotal: highestTicket?.total || 0
  };
}

function getFinanceProductRows(tickets) {
  const map = new Map();

  tickets.forEach((ticket) => {
    (ticket.items || []).forEach((item) => {
      const key = `${item.name || "Producto"}|${item.category || "Sin categoria"}|${Number(item.price || 0)}`;
      if (!map.has(key)) {
        map.set(key, {
          name: item.name || "Producto",
          category: item.category || "Sin categoria",
          price: Number(item.price || 0),
          qty: 0,
          total: 0
        });
      }

      const row = map.get(key);
      row.qty += Number(item.qty || 0);
      row.total += Number(item.subtotal || (Number(item.price || 0) * Number(item.qty || 0)));
    });
  });

  return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.total - a.total);
}

function getFinanceTypeRows(tickets) {
  const types = [
    { key: "mesa", label: "Mesas" },
    { key: "llevar", label: "Para llevar" }
  ];

  return types.map((type) => {
    const list = tickets.filter((ticket) => (ticket.type || "mesa") === type.key);
    const total = list.reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
    return { ...type, count: list.length, total };
  });
}

function ticketFinanceRow(ticket) {
  const items = (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);

  return `
    <tr>
      <td>
        <strong>${escapeHtml(ticket.name || ticket.alias || "Ticket")}</strong>
        <br>
        <span class="table-muted">${escapeHtml(formatTicketDateTime(ticket.closedAt || ticket.createdAt))}</span>
      </td>
      <td>${escapeHtml(ticket.type || "mesa")}</td>
      <td>${escapeHtml(paymentLabel(ticket.paymentMethod || ""))}</td>
      <td>${items}</td>
      <td><strong>${formatMoney(ticket.total)}</strong></td>
      <td>
        <div class="finance-ticket-actions">
          <button class="btn btn-soft btn-small" data-action="view-finished-ticket" data-id="${ticket.id}">
            Ver ticket
          </button>
          <button class="btn btn-outline btn-small" data-action="print-ticket" data-id="${ticket.id}">
            Reimprimir
          </button>
          <button class="btn btn-danger btn-small" data-action="delete-finance-ticket" data-id="${ticket.id}">
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  `;
}

function paymentLabel(method) {
  const labels = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia"
  };

  return labels[method] || method || "Sin dato";
}

function formatTicketDateTime(timestamp) {
  if (!timestamp?.seconds) return "Sin dato";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp.seconds * 1000));
}

function getFinishedTicket(ticketId) {
  return currentFinanceTickets.find((ticket) => ticket.id === ticketId);
}

function openFinishedTicketModal(ticketId) {
  const ticket = getFinishedTicket(ticketId);

  if (!ticket) {
    showToast("No se encontro el ticket");
    return;
  }

  const totalItems = (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);

  openModal(`Ticket finalizado`, `
    <section class="ticket-detail">
      <div class="ticket-detail-logo">
        <img src="/assets/logo-esspreso.jpeg" alt="Logo esspreso">
      </div>

      <div class="ticket-detail-header">
        <div>
          <span class="badge badge-dark">Finalizado</span>
          <h3>${escapeHtml(ticket.name || ticket.alias || "Ticket")}</h3>
          <p>${escapeHtml(ticket.type || "mesa")} · ${escapeHtml(paymentLabel(ticket.paymentMethod))}</p>
        </div>

        <div class="ticket-detail-total">
          <span>Total</span>
          <strong>${formatMoney(ticket.total)}</strong>
        </div>
      </div>

      <div class="ticket-detail-grid">
        <div>
          <span>Fecha de apertura</span>
          <strong>${escapeHtml(formatTicketDateTime(ticket.createdAt))}</strong>
        </div>

        <div>
          <span>Fecha de cobro</span>
          <strong>${escapeHtml(formatTicketDateTime(ticket.closedAt))}</strong>
        </div>

        <div>
          <span>Metodo de pago</span>
          <strong>${escapeHtml(paymentLabel(ticket.paymentMethod))}</strong>
        </div>

        <div>
          <span>Productos</span>
          <strong>${totalItems}</strong>
        </div>
      </div>

      ${finishedTicketItemsTable(ticket)}

      <div class="total-line ticket-detail-final-total">
        <span>Total pagado</span>
        <strong>${formatMoney(ticket.total)}</strong>
      </div>
    </section>
  `, `
    <button class="btn btn-outline" data-action="close-modal">Cerrar</button>
    <button class="btn btn-soft" data-action="pdf-ticket" data-id="${ticket.id}">Guardar PDF</button>
    <button class="btn btn-primary" data-action="print-ticket" data-id="${ticket.id}">Reimprimir ticket</button>
  `);
}

function finishedTicketItemsTable(ticket) {
  const items = ticket.items || [];

  if (!items.length) {
    return `<div class="empty-state">Este ticket no tiene productos registrados.</div>`;
  }

  return `
    <div class="table-wrap ticket-detail-table">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoria</th>
            <th>Precio</th>
            <th>Cantidad</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.name || "Producto")}</strong>${renderItemOptions(item)}</td>
              <td>${escapeHtml(item.category || "Sin categoria")}</td>
              <td>${formatMoney(item.price)}</td>
              <td>${Number(item.qty || 0)}</td>
              <td><strong>${formatMoney(item.subtotal)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildPrintableTicketHtml(ticket) {
  const items = ticket.items || [];
  const totalItems = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Ticket ${escapeHtml(ticket.name || "esspreso")}</title>

        <style>
          @page {
            size: 58mm auto;
            margin: 2mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            width: 58mm;
            background: #ffffff;
            color: #000000;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            line-height: 1.25;
          }

          .ticket {
            width: 54mm;
            margin: 0 auto;
            padding: 2mm 0;
          }

          .center { text-align: center; }

          .logo {
            width: 36mm;
            margin: 0 auto 3mm;
          }

          .logo img {
            width: 100%;
            height: auto;
            display: block;
          }

          h1 {
            margin: 0;
            font-size: 15px;
            font-weight: 800;
            text-align: center;
          }

          .subtitle {
            margin: 1mm 0 2mm;
            font-size: 10px;
            text-align: center;
          }

          .line {
            border-top: 1px dashed #000;
            margin: 2mm 0;
          }

          .info {
            font-size: 10px;
          }

          .info div {
            display: flex;
            justify-content: space-between;
            gap: 4px;
            margin-bottom: 1mm;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
          }

          th {
            padding-bottom: 1mm;
            border-bottom: 1px dashed #000;
            text-align: left;
            font-weight: 800;
          }

          th:last-child,
          td:last-child {
            text-align: right;
          }

          td {
            padding: 1.5mm 0;
            vertical-align: top;
            border-bottom: 1px dotted #aaa;
          }

          .product-name {
            font-weight: 700;
          }

          .item-note {
            display: block;
            margin-top: 1mm;
            font-size: 9px;
            font-style: italic;
            text-align: left;
          }

          .small {
            font-size: 9px;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 5px;
            margin-top: 3mm;
            font-size: 15px;
            font-weight: 900;
          }

          .thanks {
            margin-top: 4mm;
            text-align: center;
            font-size: 10px;
          }

          .cut-space {
            height: 10mm;
          }

          @media print {
            html, body {
              width: 58mm;
              margin: 0;
              padding: 0;
            }

            .ticket {
              width: 54mm;
            }
          }
        </style>
      </head>

      <body>
        <main class="ticket">
          <div class="logo">
            <img src="/assets/logo-esspreso.png" alt="esspreso">
          </div>

          <h1>Ticket de venta</h1>
          <p class="subtitle">esspreso cafe y sabor</p>

          <div class="line"></div>

          <section class="info">
            <div><strong>Ticket:</strong><span>${escapeHtml(ticket.name || ticket.alias || "Ticket")}</span></div>
            <div><strong>Tipo:</strong><span>${escapeHtml(ticket.type || "mesa")}</span></div>
            <div><strong>Pago:</strong><span>${escapeHtml(paymentLabel(ticket.paymentMethod))}</span></div>
            <div><strong>Fecha:</strong><span>${escapeHtml(formatTicketDateTime(ticket.closedAt || ticket.createdAt))}</span></div>
            <div><strong>Productos:</strong><span>${totalItems}</span></div>
          </section>

          <div class="line"></div>

          <table>
            <thead><tr><th>Producto</th><th>Total</th></tr></thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>
                    <span class="product-name">${Number(item.qty || 0)} x ${escapeHtml(item.name || "Producto")}</span>
                    <br>
                    <span class="small">${formatMoney(item.price)} c/u</span>
                    ${normalizeOptions(item.options || item.notes) ? `<span class="item-note">Nota: ${escapeHtml(normalizeOptions(item.options || item.notes))}</span>` : ""}
                  </td>
                  <td>${formatMoney(item.subtotal)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="line"></div>
          <div class="total-row"><span>TOTAL</span><span>${formatMoney(ticket.total)}</span></div>
          <div class="line"></div>

          <p class="thanks">Gracias por tu compra<br>Vuelve pronto</p>
          <div class="cut-space"></div>
        </main>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `;
}

function printSingleTicket(ticketId) {
  const ticket = getFinishedTicket(ticketId);

  if (!ticket) {
    showToast("No se encontro el ticket");
    return;
  }

  const printWindow = window.open("", "_blank", "width=420,height=700");

  if (!printWindow) {
    showToast("Permite ventanas emergentes para imprimir");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintableTicketHtml(ticket));
  printWindow.document.close();
  printWindow.focus();
}

function saveSingleTicketPdf(ticketId) {
  const ticket = getFinishedTicket(ticketId);

  if (!ticket) {
    showToast("No se encontro el ticket");
    return;
  }

  if (!window.jspdf) {
    showToast("No se pudo cargar jsPDF");
    return;
  }

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();
  const items = ticket.items || [];

  let y = 18;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(18);
  docPdf.text("Ticket de venta - esspreso", 14, y);

  y += 10;
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(11);
  docPdf.text(`Ticket: ${ticket.name || ticket.alias || "Ticket"}`, 14, y); y += 7;
  docPdf.text(`Tipo: ${ticket.type || "mesa"}`, 14, y); y += 7;
  docPdf.text(`Metodo de pago: ${paymentLabel(ticket.paymentMethod)}`, 14, y); y += 7;
  docPdf.text(`Apertura: ${formatTicketDateTime(ticket.createdAt)}`, 14, y); y += 7;
  docPdf.text(`Cobro: ${formatTicketDateTime(ticket.closedAt)}`, 14, y); y += 10;

  docPdf.setFont("helvetica", "bold");
  docPdf.text("Productos", 14, y);
  y += 8;

  docPdf.setFont("helvetica", "normal");

  items.forEach((item) => {
    if (y > 270) {
      docPdf.addPage();
      y = 18;
    }

    const line = `${Number(item.qty || 0)} x ${item.name || "Producto"} - ${formatMoney(item.subtotal)}`;
    const wrapped = docPdf.splitTextToSize(line, 180);

    docPdf.text(wrapped, 14, y);
    y += wrapped.length * 6;

    docPdf.setFontSize(9);
    docPdf.text(`Categoria: ${item.category || "Sin categoria"} | Precio: ${formatMoney(item.price)}`, 18, y);
    y += 5;

    const options = normalizeOptions(item.options || "");
    if (options) {
      const optionsWrapped = docPdf.splitTextToSize(`Indicaciones: ${options}`, 170);
      docPdf.text(optionsWrapped, 18, y);
      y += optionsWrapped.length * 5;
    }

    docPdf.setFontSize(11);
    y += 4;
  });

  y += 4;
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(16);
  docPdf.text(`Total: ${formatMoney(ticket.total)}`, 14, y);

  docPdf.save(`ticket_${ticket.name || ticket.alias || "esspreso"}.pdf`);
}

function drawPaymentChart(values) {
  const canvas = document.querySelector("#payment-chart");
  if (!canvas || !window.Chart) return;
  paymentChart?.destroy();
  paymentChart = new window.Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Efectivo", "Tarjeta", "Transferencia"],
      datasets: [{
        data: values,
        backgroundColor: ["#6C9373", "#3D5241", "#BCCDBF"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${formatMoney(context.raw)}`
          }
        }
      }
    }
  });
}

function drawFinanceChart(tickets) {
  const canvas = document.querySelector("#finance-chart");
  if (!canvas || !window.Chart) return;
  const labels = tickets.map((ticket) => shortTicketLabel(ticket.name || ticket.alias || "Ticket"));
  const data = tickets.map((ticket) => Number(ticket.total || 0));
  financeChart?.destroy();
  financeChart = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total",
        data,
        backgroundColor: "#87A68D",
        borderRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Total: ${formatMoney(context.raw)}`
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
        y: { beginAtZero: true }
      }
    }
  });
}

function shortTicketLabel(value) {
  const text = String(value || "Ticket");
  return text.length > 16 ? `${text.slice(0, 16)}...` : text;
}

function openNewTicketModal() {
  openModal("Nuevo ticket o mesa", `
    <div class="form-grid">
      <div class="form-group">
        <label for="ticket-type">Tipo</label>
        <select id="ticket-type">
          <option value="mesa">Mesa</option>
          <option value="llevar">Para llevar</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ticket-alias">Sobrenombre</label>
        <input id="ticket-alias" placeholder="Ejemplo: Martin, Mesa 3, Muchacholentes" autocomplete="off">
      </div>
      <div class="form-group full">
        <div class="alert">El nombre se guardara como fecha + sobrenombre. Ejemplo: ${displayDate(new Date())}_Martin</div>
      </div>
    </div>
  `, `
    <button class="btn btn-outline" data-action="close-modal">Cancelar</button>
    <button class="btn btn-primary" data-action="create-ticket">Crear ticket</button>
  `);
}

async function createTicket() {
  if (!firebaseReady || !db) return showToast("Configura Firebase primero");

  const alias = document.querySelector("#ticket-alias")?.value || "Cliente";
  const type = document.querySelector("#ticket-type")?.value || "mesa";
  const name = makeTicketName(alias);
  const now = new Date();

  const newTicketData = {
    name,
    alias: String(alias).trim() || "Cliente",
    type,
    status: "activo",
    items: [],
    total: 0,
    dateKey: getDateKey(now),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ticketRef = await addDoc(collection(db, "tickets"), newTicketData);

  const localTicket = {
    id: ticketRef.id,
    ...newTicketData,
    createdAt: {
      seconds: Math.floor(now.getTime() / 1000)
    },
    updatedAt: {
      seconds: Math.floor(now.getTime() / 1000)
    }
  };

  const alreadyExists = activeTickets.some((ticket) => ticket.id === ticketRef.id);
  if (!alreadyExists) {
    activeTickets = [localTicket, ...activeTickets];
  }

  showToast("Ticket creado");
  openTicketModal(ticketRef.id);
}

function openTicketModal(ticketId) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (!ticket) return showToast("No se encontro el ticket");

  const activeProducts = products.filter((product) => product.active !== false);
  const categories = [...new Set(activeProducts.map((product) => product.category || "Sin categoria"))];
  const firstCategory = categories[0] || "";
  const productOptions = productOptionsByCategory(firstCategory);
  const preparedLock = hasPreparedItems(ticket);

  openModal(`Orden: ${ticket.name || "Ticket"}`, `
    <div class="ticket-meta">
      <span class="badge badge-dark">${escapeHtml(ticket.type || "mesa")}</span>
      <span class="badge">${escapeHtml(displayTicketDate(ticket.createdAt))}</span>
      <span class="badge">${(ticket.items || []).length} linea(s)</span>
      ${preparedLock ? `<span class="badge badge-green">Tiene productos preparados</span>` : `<span class="badge badge-red">En preparacion</span>`}
    </div>

    ${preparedLock ? `<div class="alert">Los productos marcados como preparados ya no se pueden modificar ni eliminar.</div>` : ""}

    <div class="form-grid">
      <div class="form-group">
        <label for="ticket-category">Categoria</label>
        <select id="ticket-category" data-action="ticket-category-change">
          ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="ticket-product">Producto</label>
        <select id="ticket-product">${productOptions}</select>
      </div>
      <div class="form-group">
        <label for="ticket-qty">Cantidad</label>
        <input id="ticket-qty" type="number" min="1" value="1">
      </div>
      <div class="form-group" style="align-self:end;">
        <button class="btn btn-primary" data-action="add-item" data-id="${ticket.id}">Agregar al ticket</button>
      </div>
      <div class="form-group full">
        <label for="ticket-options">Opciones o indicaciones para cocina</label>
        <textarea id="ticket-options" class="ticket-options-input" placeholder="Ejemplo: sin fresas, con nutella, poco hielo, sin cebolla..."></textarea>
      </div>
    </div>
    <div style="height:16px;"></div>
    ${ticketItemsTable(ticket)}
    <div class="total-line"><span>Total de mesa/ticket</span><strong>${formatMoney(ticket.total)}</strong></div>
  `, `
    <button class="btn btn-outline" data-action="delete-ticket" data-id="${ticket.id}">Cancelar ticket</button>
    <button class="btn btn-soft" data-action="close-modal">Regresar</button>
    <button class="btn btn-primary" data-action="pay-ticket" data-id="${ticket.id}">Pagar</button>
  `);
}

function productOptionsByCategory(category) {
  return products
    .filter((product) => product.active !== false && (product.category || "Sin categoria") === category)
    .map((product) => `<option value="${product.id}">${escapeHtml(product.name)} · ${formatMoney(product.price)}</option>`)
    .join("");
}

function ticketItemsTable(ticket) {
  const items = ticket.items || [];
  if (!items.length) return `<div class="empty-state">Aun no hay productos agregados.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Producto</th><th>Estado cocina</th><th>Precio</th><th>Cantidad</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
          ${items.map((item, index) => {
            const prepared = isItemPrepared(item);
            const status = itemKitchenStatus(item);
            return `
              <tr class="${prepared ? "ticket-row-prepared" : "ticket-row-preparation"}">
                <td>
                  ${escapeHtml(item.name)}
                  <br>
                  <span style="color:var(--color-600); font-size:12px;">${escapeHtml(item.category || "")}</span>
                  ${renderItemOptions(item)}
                </td>
                <td><span class="status-mini ${kitchenStatusClass(status)}">${kitchenStatusLabel(status)}</span></td>
                <td>${formatMoney(item.price)}</td>
                <td>
                  <span class="qty-control">
                    <input type="number" min="1" value="${Number(item.qty || 1)}" data-action="change-qty" data-id="${ticket.id}" data-index="${index}" ${prepared ? "disabled" : ""}>
                  </span>
                </td>
                <td><strong>${formatMoney(item.subtotal)}</strong></td>
                <td>
                  ${prepared
                    ? `<button class="icon-btn" title="Producto preparado" disabled>🔒</button>`
                    : `<button class="icon-btn" data-action="remove-item" data-id="${ticket.id}" data-index="${index}" title="Eliminar">🗑</button>`
                  }
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function addItemToTicket(ticketId) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  const productId = document.querySelector("#ticket-product")?.value;
  const qty = Math.max(1, Number(document.querySelector("#ticket-qty")?.value || 1));
  const options = normalizeOptions(document.querySelector("#ticket-options")?.value || "");
  const product = products.find((item) => item.id === productId);
  if (!ticket || !product) return showToast("Selecciona un producto valido");

  const items = [...(ticket.items || [])];
  const existing = items.find((item) => (
    item.productId === product.id &&
    item.price === product.price &&
    normalizeOptions(item.options || "") === options &&
    !isItemPrepared(item)
  ));

  if (existing) {
    existing.qty = Number(existing.qty || 0) + qty;
    existing.subtotal = existing.qty * Number(existing.price || 0);
    existing.options = options;
    existing.kitchenStatus = itemKitchenStatus(existing);
    existing.kitchenUpdatedAt = new Date().toISOString();
  } else {
    items.push({
      lineId: makeLineId(),
      productId: product.id,
      name: product.name,
      category: product.category,
      price: Number(product.price || 0),
      qty,
      options,
      subtotal: Number(product.price || 0) * qty,
      kitchenStatus: "preparacion",
      kitchenCreatedAt: new Date().toISOString(),
      kitchenUpdatedAt: new Date().toISOString()
    });
  }

  await saveTicketItems(ticketId, items);
  showToast("Producto agregado a cocina");
  openTicketModal(ticketId);
}

async function saveTicketItems(ticketId, items) {
  const normalizedItems = items.map((item) => ({
    ...item,
    lineId: item.lineId || makeLineId(),
    options: normalizeOptions(item.options || item.notes || item.kitchenNotes || ""),
    kitchenStatus: itemKitchenStatus(item),
    subtotal: Number(item.qty || 0) * Number(item.price || 0)
  }));
  const total = normalizedItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const index = activeTickets.findIndex((item) => item.id === ticketId);
  if (index >= 0) activeTickets[index] = { ...activeTickets[index], items: normalizedItems, total };
  await updateDoc(doc(db, "tickets", ticketId), {
    items: normalizedItems,
    total,
    updatedAt: serverTimestamp()
  });
}

async function removeItem(ticketId, itemIndex) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (!ticket) return;

  const items = [...(ticket.items || [])];
  const index = Number(itemIndex);
  if (!items[index]) return;
  if (isItemPrepared(items[index])) return showToast("No puedes eliminar un producto preparado");

  items.splice(index, 1);
  await saveTicketItems(ticketId, items);
  showToast("Producto eliminado");
  openTicketModal(ticketId);
}

async function changeQty(input) {
  const ticketId = input.dataset.id;
  const itemIndex = Number(input.dataset.index);
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (!ticket) return;

  const items = [...(ticket.items || [])];
  const qty = Math.max(1, Number(input.value || 1));
  if (!items[itemIndex]) return;
  if (isItemPrepared(items[itemIndex])) return showToast("No puedes modificar un producto preparado");

  items[itemIndex].qty = qty;
  items[itemIndex].subtotal = qty * Number(items[itemIndex].price || 0);
  items[itemIndex].kitchenStatus = itemKitchenStatus(items[itemIndex]);
  items[itemIndex].kitchenUpdatedAt = new Date().toISOString();

  await saveTicketItems(ticketId, items);
  openTicketModal(ticketId);
}

function openPayModal(ticketId) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (!ticket) return;
  if (!ticket.items?.length) return showToast("Agrega productos antes de cobrar");
  openModal("Finalizar cobro", `
    <div class="total-line"><span>Total a pagar</span><strong>${formatMoney(ticket.total)}</strong></div>
    <div class="form-group">
      <label for="payment-method">Metodo de pago</label>
      <select id="payment-method">
        <option value="efectivo">Efectivo</option>
        <option value="tarjeta">Tarjeta</option>
        <option value="transferencia">Transferencia</option>
      </select>
    </div>
    <div class="alert" style="margin-top:14px;">Al finalizar, este ticket pasara a Finanzas y desaparecera de ventas activas.</div>
  `, `
    <button class="btn btn-outline" data-action="open-ticket" data-id="${ticket.id}">Regresar</button>
    <button class="btn btn-primary" data-action="finish-ticket" data-id="${ticket.id}">Finalizar venta</button>
  `);
}

async function finishTicket(ticketId) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  const paymentMethod = document.querySelector("#payment-method")?.value || "efectivo";
  if (!ticket) return;
  await updateDoc(doc(db, "tickets", ticketId), {
    status: "finalizado",
    paymentMethod,
    dateKey: getDateKey(new Date()),
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  closeModal();
  showToast("Venta finalizada");
}

async function deleteTicket(ticketId) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (hasPreparedItems(ticket)) return showToast("No puedes eliminar un ticket con productos preparados");
  if (!window.confirm("Seguro que quieres cancelar y eliminar este ticket activo?")) return;
  await deleteDoc(doc(db, "tickets", ticketId));
  closeModal();
  showToast("Ticket cancelado");
}

async function markKitchenItemPrepared(ticketId, itemIndex) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (!ticket) return showToast("No se encontro el ticket");

  const items = [...(ticket.items || [])];
  const index = Number(itemIndex);
  if (!items[index]) return showToast("No se encontro el producto");
  if (isItemPrepared(items[index])) return showToast("El producto ya esta preparado");

  items[index] = {
    ...items[index],
    kitchenStatus: "preparado",
    kitchenUpdatedAt: new Date().toISOString()
  };

  await saveTicketItems(ticketId, items);
  showToast("Producto marcado como preparado");
}


function openProductModal(productId = null) {
  const product = productId ? products.find((item) => item.id === productId) : null;

  const categories = [
    ...new Set([
      ...categoryBase,
      ...products.map((item) => item.category).filter(Boolean)
    ])
  ];

  const selectedCategory = product?.category || categories[0] || "";
  const selectedMenuSection = inferMenuSection(product || { category: selectedCategory });

  openModal(product ? "Editar producto" : "Nuevo producto", `
    <div class="form-grid">
      <div class="form-group">
        <label for="product-name">Nombre</label>
        <input 
          id="product-name" 
          value="${escapeHtml(product?.name || "")}" 
          placeholder="Latte, Crepa clasica..."
        >
      </div>

      <div class="form-group">
        <label for="product-menu-section">Menu</label>
        <select id="product-menu-section">
          ${menuSections.map((section) => `
            <option value="${escapeHtml(section.id)}" ${section.id === selectedMenuSection ? "selected" : ""}>
              ${escapeHtml(section.label)} - ${escapeHtml(section.detail)}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="form-group">
        <label for="product-category">Categoria</label>
        <select id="product-category">
          ${categories.map((item) => `
            <option value="${escapeHtml(item)}" ${item === selectedCategory ? "selected" : ""}>
              ${escapeHtml(item)}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="form-group">
        <label for="product-price">Precio</label>
        <input 
          id="product-price" 
          type="number" 
          min="0" 
          step="1" 
          value="${escapeHtml(product?.price ?? "")}" 
          placeholder="60"
        >
      </div>

      <div class="form-group">
        <label for="product-image">Imagen tipo</label>
        <select id="product-image">
          ${Object.keys(imageMap).map((key) => `
            <option value="${key}" ${product?.imageTag === key ? "selected" : ""}>
              ${key}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="form-group">
        <label for="product-active">Estado</label>
        <select id="product-active">
          <option value="true" ${product?.active !== false ? "selected" : ""}>Activo</option>
          <option value="false" ${product?.active === false ? "selected" : ""}>Inactivo</option>
        </select>
      </div>

      <div class="form-group full">
        <label for="product-description">Descripcion</label>
        <textarea id="product-description" placeholder="Descripcion corta">${escapeHtml(product?.description || "")}</textarea>
      </div>
    </div>
  `, `
    <button class="btn btn-outline" data-action="close-modal">Cancelar</button>
    <button class="btn btn-primary" data-action="save-product" data-id="${product?.id || ""}">Guardar</button>
  `);
}

async function saveProduct(productId = "") {
  if (!firebaseReady || !db) return showToast("Configura Firebase primero");
  const name = document.querySelector("#product-name")?.value.trim();
  const category = document.querySelector("#product-category")?.value.trim();
  const menuSection = normalizeMenuSection(document.querySelector("#product-menu-section")?.value) || inferMenuSection({ category });
  const price = Number(document.querySelector("#product-price")?.value || 0);
  const imageTag = document.querySelector("#product-image")?.value || "latte";
  const active = document.querySelector("#product-active")?.value === "true";
  const description = document.querySelector("#product-description")?.value.trim();

  if (!name || !category || price < 0) return showToast("Revisa nombre, categoria y precio");
  const payload = { name, category, menuSection, price, imageTag, active, description, updatedAt: serverTimestamp() };
  if (productId) {
    await updateDoc(doc(db, "products", productId), payload);
  } else {
    await addDoc(collection(db, "products"), { ...payload, createdAt: serverTimestamp() });
  }
  closeModal();
  showToast("Producto guardado");
}

async function deleteProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (!window.confirm(`Eliminar producto: ${product?.name || "producto"}?`)) return;
  await deleteDoc(doc(db, "products", productId));
  showToast("Producto eliminado");
}

async function seedProducts() {
  if (!firebaseReady || !db) return showToast("Configura Firebase primero");
  if (!window.confirm("Esto cargara o actualizara los productos base del menu en Firebase. Puedes editarlos despues. Continuar?")) return;
  await seedDefaultProducts(db);
  showToast("Productos base cargados");
}

function openMenuQrModal() {
  const url = getOnlineMenuUrl();
  openModal("Codigo QR del menu", `
    <div class="qr-panel">
      <div class="qr-card">
        <img src="${getQrImageUrl(360)}" alt="Codigo QR del menu en linea">
      </div>
      <div class="qr-info">
        <h3>Menu en linea</h3>
        <p>Escanea este codigo para abrir el menu actualizado sin imprimirlo.</p>
        <input value="${escapeHtml(url)}" readonly>
      </div>
    </div>
  `, `
    <button class="btn btn-outline" data-action="close-modal">Cerrar</button>
    <button class="btn btn-soft" data-action="copy-menu-link">Copiar link</button>
    <button class="btn btn-primary" data-action="view-menu-online">Abrir menu</button>
  `);
}

async function copyMenuLink() {
  try {
    await navigator.clipboard.writeText(getOnlineMenuUrl());
    showToast("Link copiado");
  } catch (error) {
    showToast("No se pudo copiar el link");
  }
}

function viewOnlineMenu() {
  closeModal();
  location.hash = "menu";
}

function exportProductsPdf() {
  if (!window.jspdf) return showToast("No se pudo cargar jsPDF");
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();
  const activeProducts = products.filter((product) => product.active !== false);
  const groupedSections = groupProductsByMenuSection(activeProducts);
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const pageHeight = docPdf.internal.pageSize.getHeight();
  const margin = 14;
  let y = 18;

  docPdf.setFillColor(30, 41, 32);
  docPdf.roundedRect(margin, y, pageWidth - margin * 2, 30, 6, 6, "F");
  docPdf.setTextColor(240, 244, 241);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(22);
  docPdf.text("esspreso", pageWidth / 2, y + 12, { align: "center" });
  docPdf.setFontSize(10);
  docPdf.setFont("helvetica", "normal");
  docPdf.text("Menu actualizado de productos", pageWidth / 2, y + 21, { align: "center" });

  y += 42;
  docPdf.setTextColor(11, 15, 12);
  docPdf.setFontSize(10);
  docPdf.text(`Generado: ${displayDate(new Date())}`, margin, y);
  docPdf.text(`Productos activos: ${activeProducts.length}`, pageWidth - margin, y, { align: "right" });
  y += 10;

  groupedSections.forEach((section) => {
    if (y > pageHeight - 44) {
      docPdf.addPage();
      y = 18;
    }

    docPdf.setFillColor(section.id === "brunchdy" ? 108 : 147, section.id === "brunchdy" ? 147 : 108, section.id === "brunchdy" ? 115 : 140);
    docPdf.roundedRect(margin, y, pageWidth - margin * 2, 12, 4, 4, "F");
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(14);
    docPdf.text(`${section.label} - ${section.detail}`, margin + 4, y + 8);
    y += 17;

    section.groups.forEach((group) => {
      if (y > pageHeight - 38) {
        docPdf.addPage();
        y = 18;
      }

      docPdf.setFillColor(214, 225, 216);
      docPdf.roundedRect(margin, y, pageWidth - margin * 2, 10, 3, 3, "F");
      docPdf.setTextColor(30, 41, 32);
      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(12);
      docPdf.text(group.category, margin + 4, y + 7);
      y += 15;

      group.items.forEach((product) => {
        if (y > pageHeight - 24) {
          docPdf.addPage();
          y = 18;
        }

        docPdf.setTextColor(11, 15, 12);
        docPdf.setFont("helvetica", "bold");
        docPdf.setFontSize(11);
        const productName = String(product.name || "Producto");
        const wrappedName = docPdf.splitTextToSize(productName, 125);
        docPdf.text(wrappedName, margin + 2, y);
        docPdf.text(formatMoney(product.price), pageWidth - margin, y, { align: "right" });
        y += wrappedName.length * 5;

        if (product.description) {
          docPdf.setFont("helvetica", "normal");
          docPdf.setFontSize(9);
          docPdf.setTextColor(89, 120, 95);
          const wrappedDescription = docPdf.splitTextToSize(String(product.description), 150);
          docPdf.text(wrappedDescription, margin + 2, y);
          y += wrappedDescription.length * 4;
        }

        docPdf.setDrawColor(214, 225, 216);
        docPdf.line(margin + 2, y + 1, pageWidth - margin - 2, y + 1);
        y += 7;
      });

      y += 3;
    });

    y += 4;
  });

  const url = getOnlineMenuUrl();
  if (y > pageHeight - 28) {
    docPdf.addPage();
    y = 18;
  }
  docPdf.setTextColor(61, 82, 65);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9);
  docPdf.text("Menu en linea:", margin, y);
  y += 5;
  docPdf.text(url, margin, y);

  docPdf.save(`menu_esspreso_${getDateKey(new Date())}.pdf`);
}

function updateProductSelect() {
  const category = document.querySelector("#ticket-category")?.value;
  const select = document.querySelector("#ticket-product");
  if (select) select.innerHTML = productOptionsByCategory(category);
}

function printReport() {
  const printWindow = window.open("", "_blank", "width=920,height=720");

  if (!printWindow) {
    showToast("Permite ventanas emergentes para imprimir");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildFinancePrintableReportHtml());
  printWindow.document.close();
  printWindow.focus();
}

function savePdfReport() {
  if (!window.jspdf) return showToast("No se pudo cargar jsPDF");

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const pageHeight = docPdf.internal.pageSize.getHeight();
  const margin = 12;
  const summary = getFinanceSummary(currentFinanceTickets);
  const productRows = getFinanceProductRows(currentFinanceTickets);
  const paymentImage = getCanvasImage("#payment-chart");
  const ticketImage = getCanvasImage("#finance-chart");

  let y = 12;

  drawFinancePdfHeader(docPdf, pageWidth, margin, y);
  y += 28;

  docPdf.setTextColor(11, 15, 12);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.text(`Fecha: ${currentFinanceDate}`, margin, y);
  docPdf.text(`Generado: ${formatTicketDateTimeFromDate(new Date())}`, pageWidth - margin, y, { align: "right" });
  y += 8;

  y = drawFinancePdfMetrics(docPdf, summary, margin, y, pageWidth);
  y += 6;

  if (paymentImage || ticketImage) {
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(11);
    docPdf.setTextColor(30, 41, 32);
    docPdf.text("Graficas", margin, y);
    y += 4;

    const chartWidth = (pageWidth - margin * 2 - 6) / 2;
    const chartHeight = 48;

    if (paymentImage) {
      docPdf.setDrawColor(214, 225, 216);
      docPdf.roundedRect(margin, y, chartWidth, chartHeight + 8, 3, 3);
      docPdf.addImage(paymentImage, "PNG", margin + 3, y + 5, chartWidth - 6, chartHeight);
    }

    if (ticketImage) {
      docPdf.setDrawColor(214, 225, 216);
      docPdf.roundedRect(margin + chartWidth + 6, y, chartWidth, chartHeight + 8, 3, 3);
      docPdf.addImage(ticketImage, "PNG", margin + chartWidth + 9, y + 5, chartWidth - 6, chartHeight);
    }

    y += chartHeight + 16;
  }

  y = drawFinancePdfTicketTable(docPdf, currentFinanceTickets, margin, y, pageWidth, pageHeight);

  if (productRows.length) {
    if (y > pageHeight - 58) {
      docPdf.addPage();
      y = 16;
    }

    y += 6;
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(12);
    docPdf.setTextColor(30, 41, 32);
    docPdf.text("Productos mas vendidos", margin, y);
    y += 7;
    y = drawFinancePdfProductTable(docPdf, productRows.slice(0, 10), margin, y, pageWidth, pageHeight);
  }

  addFinancePdfFooters(docPdf, pageWidth, pageHeight, margin);
  docPdf.save(`reporte_esspreso_${currentFinanceDate}.pdf`);
}

function buildFinancePrintableReportHtml() {
  const summary = getFinanceSummary(currentFinanceTickets);
  const productRows = getFinanceProductRows(currentFinanceTickets);
  const paymentImage = getCanvasImage("#payment-chart");
  const ticketImage = getCanvasImage("#finance-chart");

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Reporte finanzas esspreso ${escapeHtml(currentFinanceDate)}</title>
        <style>
          @page {
            size: letter;
            margin: 12mm;
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #0B0F0C;
            background: #ffffff;
          }

          .report-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 12px 14px;
            border-radius: 14px;
            background: #1E2920;
            color: #F0F4F1;
          }

          .report-header h1 {
            margin: 0;
            font-size: 22px;
          }

          .report-header p {
            margin: 4px 0 0;
            font-size: 12px;
            color: #D6E1D8;
          }

          .logo {
            width: 112px;
            height: auto;
            object-fit: contain;
            background: #ffffff;
            border-radius: 10px;
            padding: 4px;
          }

          .meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin: 12px 0;
            font-size: 12px;
            color: #3D5241;
            font-weight: 700;
          }

          .metrics {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin: 10px 0 12px;
          }

          .metric {
            min-height: 58px;
            padding: 8px;
            border: 1px solid #D6E1D8;
            border-radius: 10px;
            background: #F0F4F1;
          }

          .metric span {
            display: block;
            font-size: 10px;
            color: #59785F;
            font-weight: 700;
          }

          .metric strong {
            display: block;
            margin-top: 4px;
            font-size: 16px;
          }

          .metric small {
            display: block;
            margin-top: 3px;
            font-size: 9px;
            color: #59785F;
          }

          .charts {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin: 8px 0 12px;
          }

          .chart-box {
            height: 145px;
            border: 1px solid #D6E1D8;
            border-radius: 10px;
            padding: 6px;
            text-align: center;
          }

          .chart-box h2 {
            margin: 0 0 4px;
            font-size: 11px;
            color: #324335;
          }

          .chart-box img {
            max-width: 100%;
            max-height: 118px;
            object-fit: contain;
          }

          h2 {
            margin: 12px 0 6px;
            font-size: 14px;
            color: #1E2920;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            page-break-inside: auto;
          }

          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }

          th {
            padding: 6px;
            background: #D6E1D8;
            color: #1E2920;
            text-align: left;
            border: 1px solid #BCCDBF;
          }

          td {
            padding: 6px;
            border: 1px solid #D6E1D8;
            vertical-align: top;
          }

          td.money,
          th.money {
            text-align: right;
          }

          .summary-table {
            margin-top: 6px;
          }

          .print-note {
            margin-top: 10px;
            font-size: 10px;
            color: #59785F;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <header class="report-header">
          <div>
            <h1>Reporte de ventas</h1>
            <p>esspreso cafe y sabor · hoja tamano carta</p>
          </div>
          <img src="/assets/logo-esspreso.png" class="logo" alt="esspreso">
        </header>

        <div class="meta">
          <span>Fecha consultada: ${escapeHtml(currentFinanceDate)}</span>
          <span>Generado: ${escapeHtml(formatTicketDateTimeFromDate(new Date()))}</span>
        </div>

        <section class="metrics">
          ${printMetric("Venta total", formatMoney(summary.total), "Ingreso bruto")}
          ${printMetric("Efectivo", formatMoney(summary.cash), "Caja")}
          ${printMetric("Tarjeta", formatMoney(summary.card), "Terminal")}
          ${printMetric("Transferencia", formatMoney(summary.transfer), "Banco")}
          ${printMetric("Tickets", summary.ticketCount, `${summary.mesaCount} mesas · ${summary.llevarCount} llevar`)}
          ${printMetric("Promedio", formatMoney(summary.averageTicket), "Ticket promedio")}
          ${printMetric("Productos", summary.items, `${summary.averageItems} por ticket`)}
          ${printMetric("Top", summary.topProductName, `${summary.topProductQty} vendido(s)`)}
        </section>

        <section class="charts">
          <div class="chart-box">
            <h2>Metodo de pago</h2>
            ${paymentImage ? `<img src="${paymentImage}" alt="Grafica metodo de pago">` : `<p>Sin grafica</p>`}
          </div>
          <div class="chart-box">
            <h2>Ventas por ticket</h2>
            ${ticketImage ? `<img src="${ticketImage}" alt="Grafica tickets">` : `<p>Sin grafica</p>`}
          </div>
        </section>

        <h2>Detalle de tickets</h2>
        ${financePrintableTicketTable(currentFinanceTickets)}

        <h2>Productos mas vendidos</h2>
        ${financePrintableProductTable(productRows.slice(0, 12))}

        <p class="print-note">Reporte generado desde el punto de venta esspreso.</p>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
    </html>
  `;
}

function printMetric(label, value, detail = "") {
  return `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </article>
  `;
}

function financePrintableTicketTable(tickets) {
  if (!tickets.length) {
    return `<p>No hay ventas finalizadas para esta fecha.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Ticket</th>
          <th>Hora</th>
          <th>Tipo</th>
          <th>Pago</th>
          <th>Productos</th>
          <th class="money">Total</th>
        </tr>
      </thead>
      <tbody>
        ${tickets.map((ticket) => {
          const productsCount = (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
          return `
            <tr>
              <td>${escapeHtml(ticket.name || ticket.alias || "Ticket")}</td>
              <td>${escapeHtml(formatTicketTime(ticket.closedAt || ticket.createdAt))}</td>
              <td>${escapeHtml(ticket.type || "mesa")}</td>
              <td>${escapeHtml(paymentLabel(ticket.paymentMethod || ""))}</td>
              <td>${productsCount}</td>
              <td class="money">${formatMoney(ticket.total)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function financePrintableProductTable(rows) {
  if (!rows.length) {
    return `<p>No hay productos vendidos.</p>`;
  }

  return `
    <table class="summary-table">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Categoria</th>
          <th>Cantidad</th>
          <th class="money">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.category)}</td>
            <td>${row.qty}</td>
            <td class="money">${formatMoney(row.total)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function getCanvasImage(selector) {
  const canvas = document.querySelector(selector);
  if (!canvas) return "";

  try {
    return canvas.toDataURL("image/png", 1);
  } catch (error) {
    return "";
  }
}

function formatTicketTime(timestamp) {
  if (!timestamp?.seconds) return "Sin dato";

  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp.seconds * 1000));
}

function formatTicketDateTimeFromDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function drawFinancePdfHeader(docPdf, pageWidth, margin, y) {
  docPdf.setFillColor(30, 41, 32);
  docPdf.roundedRect(margin, y, pageWidth - margin * 2, 22, 4, 4, "F");
  docPdf.setTextColor(240, 244, 241);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(18);
  docPdf.text("Reporte de ventas", margin + 8, y + 9);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9);
  docPdf.text("esspreso cafe y sabor · hoja tamano carta", margin + 8, y + 16);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.text("esspreso", pageWidth - margin - 8, y + 13, { align: "right" });
}

function drawFinancePdfMetrics(docPdf, summary, margin, y, pageWidth) {
  const metrics = [
    ["Venta total", formatMoney(summary.total), "Ingreso bruto"],
    ["Efectivo", formatMoney(summary.cash), "Caja"],
    ["Tarjeta", formatMoney(summary.card), "Terminal"],
    ["Transferencia", formatMoney(summary.transfer), "Banco"],
    ["Tickets", String(summary.ticketCount), `${summary.mesaCount} mesas / ${summary.llevarCount} llevar`],
    ["Promedio", formatMoney(summary.averageTicket), "Por ticket"],
    ["Productos", String(summary.items), `${summary.averageItems} por ticket`],
    ["Top", summary.topProductName, `${summary.topProductQty} vendido(s)`]
  ];

  const boxGap = 4;
  const boxWidth = (pageWidth - margin * 2 - boxGap * 3) / 4;
  const boxHeight = 18;

  metrics.forEach((metric, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = margin + col * (boxWidth + boxGap);
    const yy = y + row * (boxHeight + boxGap);

    docPdf.setFillColor(240, 244, 241);
    docPdf.setDrawColor(214, 225, 216);
    docPdf.roundedRect(x, yy, boxWidth, boxHeight, 3, 3, "FD");
    docPdf.setTextColor(89, 120, 95);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(7);
    docPdf.text(metric[0], x + 3, yy + 5);
    docPdf.setTextColor(11, 15, 12);
    docPdf.setFontSize(metric[1].length > 14 ? 8 : 10);
    docPdf.text(docPdf.splitTextToSize(metric[1], boxWidth - 6), x + 3, yy + 10);
    docPdf.setTextColor(89, 120, 95);
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(6.5);
    docPdf.text(docPdf.splitTextToSize(metric[2], boxWidth - 6), x + 3, yy + 15);
  });

  return y + boxHeight * 2 + boxGap + 2;
}

function drawFinancePdfTicketTable(docPdf, tickets, margin, y, pageWidth, pageHeight) {
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.setTextColor(30, 41, 32);
  docPdf.text("Detalle de tickets", margin, y);
  y += 7;

  const columns = [
    { label: "Ticket", x: margin, width: 64 },
    { label: "Hora", x: margin + 66, width: 22 },
    { label: "Tipo", x: margin + 90, width: 25 },
    { label: "Pago", x: margin + 117, width: 32 },
    { label: "Prod.", x: margin + 151, width: 16 },
    { label: "Total", x: pageWidth - margin - 28, width: 28, align: "right" }
  ];

  y = drawFinancePdfTableHeader(docPdf, columns, y, pageWidth, margin);

  if (!tickets.length) {
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.text("No hay ventas finalizadas para esta fecha.", margin, y + 5);
    return y + 12;
  }

  tickets.forEach((ticket) => {
    if (y > pageHeight - 20) {
      docPdf.addPage();
      y = 16;
      y = drawFinancePdfTableHeader(docPdf, columns, y, pageWidth, margin);
    }

    const productsCount = (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const row = [
      String(ticket.name || ticket.alias || "Ticket"),
      formatTicketTime(ticket.closedAt || ticket.createdAt),
      String(ticket.type || "mesa"),
      paymentLabel(ticket.paymentMethod || ""),
      String(productsCount),
      formatMoney(ticket.total)
    ];

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(8);
    docPdf.setTextColor(11, 15, 12);
    docPdf.text(docPdf.splitTextToSize(row[0], columns[0].width), columns[0].x + 1, y + 5);
    docPdf.text(row[1], columns[1].x + 1, y + 5);
    docPdf.text(row[2], columns[2].x + 1, y + 5);
    docPdf.text(row[3], columns[3].x + 1, y + 5);
    docPdf.text(row[4], columns[4].x + 1, y + 5);
    docPdf.text(row[5], columns[5].x + columns[5].width, y + 5, { align: "right" });
    docPdf.setDrawColor(214, 225, 216);
    docPdf.line(margin, y + 8, pageWidth - margin, y + 8);
    y += 9;
  });

  return y;
}

function drawFinancePdfProductTable(docPdf, rows, margin, y, pageWidth, pageHeight) {
  const columns = [
    { label: "Producto", x: margin, width: 76 },
    { label: "Categoria", x: margin + 78, width: 50 },
    { label: "Cant.", x: margin + 130, width: 18 },
    { label: "Importe", x: pageWidth - margin - 32, width: 32, align: "right" }
  ];

  y = drawFinancePdfTableHeader(docPdf, columns, y, pageWidth, margin);

  rows.forEach((row) => {
    if (y > pageHeight - 20) {
      docPdf.addPage();
      y = 16;
      y = drawFinancePdfTableHeader(docPdf, columns, y, pageWidth, margin);
    }

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(8);
    docPdf.setTextColor(11, 15, 12);
    docPdf.text(docPdf.splitTextToSize(String(row.name), columns[0].width), columns[0].x + 1, y + 5);
    docPdf.text(docPdf.splitTextToSize(String(row.category), columns[1].width), columns[1].x + 1, y + 5);
    docPdf.text(String(row.qty), columns[2].x + 1, y + 5);
    docPdf.text(formatMoney(row.total), columns[3].x + columns[3].width, y + 5, { align: "right" });
    docPdf.setDrawColor(214, 225, 216);
    docPdf.line(margin, y + 8, pageWidth - margin, y + 8);
    y += 9;
  });

  return y;
}

function drawFinancePdfTableHeader(docPdf, columns, y, pageWidth, margin) {
  docPdf.setFillColor(214, 225, 216);
  docPdf.rect(margin, y, pageWidth - margin * 2, 7, "F");
  docPdf.setTextColor(30, 41, 32);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(7.5);

  columns.forEach((column) => {
    docPdf.text(column.label, column.align === "right" ? column.x + column.width : column.x + 1, y + 4.7, {
      align: column.align || "left"
    });
  });

  return y + 8;
}

function addFinancePdfFooters(docPdf, pageWidth, pageHeight, margin) {
  const pages = docPdf.internal.getNumberOfPages();

  for (let page = 1; page <= pages; page += 1) {
    docPdf.setPage(page);
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(8);
    docPdf.setTextColor(89, 120, 95);
    docPdf.text(`esspreso · ${currentFinanceDate}`, margin, pageHeight - 7);
    docPdf.text(`Pagina ${page} de ${pages}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  }
}

function handleClick(event) {
  const routeBtn = event.target.closest("[data-route]");
  if (routeBtn) {
    const nextRoute = routeBtn.dataset.route;
    if (!PUBLIC_ROUTES.includes(nextRoute) && !isAuthenticated()) {
      redirectToLogin();
      return;
    }
    location.hash = nextRoute;
    return;
  }

  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  if (action === "close-modal") return closeModal();
  if (action === "logout") return logout();
  if (action === "login") return loginUser();
  if (action === "new-ticket") return openNewTicketModal();
  if (action === "create-ticket") return createTicket().catch((error) => showToast(error.message));
  if (action === "open-ticket") return openTicketModal(id);
  if (action === "add-item") return addItemToTicket(id).catch((error) => showToast(error.message));
  if (action === "remove-item") return removeItem(id, actionEl.dataset.index).catch((error) => showToast(error.message));
  if (action === "pay-ticket") return openPayModal(id);
  if (action === "finish-ticket") return finishTicket(id).catch((error) => showToast(error.message));
  if (action === "delete-ticket") return deleteTicket(id).catch((error) => showToast(error.message));
  if (action === "mark-item-prepared") return markKitchenItemPrepared(id, actionEl.dataset.index).catch((error) => showToast(error.message));

  if (action === "new-product") return openProductModal();
  if (action === "edit-product") return openProductModal(id);
  if (action === "save-product") return saveProduct(id).catch((error) => showToast(error.message));
  if (action === "delete-product") return deleteProduct(id).catch((error) => showToast(error.message));
  if (action === "seed-products") return seedProducts().catch((error) => showToast(error.message));
  if (action === "export-products-pdf") return exportProductsPdf();
  if (action === "show-menu-qr") return openMenuQrModal();
  if (action === "copy-menu-link") return copyMenuLink();
  if (action === "view-menu-online") return viewOnlineMenu();

  if (action === "view-finished-ticket") return openFinishedTicketModal(id);
  if (action === "delete-finance-ticket") return openDeleteFinanceTicketModal(id);
  if (action === "confirm-delete-finance-ticket") return deleteFinanceTicket(id).catch((error) => showToast(error.message));
  if (action === "print-ticket") return printSingleTicket(id);
  if (action === "pdf-ticket") return saveSingleTicketPdf(id);
  if (action === "print-report") return printReport();
  if (action === "pdf-report") return savePdfReport();
  if (action === "load-period-report") return loadPeriodFinance();
  if (action === "print-period-report") return printPeriodReport();
  if (action === "pdf-period-report") return savePeriodPdfReport();

}

function handleSubmit(event) {
  if (event.target?.id === "login-form") {
    event.preventDefault();
    loginUser();
  }
}

function handleChange(event) {
  const action = event.target.dataset.action;
  if (action === "ticket-category-change") return updateProductSelect();
  if (action === "change-qty") return changeQty(event.target).catch((error) => showToast(error.message));
  if (action === "finance-date") {
    currentFinanceDate = event.target.value || getDateKey(new Date());
    loadFinance(currentFinanceDate);
  }

  if (action === "period-report-type") {
    financePeriodType = event.target.value || "semana";
    loadPeriodFinance();
  }

  if (action === "period-report-date") {
    financePeriodDate = event.target.value || getDateKey(new Date());
    loadPeriodFinance();
  }
}

function stopFirestoreListeners() {
  unsubscribeProducts?.();
  unsubscribeActiveTickets?.();

  unsubscribeProducts = null;
  unsubscribeActiveTickets = null;
  products = [];
  activeTickets = [];
}

function managePrivateListeners() {
  const route = getRoute();

  if (route === "menu" || !isAuthenticated()) {
    stopFirestoreListeners();
    return;
  }

  if (!unsubscribeProducts || !unsubscribeActiveTickets) {
    startFirestoreListeners();
  }
}

function init() {
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit);
  modalRoot.addEventListener("click", (event) => {
    if (event.target === modalRoot) closeModal();
  });
  window.addEventListener("hashchange", () => {
    managePrivateListeners();
    render();
  });
  window.setInterval(() => {
    if (!PUBLIC_ROUTES.includes(getRoute()) && !isAuthenticated()) {
      showToast("Sesion caducada");
      redirectToLogin();
      managePrivateListeners();
      render();
    }
  }, 60000);
  managePrivateListeners();
  render();
}

init();
