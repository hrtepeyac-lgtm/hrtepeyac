import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentRole = null;
let unsubscribeInventario = null;

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }

    const navTabs = document.querySelectorAll(".tab-btn");
    navTabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            const targetModule = e.target.getAttribute("data-module");
            if (targetModule) switchTab(targetModule);
        });
    });

    const formPacientes = document.getElementById("form-pacientes");
    if (formPacientes) {
        formPacientes.addEventListener("submit", handleGuardarPaciente);
    }

    const formCitas = document.getElementById("form-citas");
    if (formCitas) {
        formCitas.addEventListener("submit", handleGuardarCita);
    }

    const formInventario = document.getElementById("form-inventario");
    if (formInventario) {
        formInventario.addEventListener("submit", handleGuardarMedicamento);
    }

    const formCobros = document.getElementById("form-cobros");
    if (formCobros) {
        formCobros.addEventListener("submit", handleGuardarCobro);
    }

    const btnImprimirTicket = document.getElementById("btn-imprimir-ticket");
    if (btnImprimirTicket) {
        btnImprimirTicket.addEventListener("click", () => window.print());
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await cargarRolUsuario(user.uid);
            configurarInterfaz();
        } else {
            currentUser = null;
            currentRole = null;
            mostrarPantallaLogin();
        }
    });
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value.trim();
    const errDiv = document.getElementById("login-error");

    try {
        if (errDiv) errDiv.style.display = "none";
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        console.error("Error al iniciar sesión:", err);
        if (errDiv) {
            errDiv.innerText = "Error: Credenciales inválidas o problema de conexión.";
            errDiv.style.display = "block";
        }
    }
}

async function handleLogout() {
    try {
        if (unsubscribeInventario) unsubscribeInventario();
        await signOut(auth);
    } catch (err) {
        console.error("Error al cerrar sesión:", err);
    }
}

async function cargarRolUsuario(uid) {
    try {
        const userDocRef = doc(db, "usuarios", uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            currentRole = userDoc.data().rol;
        } else {
            console.error("No se encontró documento de usuario para el UID:", uid);
            currentRole = "invitado";
        }
    } catch (err) {
        console.error("Error al obtener rol:", err);
        currentRole = "invitado";
    }
}

function mostrarPantallaLogin() {
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    if (loginScreen) loginScreen.style.display = "flex";
    if (appScreen) appScreen.style.display = "none";
}

function configurarInterfaz() {
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    if (loginScreen) loginScreen.style.display = "none";
    if (appScreen) appScreen.style.display = "block";

    const userEmailSpan = document.getElementById("user-email");
    const userRoleSpan = document.getElementById("user-role");
    if (userEmailSpan) userEmailSpan.innerText = currentUser.email;
    if (userRoleSpan) userRoleSpan.innerText = currentRole;

    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
        const rolesPermitidos = tab.getAttribute("data-roles");
        if (rolesPermitidos) {
            const listaRoles = rolesPermitidos.split(",");
            if (listaRoles.includes(currentRole) || currentRole === "admin") {
                tab.style.display = "inline-block";
            } else {
                tab.style.display = "none";
            }
        }
    });

    if (currentRole === "secretaria") {
        switchTab("pacientes");
    } else if (currentRole === "farmacia") {
        switchTab("inventario");
    } else {
        switchTab("pacientes");
    }

    escucharColecciones();
}

