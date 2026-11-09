
// 1. Impor module yang diperlukan dari firebase dan firestore
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
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"

import QRCode from "https://esm.sh/qrcode@1.5.3"


// 2. Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA6I1Tvw61wzc6-2MVmcWXfZ17IwDYj7u4",
  authDomain: "rpl25-b6db4.firebaseapp.com",
  projectId: "rpl25-b6db4",
  storageBucket: "rpl25-b6db4.firebasestorage.app",
  messagingSenderId: "643920833293",
  appId: "1:643920833293:web:f5ac7fdc746e4e410d5e44"
}


// 3. Inisialisasi Firebase dan Firestore
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)


// 4. Fungsi Speech Synthesis
function suaraKasir(teks) {

  if (!("speechSynthesis" in window)) {
    console.log("Browser tidak mendukung suara")
    return
  }

  window.speechSynthesis.cancel()

  const ucapan = new SpeechSynthesisUtterance(teks)
  const daftarSuara = window.speechSynthesis.getVoices()

  // Memilih suara bahasa Indonesia
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


// 5. Kondisi / state aplikasi kasir
let totalHarga = 0
let trxIdSekarang = ""
let unsubscribeListener = null


// 6. Fungsi tambah item ke keranjang
window.tambahKeKeranjang = function(nama, harga) {

  totalHarga += harga

  document.getElementById('total-harga').innerText =
    `Rp. ${totalHarga}`

  document.getElementById('btn-bayar').disabled = false

  // Suara ketika menu ditambahkan
  suaraKasir(nama + " berhasil ditambahkan")
}


// 7. Fungsi Reset keranjang
window.resetKeranjang = function() {

  totalHarga = 0

  document.getElementById('total-harga').innerText = 'Rp.0'

  document.getElementById('btn-bayar').disabled = true

  document.getElementById('qr-section').classList.add('hidden')

  if (unsubscribeListener) {
    unsubscribeListener()
    unsubscribeListener = null
  }

  suaraKasir("Keranjang berhasil dikosongkan")
}


// 8. Fungsi membuat ID transaksi dan QR Code
window.buatTransaksiQR = async function() {

  if (totalHarga === 0) return

  if (unsubscribeListener) {
    unsubscribeListener()
    unsubscribeListener = null
  }

  trxIdSekarang =
    "TRX-" + Math.floor(1000 + Math.random() * 9000)

  document.getElementById('tx-id-display').innerText =
    trxIdSekarang

  document.getElementById('qr-section').classList.remove('hidden')

  const statusBox = document.getElementById('status-box')

  statusBox.className = "status-box status-pending"

  document.getElementById('status-teks').innerText =
    "menunggu scan..."

  document.getElementById('qr-canvas').style.opacity = 1

  // Render QR Code ke Canvas
  const elemenCanvas = document.getElementById('qr-canvas')

  try {

    await QRCode.toCanvas(elemenCanvas, trxIdSekarang, {
      width: 140,
      margin: 1
    })

  } catch (error) {

    console.log("Gagal membuat QR", error)
    return
  }

  // Simpan dokumen transaksi ke Firestore
  const refTrx = doc(db, "transaksi", trxIdSekarang)

  try {

    await setDoc(refTrx, {
      total: totalHarga,
      status: 'takterbayar',
      waktuBuat: Date.now()
    })

  } catch (error) {

    console.log("Gagal menyimpan transaksi ke firestore", error)
    return
  }

  // Suara instruksi pembayaran
  suaraKasir("Silakan scan kode QR untuk melakukan pembayaran")

  listenStatusPembayaran(trxIdSekarang)
}


// 9. Fungsi listener status pembayaran di Firestore
function listenStatusPembayaran(trxId) {

  const refTrx = doc(db, "transaksi", trxId)

  unsubscribeListener = onSnapshot(refTrx, (docSnapshot) => {

    if (
      docSnapshot.exists() &&
      docSnapshot.data().status == 'terbayar'
    ) {

      // Tampilkan efek lunas
      document.getElementById('status-box').className =
        "status-box status-success"

      document.getElementById('status-teks').innerText =
        "🥳 LUNAS"

      document.getElementById('qr-canvas').style.opacity = "0.2"

      // Suara pembayaran berhasil
      suaraKasir(
        "Pembayaran berhasil. Terima kasih sudah berbelanja di Kasir Cemerlang"
      )

      // Hentikan listener
      if (unsubscribeListener) {
        unsubscribeListener()
        unsubscribeListener = null
      }
    }

  }, (error) => {
    console.log("Gagal memantau pembayaran", error)
  })
}
