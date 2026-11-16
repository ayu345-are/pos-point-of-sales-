
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  runTransaction
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


// ==========================================
// 2. INISIALISASI
// ==========================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const saldoRef = doc(db, "pengaturan", "saldoKasir");

let totalHarga = 0;
let trxIdSekarang = "";
let unsubscribeListener = null;
let suaraDiaktifkan = false;
let prosesSedangBerjalan = false;


// ==========================================
// 3. FORMAT RUPIAH
// ==========================================

function formatRupiah(angka) {
  return "Rp" + Number(angka || 0).toLocaleString("id-ID");
}


// ==========================================
// 4. SALDO KASIR REALTIME
// ==========================================

onSnapshot(saldoRef, async (snapshot) => {

  if (!snapshot.exists()) {

    try {
      await setDoc(saldoRef, {
        saldo: 0,
        totalPemasukan: 0
      }, { merge: true });
    } catch (error) {
      console.error("Gagal membuat saldo:", error);
    }

    return;
  }

  const data = snapshot.data();

  document.getElementById("saldo-kasir").innerText =
    formatRupiah(data.saldo);

  document.getElementById("total-pemasukan").innerText =
    formatRupiah(data.totalPemasukan);

}, (error) => {
  console.error("Gagal mengambil saldo:", error);
});


// ==========================================
// 5. SUARA KASIR
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

  const suaraIndonesia = daftarSuara.find(voice =>
    voice.lang.toLowerCase().startsWith("id")
  );

  if (suaraIndonesia) {
    ucapan.voice = suaraIndonesia;
  }

  ucapan.lang = "id-ID";
  ucapan.rate = 0.75;
  ucapan.pitch = 1;
  ucapan.volume = 1;

  window.speechSynthesis.speak(ucapan);
}


// ==========================================
// 6. ID TRANSAKSI MENJADI SUARA
// ==========================================

function ubahIdMenjadiSuara(id) {

  return id
    .replace("TRX-", "T R X ")
    .split("")
    .join(" ")
    .trim();
}


// ==========================================
// 7. NOTIFIKASI PEMBAYARAN
// ==========================================

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

  const nominalSuara =
    Number(total).toLocaleString("id-ID");

  const idSuara = ubahIdMenjadiSuara(idTransaksi);

  suaraKasir(
    "Pembayaran berhasil. " +
    "Uang masuk sebesar " +
    nominalSuara +
    " rupiah. " +
    "ID transaksi " +
    idSuara
  );

  setTimeout(() => {
    notifikasi.remove();
  }, 5000);
}


// ==========================================
// 8. TAMBAH MENU
// ==========================================

window.tambahKeKeranjang = function(nama, harga) {

  totalHarga += Number(harga);

  document.getElementById("total-harga").innerText =
    formatRupiah(totalHarga);

  document.getElementById("btn-bayar").disabled = false;
};


// ==========================================
// 9. RESET KERANJANG
// ==========================================

window.resetKeranjang = function() {

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
// 10. BUAT TRANSAKSI QR
// ==========================================

window.buatTransaksiQR = async function() {

  if (prosesSedangBerjalan || totalHarga === 0) return;

  prosesSedangBerjalan = true;

  aktifkanSuara();

  const totalTransaksi = totalHarga;

  document.getElementById("btn-bayar").disabled = true;

  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
  }

  // ID unik untuk setiap transaksi
  trxIdSekarang =
    "TRX-" + Date.now() + "-" +
    Math.floor(Math.random() * 1000);

  document.getElementById("tx-id-display").innerText =
    trxIdSekarang;

  document.getElementById("qr-section").classList.remove("hidden");

  document.getElementById("status-box").className =
    "status-box status-pending";

  document.getElementById("status-teks").innerText =
    "Menunggu pembayaran...";

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

    totalHarga = 0;

    document.getElementById("total-harga").innerText = "Rp0";

    listenStatusPembayaran(trxIdSekarang);

  } catch (error) {

    console.error("Gagal membuat transaksi:", error);

    alert("Transaksi gagal dibuat. Silakan coba kembali.");

    document.getElementById("btn-bayar").disabled = false;

  } finally {

    prosesSedangBerjalan = false;
  }
};


// ==========================================
// 11. PROSES SALDO KASIR
// ==========================================

async function prosesSaldoKasir(trxId) {

  const refTrx = doc(db, "transaksi", trxId);

  return await runTransaction(db, async (transaction) => {

    const trxSnapshot = await transaction.get(refTrx);

    if (!trxSnapshot.exists()) return false;

    const dataTrx = trxSnapshot.data();

    // Pastikan status pembayaran lunas
    if (dataTrx.status !== "terbayar") return false;

    // Cegah saldo masuk dua kali
    if (dataTrx.saldoDiproses === true) return false;

    const jumlah = Number(dataTrx.total);

    if (!Number.isSafeInteger(jumlah) || jumlah <= 0) {
      throw new Error("Nominal pembayaran tidak valid.");
    }

    const saldoSnapshot = await transaction.get(saldoRef);

    const saldoLama = saldoSnapshot.exists()
      ? Number(saldoSnapshot.data().saldo || 0)
      : 0;

    const pemasukanLama = saldoSnapshot.exists()
      ? Number(saldoSnapshot.data().totalPemasukan || 0)
      : 0;

    // Update saldo
    transaction.set(saldoRef, {
      saldo: saldoLama + jumlah,
      totalPemasukan: pemasukanLama + jumlah,
      diperbarui: Date.now()
    }, { merge: true });

    // Tandai transaksi sudah masuk
    transaction.update(refTrx, {
      saldoDiproses: true,
      waktuSaldoMasuk: Date.now()
    });

    return true;

  });
}


// ==========================================
// 12. PANTAU PEMBAYARAN
// ==========================================

function listenStatusPembayaran(trxId) {

  const refTrx = doc(db, "transaksi", trxId);

  let sedangMemproses = false;
  let notifikasiSudahDitampilkan = false;

  unsubscribeListener = onSnapshot(
    refTrx,

    async (snapshot) => {

      if (!snapshot.exists()) return;

      const data = snapshot.data();

      if (data.status !== "terbayar") return;

      document.getElementById("status-box").className =
        "status-box status-success";

      document.getElementById("status-teks").innerText =
        "🥳 LUNAS";

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
    },

    (error) => {
      console.error("Listener pembayaran gagal:", error);
    }
  );
}
