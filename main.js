
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  runTransaction,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import QRCode from "https://esm.sh/qrcode@1.5.3";

// ==========================================
// 1. FIREBASE CONFIG
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyA6I1Tvw61wzc6-2MVmcWXfZ17IwDYj7u4",
  authDomain: "rpl25-b6db4.firebaseapp.com",
  projectId: "rpl25-b6db4",
  storageBucket: "rpl25-b6db4.firebasestorage.app",
  messagingSenderId: "643920833293",
  appId: "1:643920833293:web:f5ac7fdc746e4e410d5e44"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const saldoRef = doc(db, "pengaturan", "saldoKasir");
const menuRef = collection(db, "menu");
const penjualRef = collection(db, "penjual");

// ==========================================
// 2. VARIABEL
// ==========================================

let totalHarga = 0;
let trxIdSekarang = "";
let unsubscribeListener = null;
let suaraDiaktifkan = false;
let prosesSedangBerjalan = false;

let dataMenuTersimpan = {};
let dataPenjualTersimpan = {};

const menuGrid = document.getElementById("menu-grid");
const daftarCrudMenu = document.getElementById("daftar-crud-menu");
const formCrudMenu = document.getElementById("form-crud-menu");
const fileInput = document.getElementById("crud-gambar-file");
const previewContainer = document.getElementById("preview-container");
const previewImg = document.getElementById("crud-preview");

const formPenjual = document.getElementById("form-penjual");
const daftarPenjual = document.getElementById("daftar-penjual");
const selectPenjual = document.getElementById("crud-penjual-id");

// ==========================================
// 3. FORMAT RUPIAH
// ==========================================

function formatRupiah(angka) {
  return "Rp" + Number(angka || 0).toLocaleString("id-ID");
}

// ==========================================
// 4. SALDO KASIR
// ==========================================

const elSaldoKasir = document.getElementById("saldo-kasir");

if (elSaldoKasir) {
  onSnapshot(saldoRef, async (snapshot) => {
    try {
      if (!snapshot.exists()) {
        await setDoc(saldoRef, {
          saldo: 0,
          totalPemasukan: 0
        });
        return;
      }

      const data = snapshot.data();

      document.getElementById("saldo-kasir").innerText =
        formatRupiah(data.saldo);

      document.getElementById("total-pemasukan").innerText =
        formatRupiah(data.totalPemasukan);

    } catch (error) {
      console.error("Gagal mengambil saldo:", error);
    }
  });
}

// ==========================================
// 5. AUDIO NOTIFIKASI
// ==========================================

function aktifkanSuara() {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  suaraDiaktifkan = true;
}

function suaraKasir(teks) {
  if (!("speechSynthesis" in window)) return;
  if (!suaraDiaktifkan) return;

  window.speechSynthesis.cancel();

  const ucapan = new SpeechSynthesisUtterance(teks);
  const daftarSuara = window.speechSynthesis.getVoices();

  const suaraIndonesia = daftarSuara.find(v =>
    v.lang.toLowerCase().startsWith("id")
  );

  if (suaraIndonesia) ucapan.voice = suaraIndonesia;

  ucapan.lang = "id-ID";
  ucapan.rate = 0.75;
  ucapan.pitch = 1;
  ucapan.volume = 1;

  window.speechSynthesis.speak(ucapan);
}

function notifikasiPembayaran(total, idTransaksi) {
  const lama = document.getElementById("notifikasi-kasir");

  if (lama) lama.remove();

  const notifikasi = document.createElement("div");
  notifikasi.id = "notifikasi-kasir";

  notifikasi.innerHTML = `
    <div style="font-size:40px;">✅</div>
    <h3>PEMBAYARAN BERHASIL!</h3>
    <p>Saldo masuk:</p>
    <h2>${formatRupiah(total)}</h2>
    <p>ID Transaksi:</p>
    <h3>${idTransaksi}</h3>
    <p>Status: <b>LUNAS</b></p>
  `;

  notifikasi.style.cssText = `
    position:fixed;
    top:20px;
    left:5%;
    width:90%;
    box-sizing:border-box;
    background:#d4edda;
    color:#155724;
    padding:20px;
    border-radius:15px;
    text-align:center;
    z-index:99999;
    box-shadow:0 4px 15px rgba(0,0,0,0.2);
    font-family:Arial,sans-serif;
  `;

  document.body.appendChild(notifikasi);

  suaraKasir(
    "Pembayaran berhasil. Uang masuk sebesar " +
    Number(total).toLocaleString("id-ID") +
    " rupiah."
  );

  setTimeout(() => notifikasi.remove(), 5000);
}

