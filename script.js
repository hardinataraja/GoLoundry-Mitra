import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, serverTimestamp, 
    query, where, doc, getDoc, updateDoc, arrayUnion, addDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAzzCc3z1g8-Zh-0WSS2ttOTrExXJuqnFE",
    authDomain: "laundry-webapp-d3e0c.firebaseapp.com",
    projectId: "laundry-webapp-d3e0c",
    storageBucket: "laundry-webapp-d3e0c.firebasestorage.app",
    messagingSenderId: "740474113356",
    appId: "1:740474113356:web:018c7a108da4ebceae13e9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentTenantId = null;
let laundryNameGlobal = "";
let currentServices = [];
let laundryData = {};

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.replace("login.html"); return; }
    
    currentTenantId = user.uid;
    onSnapshot(doc(db, "laundries", user.uid), (snap) => {
        if (snap.exists()) {
            laundryData = snap.data();
            laundryNameGlobal = laundryData.laundryName;
            currentServices = laundryData.services || [];
            
            document.getElementById("laundryNameHeader").innerText = laundryNameGlobal;
            document.getElementById("laundryAddress").innerText = laundryData.laundryAddress || "Alamat belum diset";
            document.getElementById("ownerBalance").innerText = `Rp ${(laundryData.balance || 0).toLocaleString()}`;
            
            renderServices();
            syncOrders();
            renderSettingsUI();
        }
    });
});

// SYNC PESANAN (URUTAN DIPERBAIKI)
function syncOrders() {
    const q = query(collection(db, "orders"), where("tenantId", "==", currentTenantId));
    onSnapshot(q, (snap) => {
        const list = document.getElementById("orderList");
        const history = document.getElementById("historyList");
        list.innerHTML = ""; history.innerHTML = "";
        
        let count = 0;
        snap.forEach(dDoc => {
            const d = dDoc.data();
            const id = dDoc.id;
            let actionBtn = "";
            let statusBadge = "";

            // LOGIKA FILTER STATUS & TOMBOL AKSI
            if (d.status === "searching") {
                statusBadge = '<span class="status-badge" style="background:#fff7ed; color:#c2410c;">Mencari Driver</span>';
            } else if (d.status === "taken") {
                statusBadge = '<span class="status-badge" style="background:#f0f9ff; color:#0ea5e9;">Driver Menuju Customer</span>';
            } else if (d.status === "collected") {
                statusBadge = '<span class="status-badge" style="background:#faf5ff; color:#6b21a8;">Driver Membawa Cucian</span>';
            } else if (d.status === "at_laundry") {
                // DISINI TOMBOL TIMBANG MUNCUL (Setelah driver serah terima ke toko)
                statusBadge = '<span class="status-badge" style="background:#f0fdf4; color:#16a34a;">Siap Ditimbang</span>';
                actionBtn = `<button onclick="timbangOrder('${id}', '${d.serviceName}')" class="btn-action btn-primary" style="margin-top:10px;">⚖️ Terima & Input Timbangan</button>`;
            } else if (d.status === "processing") {
                statusBadge = '<span class="status-badge" style="background:#fefce8; color:#a16207;">Sedang Dicuci</span>';
                actionBtn = `<button onclick="updateStatus('${id}', 'ready_to_deliver')" class="btn-action btn-primary" style="margin-top:10px;">✅ Selesai & Panggil Kurir</button>`;
            } else if (d.status === "ready_to_deliver") {
                statusBadge = '<span class="status-badge" style="background:#f0f9ff; color:#0ea5e9;">Menunggu Dijemput Kurir Antar</span>';
            } else if (d.status === "delivering") {
                statusBadge = '<span class="status-badge" style="background:#faf5ff; color:#6b21a8;">Dalam Pengantaran</span>';
            }

            const cardHTML = `
                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <strong style="font-size:14px;">${d.customerName}</strong>
                            <p style="font-size:12px; color:#64748b; margin:4px 0;">${d.serviceName} (${d.finalWeight || d.estWeight} Kg)</p>
                            ${statusBadge}
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:800; color:#0ea5e9;">Rp ${(d.finalPrice || d.estPrice || 0).toLocaleString()}</div>
                            <small style="font-size:9px; color:#94a3b8;">${d.createdAt ? d.createdAt.toDate().toLocaleTimeString() : 'Baru'}</small>
                        </div>
                    </div>
                    ${actionBtn}
                </div>`;

            if (d.status === "completed") {
                history.innerHTML += cardHTML;
            } else {
                list.innerHTML += cardHTML;
                count++;
            }
        });
        document.getElementById("orderCount").innerText = count;
        if (window.lucide) lucide.createIcons();
    });
}