function switchTab(moduleName) {
    const tabs = document.querySelectorAll(".tab-btn");
    const modules = document.querySelectorAll(".module");

    tabs.forEach(tab => {
        if (tab.getAttribute("data-module") === moduleName) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    modules.forEach(mod => {
        if (mod.id === `module-${moduleName}`) {
            mod.classList.add("active");
        } else {
            mod.classList.remove("active");
        }
    });
}

function escucharColecciones() {
    cargasEnTiempoReal();
}

function cargasEnTiempoReal() {
    const qPacientes = query(collection(db, "pacientes"), orderBy("fechaRegistro", "desc"));
    onSnapshot(qPacientes, (snapshot) => {
        const pacientes = [];
        snapshot.forEach(doc => pacientes.push({ id: doc.id, ...doc.data() }));
        renderizarPacientes(pacientes);
        actualizarSelectsPacientes(pacientes);
    });

    const qCitas = query(collection(db, "citas"), orderBy("fechaHora", "asc"));
    onSnapshot(qCitas, (snapshot) => {
        const citas = [];
        snapshot.forEach(doc => citas.push({ id: doc.id, ...doc.data() }));
        renderizarCitas(citas);
    });

    const qInventario = query(collection(db, "inventario"), orderBy("nombre", "asc"));
    if (unsubscribeInventario) unsubscribeInventario();
    unsubscribeInventario = onSnapshot(qInventario, (snapshot) => {
        const items = [];
        snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        renderizarInventario(items);
        actualizarSelectsMedicamentos(items);
    });

    const qCobros = query(collection(db, "cobros"), orderBy("fecha", "desc"));
    onSnapshot(qCobros, (snapshot) => {
        const cobros = [];
        snapshot.forEach(doc => cobros.push({ id: doc.id, ...doc.data() }));
        renderizarCobros(cobros);
    });
}

async function handleGuardarPaciente(e) {
    e.preventDefault();
    const nombre = document.getElementById("paciente-nombre").value.trim();
    const telefono = document.getElementById("paciente-telefono").value.trim();
    const email = document.getElementById("paciente-email").value.trim();

    if (!nombre) return;

    try {
        await addDoc(collection(db, "pacientes"), {
            nombre,
            telefono,
            email,
            fechaRegistro: serverTimestamp()
        });
        e.target.reset();
    } catch (err) {
        console.error("Error al guardar paciente:", err);
    }
}

function renderizarPacientes(pacientes) {
    const tbody = document.getElementById("tabla-pacientes-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    pacientes.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${p.nombre || ""}</td>
            <td>${p.telefono || "-"}</td>
            <td>${p.email || "-"}</td>
            <td>
                <button class="btn btn-danger btn-sm btn-eliminar-paciente" data-id="${p.id}">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".btn-eliminar-paciente").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            if (confirm("¿Desea eliminar este paciente?")) {
                deleteDoc(doc(db, "pacientes", id));
            }
        });
    });
}

function actualizarSelectsPacientes(pacientes) {
    const selectCita = document.getElementById("cita-paciente-select");
    const selectCobro = document.getElementById("cobro-paciente-select");

    const opciones = pacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join("");
    const defaultOpt = `<option value="">Seleccione un paciente...</option>`;

    if (selectCita) selectCita.innerHTML = defaultOpt + opciones;
    if (selectCobro) selectCobro.innerHTML = defaultOpt + opciones;
}

async function handleGuardarCita(e) {
    e.preventDefault();
    const pacienteId = document.getElementById("cita-paciente-select").value;
    const fechaHora = document.getElementById("cita-fechahora").value;
    const motivo = document.getElementById("cita-motivo").value.trim();

    const select = document.getElementById("cita-paciente-select");
    const pacienteNombre = select.options[select.selectedIndex]?.text || "";

    if (!pacienteId || !fechaHora) return;

    try {
        await addDoc(collection(db, "citas"), {
            pacienteId,
            pacienteNombre,
            fechaHora,
            motivo,
            estado: "Pendiente",
            fechaCreacion: serverTimestamp()
        });
        e.target.reset();
    } catch (err) {
        console.error("Error al agendar cita:", err);
    }
}

function renderizarCitas(citas) {
    const tbody = document.getElementById("tabla-citas-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    citas.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.pacienteNombre || ""}</td>
            <td>${c.fechaHora ? new Date(c.fechaHora).toLocaleString() : ""}</td>
            <td>${c.motivo || "-"}</td>
            <td><span class="badge">${c.estado || "Pendiente"}</span></td>
            <td>
                <button class="btn btn-danger btn-sm btn-eliminar-cita" data-id="${c.id}">Cancelar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".btn-eliminar-cita").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            if (confirm("¿Desea cancelar esta cita?")) {
                deleteDoc(doc(db, "citas", id));
            }
        });
    });
}

async function handleGuardarMedicamento(e) {
    e.preventDefault();
    const nombre = document.getElementById("med-nombre").value.trim();
    const stock = parseInt(document.getElementById("med-stock").value) || 0;
    const precio = parseFloat(document.getElementById("med-precio").value) || 0;
    const caducidad = document.getElementById("med-caducidad").value;

    if (!nombre) return;

    try {
        await addDoc(collection(db, "inventario"), {
            nombre,
            stock,
            precio,
            caducidad,
            fechaRegistro: serverTimestamp()
        });
        e.target.reset();
    } catch (err) {
        console.error("Error al guardar medicamento:", err);
    }
}

