import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    where, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROJECT_ID.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT_ID.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUserRole = null;
let currentUserId = null;
let currentUserData = null;
let unsubscribeVentas = null;
let unsubscribeCitas = null;
let unsubscribePacientes = null;
let unsubscribeUsuarios = null;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    setupAuthListeners();
    setupDOMEvents();
    setupGlobalHelpers();
}

function setupAuthListeners() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            try {
                const userDoc = await getDoc(doc(db, "usuarios", user.uid));
                if (userDoc.exists()) {
                    currentUserData = userDoc.data();
                    if (currentUserData.rol) {
                        currentUserRole = currentUserData.rol.toLowerCase().trim();
                    } else {
                        currentUserRole = "secretaria";
                    }
                } else {
                    currentUserRole = "secretaria";
                }
            } catch (error) {
                console.error("Error al obtener rol:", error);
                currentUserRole = "secretaria";
            }
            
            showAppView();
            updateUserProfileUI();
            configureUIByRole(currentUserRole);
            initRealtimeData();
        } else {
            resetState();
            showLoginView();
        }
    });
}

function resetState() {
    currentUserId = null;
    currentUserRole = null;
    currentUserData = null;
    cleanupSubscriptions();
}

function setupDOMEvents() {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLoginSubmit);
    }

    const logoutBtn = document.getElementById("btnLogout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }

    const formVenta = document.getElementById("formNuevaVenta");
    if (formVenta) {
        formVenta.addEventListener("submit", handleNuevaVenta);
    }

    const formCita = document.getElementById("formNuevaCita");
    if (formCita) {
        formCita.addEventListener("submit", handleNuevaCita);
    }

    const formPaciente = document.getElementById("formNuevoPaciente");
    if (formPaciente) {
        formPaciente.addEventListener("submit", handleNuevoPaciente);
    }

    const btnCerrarExpediente = document.getElementById("btnCerrarExpediente");
    if (btnCerrarExpediente) {
        btnCerrarExpediente.addEventListener("click", cerrarModalExpediente);
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const pass = document.getElementById("loginPassword").value;
    const errorElement = document.getElementById("loginError");

    try {
        if (errorElement) {
            errorElement.classList.add("d-none");
            errorElement.innerText = "";
        }
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        if (errorElement) {
            errorElement.innerText = getAuthErrorMessage(error.code);
            errorElement.classList.remove("d-none");
        }
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
}

function showLoginView() {
    const loginContainer = document.getElementById("loginContainer");
    const appContainer = document.getElementById("appContainer");
    if (loginContainer) loginContainer.classList.remove("d-none");
    if (appContainer) appContainer.classList.add("d-none");
}

function showAppView() {
    const loginContainer = document.getElementById("loginContainer");
    const appContainer = document.getElementById("appContainer");
    if (loginContainer) loginContainer.classList.add("d-none");
    if (appContainer) appContainer.classList.remove("d-none");
}

function updateUserProfileUI() {
    const lblUserName = document.getElementById("lblUserName");
    const lblUserRole = document.getElementById("lblUserRole");
    
    if (lblUserName && currentUserData) {
        lblUserName.innerText = currentUserData.nombre || auth.currentUser.email;
    }
    if (lblUserRole) {
        lblUserRole.innerText = (currentUserRole || "Usuario").toUpperCase();
    }
}

function configureUIByRole(role) {
    const navTabs = document.getElementById("mainNavTabs");
    const adminMod = document.getElementById("adm-mod");
    const recepMod = document.getElementById("recep-mod");
    const psicoMod = document.getElementById("psico-mod");

    document.querySelectorAll(".role-block").forEach(el => el.classList.add("d-none"));

    if (navTabs) {
        navTabs.innerHTML = "";
        
        if (role === "admin") {
            navTabs.innerHTML = `
                <li class="nav-item">
                    <button class="nav-link active tab-btn" data-mod="adm-mod">Administración y Reportes</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link tab-btn" data-mod="recep-mod">Recepción y Caja</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link tab-btn" data-mod="psico-mod">Consultas Psicología</button>
                </li>
            `;
        } else if (role === "psicologo" || role === "psicologa") {
            navTabs.innerHTML = `
                <li class="nav-item">
                    <button class="nav-link active tab-btn" data-mod="psico-mod">Mis Consultas y Pacientes</button>
                </li>
            `;
        } else {
            navTabs.innerHTML = `
                <li class="nav-item">
                    <button class="nav-link active tab-btn" data-mod="recep-mod">Recepción y Caja</button>
                </li>
            `;
        }

        bindTabEvents();
    }

    document.querySelectorAll(".module").forEach(m => m.classList.remove("active", "d-none"));
    
    if (role === "admin") {
        if (adminMod) adminMod.classList.add("active");
    } else if (role === "psicologo" || role === "psicologa") {
        if (psicoMod) psicoMod.classList.add("active");
        if (adminMod) adminMod.classList.add("d-none");
        if (recepMod) recepMod.classList.add("d-none");
    } else {
        if (recepMod) recepMod.classList.add("active");
        if (adminMod) adminMod.classList.add("d-none");
        if (psicoMod) psicoMod.classList.add("d-none");
    }
}

function bindTabEvents() {
    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            tabButtons.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".module").forEach(m => m.classList.remove("active"));
            
            e.target.classList.add("active");
            const targetId = e.target.getAttribute("data-mod");
            const targetMod = document.getElementById(targetId);
            if (targetMod) targetMod.classList.add("active");
        });
    });
}