// ==========================================
// 6. KERANJANG
// ==========================================

window.tambahKeKeranjang = function(nama, harga) {
  if (prosesSedangBerjalan || trxIdSekarang) return;

  totalHarga += Number(harga);

  document.getElementById("total-harga").innerText =
    formatRupiah(totalHarga);

  document.getElementById("btn-bayar").disabled = false;
};

window.resetKeranjang = function() {
  if (prosesSedangBerjalan) return;

  totalHarga = 0;

  document.getElementById("total-harga").innerText = "Rp0";
  document.getElementById("btn-bayar").disabled = true;
  document.getElementById("qr-section").classList.add("hidden");

  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
  }

  trxIdSekarang = "";
};

// ==========================================
// 7. BUAT TRANSAKSI QR
// ==========================================

window.buatTransaksiQR = async function() {
  if (prosesSedangBerjalan || totalHarga <= 0 || trxIdSekarang) return;

  prosesSedangBerjalan = true;
  aktifkanSuara();

  const totalTransaksi = totalHarga;

  document.getElementById("btn-bayar").disabled = true;

  trxIdSekarang =
    "TRX-" + Date.now() + "-" +
    Math.floor(Math.random() * 1000);

  document.getElementById("tx-id-display").innerText = trxIdSekarang;
  document.getElementById("qr-section").classList.remove("hidden");

  document.getElementById("status-box").className =
    "status-box status-pending";

  document.getElementById("status-teks").innerText =
    "Menunggu pembayaran...";

  document.getElementById("total-harga").innerText =
    formatRupiah(totalTransaksi);

  const canvas = document.getElementById("qr-canvas");
  canvas.style.opacity = "1";

  try {
    await QRCode.toCanvas(canvas, trxIdSekarang, {
      width: 140,
      margin: 1
    });

    const refTrx = doc(db, "transaksi", trxIdSekarang);

    await setDoc(refTrx, {
      total: totalTransaksi,
      status: "takterbayar",
      saldoDiproses: false,
      waktuBuat: Date.now()
    });

    listenStatusPembayaran(trxIdSekarang);

  } catch (error) {
    console.error("Gagal membuat transaksi:", error);

    alert("Transaksi gagal dibuat. Periksa aturan database Firestore.");

    trxIdSekarang = "";

    document.getElementById("btn-bayar").disabled = false;
    document.getElementById("qr-section").classList.add("hidden");

  } finally {
    prosesSedangBerjalan = false;
  }
};

// ==========================================
// 8. PROSES SALDO
// ==========================================

async function prosesSaldoKasir(trxId) {
  const refTrx = doc(db, "transaksi", trxId);

  return await runTransaction(db, async (transaction) => {

    const trxSnapshot = await transaction.get(refTrx);

    if (!trxSnapshot.exists()) return false;

    const dataTrx = trxSnapshot.data();

    if (
      dataTrx.status !== "terbayar" ||
      dataTrx.saldoDiproses === true
    ) return false;

    const jumlah = Number(dataTrx.total);

    const saldoSnapshot = await transaction.get(saldoRef);

    const saldoLama = saldoSnapshot.exists()
      ? Number(saldoSnapshot.data().saldo || 0)
      : 0;

    const pemasukanLama = saldoSnapshot.exists()
      ? Number(saldoSnapshot.data().totalPemasukan || 0)
      : 0;

    transaction.set(saldoRef, {
      saldo: saldoLama + jumlah,
      totalPemasukan: pemasukanLama + jumlah,
      diperbarui: Date.now()
    }, { merge: true });

    transaction.update(refTrx, {
      saldoDiproses: true,
      waktuSaldoMasuk: Date.now()
    });

    return true;
  });
}

// ==========================================
// 9. STATUS PEMBAYARAN
// ==========================================

