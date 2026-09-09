import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc,
    doc, 
    setDoc,
    updateDoc, 
    deleteDoc,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export { signInWithEmailAndPassword, signOut, onAuthStateChanged };
export { collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, onSnapshot };

let currentUserRole = null;
let cajaActualItems = [];

const consultasRef = collection(db, "consultas");
const inventarioRef = collection(db, "inventario");
const ventasRef = collection(db, "ventas");

document.addEventListener("DOMContentLoaded", () => {
    setupAuthListeners();
    setupEventListeners();
    
    const inputFecha = document.getElementById("reporteFecha");
    if (inputFecha) {
        inputFecha.value = new Date().toISOString().split('T')[0];
    }

    const inputCaducidad = document.getElementById("invCaducidad");
    if (inputCaducidad) {
        const hoy = new Date().toISOString().split('T')[0];
        inputCaducidad.setAttribute("min", hoy);
    }
});

function setupAuthListeners() {
    const formLogin = document.getElementById("formLogin");
    if (formLogin) {
        formLogin.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("loginEmail").value;
            const pass = document.getElementById("loginPassword").value;
            const errDiv = document.getElementById("loginError");

            try {
                if (errDiv) errDiv.style.display = "none";
                await signInWithEmailAndPassword(auth, email, pass);
            } catch (err) {
                if (errDiv) {
                    errDiv.innerText = "Error: Credenciales inválidas.";
                    errDiv.style.display = "block";
                }
            }
        });
    }

    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
        btnLogout.addEventListener("click", () => signOut(auth));
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "usuarios", user.uid));
                if (userDoc.exists()) {
                    currentUserRole = userDoc.data().rol;
                } else {
                    currentUserRole = "secretaria"; 
                }
            } catch (error) {
                currentUserRole = "secretaria";
            }

            const userDisplayEmail = document.getElementById("userDisplayEmail");
            const userDisplayRole = document.getElementById("userDisplayRole");
            const loginScreen = document.getElementById("login-screen");
            const appScreen = document.getElementById("app-screen");

            if (userDisplayEmail) userDisplayEmail.innerText = user.email;
            if (userDisplayRole) userDisplayRole.innerText = currentUserRole;
            if (loginScreen) loginScreen.style.display = "none";
            if (appScreen) appScreen.style.display = "block";

            configureUIByRole(currentUserRole);
            initRealtimeData();
        } else {
            const loginScreen = document.getElementById("login-screen");
            const appScreen = document.getElementById("app-screen");
            if (loginScreen) loginScreen.style.display = "flex";
            if (appScreen) appScreen.style.display = "none";
        }
    });
}

function configureUIByRole(role) {
    const nav = document.getElementById("mainNav");
    if (!nav) return;

    nav.innerHTML = "";
    document.querySelectorAll(".module").forEach(m => m.classList.remove("active"));

    if (role === "secretaria") {
        nav.innerHTML = '<button class="tab-btn active" data-mod="sec-mod">Recepción (Secretaría)</button>';
        const secMod = document.getElementById("sec-mod");
        if (secMod) secMod.classList.add("active");
    } 
    else if (role === "farmacia") {
        nav.innerHTML = '<button class="tab-btn active" data-mod="farm-mod">Farmacia, Caja e Inventario</button>';
        const farmMod = document.getElementById("farm-mod");
        if (farmMod) farmMod.classList.add("active");
    } 
    else if (role === "admin") {
        nav.innerHTML = `
            <button class="tab-btn active" data-mod="adm-mod">Reportes y Contabilidad</button>
            <button class="tab-btn" data-mod="sec-mod">Recepción</button>
            <button class="tab-btn" data-mod="farm-mod">Farmacia / Inventario</button>
        `;
        const admMod = document.getElementById("adm-mod");
        if (admMod) admMod.classList.add("active");

        nav.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                nav.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                document.querySelectorAll(".module").forEach(m => m.classList.remove("active"));
                btn.classList.add("active");
                const targetMod = document.getElementById(btn.getAttribute("data-mod"));
                if (targetMod) targetMod.classList.add("active");
            });
        });
    }
}

