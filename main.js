
// ==========================================
// 1. IMPORT FIREBASE DAN FIRESTORE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"

import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc
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
// 4. STATE APLIKASI KASIR
// ==========================================

let totalHarga = 0
let trxIdSekarang = ""
let unsubscribeListener = null


// ==========================================
// 5. SPEECH SYNTHESIS
// ==========================================

function suaraKasir(teks) {

  if (!("speechSynthesis" in window)) {
    console.log("Browser tidak mendukung suara")
    return
  }

  window.speechSynthesis.cancel()

  const ucapan = new SpeechSynthesisUtterance(teks)
  const daftarSuara = window.speechSynthesis.getVoices()

  const suaraIndonesia = daftarSuara.find(voice =>
    voice.lang.toLowerCase().startsWith("id")
  )

  ucapan.voice = suaraIndonesia || null
  ucapan.lang = "id-ID"
  ucapan.rate = 0.9
  ucapan.pitch = 1.1
  ucapan.volume = 1

  window.speechSynthesis.speak(ucapan)
}


// ==========================================
// 6. NOTIFIKASI PEMBAYARAN BERHASIL
// ==========================================

function notifikasiPembayaran(total) {

  // Notifikasi pembayaran
  alert(
    "PEMBAYARAN BERHASIL!\n\n" +
    "Saldo masuk: Rp. " +
    total.toLocaleString("id-ID") +
    "\nStatus: LUNAS"
  )

  // Suara kasir
  suaraKasir(
    "Pembayaran berhasil. Uang sebesar " +
    total.toLocaleString("id-ID") +
    " rupiah telah diterima. Terima kasih."
  )
}


// ==========================================
// 7. TAMBAH ITEM KE KERANJANG
// ==========================================

window.tambahKeKeranjang = function(nama, harga) {

  totalHarga += harga

  document.getElementById("total-harga").innerText =
    `Rp. ${totalHarga.toLocaleString("id-ID")}`

  document.getElementById("btn-bayar").disabled = false

  suaraKasir(nama + " berhasil ditambahkan")
}


// ==========================================
// 8. RESET KERANJANG
// ==========================================

window.resetKeranjang = function() {

  totalHarga = 0

  document.getElementById("total-harga").innerText = "Rp. 0"

  document.getElementById("btn-bayar").disabled = true

  document.getElementById("qr-section").classList.add("hidden")

  if (unsubscribeListener) {
    unsubscribeListener()
    unsubscribeListener = null
  }

  suaraKasir("Keranjang berhasil dikosongkan")
}


// ==========================================
// 9. MEMBUAT TRANSAKSI QR CODE
// ==========================================

window.buatTransaksiQR = async function() {

  if (totalHarga === 0) return

  if (unsubscribeListener) {
    unsubscribeListener()
    unsubscribeListener = null
  }

  trxIdSekarang =
    "TRX-" + Math.floor(1000 + Math.random() * 9000)

  document.getElementById("tx-id-display").innerText =
    trxIdSekarang

  document.getElementById("qr-section").classList.remove("hidden")

  const statusBox = document.getElementById("status-box")

  statusBox.className = "status-box status-pending"

  document.getElementById("status-teks").innerText =
    "Menunggu scan..."

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

  suaraKasir("Silakan scan kode QR untuk melakukan pembayaran")

  listenStatusPembayaran(trxIdSekarang)
}


// ==========================================
// 10. LISTENER STATUS PEMBAYARAN
// ==========================================

function listenStatusPembayaran(trxId) {

  const refTrx = doc(db, "transaksi", trxId)

  unsubscribeListener = onSnapshot(refTrx, (docSnapshot) => {

    if (
      docSnapshot.exists() &&
      docSnapshot.data().status === "terbayar"
    ) {

      const dataTransaksi = docSnapshot.data()

      // Mengubah tampilan menjadi lunas
      document.getElementById("status-box").className =
        "status-box status-success"

      document.getElementById("status-teks").innerText =
        "🥳 LUNAS"

      document.getElementById("qr-canvas").style.opacity = "0.2"

      // Menampilkan notifikasi dan suara pembayaran
      notifikasiPembayaran(dataTransaksi.total)

      // Menghentikan listener
      if (unsubscribeListener) {
        unsubscribeListener()
        unsubscribeListener = null
      }

    }

  }, (error) => {

    console.log("Gagal memantau pembayaran", error)

  })
}
