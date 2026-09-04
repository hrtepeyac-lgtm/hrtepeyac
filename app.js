import { 
    auth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    db, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc,
    doc, 
    setDoc,
    updateDoc, 
    deleteDoc,
    onSnapshot 
} from "./firebase-config.js";

let currentUserRole = null;
let cajaActualItems = [];

const consultasRef = collection(db, "consultas");
const inventarioRef = collection(db, "inventario");
const ventasRef = collection(db, "ventas");

document.addEventListener("DOMContentLoaded", () => {
    setupAuthListeners();
    setupEventListeners();
    
    const inputFecha = document.getElementById("reporteFecha");
    if(inputFecha) {
        inputFecha.value = new Date().toISOString().split('T')[0];
    }

    const inputCaducidad = document.getElementById("invCaducidad");
    if (inputCaducidad) {
        const hoy = new Date().toISOString().split('T')[0];
        inputCaducidad.setAttribute("min", hoy);
    }
});

function setupAuthListeners() {
    document.getElementById("formLogin").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value;
        const pass = document.getElementById("loginPassword").value;
        const errDiv = document.getElementById("loginError");

        try {
            errDiv.style.display = "none";
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (err) {
            errDiv.innerText = "Error: Credenciales inválidas.";
            errDiv.style.display = "block";
        }
    });

    document.getElementById("btnLogout").addEventListener("click", () => signOut(auth));

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                currentUserRole = userDoc.data().rol;
            } else {
                currentUserRole = "secretaria"; 
            }

            document.getElementById("userDisplayEmail").innerText = user.email;
            document.getElementById("userDisplayRole").innerText = currentUserRole;
            document.getElementById("login-screen").style.display = "none";
            document.getElementById("app-screen").style.display = "block";

            configureUIByRole(currentUserRole);
            initRealtimeData();
        } else {
            document.getElementById("login-screen").style.display = "flex";
            document.getElementById("app-screen").style.display = "none";
        }
    });
}

function configureUIByRole(role) {
    const nav = document.getElementById("mainNav");
    nav.innerHTML = "";

    document.querySelectorAll(".module").forEach(m => m.classList.remove("active"));

    if (role === "secretaria") {
        nav.innerHTML = '<button class="tab-btn active" data-mod="sec-mod">Recepción (Secretaría)</button>';
        document.getElementById("sec-mod").classList.add("active");
    } 
    else if (role === "farmacia") {
        nav.innerHTML = '<button class="tab-btn active" data-mod="farm-mod">Farmacia, Caja e Inventario</button>';
        document.getElementById("farm-mod").classList.add("active");
    } 
    else if (role === "admin") {
        nav.innerHTML = `
            <button class="tab-btn active" data-mod="adm-mod">Reportes y Contabilidad</button>
            <button class="tab-btn" data-mod="sec-mod">Recepción</button>
            <button class="tab-btn" data-mod="farm-mod">Farmacia / Inventario</button>
        `;
        document.getElementById("adm-mod").classList.add("active");

        nav.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                nav.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                document.querySelectorAll(".module").forEach(m => m.classList.remove("active"));
                btn.classList.add("active");
                document.getElementById(btn.getAttribute("data-mod")).classList.add("active");
            });
        });
    }
}

function setupEventListeners() {
    document.getElementById("consultaTipo").addEventListener("change", (e) => {
        const selected = e.target.options[e.target.selectedIndex];
        document.getElementById("costoConsulta").value = selected.getAttribute("data-costo");
    });

    document.getElementById("formConsulta").addEventListener("submit", guardarConsulta);
    
    const btnAgregarMed = document.getElementById("btnAgregarMed");
    if (btnAgregarMed) {
        btnAgregarMed.addEventListener("click", agregarMedicamentoACaja);
    }

    document.getElementById("btnProcessPayment").addEventListener("click", procesarCobroFirestore);
    document.getElementById("formInventario").addEventListener("submit", guardarInventarioFirestore);
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
        fecha: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };

    try {
        await addDoc(consultasRef, consultaData);

        document.getElementById("lblFolio").innerText = folio;
        document.getElementById("lblPaciente").innerText = consultaData.paciente;
        document.getElementById("lblMedico").innerText = consultaData.medico;
        document.getElementById("lblConsultorio").innerText = consultaData.consultorio;
        document.getElementById("lblServicio").innerText = consultaData.servicio;
        document.getElementById("lblTotal").innerText = `$${consultaData.costo.toFixed(2)}`;

        document.getElementById("ticketPlaceholder").style.display = "none";
        document.getElementById("ticketGenerated").style.display = "block";

        alert(`Orden enviada a Caja. Folio: ${folio}`);
        document.getElementById("formConsulta").reset();
    } catch (err) {
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
        alert("Error: No se pueden registrar o actualizar medicamentos caducados (fecha anterior al día de hoy).");
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
        alert("Error al guardar en el inventario.");
    }
}