function listenStatusPembayaran(trxId) {
  const refTrx = doc(db, "transaksi", trxId);

  let sedangMemproses = false;
  let notifikasiSudahDitampilkan = false;

  unsubscribeListener = onSnapshot(refTrx, async (snapshot) => {

    if (!snapshot.exists()) return;

    const data = snapshot.data();

    if (data.status !== "terbayar") return;

    document.getElementById("status-box").className =
      "status-box status-success";

    document.getElementById("status-teks").innerText = "🥳 LUNAS";

    document.getElementById("qr-canvas").style.opacity = "0.2";

    if (data.saldoDiproses === true) {

      if (!notifikasiSudahDitampilkan) {
        notifikasiSudahDitampilkan = true;
        notifikasiPembayaran(data.total, trxId);
      }

      if (unsubscribeListener) {
        unsubscribeListener();
        unsubscribeListener = null;
      }

      return;
    }

    if (sedangMemproses) return;

    sedangMemproses = true;

    try {
      const berhasil = await prosesSaldoKasir(trxId);

      if (berhasil && !notifikasiSudahDitampilkan) {
        notifikasiSudahDitampilkan = true;
        notifikasiPembayaran(data.total, trxId);
      }

      if (berhasil && unsubscribeListener) {
        unsubscribeListener();
        unsubscribeListener = null;
      }

    } catch (error) {
      console.error("Gagal memproses saldo:", error);

    } finally {
      sedangMemproses = false;
    }
  });
}

// ==========================================
// 10. IDENTITAS PENJUAL
// ==========================================

// Daftarkan penjual
if (formPenjual) {

  formPenjual.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = document.getElementById("penjual-id-baru")
      .value.trim().toUpperCase();

    const nama = document.getElementById("penjual-nama-baru")
      .value.trim();

    if (!id || !nama) {
      alert("Lengkapi ID dan nama penjual!");
      return;
    }

    if (!/^P[0-9]+$/.test(id)) {
      alert("Format ID harus seperti P001, P002, P003!");
      return;
    }

    try {
      const refPenjual = doc(db, "penjual", id);

      await setDoc(refPenjual, {
        idPenjual: id,
        nama: nama,
        waktuDaftar: Date.now()
      });

      formPenjual.reset();

      alert("Identitas penjual berhasil didaftarkan!");

    } catch (error) {
      console.error(error);
      alert("Gagal mendaftarkan penjual.");
    }
  });
}

// ==========================================
// 11. TAMPILKAN DAFTAR PENJUAL
// ==========================================

function renderPenjual() {

  if (daftarPenjual) {
    daftarPenjual.innerHTML = "";
  }

  if (selectPenjual) {
    selectPenjual.innerHTML =
      '<option value="">Pilih Identitas Penjual</option>';
  }

  Object.entries(dataPenjualTersimpan).forEach(([id, item]) => {

    if (selectPenjual) {
      const option = document.createElement("option");

      option.value = id;
      option.textContent = `${id} - ${item.nama}`;

      selectPenjual.appendChild(option);
    }

    if (daftarPenjual) {

      const row = document.createElement("div");
      row.className = "penjual-item";

      const info = document.createElement("div");

      const strong = document.createElement("strong");
      strong.textContent = item.nama;

      const detail = document.createElement("span");
      detail.textContent = "ID: " + id;
      detail.style.display = "block";
      detail.style.color = "#71808a";

      info.appendChild(strong);
      info.appendChild(detail);

      const tombol = document.createElement("button");
      tombol.textContent = "Hapus";

      tombol.onclick = () => hapusPenjual(id);

      row.appendChild(info);
      row.appendChild(tombol);

      daftarPenjual.appendChild(row);
    }
  });

  if (daftarPenjual &&
      Object.keys(dataPenjualTersimpan).length === 0) {

    daftarPenjual.innerHTML =
      "<p style='font-size:12px;color:#888;'>Belum ada penjual terdaftar.</p>";
  }

  renderMenu();
}

onSnapshot(penjualRef, (snapshot) => {

  dataPenjualTersimpan = {};

  snapshot.forEach((docSnap) => {
    dataPenjualTersimpan[docSnap.id] = docSnap.data();
  });

  renderPenjual();

}, (error) => {
  console.error("Gagal mengambil data penjual:", error);
});

async function hapusPenjual(id) {

  const snapshot = await getDocs(menuRef);

  let masihMemilikiMenu = false;

  snapshot.forEach((item) => {
    if (item.data().penjualId === id) {
      masihMemilikiMenu = true;
    }
  });

  if (masihMemilikiMenu) {
    alert("Penjual tidak bisa dihapus karena masih memiliki menu!");
    return;
  }

  if (!confirm("Yakin ingin menghapus identitas penjual ini?")) return;

  try {
    await deleteDoc(doc(db, "penjual", id));
    alert("Identitas penjual berhasil dihapus!");

  } catch (error) {
    console.error(error);
    alert("Gagal menghapus penjual.");
  }
}

