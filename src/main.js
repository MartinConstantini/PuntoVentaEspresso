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
let financeChart = null;
let paymentChart = null;
let unsubscribeProducts = null;
let unsubscribeActiveTickets = null;

const categoryBase = [
  "Ensaladas", "Sandwich", "Hamburguesas", "Combos", "Bowl", "Tortas", "Baguette",
  "Bebidas calientes", "Bebidas frias", "Base horchata", "Otras bebidas", "Malteadas",
  "Frappe", "Crepas", "Waffles", "Extras"
];

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
  const names = { inicio: "Inicio", venta: "Venta", productos: "Productos", finanzas: "Finanzas" };
  return names[route] || "Inicio";
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toastEl.classList.remove("show"), 2300);
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

  appEl.innerHTML = `
    <main class="app-shell ${isHome ? "home-shell" : ""}">
      ${
        !isHome
          ? `
            <header class="page-topbar page-topbar-short">
              <button class="btn btn-outline btn-home" data-route="inicio">← Inicio</button>

              <img 
                src="/assets/logo-esspreso.png" 
                alt="Logo esspreso cafe y sabor" 
                class="page-logo-center"
              >
            </header>
          `
          : ""
      }

      ${configWarning()}
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
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => `${a.category}-${a.name}`.localeCompare(`${b.category}-${b.name}`, "es"));
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
  if (route === "venta") return renderSales();
  if (route === "productos") return renderProducts();
  if (route === "finanzas") return renderFinance();
  return renderHome();
}

function renderHome() {
  baseLayout(`
    <section class="home-start home-start-clean">
      <header class="home-logo-header">
        <img src="/assets/logo-esspreso.png" alt="Logo esspreso cafe y sabor">
      </header>

      <div class="home-cards-clean">
        ${homeSimpleCard(
          "venta",
          "🧾",
          "Venta",
          "Abre mesas, tickets para llevar, agrega productos y finaliza cobros."
        )}

        ${homeSimpleCard(
          "productos",
          "🥐",
          "Productos",
          "Agrega, modifica o elimina productos y precios guardados en Firebase."
        )}

        ${homeSimpleCard(
          "finanzas",
          "📊",
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

function renderProducts() {
  const grouped = groupProducts(products);
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
          <button class="btn btn-soft" data-action="seed-products">Cargar productos base</button>
          <button class="btn btn-primary" data-action="new-product">+ Nuevo producto</button>
        </div>
      </div>
      <div class="product-grid">
        ${products.length ? grouped.map(productGroup).join("") : `<div class="empty-state">Aun no tienes productos. Puedes cargarlos desde el menu base o crear uno manual.</div>`}
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
        <p style="margin:2px 0 0; font-size:13px;">${formatMoney(product.price)} ${product.active === false ? "· Inactivo" : ""}</p>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="icon-btn" title="Editar" data-action="edit-product" data-id="${product.id}">✎</button>
        <button class="icon-btn" title="Eliminar" data-action="delete-product" data-id="${product.id}">🗑</button>
      </div>
    </div>
  `;
}

function renderFinance() {
  baseLayout(`
    <section class="card panel" id="finance-panel">
      <div class="toolbar">
        <div class="toolbar-left">
          <div>
            <h2 style="margin:0; letter-spacing:-.04em;">Finanzas</h2>
            <p style="margin:4px 0 0; color:var(--color-600);">Consulta ventas cerradas por fecha.</p>
          </div>
        </div>
        <div class="toolbar-right">
          <input type="date" id="finance-date" value="${escapeHtml(currentFinanceDate)}" data-action="finance-date" style="max-width:180px;">
          <button class="btn btn-outline" data-action="print-report">Imprimir</button>
          <button class="btn btn-primary" data-action="pdf-report">Guardar PDF</button>
        </div>
      </div>
      <div id="finance-content">
        <div class="empty-state">Cargando ventas del dia...</div>
      </div>
    </section>
  `);
  loadFinance(currentFinanceDate);
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
  const total = tickets.reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
  const items = tickets.reduce((sum, ticket) => sum + (ticket.items || []).reduce((s, item) => s + Number(item.qty || 0), 0), 0);
  const cash = sumByPayment(tickets, "efectivo");
  const card = sumByPayment(tickets, "tarjeta");
  const transfer = sumByPayment(tickets, "transferencia");

  content.innerHTML = `
    <div class="metrics-grid">
      ${metricCard("Ventas", formatMoney(total))}
      ${metricCard("Tickets", tickets.length)}
      ${metricCard("Productos", items)}
      ${metricCard("Promedio", tickets.length ? formatMoney(total / tickets.length) : formatMoney(0))}
    </div>

    <div class="finance-layout">
      <section class="chart-card card">
        <h3>Ventas por metodo de pago</h3>
        <canvas id="payment-chart"></canvas>
      </section>

      <section class="chart-card card">
        <h3>Resumen</h3>
        <canvas id="finance-chart"></canvas>
      </section>
    </div>

    <div class="section-title">
      <div>
        <h2 style="font-size:28px;">Tickets finalizados</h2>
        <p>${escapeHtml(currentFinanceDate)}</p>
      </div>
    </div>

    <div class="table-wrap">
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

  drawPaymentChart([cash, card, transfer]);
  drawFinanceChart(tickets);
}

function metricCard(label, value) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function sumByPayment(tickets, method) {
  return tickets
    .filter((ticket) => ticket.paymentMethod === method)
    .reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
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
              <td><strong>${escapeHtml(item.name || "Producto")}</strong></td>
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
            size: 80mm auto;
            margin: 8mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #0B0F0C;
            background: #ffffff;
          }

          .ticket {
            width: 100%;
            max-width: 300px;
            margin: 0 auto;
          }

          .logo {
            width: 150px;
            margin: 0 auto 10px;
          }

          .logo img {
            width: 100%;
            height: auto;
          }

          h1 {
            margin: 0;
            text-align: center;
            font-size: 18px;
          }

          .center {
            text-align: center;
          }

          .muted {
            color: #59785F;
            font-size: 12px;
          }

          .line {
            border-top: 1px dashed #3D5241;
            margin: 10px 0;
          }

          .info {
            font-size: 12px;
            line-height: 1.45;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          th,
          td {
            padding: 5px 0;
            border-bottom: 1px solid #D6E1D8;
            text-align: left;
            vertical-align: top;
          }

          th:last-child,
          td:last-child {
            text-align: right;
          }

          .total {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-top: 12px;
            font-size: 18px;
            font-weight: 800;
          }

          .thanks {
            margin-top: 16px;
            text-align: center;
            font-size: 12px;
          }
        </style>
      </head>

      <body>
        <main class="ticket">
          <div class="logo">
            <img src="/assets/logo-esspreso.jpeg" alt="esspreso">
          </div>

          <h1>Ticket de venta</h1>
          <p class="center muted">esspreso cafe y sabor</p>

          <div class="line"></div>

          <div class="info">
            <strong>Ticket:</strong> ${escapeHtml(ticket.name || ticket.alias || "Ticket")}<br>
            <strong>Tipo:</strong> ${escapeHtml(ticket.type || "mesa")}<br>
            <strong>Pago:</strong> ${escapeHtml(paymentLabel(ticket.paymentMethod))}<br>
            <strong>Apertura:</strong> ${escapeHtml(formatTicketDateTime(ticket.createdAt))}<br>
            <strong>Cobro:</strong> ${escapeHtml(formatTicketDateTime(ticket.closedAt))}<br>
            <strong>Productos:</strong> ${totalItems}
          </div>

          <div class="line"></div>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>
                    ${Number(item.qty || 0)} x ${escapeHtml(item.name || "Producto")}
                    <br>
                    <span class="muted">${formatMoney(item.price)} c/u</span>
                  </td>
                  <td>${formatMoney(item.subtotal)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="total">
            <span>Total</span>
            <span>${formatMoney(ticket.total)}</span>
          </div>

          <div class="line"></div>

          <p class="thanks">Gracias por tu compra.</p>
        </main>

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
    docPdf.setFontSize(11);
    y += 8;
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
      datasets: [{ data: values, backgroundColor: ["#6C9373", "#3D5241", "#BCCDBF"], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
}

function drawFinanceChart(tickets) {
  const canvas = document.querySelector("#finance-chart");
  if (!canvas || !window.Chart) return;
  const labels = tickets.map((ticket) => ticket.name || ticket.alias || "Ticket");
  const data = tickets.map((ticket) => Number(ticket.total || 0));
  financeChart?.destroy();
  financeChart = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Total", data, backgroundColor: "#87A68D", borderRadius: 10 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
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
  await addDoc(collection(db, "tickets"), {
    name,
    alias: String(alias).trim() || "Cliente",
    type,
    status: "activo",
    items: [],
    total: 0,
    dateKey: getDateKey(new Date()),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  closeModal();
  showToast("Ticket creado");
}

function openTicketModal(ticketId) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (!ticket) return showToast("No se encontro el ticket");
  const activeProducts = products.filter((product) => product.active !== false);
  const categories = [...new Set(activeProducts.map((product) => product.category || "Sin categoria"))];
  const firstCategory = categories[0] || "";
  const productOptions = productOptionsByCategory(firstCategory);
  openModal(`Orden: ${ticket.name || "Ticket"}`, `
    <div class="ticket-meta">
      <span class="badge badge-dark">${escapeHtml(ticket.type || "mesa")}</span>
      <span class="badge">${escapeHtml(displayTicketDate(ticket.createdAt))}</span>
      <span class="badge">${(ticket.items || []).length} linea(s)</span>
    </div>
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
        <thead><tr><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
          ${items.map((item, index) => `
            <tr>
              <td>${escapeHtml(item.name)}<br><span style="color:var(--color-600); font-size:12px;">${escapeHtml(item.category || "")}</span></td>
              <td>${formatMoney(item.price)}</td>
              <td>
                <span class="qty-control">
                  <input type="number" min="1" value="${Number(item.qty || 1)}" data-action="change-qty" data-id="${ticket.id}" data-index="${index}">
                </span>
              </td>
              <td><strong>${formatMoney(item.subtotal)}</strong></td>
              <td><button class="icon-btn" data-action="remove-item" data-id="${ticket.id}" data-index="${index}" title="Eliminar">🗑</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function addItemToTicket(ticketId) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  const productId = document.querySelector("#ticket-product")?.value;
  const qty = Math.max(1, Number(document.querySelector("#ticket-qty")?.value || 1));
  const product = products.find((item) => item.id === productId);
  if (!ticket || !product) return showToast("Selecciona un producto valido");

  const items = [...(ticket.items || [])];
  const existing = items.find((item) => item.productId === product.id && item.price === product.price);
  if (existing) {
    existing.qty = Number(existing.qty || 0) + qty;
    existing.subtotal = existing.qty * Number(existing.price || 0);
  } else {
    items.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      price: Number(product.price || 0),
      qty,
      subtotal: Number(product.price || 0) * qty
    });
  }
  await saveTicketItems(ticketId, items);
  showToast("Producto agregado");
  openTicketModal(ticketId);
}

async function saveTicketItems(ticketId, items) {
  const total = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const index = activeTickets.findIndex((item) => item.id === ticketId);
  if (index >= 0) activeTickets[index] = { ...activeTickets[index], items, total };
  await updateDoc(doc(db, "tickets", ticketId), {
    items,
    total,
    updatedAt: serverTimestamp()
  });
}

async function removeItem(ticketId, itemIndex) {
  const ticket = activeTickets.find((item) => item.id === ticketId);
  if (!ticket) return;
  const items = [...(ticket.items || [])];
  items.splice(Number(itemIndex), 1);
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
  items[itemIndex].qty = qty;
  items[itemIndex].subtotal = qty * Number(items[itemIndex].price || 0);
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
  if (!window.confirm("Seguro que quieres cancelar y eliminar este ticket activo?")) return;
  await deleteDoc(doc(db, "tickets", ticketId));
  closeModal();
  showToast("Ticket cancelado");
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
  const price = Number(document.querySelector("#product-price")?.value || 0);
  const imageTag = document.querySelector("#product-image")?.value || "latte";
  const active = document.querySelector("#product-active")?.value === "true";
  const description = document.querySelector("#product-description")?.value.trim();

  if (!name || !category || price < 0) return showToast("Revisa nombre, categoria y precio");
  const payload = { name, category, price, imageTag, active, description, updatedAt: serverTimestamp() };
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

function updateProductSelect() {
  const category = document.querySelector("#ticket-category")?.value;
  const select = document.querySelector("#ticket-product");
  if (select) select.innerHTML = productOptionsByCategory(category);
}

function printReport() {
  window.print();
}

function savePdfReport() {
  if (!window.jspdf) return showToast("No se pudo cargar jsPDF");
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();
  const total = currentFinanceTickets.reduce((sum, ticket) => sum + Number(ticket.total || 0), 0);
  let y = 18;
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(18);
  docPdf.text("Reporte de ventas - esspreso", 14, y);
  y += 10;
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(11);
  docPdf.text(`Fecha: ${currentFinanceDate}`, 14, y); y += 7;
  docPdf.text(`Tickets finalizados: ${currentFinanceTickets.length}`, 14, y); y += 7;
  docPdf.text(`Total vendido: ${formatMoney(total)}`, 14, y); y += 10;
  docPdf.setFont("helvetica", "bold");
  docPdf.text("Detalle", 14, y); y += 8;
  docPdf.setFont("helvetica", "normal");
  currentFinanceTickets.forEach((ticket, index) => {
    if (y > 270) { docPdf.addPage(); y = 18; }
    const productsCount = (ticket.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
    docPdf.text(`${index + 1}. ${ticket.name || ticket.alias || "Ticket"}`, 14, y); y += 6;
    docPdf.text(`Tipo: ${ticket.type || "mesa"} | Pago: ${ticket.paymentMethod || ""} | Productos: ${productsCount} | Total: ${formatMoney(ticket.total)}`, 18, y); y += 8;
  });
  docPdf.save(`reporte_esspreso_${currentFinanceDate}.pdf`);
}

function handleClick(event) {
  const routeBtn = event.target.closest("[data-route]");
  if (routeBtn) {
    location.hash = routeBtn.dataset.route;
    return;
  }

  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  if (action === "close-modal") return closeModal();
  if (action === "new-ticket") return openNewTicketModal();
  if (action === "create-ticket") return createTicket().catch((error) => showToast(error.message));
  if (action === "open-ticket") return openTicketModal(id);
  if (action === "add-item") return addItemToTicket(id).catch((error) => showToast(error.message));
  if (action === "remove-item") return removeItem(id, actionEl.dataset.index).catch((error) => showToast(error.message));
  if (action === "pay-ticket") return openPayModal(id);
  if (action === "finish-ticket") return finishTicket(id).catch((error) => showToast(error.message));
  if (action === "delete-ticket") return deleteTicket(id).catch((error) => showToast(error.message));

  if (action === "new-product") return openProductModal();
  if (action === "edit-product") return openProductModal(id);
  if (action === "save-product") return saveProduct(id).catch((error) => showToast(error.message));
  if (action === "delete-product") return deleteProduct(id).catch((error) => showToast(error.message));
  if (action === "seed-products") return seedProducts().catch((error) => showToast(error.message));

  if (action === "view-finished-ticket") return openFinishedTicketModal(id);
  if (action === "print-ticket") return printSingleTicket(id);
  if (action === "pdf-ticket") return saveSingleTicketPdf(id);
  if (action === "print-report") return printReport();
  if (action === "pdf-report") return savePdfReport();

}

function handleChange(event) {
  const action = event.target.dataset.action;
  if (action === "ticket-category-change") return updateProductSelect();
  if (action === "change-qty") return changeQty(event.target).catch((error) => showToast(error.message));
  if (action === "finance-date") {
    currentFinanceDate = event.target.value || getDateKey(new Date());
    loadFinance(currentFinanceDate);
  }
}

function init() {
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  modalRoot.addEventListener("click", (event) => {
    if (event.target === modalRoot) closeModal();
  });
  window.addEventListener("hashchange", render);
  startFirestoreListeners();
  render();
}

init();
