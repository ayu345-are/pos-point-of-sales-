
// ==========================================
// 1. IMPORT FIREBASE DAN FIRESTORE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"

import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"

import QRCode from "https://esm.sh/qrcode@1.5.3"


// ==========================================
// 2. KONFIGURASI FIREBASE
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyA6I1Tvw61wzc6-2MVmcWXfZ17IwDYj7u4",
  authDomain: "rpl25-b6db4.firebaseapp.com",
  projectId: "rpl25-b6db4",
  storageBucket: "rpl25-b6db4.firebasestorage.app",
  messagingSenderId: "643920833293",
  appId: "1:643920833293:web:f5ac7fdc746e4e410d5e44"
}


// ==========================================
// 3. INISIALISASI FIREBASE
// ==========================================

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)


// ==========================================
// 4. KONDISI / STATE APLIKASI
// ==========================================

let totalHarga = 0
let trxIdSekarang = ""
let unsubscribeListener = null
let suaraDiaktifkan = false


// ==========================================
// 5. AKTIFKAN SUARA BROWSER
// ==========================================

function aktifkanSuara() {

  if (!("speechSynthesis" in window)) return

  window.speechSynthesis.resume()
  suaraDiaktifkan = true
}


// ==========================================
// 6. FUNGSI SPEECH SYNTHESIS
// ==========================================

function suaraKasir(teks) {

  if (!("speechSynthesis" in window)) {
    console.log("Browser tidak mendukung suara")
    return
  }

  if (!suaraDiaktifkan) {
    console.log("Suara belum diaktifkan")
    return
  }

  window.speechSynthesis.cancel()

  const ucapan = new SpeechSynthesisUtterance(teks)

  const daftarSuara = window.speechSynthesis.getVoices()

  // Mencari suara bahasa Indonesia
  const suaraIndonesia = daftarSuara.find(voice =>
    voice.lang.toLowerCase().startsWith("id")
  )

  if (suaraIndonesia) {
    ucapan.voice = suaraIndonesia
  }

  ucapan.lang = "id-ID"
  ucapan.rate = 0.9
  ucapan.pitch = 1.1
  ucapan.volume = 1

  window.speechSynthesis.speak(ucapan)
}


// ==========================================
// 7. NOTIFIKASI PEMBAYARAN BERHASIL
// ==========================================

function notifikasiPembayaran(total, idTransaksi) {

  // Hapus notifikasi sebelumnya
  const lama = document.getElementById("notifikasi-kasir")

  if (lama) {
    lama.remove()
  }

  // Buat notifikasi baru
  const notifikasi = document.createElement("div")

  notifikasi.id = "notifikasi-kasir"

  notifikasi.innerHTML = `
    <div style="font-size:40px;">✅</div>

    <h3>PEMBAYARAN BERHASIL!</h3>

    <p>Saldo masuk:</p>

    <h2>Rp. ${Number(total).toLocaleString("id-ID")}</h2>

    <p>ID Transaksi:</p>

    <h3>${idTransaksi}</h3>

    <p>Status: <b>LUNAS</b></p>
  `

  notifikasi.style.cssText = `
    position: fixed;
    top: 20px;
    left: 5%;
    width: 90%;
    box-sizing: border-box;
    background: #d4edda;
    color: #155724;
    padding: 20px;
    border-radius: 15px;
    text-align: center;
    z-index: 99999;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    font-family: Arial, sans-serif;
  `

  document.body.appendChild(notifikasi)

  // Pisahkan huruf ID transaksi agar mudah dibaca
  const idUntukSuara = idTransaksi
    .split("")
    .join(" ")

  // Suara nominal dan ID transaksi
  suaraKasir(
    "Pembayaran berhasil. " +
    "Uang masuk sebesar " +
    Number(total).toLocaleString("id-ID") +
    " rupiah. " +
    "ID transaksi " +
    idUntukSuara +
    ". Terima kasih sudah berbelanja."
  )

  // Hilangkan notifikasi setelah 5 detik
  setTimeout(() => {
    notifikasi.remove()
  }, 5000)
}


// ==========================================
// 8. TAMBAH ITEM KE KERANJANG
// ==========================================

window.tambahKeKeranjang = function(nama, harga) {

  totalHarga += harga

  document.getElementById("total-harga").innerText =
    `Rp. ${totalHarga.toLocaleString("id-ID")}`

  document.getElementById("btn-bayar").disabled = false
}


// ==========================================
// 9. RESET KERANJANG
// ==========================================

window.resetKeranjang = function() {

  totalHarga = 0

  document.getElementById("total-harga").innerText = "Rp. 0"

  document.getElementById("btn-bayar").disabled = true

  document.getElementById("qr-section").classList.add("hidden")

  // Hentikan listener transaksi
  if (unsubscribeListener) {
    unsubscribeListener()
    unsubscribeListener = null
  }

  trxIdSekarang = ""
}


// ==========================================
// 10. MEMBUAT TRANSAKSI QR CODE
// ==========================================

window.buatTransaksiQR = async function() {

  // Aktifkan izin suara melalui interaksi pengguna
  aktifkanSuara()

  if (totalHarga === 0) return

  // Hentikan listener sebelumnya
  if (unsubscribeListener) {
    unsubscribeListener()
    unsubscribeListener = null
  }

  // Membuat ID transaksi
  trxIdSekarang =
    "TRX-" + Math.floor(1000 + Math.random() * 9000)

  document.getElementById("tx-id-display").innerText =
    trxIdSekarang

  // Tampilkan QR section
  document.getElementById("qr-section").classList.remove("hidden")

  // Status menunggu pembayaran
  document.getElementById("status-box").className =
    "status-box status-pending"

  document.getElementById("status-teks").innerText =
    "Menunggu pembayaran..."

  document.getElementById("qr-canvas").style.opacity = 1

  // Membuat QR Code
  const elemenCanvas = document.getElementById("qr-canvas")

  try {

    await QRCode.toCanvas(elemenCanvas, trxIdSekarang, {
      width: 140,
      margin: 1
    })

  } catch (error) {

    console.log("Gagal membuat QR Code", error)
    return
  }

  // Simpan transaksi ke Firestore
  const refTrx = doc(db, "transaksi", trxIdSekarang)

  try {

    await setDoc(refTrx, {
      total: totalHarga,
      status: "takterbayar",
      waktuBuat: Date.now()
    })

  } catch (error) {

    console.log("Gagal menyimpan transaksi", error)
    return
  }

  // Pantau pembayaran
  listenStatusPembayaran(trxIdSekarang)
}


// ==========================================
// 11. LISTENER STATUS PEMBAYARAN
// ==========================================

function listenStatusPembayaran(trxId) {

  const refTrx = doc(db, "transaksi", trxId)

  unsubscribeListener = onSnapshot(
    refTrx,

    (docSnapshot) => {

      if (!docSnapshot.exists()) return

      const dataTransaksi = docSnapshot.data()

      // Periksa status pembayaran
      if (dataTransaksi.status === "terbayar") {

        // Ubah tampilan menjadi lunas
        document.getElementById("status-box").className =
          "status-box status-success"

        document.getElementById("status-teks").innerText =
          "🥳 LUNAS"

        document.getElementById("qr-canvas").style.opacity = "0.2"

        // Notifikasi nominal dan ID transaksi
        notifikasiPembayaran(
          dataTransaksi.total,
          trxId
        )

        // Hentikan listener agar suara tidak berulang
        if (unsubscribeListener) {
          unsubscribeListener()
          unsubscribeListener = null
        }

      }

    },

    (error) => {
      console.log("Gagal memantau pembayaran", error)
    }
  )
}