// ==========================================
// 12. GAMBAR MENU BASE64
// ==========================================

function ubahFileKeBase64(file) {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = (e) => {

      const img = new Image();

      img.onload = () => {

        const canvas = document.createElement("canvas");

        const maxLebar = 400;
        const skala = Math.min(1, maxLebar / img.width);

        canvas.width = img.width * skala;
        canvas.height = img.height * skala;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );

        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };

      img.onerror = reject;
      img.src = e.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ==========================================
// 13. PREVIEW GAMBAR
// ==========================================

if (fileInput) {

  fileInput.addEventListener("change", async () => {

    const file = fileInput.files[0];

    if (file) {

      try {
        const hasilBase64 = await ubahFileKeBase64(file);

        previewImg.src = hasilBase64;
        previewContainer.classList.remove("hidden");

      } catch (error) {
        alert("Gagal membaca gambar.");
      }

    } else {

      previewImg.src = "";
      previewContainer.classList.add("hidden");
    }
  });
}

// ==========================================
// 14. RESET FORM CRUD
// ==========================================

function resetFormCRUD() {

  if (formCrudMenu) formCrudMenu.reset();

  const idEl = document.getElementById("crud-menu-id");
  const lamaEl = document.getElementById("crud-gambar-lama");

  if (idEl) idEl.value = "";
  if (lamaEl) lamaEl.value = "";

  if (previewImg) previewImg.src = "";

  if (previewContainer) {
    previewContainer.classList.add("hidden");
  }
}

// ==========================================
// 15. RENDER MENU
// ==========================================

function renderMenu() {

  if (menuGrid) {
    document.querySelectorAll(".menu-dinamis")
      .forEach(el => el.remove());
  }

  if (daftarCrudMenu) {
    daftarCrudMenu.innerHTML = "";
  }

  Object.entries(dataMenuTersimpan).forEach(([id, item]) => {

    const namaPenjual =
      dataPenjualTersimpan[item.penjualId]?.nama ||
      item.penjualId ||
      "Umum";

    const gambarTampil =
      item.gambar ||
      "https://via.placeholder.com/150?text=No+Image";

    // HALAMAN KASIR
    if (menuGrid) {

      const card = document.createElement("div");
      card.className = "menu-card menu-dinamis";

      const gambar = document.createElement("img");
      gambar.src = gambarTampil;
      gambar.alt = item.nama;

      const nama = document.createElement("h3");
      nama.textContent = item.nama;

      const penjual = document.createElement("span");
      penjual.textContent =
        "Penjual: " + namaPenjual +
        (dataPenjualTersimpan[item.penjualId]
          ? " (" + item.penjualId + ")"
          : "");

      penjual.style.cssText =
        "font-size:10px;color:#71808a;display:block;text-align:center;";

      const harga = document.createElement("p");
      harga.textContent = formatRupiah(item.harga);

      const tombol = document.createElement("button");
      tombol.textContent = "+ Tambah";

      tombol.onclick = () => {
        window.tambahKeKeranjang(item.nama, item.harga);
      };

      card.appendChild(gambar);
      card.appendChild(nama);
      card.appendChild(penjual);
      card.appendChild(harga);
      card.appendChild(tombol);

      menuGrid.appendChild(card);
    }

    // HALAMAN KELOLA
    if (daftarCrudMenu) {

      const row = document.createElement("div");
      row.className = "crud-list-item";

      const info = document.createElement("div");
      info.className = "crud-item-info";

      const gambar = document.createElement("img");
      gambar.src = gambarTampil;
      gambar.alt = item.nama;

      const teks = document.createElement("div");
      teks.className = "crud-item-text";

      const nama = document.createElement("strong");
      nama.textContent = item.nama;

      const penjual = document.createElement("span");
      penjual.textContent =
        namaPenjual + " (" + (item.penjualId || "Umum") + ")";

      penjual.style.cssText =
        "font-size:11px;color:#71808a;";

      const harga = document.createElement("span");
      harga.textContent = formatRupiah(item.harga);
      harga.style.cssText =
        "color:#079669;font-weight:bold;";

      teks.appendChild(nama);
      teks.appendChild(penjual);
      teks.appendChild(harga);

      info.appendChild(gambar);
      info.appendChild(teks);

      const actions = document.createElement("div");
      actions.className = "crud-item-actions";

      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.style.background = "#2185e8";
      edit.onclick = () => window.isiFormEditCRUD(id);

      const hapus = document.createElement("button");
      hapus.textContent = "Hapus";
      hapus.style.background = "#e94359";
      hapus.onclick = () => window.hapusMenuCRUD(id);

      actions.appendChild(edit);
      actions.appendChild(hapus);

      row.appendChild(info);
      row.appendChild(actions);

      daftarCrudMenu.appendChild(row);
    }
  });

  if (
    daftarCrudMenu &&
    Object.keys(dataMenuTersimpan).length === 0
  ) {
    daftarCrudMenu.innerHTML =
      "<p style='color:#888;font-size:12px;'>Belum ada menu tambahan.</p>";
  }
}

// ==========================================
// 16. AMBIL DATA MENU FIREBASE
// ==========================================

onSnapshot(menuRef, (snapshot) => {

  dataMenuTersimpan = {};

  snapshot.forEach((docSnap) => {
    dataMenuTersimpan[docSnap.id] = docSnap.data();
  });

  renderMenu();

}, (error) => {
  console.error("Gagal mengambil menu:", error);
});

// ==========================================
// 17. SIMPAN / EDIT MENU
// ==========================================

if (formCrudMenu) {

  formCrudMenu.addEventListener("submit", async (e) => {

    e.preventDefault();

    const id =
      document.getElementById("crud-menu-id").value;

    const penjualId =
      document.getElementById("crud-penjual-id").value;

    const nama =
      document.getElementById("crud-nama").value.trim();

    const harga =
      Number(document.getElementById("crud-harga").value);

    const gambarLama =
      document.getElementById("crud-gambar-lama").value;

    const file =
      fileInput.files[0];

    if (!penjualId || !nama || harga <= 0) {
      alert("Lengkapi semua data menu!");
      return;
    }

    if (!dataPenjualTersimpan[penjualId]) {
      alert("Identitas penjual tidak ditemukan!");
      return;
    }

    if (!id && !file) {
      alert("Silakan pilih file gambar terlebih dahulu!");
      return;
    }

    try {

      const gambarFinal = file
        ? await ubahFileKeBase64(file)
        : gambarLama;

      const dataMenu = {
        penjualId,
        nama,
        harga,
        gambar: gambarFinal
      };

      if (id) {

        await updateDoc(
          doc(db, "menu", id),
          dataMenu
        );

        alert("Menu berhasil diperbarui!");

      } else {

        await addDoc(menuRef, dataMenu);

        alert("Menu baru berhasil ditambahkan!");
      }

      resetFormCRUD();

    } catch (err) {

      console.error("Gagal menyimpan menu:", err);

      alert("Terjadi kesalahan saat menyimpan menu.");
    }
  });
}

// ==========================================

// ==========================================
// 18. EDIT MENU
// ==========================================

window.isiFormEditCRUD = function(id) {

  const item = dataMenuTersimpan[id];

  if (!item) return;

  document.getElementById("crud-menu-id").value = id;

  document.getElementById("crud-penjual-id").value =
    item.penjualId || "";

  document.getElementById("crud-nama").value =
    item.nama || "";

  document.getElementById("crud-harga").value =
    item.harga || "";

  document.getElementById("crud-gambar-lama").value =
    item.gambar || "";

  if (item.gambar && previewImg) {

    previewImg.src = item.gambar;
    previewContainer.classList.remove("hidden");

  } else if (previewImg) {

    previewImg.src = "";
    previewContainer.classList.add("hidden");
  }

  if (fileInput) fileInput.value = "";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
};


// ==========================================
// 19. HAPUS MENU
// ==========================================

window.hapusMenuCRUD = async function(id) {

  if (!confirm("Yakin ingin menghapus menu ini?")) return;

  try {

    await deleteDoc(doc(db, "menu", id));

    alert("Menu berhasil dihapus!");

  } catch (err) {

    console.error("Gagal menghapus menu:", err);

    alert("Terjadi kesalahan saat menghapus menu.");
  }
};