function setupEventListeners() {
    const consultaTipo = document.getElementById("consultaTipo");
    if (consultaTipo) {
        consultaTipo.addEventListener("change", (e) => {
            const selected = e.target.options[e.target.selectedIndex];
            const costoInput = document.getElementById("costoConsulta");
            if (costoInput) costoInput.value = selected.getAttribute("data-costo");
        });
    }

    const formConsulta = document.getElementById("formConsulta");
    if (formConsulta) formConsulta.addEventListener("submit", guardarConsulta);
    
    const btnAgregarMed = document.getElementById("btnAgregarMed");
    if (btnAgregarMed) btnAgregarMed.addEventListener("click", agregarMedicamentoACaja);

    const btnProcessPayment = document.getElementById("btnProcessPayment");
    if (btnProcessPayment) btnProcessPayment.addEventListener("click", procesarCobroFirestore);

    const formInventario = document.getElementById("formInventario");
    if (formInventario) formInventario.addEventListener("submit", guardarInventarioFirestore);

    document.getElementById("btnGenerarReporteContable")?.addEventListener("click", generarReporteContableTurno);
    document.getElementById("btnGenerarReporteInegi")?.addEventListener("click", generarReporteInegiPDF);
    document.getElementById("btnPrintTicketNow")?.addEventListener("click", () => window.print());
}

async function guardarConsulta(e) {
    e.preventDefault();
    const folio = "FOL-" + Math.floor(1000 + Math.random() * 9000);
    
    const consultaData = {
        folio: folio,
        paciente: document.getElementById("pacienteNombre").value,
        servicio: document.getElementById("consultaTipo").value,
        medico: document.getElementById("medicoSelect").value,
        consultorio: document.getElementById("consultorio").value,
        costo: parseFloat(document.getElementById("costoConsulta").value),
        estado: "PENDIENTE",
        fecha: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
        timestamp: Date.now()
    };

    try {
        await addDoc(consultasRef, consultaData);

        document.getElementById("lblFolio").innerText = folio;
        document.getElementById("lblPaciente").innerText = consultaData.paciente;
        document.getElementById("lblMedico").innerText = consultaData.medico;
        document.getElementById("lblConsultorio").innerText = consultaData.consultorio;
        document.getElementById("lblServicio").innerText = consultaData.servicio;
        document.getElementById("lblTotal").innerText = `$${consultaData.costo.toFixed(2)}`;

        const placeholder = document.getElementById("ticketPlaceholder");
        const generated = document.getElementById("ticketGenerated");
        if (placeholder) placeholder.style.display = "none";
        if (generated) generated.style.display = "block";

        alert(`Orden enviada a Caja. Folio: ${folio}`);
        document.getElementById("formConsulta").reset();
    } catch (err) {
        console.error(err);
        alert("Error al registrar consulta.");
    }
}

async function guardarInventarioFirestore(e) {
    e.preventDefault();

    const caducidadValor = document.getElementById("invCaducidad").value;
    const fechaCaducidad = new Date(caducidadValor + "T00:00:00");
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fechaCaducidad < hoy) {
        alert("Error: No se pueden registrar medicamentos caducados.");
        return;
    }

    const codigo = document.getElementById("invCodigo").value.trim();
    const itemData = {
        codigo: codigo,
        nombre: document.getElementById("invNombre").value.trim(),
        categoria: document.getElementById("invCat").value.trim(),
        ubicacion: document.getElementById("invUbicacion").value.trim(),
        precio: parseFloat(document.getElementById("invPrecio").value),
        stock: parseInt(document.getElementById("invStock").value),
        minStock: parseInt(document.getElementById("invMinStock").value),
        caducidad: caducidadValor
    };

    try {
        const itemDocRef = doc(db, "inventario", codigo);
        await setDoc(itemDocRef, itemData, { merge: true });
        alert("Insumo registrado/actualizado correctamente.");
        document.getElementById("formInventario").reset();
    } catch (err) {
        console.error(err);
        alert("Error al guardar en el inventario.");
    }
}

window.cargarOrdenACaja = function(docId, servicio, paciente, costo) {
    const existe = cajaActualItems.some(i => i.firestoreId === docId);
    if (existe) return alert("Esta consulta ya está en la caja.");

    cajaActualItems.push({
        desc: `${servicio} - ${paciente}`,
        cant: 1,
        precio: costo,
        subtotal: costo,
        firestoreId: docId,
        tipo: "CONSULTA"
    });
    renderTablaCaja();
};