// LOGIKA TIMBANGAN & UPDATE HARGA
window.timbangOrder = async (orderId, serviceName) => {
    const service = currentServices.find(s => s.name === serviceName);
    if(!service) return Swal.fire("Error", "Data layanan tidak ditemukan", "error");

    const { value: kg } = await Swal.fire({
        title: 'Input Berat Riil',
        input: 'number',
        inputLabel: `Harga Layanan: Rp ${service.price.toLocaleString()}/kg`,
        inputPlaceholder: 'Masukkan berat (Kg)...',
        showCancelButton: true,
        confirmButtonText: 'Simpan & Proses'
    });

    if (kg) {
        const finalJasa = parseFloat(kg) * service.price;
        const finalTotal = finalJasa + 10000; // Jasa + Ongkir PP 10rb

        await updateDoc(doc(db, "orders", orderId), {
            finalWeight: parseFloat(kg),
            finalPrice: finalTotal,
            status: "processing" // Berubah ke status cuci
        });

        Swal.fire("Berhasil", "Data timbangan disimpan. Customer akan melihat harga update.", "success");
    }
};

window.updateStatus = async (id, status) => {
    await updateDoc(doc(db, "orders", id), { status: status });
};

// --- MANAJEMEN TOKO & LOKASI ---
function renderSettingsUI() {
    const settingsDiv = document.getElementById("page-settings");
    // Cek apakah tombol lokasi sudah ada, jika belum tambahkan
    if (!document.getElementById("btnSetLocation")) {
        const locBox = document.createElement("div");
        locBox.className = "card";
        locBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:13px; display:block;">Lokasi Toko (GPS)</strong>
                    <small id="locStatusText" style="color:${laundryData.laundryCoords ? '#10b981' : '#ef4444'}; font-size:11px;">
                        ${laundryData.laundryCoords ? '✅ Lokasi sudah diatur' : '⚠️ Lokasi belum diatur'}
                    </small>
                </div>
                <button id="btnSetLocation" onclick="updateLaundryLocation()" style="background:#f0f9ff; color:#0ea5e9; border:none; padding:8px 15px; border-radius:10px; font-weight:700; font-size:11px;">
                    Set Lokasi
                </button>
            </div>
        `;
        settingsDiv.prepend(locBox);
    }
}

window.updateLaundryLocation = () => {
    if (!navigator.geolocation) return Swal.fire("Error", "Browser tidak mendukung GPS", "error");

    Swal.fire({
        title: 'Update Lokasi Toko?',
        text: "Pastikan Anda berada di lokasi toko saat menekan tombol ini agar Driver tidak salah arah.",
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Ya, Set Lokasi'
    }).then((res) => {
        if (res.isConfirmed) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                await updateDoc(doc(db, "laundries", currentTenantId), {
                    laundryCoords: {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    }
                });
                Swal.fire("Berhasil", "Titik koordinat toko berhasil diperbarui!", "success");
            }, (err) => {
                Swal.fire("Gagal", "Akses lokasi ditolak. Periksa izin browser Anda.", "error");
            });
        }
    });
};

function renderServices() {
    const list = document.getElementById("serviceList");
    if(!list) return;
    list.innerHTML = currentServices.map(s => `
        <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #f1f5f9;">
            <span style="font-size:13px;">${s.name}</span>
            <span style="font-weight:700; color:#0ea5e9;">Rp ${s.price.toLocaleString()}/kg</span>
        </div>
    `).join("");
}

document.getElementById("formService")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newService = {
        name: document.getElementById("sName").value,
        price: parseInt(document.getElementById("sPrice").value)
    };
    await updateDoc(doc(db, "laundries", currentTenantId), {
        services: arrayUnion(newService)
    });
    window.closeModal('modalService');
    e.target.reset();
});

// TOPUP & WITHDRAW
window.requestTopup = () => {
    Swal.fire({
        title: 'Top Up Saldo',
        text: 'Silakan hubungi Admin GoLaundry untuk deposit saldo toko Anda.',
        icon: 'info',
        footer: '<a href="https://wa.me/628123456789">Chat Admin WhatsApp</a>'
    });
};

window.requestWithdraw = async () => {
    const bal = laundryData.balance || 0;
    if (bal < 50000) return Swal.fire("Gagal", "Minimal penarikan Rp 50.000", "warning");

    const { value: amount } = await Swal.fire({
        title: 'Tarik Tunai',
        input: 'number',
        inputLabel: `Saldo Anda: Rp ${bal.toLocaleString()}`,
        inputPlaceholder: 'Masukkan jumlah...',
        showCancelButton: true
    });

    if (amount && amount >= 50000) {
        await addDoc(collection(db, "withdraw_requests"), {
            ownerId: currentTenantId,
            ownerName: laundryNameGlobal,
            amount: parseInt(amount),
            status: "pending",
            type: "owner",
            createdAt: serverTimestamp()
        });
        Swal.fire("Berhasil", "Permintaan tarik saldo terkirim ke admin.", "success");
    }
};

window.logout = async () => {
    await signOut(auth);
    window.location.href="login.html";
};