window.cargarOrdenACaja = function(docId, servicio, paciente, costo) {
    const existe = cajaActualItems.some(i => i.firestoreId === docId);
    if(existe) return alert("Esta consulta ya está en la caja.");

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

function agregarMedicamentoACaja() {
    const select = document.getElementById("selectMedPrescription");
    const selectedOption = select.options[select.selectedIndex];
    if (!select.value) return alert("Selecciona un medicamento del inventario.");

    const inputCant = document.getElementById("cantMedPrescription");
    const cantidadDeseada = inputCant ? parseInt(inputCant.value) || 1 : 1;

    if (cantidadDeseada <= 0) return alert("Ingresa una cantidad válida mayor a 0.");

    const id = select.value;
    const nombre = selectedOption.getAttribute("data-nombre");
    const precio = parseFloat(selectedOption.getAttribute("data-precio"));
    const stockActual = parseInt(selectedOption.getAttribute("data-stock"));

    const itemExistente = cajaActualItems.find(i => i.id === id && i.tipo === "MEDICAMENTO");
    const cantidadEnCarrito = itemExistente ? itemExistente.cant : 0;
    const cantidadTotalSolicitada = cantidadEnCarrito + cantidadDeseada;

    if (cantidadTotalSolicitada > stockActual) {
        return alert(`Stock insuficiente. Stock disponible: ${stockActual} (Ya tienes ${cantidadEnCarrito} en la caja).`);
    }

    if (itemExistente) {
        itemExistente.cant += cantidadDeseada;
        itemExistente.subtotal = itemExistente.cant * precio;
    } else {
        cajaActualItems.push({
            id: id,
            desc: nombre,
            cant: cantidadDeseada,
            precio: precio,
            subtotal: cantidadDeseada * precio,
            tipo: "MEDICAMENTO"
        });
    }

    select.value = "";
    if (inputCant) inputCant.value = 1;

    renderTablaCaja();
}

function renderTablaCaja() {
    const tbody = document.getElementById("cajaItems");
    tbody.innerHTML = "";
    let total = 0;

    if (cajaActualItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No hay ítems cargados en la caja</td></tr>`;
        document.getElementById("cajaTotal").innerText = "$0.00";
        return;
    }

    cajaActualItems.forEach(item => {
        total += item.subtotal;
        tbody.innerHTML += `
            <tr>
                <td>${item.desc}</td>
                <td>${item.cant}</td>
                <td>$${item.precio.toFixed(2)}</td>
                <td>$${item.subtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    document.getElementById("cajaTotal").innerText = `$${total.toFixed(2)}`;
}

async function procesarCobroFirestore() {
    if (cajaActualItems.length === 0) return alert("No hay ítems en la caja.");

    const inputCliente = document.getElementById("cajaNombreCliente").value.trim();
    const clienteNombre = inputCliente !== "" ? inputCliente : "Público General";

    const total = cajaActualItems.reduce((acc, i) => acc + i.subtotal, 0);
    const metodoPago = document.getElementById("cajaMetodoPago").value;
    const ticketId = "TCK-" + Math.floor(10000 + Math.random() * 90000);
    const fechaHora = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString();

    try {
        await addDoc(ventasRef, {
            ticketId: ticketId,
            cliente: clienteNombre,
            items: cajaActualItems,
            total: total,
            metodoPago: metodoPago,
            fecha: fechaHora
        });

        for (let item of cajaActualItems) {
            if (item.tipo === "CONSULTA" && item.firestoreId) {
                await updateDoc(doc(db, "consultas", item.firestoreId), { estado: "PAGADO" });
            } else if (item.tipo === "MEDICAMENTO" && item.id) {
                const medRef = doc(db, "inventario", item.id);
                const medSnap = await getDoc(medRef);
                if (medSnap.exists()) {
                    const nuevoStock = Math.max(0, medSnap.data().stock - item.cant);
                    await updateDoc(medRef, { stock: nuevoStock });
                }
            }
        }

        document.getElementById("tckId").innerText = ticketId;
        document.getElementById("tckCliente").innerText = clienteNombre;
        document.getElementById("tckFecha").innerText = fechaHora;
        document.getElementById("tckPago").innerText = metodoPago;
        document.getElementById("tckTotal").innerText = total.toFixed(2);

        const detalleDiv = document.getElementById("tckDetalleItems");
        detalleDiv.innerHTML = "";
        cajaActualItems.forEach(i => {
            detalleDiv.innerHTML += `<div style="display:flex; justify-content:space-between; margin:2px 0;"><span>${i.cant}x ${i.desc}</span><span>$${i.subtotal.toFixed(2)}</span></div>`;
        });

        document.getElementById("ticketClienteImprimir").style.display = "block";
        cajaActualItems = [];
        renderTablaCaja();
    } catch (err) {
        alert("Error al procesar el cobro.");
    }
}

async function generarReporteContableTurno() {
    alert("Generando reporte contable...");
}

function generarReporteInegiPDF() {
    alert("Generando boleta INEGI...");
    window.print();
}

function initRealtimeData() {
    onSnapshot(consultasRef, (snapshot) => {
        const tablaConsultas = document.getElementById("tablaConsultasPendientes");
        if (tablaConsultas) tablaConsultas.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const c = docSnap.data();
            const docId = docSnap.id;

            if (tablaConsultas && c.estado === 'PENDIENTE') {
                tablaConsultas.innerHTML += `
                    <tr>
                        <td>${c.folio || "N/A"}</td>
                        <td>${c.paciente}</td>
                        <td>${c.servicio}</td>
                        <td>$${c.costo.toFixed(2)}</td>
                        <td>
                            <button class="btn btn-sm btn-success" onclick="cargarOrdenACaja('${docId}', '${c.servicio}', '${c.paciente}', ${c.costo})">Cobrar</button>
                        </td>
                    </tr>
                `;
            }
        });

        if (tablaConsultas && tablaConsultas.innerHTML === "") {
            tablaConsultas.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No hay consultas pendientes de pago</td></tr>`;
        }
    });

    onSnapshot(inventarioRef, (snapshot) => {
        const tablaInv = document.getElementById("tablaInventarioBody");
        const selectMed = document.getElementById("selectMedPrescription");

        if (tablaInv) tablaInv.innerHTML = "";
        if (selectMed) selectMed.innerHTML = '<option value="">-- Seleccionar producto --</option>';

        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            const id = docSnap.id;
            const bajoStock = item.stock <= item.minStock;

            if (tablaInv) {
                tablaInv.innerHTML += `
                    <tr class="${bajoStock ? 'row-alert' : ''}">
                        <td>${item.codigo}</td>
                        <td>${item.nombre}</td>
                        <td>${item.categoria}</td>
                        <td>${item.ubicacion}</td>
                        <td>$${parseFloat(item.precio).toFixed(2)}</td>
                        <td>${item.stock}</td>
                        <td>${item.minStock}</td>
                        <td>${item.caducidad || 'N/A'}</td>
                    </tr>
                `;
            }

            if (selectMed) {
                selectMed.innerHTML += `
                    <option value="${id}" data-nombre="${item.nombre}" data-precio="${item.precio}" data-stock="${item.stock}">
                        ${item.nombre} - $${item.precio} (Stock: ${item.stock})
                    </option>
                `;
            }
        });
    });
}