function renderizarInventario(items) {
    const tbody = document.getElementById("tabla-inventario-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const hoy = new Date();
    const limite30Dias = new Date();
    limite30Dias.setDate(hoy.getDate() + 30);

    items.forEach(item => {
        const fechaCad = item.caducidad ? new Date(item.caducidad) : null;
        const stockBajo = item.stock <= 5;
        const proximoCaducar = fechaCad && fechaCad <= limite30Dias;

        const tr = document.createElement("tr");
        if (stockBajo || proximoCaducar) {
            tr.classList.add("row-alert");
        }

        tr.innerHTML = `
            <td>${item.nombre || ""}</td>
            <td>${item.stock} ${stockBajo ? '<span style="color:red; font-weight:bold;">(!Bajo)</span>' : ''}</td>
            <td>$${item.precio ? item.precio.toFixed(2) : "0.00"}</td>
            <td>${item.caducidad || "-"} ${proximoCaducar ? '<span style="color:red; font-weight:bold;">(!Próximo)</span>' : ''}</td>
            <td>
                <button class="btn btn-danger btn-sm btn-eliminar-med" data-id="${item.id}">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".btn-eliminar-med").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            if (confirm("¿Desea eliminar este medicamento?")) {
                deleteDoc(doc(db, "inventario", id));
            }
        });
    });
}

function actualizarSelectsMedicamentos(items) {
    const selectCobroMed = document.getElementById("cobro-medicamento-select");
    if (!selectCobroMed) return;

    const opciones = items
        .filter(i => i.stock > 0)
        .map(i => `<option value="${i.id}" data-precio="${i.precio}" data-stock="${i.stock}">${i.nombre} - $${i.precio.toFixed(2)} (Stock: ${i.stock})</option>`)
        .join("");

    selectCobroMed.innerHTML = `<option value="">Seleccione medicamento (opcional)...</option>` + opciones;
}

async function handleGuardarCobro(e) {
    e.preventDefault();
    const pacienteSelect = document.getElementById("cobro-paciente-select");
    const pacienteId = pacienteSelect.value;
    const pacienteNombre = pacienteSelect.options[pacienteSelect.selectedIndex]?.text || "";

    const concepto = document.getElementById("cobro-concepto").value.trim();
    const montoConsulta = parseFloat(document.getElementById("cobro-monto-consulta").value) || 0;

    const medSelect = document.getElementById("cobro-medicamento-select");
    const medId = medSelect ? medSelect.value : "";
    let medNombre = "";
    let medPrecio = 0;

    if (medId) {
        const optSelected = medSelect.options[medSelect.selectedIndex];
        medPrecio = parseFloat(optSelected.getAttribute("data-precio")) || 0;
        const currentStock = parseInt(optSelected.getAttribute("data-stock")) || 0;
        medNombre = optSelected.text.split(" - ")[0];

        if (currentStock > 0) {
            const medRef = doc(db, "inventario", medId);
            await updateDoc(medRef, { stock: currentStock - 1 });
        }
    }

    const total = montoConsulta + medPrecio;

    try {
        const docRef = await addDoc(collection(db, "cobros"), {
            pacienteId,
            pacienteNombre,
            concepto,
            montoConsulta,
            medicamentoId: medId,
            medicamentoNombre: medNombre,
            medicamentoPrecio: medPrecio,
            total,
            fecha: serverTimestamp()
        });

        e.target.reset();
        generarTicket({
            id: docRef.id,
            pacienteNombre,
            concepto,
            montoConsulta,
            medicamentoNombre: medNombre,
            medicamentoPrecio: medPrecio,
            total,
            fecha: new Date().toLocaleString()
        });

    } catch (err) {
        console.error("Error al registrar cobro:", err);
    }
}

function renderizarCobros(cobros) {
    const tbody = document.getElementById("tabla-cobros-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    cobros.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.pacienteNombre || ""}</td>
            <td>${c.concepto || "Consulta"}</td>
            <td>$${c.total ? c.total.toFixed(2) : "0.00"}</td>
            <td>${c.fecha ? new Date(c.fecha.seconds * 1000).toLocaleString() : ""}</td>
        `;
        tbody.appendChild(tr);
    });
}

function generarTicket(datos) {
    const ticketBox = document.getElementById("ticket-cliente-container");
    if (!ticketBox) return;

    ticketBox.innerHTML = `
        <div id="ticketClienteImprimir" class="ticket-box">
            <div class="ticket-header">
                <h3>Comprobante de Pago</h3>
                <p>Clínica Médica</p>
                <small>Fecha: ${datos.fecha}</small>
            </div>
            <div class="ticket-row">
                <span><strong>Paciente:</strong></span>
                <span>${datos.pacienteNombre}</span>
            </div>
            <div class="ticket-row">
                <span><strong>Concepto:</strong></span>
                <span>${datos.concepto}</span>
            </div>
            <div class="ticket-row">
                <span>Consulta / Serv:</span>
                <span>$${datos.montoConsulta.toFixed(2)}</span>
            </div>
            ${datos.medicamentoNombre ? `
            <div class="ticket-row">
                <span>Med: ${datos.medicamentoNombre}</span>
                <span>$${datos.medicamentoPrecio.toFixed(2)}</span>
            </div>
            ` : ""}
            <div class="ticket-row ticket-total">
                <span>TOTAL:</span>
                <span>$${datos.total.toFixed(2)}</span>
            </div>
        </div>
    `;

    const areaImpresion = document.getElementById("area-impresion");
    if (areaImpresion) {
        areaImpresion.style.display = "block";
    }
}