function initRealtimeData() {
    cleanupSubscriptions();
    subscribeVentas();
    subscribeCitas();
    subscribePacientes();
}

function subscribeVentas() {
    const ventasRef = collection(db, "ventas");
    const qVentas = query(ventasRef, orderBy("fechaCreacion", "desc"));

    unsubscribeVentas = onSnapshot(qVentas, (snapshot) => {
        let totalIngresos = 0;
        let totalVentasContador = 0;
        const tablaVentasAdmin = document.getElementById("tablaVentasAdmin");
        const tablaVentasRecep = document.getElementById("tablaVentasRecep");

        if (tablaVentasAdmin) tablaVentasAdmin.innerHTML = "";
        if (tablaVentasRecep) tablaVentasRecep.innerHTML = "";

        if (snapshot.empty) {
            const emptyRow = `<tr><td colspan="5" class="text-center text-muted">No hay registros de ventas</td></tr>`;
            if (tablaVentasAdmin) tablaVentasAdmin.innerHTML = emptyRow;
            if (tablaVentasRecep) tablaVentasRecep.innerHTML = emptyRow;
        } else {
            snapshot.forEach((docSnap) => {
                const venta = docSnap.data();
                const monto = parseFloat(venta.total || 0);
                totalIngresos += monto;
                totalVentasContador++;

                const fechaTexto = venta.fechaCreacion ? new Date(venta.fechaCreacion.toDate()).toLocaleString() : (venta.fecha || "N/A");
                const rowHTML = `
                    <tr>
                        <td>${venta.ticketId || docSnap.id.substring(0, 8)}</td>
                        <td>${venta.cliente || "Público General"}</td>
                        <td>$${monto.toFixed(2)}</td>
                        <td>${venta.metodoPago || "Efectivo"}</td>
                        <td>${fechaTexto}</td>
                    </tr>
                `;

                if (tablaVentasAdmin) tablaVentasAdmin.innerHTML += rowHTML;
                if (tablaVentasRecep) tablaVentasRecep.innerHTML += rowHTML;
            });
        }

        const lblTotalIngresos = document.getElementById("adminTotalIngresos");
        const lblTotalVentas = document.getElementById("adminTotalVentas");

        if (lblTotalIngresos) lblTotalIngresos.innerText = `$${totalIngresos.toFixed(2)}`;
        if (lblTotalVentas) lblTotalVentas.innerText = totalVentasContador;
    }, (error) => {
        console.error("Error al suscribirse a ventas:", error);
    });
}