async function agregarMedicamentoACaja() {
    const select = document.getElementById("selectMedPrescription");
    if (!select || !select.value) return alert("Selecciona un medicamento del inventario.");

    const codigo = select.value;
    const inputCant = document.getElementById("cantMedPrescription");
    const cantidad = parseInt(inputCant.value) || 1;

    try {
        const medDoc = await getDoc(doc(db, "inventario", codigo));
        if (!medDoc.exists()) return alert("El medicamento no existe en el inventario.");

        const data = medDoc.data();
        if (data.stock < cantidad) {
            return alert(`Stock insuficiente. Stock actual disponible: ${data.stock}`);
        }

        const subtotal = data.precio * cantidad;
        cajaActualItems.push({
            desc: data.nombre,
            cant: cantidad,
            precio: data.precio,
            subtotal: subtotal,
            firestoreId: codigo,
            tipo: "MEDICAMENTO"
        });

        renderTablaCaja();
        inputCant.value = 1;
        select.value = "";
    } catch (err) {
        console.error(err);
        alert("Error al agregar el medicamento a la caja.");
    }
}

function renderTablaCaja() {
    const tbody = document.getElementById("cajaItems");
    const totalSpan = document.getElementById("cajaTotal");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (cajaActualItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay ítems cargados en la caja</td></tr>';
        if (totalSpan) totalSpan.innerText = "$0.00";
        return;
    }

    let totalGlobal = 0;
    cajaActualItems.forEach((item, index) => {
        totalGlobal += item.subtotal;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.desc}</td>
            <td>${item.cant}</td>
            <td>$${item.precio.toFixed(2)}</td>
            <td>$${item.subtotal.toFixed(2)} <button onclick="window.eliminarItemCaja(${index})" class="btn btn-danger btn-auto" style="padding:2px 6px; font-size:10px;">X</button></td>
        `;
        tbody.appendChild(tr);
    });

    if (totalSpan) totalSpan.innerText = `$${totalGlobal.toFixed(2)}`;
}

window.eliminarItemCaja = function(index) {
    cajaActualItems.splice(index, 1);
    renderTablaCaja();
};

async function procesarCobroFirestore() {
    if (cajaActualItems.length === 0) return alert("La caja está vacía.");

    const nombreCliente = document.getElementById("cajaNombreCliente").value.trim() || "Público General";
    const metodoPago = document.getElementById("cajaMetodoPago").value;
    const totalGlobal = cajaActualItems.reduce((acc, item) => acc + item.subtotal, 0);
    const ticketId = "TICK-" + Math.floor(100000 + Math.random() * 900000);

    const ventaData = {
        ticketId: ticketId,
        cliente: nombreCliente,
        metodoPago: metodoPago,
        items: cajaActualItems,
        total: totalGlobal,
        fecha: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
        timestamp: Date.now()
    };

    try {
        await addDoc(ventasRef, ventaData);

        for (const item of cajaActualItems) {
            if (item.tipo === "CONSULTA" && item.firestoreId) {
                await updateDoc(doc(db, "consultas", item.firestoreId), { estado: "PAGADA" });
            } else if (item.tipo === "MEDICAMENTO" && item.firestoreId) {
                const medRef = doc(db, "inventario", item.firestoreId);
                const medSnap = await getDoc(medRef);
                if (medSnap.exists()) {
                    const nuevoStock = medSnap.data().stock - item.cant;
                    await updateDoc(medRef, { stock: nuevoStock >= 0 ? nuevoStock : 0 });
                }
            }
        }

        document.getElementById("tckId").innerText = ticketId;
        document.getElementById("tckCliente").innerText = nombreCliente;
        document.getElementById("tckFecha").innerText = ventaData.fecha;
        document.getElementById("tckPago").innerText = metodoPago;
        document.getElementById("tckTotal").innerText = totalGlobal.toFixed(2);

        let detalleHTML = "";
        cajaActualItems.forEach(i => {
            detalleHTML += `<p style="margin:2px 0;">${i.cant}x ${i.desc} - $${i.subtotal.toFixed(2)}</p>`;
        });
        document.getElementById("tckDetalleItems").innerHTML = detalleHTML;
        document.getElementById("ticketClienteImprimir").style.display = "block";

        alert(`Cobro realizado con éxito. Ticket: ${ticketId}`);
        cajaActualItems = [];
        renderTablaCaja();
        document.getElementById("cajaNombreCliente").value = "";
    } catch (err) {
        console.error(err);
        alert("Error al procesar el cobro en la base de datos.");
    }
}

function initRealtimeData() {
    onSnapshot(consultasRef, (snapshot) => {
        const tbodyPendientes = document.getElementById("tablaConsultasPendientes");
        const tablaReporte = document.getElementById("tablaReporteConsultas");
        
        if (!tbodyPendientes) return;

        tbodyPendientes.innerHTML = "";
        if (tablaReporte) tablaReporte.innerHTML = "";

        let totalConsultasCount = 0;
        let hayPendientes = false;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            totalConsultasCount++;

            if (tablaReporte) {
                const trRep = document.createElement("tr");
                trRep.innerHTML = `
                    <td>${data.fecha || 'N/A'}</td>
                    <td>${data.folio}</td>
                    <td>${data.paciente}</td>
                    <td>${data.servicio}</td>
                    <td>${data.medico}</td>
                    <td>$${data.costo.toFixed(2)}</td>
                    <td><span class="badge ${data.estado === 'PAGADA' ? 'text-success' : 'text-danger'}">${data.estado}</span></td>
                `;
                tablaReporte.appendChild(trRep);
            }

            if (data.estado === "PENDIENTE") {
                hayPendientes = true;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${data.folio}</td>
                    <td>${data.paciente}</td>
                    <td>${data.servicio}</td>
                    <td>$${data.costo.toFixed(2)}</td>
                    <td><button onclick="window.cargarOrdenACaja('${id}', '${data.servicio}', '${data.paciente}', ${data.costo})" class="btn btn-success btn-auto" style="padding:4px 8px; font-size:11px;">Cargar a Caja</button></td>
                `;
                tbodyPendientes.appendChild(tr);
            }
        });

        if (!hayPendientes) {
            tbodyPendientes.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay consultas pendientes de cobro</td></tr>';
        }

        const totalC_El = document.getElementById("admTotalConsultas");
        if (totalC_El) totalC_El.innerText = totalConsultasCount;
    });

    onSnapshot(inventarioRef, (snapshot) => {
        const tablaInv = document.getElementById("tablaInventarioBody");
        const selectMed = document.getElementById("selectMedPrescription");

        if (tablaInv) tablaInv.innerHTML = "";
        if (selectMed) selectMed.innerHTML = '<option value="">-- Seleccionar producto --</option>';

        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            
            if (tablaInv) {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${item.codigo}</td>
                    <td>${item.nombre}</td>
                    <td>${item.categoria}</td>
                    <td>${item.ubicacion}</td>
                    <td>$${item.precio.toFixed(2)}</td>
                    <td class="${item.stock <= item.minStock ? 'text-danger text-bold' : ''}">${item.stock}</td>
                    <td>${item.minStock}</td>
                    <td>${item.caducidad}</td>
                `;
                tablaInv.appendChild(tr);
            }

            if (selectMed && item.stock > 0) {
                const opt = document.createElement("option");
                opt.value = item.codigo;
                opt.textContent = `${item.nombre} - Stock: ${item.stock} ($${item.precio.toFixed(2)})`;
                selectMed.appendChild(opt);
            }
        });
    });

    onSnapshot(ventasRef, (snapshot) => {
        let ventasTotales = 0;
        let honorariosTotales = 0;

        snapshot.forEach((docSnap) => {
            const v = docSnap.data();
            ventasTotales += v.total || 0;

            if (v.items && Array.isArray(v.items)) {
                v.items.forEach(i => {
                    if (i.tipo === "CONSULTA") {
                        honorariosTotales += (i.subtotal * 0.70);
                    }
                });
            }
        });

        const admVentasDia = document.getElementById("admVentasDia");
        const admHonorarios = document.getElementById("admHonorarios");

        if (admVentasDia) admVentasDia.innerText = `$${ventasTotales.toFixed(2)}`;
        if (admHonorarios) admHonorarios.innerText = `$${honorariosTotales.toFixed(2)}`;
    });
}

function generarReporteContableTurno() {
    alert("Generando reporte contable en PDF...");
}

function generarReporteInegiPDF() {
    alert("Generando boleta estadística INEGI...");
}