function subscribeCitas() {
    const citasRef = collection(db, "citas");
    const qCitas = query(citasRef, orderBy("fechaHora", "asc"));

    unsubscribeCitas = onSnapshot(qCitas, (snapshot) => {
        const tablaCitas = document.getElementById("tablaCitas");
        const lblTotalCitas = document.getElementById("adminTotalCitas");
        
        if (tablaCitas) tablaCitas.innerHTML = "";
        if (lblTotalCitas) lblTotalCitas.innerText = snapshot.size;

        if (snapshot.empty) {
            if (tablaCitas) tablaCitas.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No hay citas programadas</td></tr>`;
        } else {
            snapshot.forEach((docSnap) => {
                const cita = docSnap.data();
                if (tablaCitas) {
                    tablaCitas.innerHTML += `
                        <tr>
                            <td>${cita.paciente || "N/A"}</td>
                            <td>${cita.psicologo || "N/A"}</td>
                            <td>${cita.fechaHora || "N/A"}</td>
                            <td><span class="badge bg-${cita.estado === 'Completada' ? 'success' : 'primary'}">${cita.estado || 'Pendiente'}</span></td>
                            <td>
                                <button class="btn btn-sm btn-outline-danger" onclick="eliminarCita('${docSnap.id}')">Cancelar</button>
                            </td>
                        </tr>
                    `;
                }
            });
        }
    }, (error) => {
        console.error("Error al suscribirse a citas:", error);
    });
}

function subscribePacientes() {
    const pacientesRef = collection(db, "pacientes");
    const qPacientes = query(pacientesRef, orderBy("nombre", "asc"));

    unsubscribePacientes = onSnapshot(qPacientes, (snapshot) => {
        const tablaPacientes = document.getElementById("tablaPacientes");
        const selectPacientesCita = document.getElementById("selectPacienteCita");
        
        if (tablaPacientes) tablaPacientes.innerHTML = "";
        if (selectPacientesCita) selectPacientesCita.innerHTML = `<option value="">Seleccione un paciente...</option>`;

        snapshot.forEach((docSnap) => {
            const pac = docSnap.data();
            if (tablaPacientes) {
                tablaPacientes.innerHTML += `
                    <tr>
                        <td>${pac.nombre} ${pac.apellidos || ''}</td>
                        <td>${pac.telefono || 'N/A'}</td>
                        <td>${pac.email || 'N/A'}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-info" onclick="verExpediente('${docSnap.id}')">Ver Expediente</button>
                        </td>
                    </tr>
                `;
            }
            if (selectPacientesCita) {
                selectPacientesCita.innerHTML += `<option value="${pac.nombre} ${pac.apellidos || ''}">${pac.nombre} ${pac.apellidos || ''}</option>`;
            }
        });
    }, (error) => {
        console.error("Error al suscribirse a pacientes:", error);
    });
}

function cleanupSubscriptions() {
    if (unsubscribeVentas) { unsubscribeVentas(); unsubscribeVentas = null; }
    if (unsubscribeCitas) { unsubscribeCitas(); unsubscribeCitas = null; }
    if (unsubscribePacientes) { unsubscribePacientes(); unsubscribePacientes = null; }
    if (unsubscribeUsuarios) { unsubscribeUsuarios(); unsubscribeUsuarios = null; }
}

async function handleNuevaVenta(e) {
    e.preventDefault();
    const clienteInput = document.getElementById("ventaCliente");
    const totalInput = document.getElementById("ventaTotal");
    const metodoInput = document.getElementById("ventaMetodo");

    const cliente = clienteInput ? clienteInput.value : "";
    const total = totalInput ? totalInput.value : "0";
    const metodoPago = metodoInput ? metodoInput.value : "Efectivo";

    try {
        await addDoc(collection(db, "ventas"), {
            cliente: cliente || "Público General",
            total: parseFloat(total),
            metodoPago: metodoPago,
            fechaCreacion: serverTimestamp(),
            ticketId: "TK-" + Math.floor(100000 + Math.random() * 900000),
            registradoPor: currentUserId
        });
        document.getElementById("formNuevaVenta").reset();
    } catch (error) {
        console.error("Error al registrar venta:", error);
        alert("Error al registrar la venta");
    }
}

async function handleNuevaCita(e) {
    e.preventDefault();
    const pacienteInput = document.getElementById("selectPacienteCita");
    const psicologoInput = document.getElementById("citaPsicologo");
    const fechaHoraInput = document.getElementById("citaFechaHora");

    const paciente = pacienteInput ? pacienteInput.value : "";
    const psicologo = psicologoInput ? psicologoInput.value : "";
    const fechaHora = fechaHoraInput ? fechaHoraInput.value : "";

    try {
        await addDoc(collection(db, "citas"), {
            paciente: paciente,
            psicologo: psicologo,
            fechaHora: fechaHora,
            estado: "Pendiente",
            fechaCreacion: serverTimestamp(),
            creadoPor: currentUserId
        });
        document.getElementById("formNuevaCita").reset();
    } catch (error) {
        console.error("Error al agendar cita:", error);
        alert("Error al agendar la cita");
    }
}

async function handleNuevoPaciente(e) {
    e.preventDefault();
    const nombreInput = document.getElementById("pacienteNombre");
    const apellidosInput = document.getElementById("pacienteApellidos");
    const telefonoInput = document.getElementById("pacienteTelefono");

    const nombre = nombreInput ? nombreInput.value : "";
    const apellidos = apellidosInput ? apellidosInput.value : "";
    const telefono = telefonoInput ? telefonoInput.value : "";

    try {
        await addDoc(collection(db, "pacientes"), {
            nombre: nombre,
            apellidos: apellidos,
            telefono: telefono,
            fechaRegistro: serverTimestamp()
        });
        document.getElementById("formNuevoPaciente").reset();
    } catch (error) {
        console.error("Error al registrar paciente:", error);
        alert("Error al registrar paciente");
    }
}

function setupGlobalHelpers() {
    window.eliminarCita = async function(id) {
        if (confirm("¿Desea cancelar esta cita?")) {
            try {
                await deleteDoc(doc(db, "citas", id));
            } catch (error) {
                console.error("Error al eliminar cita:", error);
                alert("Error al eliminar cita");
            }
        }
    };

    window.verExpediente = async function(id) {
        try {
            const docRef = doc(db, "pacientes", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const pac = docSnap.data();
                
                const expNombre = document.getElementById("expedienteNombre");
                const expTelefono = document.getElementById("expedienteTelefono");
                const expEmail = document.getElementById("expedienteEmail");
                const expNotas = document.getElementById("expedienteNotas");

                if (expNombre) expNombre.innerText = `${pac.nombre || ''} ${pac.apellidos || ''}`;
                if (expTelefono) expTelefono.innerText = pac.telefono || 'N/A';
                if (expEmail) expEmail.innerText = pac.email || 'N/A';
                if (expNotas) expNotas.innerText = pac.notas || 'Sin observaciones registradas.';

                const modalExpediente = document.getElementById("modalExpediente");
                if (modalExpediente) {
                    if (window.bootstrap && bootstrap.Modal) {
                        const modal = bootstrap.Modal.getOrCreateInstance(modalExpediente);
                        modal.show();
                    } else {
                        modalExpediente.classList.remove("d-none");
                        modalExpediente.style.display = "block";
                    }
                } else {
                    alert(`EXPEDIENTE PACIENTE:\nNombre: ${pac.nombre} ${pac.apellidos || ''}\nTeléfono: ${pac.telefono || 'N/A'}\nEmail: ${pac.email || 'N/A'}`);
                }
            } else {
                alert("No se encontró el registro del paciente.");
            }
        } catch (error) {
            console.error("Error al consultar expediente:", error);
            alert("Error al cargar el expediente.");
        }
    };
}

function cerrarModalExpediente() {
    const modalExpediente = document.getElementById("modalExpediente");
    if (modalExpediente) {
        if (window.bootstrap && bootstrap.Modal) {
            const modal = bootstrap.Modal.getInstance(modalExpediente);
            if (modal) modal.hide();
        } else {
            modalExpediente.classList.add("d-none");
            modalExpediente.style.display = "none";
        }
    }
}

function getAuthErrorMessage(code) {
    switch (code) {
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "Credenciales incorrectas o usuario no registrado.";
        case "auth/invalid-email":
            return "El formato de correo electrónico no es válido.";
        case "auth/too-many-requests":
            return "Demasiados intentos fallidos. Intente más tarde.";
        default:
            return "Error al iniciar sesión. Intente nuevamente.";
    }
}