# MalasFinance v2 — "Sadar"

> Spesifikasi penulisan ulang total. Dokumen ini menggantikan `PLAN.md` dan `next-spec.md`, yang keduanya menggambarkan aplikasi lama dan sudah tidak berlaku.

**Status:** disetujui untuk masuk tahap perencanaan implementasi
**Tanggal:** 2026-07-28
**Menggantikan:** MalasFinance v1.5.2 (Kotlin/Compose/Room, ~2.150 baris)

---

## 0. Ringkasan Satu Paragraf

MalasFinance v2 adalah aplikasi keuangan pribadi yang tugasnya **bukan mencatat uang, melainkan membuat pemakainya sadar sebelum uang itu keluar**. Aplikasi lama adalah pencatat: ia menjawab "aku sudah habis berapa?". Aplikasi baru menjawab "**hari ini aku masih boleh habis berapa, dan kenapa uangku bocor?**". Perbedaannya bukan fitur, melainkan poros: satu angka jangkar yang selalu terlihat di atas form input, satu niat wajib di setiap pengeluaran, dan aplikasi yang berbicara duluan lewat notifikasi. Ditulis ulang dari nol dengan Svelte + Vite + Capacitor supaya siklus pengembangan bisa berjalan langsung di Termux tanpa menunggu CI lima menit.

---

## 1. Kenapa Ditulis Ulang

Aplikasi lama tidak rusak. Ia bekerja, datanya aman, rilisnya rapi. Yang salah adalah **porosnya**.

| Aspek | v1 (pencatat) | v2 (penyadar) |
|---|---|---|
| Pertanyaan yang dijawab | "Sudah habis berapa?" | "Masih boleh habis berapa?" |
| Angka utama | Saldo | Sisa jatah hari ini |
| Kategori | CORE/OPER/HOBBY/VAULT — *untuk apa* | Terencana/Rutin/Impulsif/Darurat — *kenapa* |
| Kapan bicara | Saat dibuka | Duluan, lewat notifikasi |
| Siklus dev | Push → tunggu CI ~5 menit | `npm run dev` → refresh, instan |
| Grafik | Harus digambar manual di Canvas | SVG/CSS, hampir gratis |

Menambal v1 untuk mencapai v2 berarti mengganti model data, taksonomi, layar utama, dan seluruh lapisan insight — yaitu semuanya kecuali pipeline rilis. Menulis ulang lebih murah daripada bermigrasi.

### 1.1 Yang dibawa dari v1 (karena memang benar)

- Aturan keamanan data dari `AGENTS.md`: soft-delete ke trash, konfirmasi ketik untuk hapus besar, tanpa migrasi destruktif diam-diam, impor selalu preview dulu.
- Konvensi rilis: tag `v<versi>-b<build>`, APK bernama unik `MalasFinance-v<versi>-b<build>.apk`.
- Prinsip "input harus cepat" — di v2 justru diperkuat, bukan dikorbankan.
- Utang yang belum lunas dari `next-spec.md` ITEM-4: keystore dan password **wajib** pindah ke GitHub Secrets, tidak boleh ikut ke repo v2.

### 1.2 Yang dibuang

Seluruh basis kode Kotlin, seluruh skema Room, dan **seluruh data historis**. Aplikasi baru mulai kosong. Konsekuensi cold-start ditangani lewat onboarding berbasis seed (§4.5), bukan lewat impor.

---

## 2. Filosofi: Tiga Komitmen yang Mengikat

Setiap keputusan desain di dokumen ini harus bisa dilacak ke salah satu dari tiga komitmen ini. Kalau sebuah fitur tidak melayani salah satunya, fitur itu tidak masuk.

### K1 — Angka jangkar selalu terlihat

Sisa jatah hari ini berada **di atas form input**, bukan di dashboard terpisah. Kesadaran yang butuh satu tap untuk dilihat adalah kesadaran yang tidak akan dilihat. Angka itu ada di detik saat keputusan belanja diambil.

### K2 — Setiap pengeluaran punya niat

Bukan "untuk apa" (itu tag, opsional), tapi "**kenapa**". Terencana, Rutin, Impulsif, atau Darurat. Wajib, tanpa nilai default yang bisa diterima secara malas. Ini satu-satunya data yang tidak bisa didapat dari mutasi rekening bank, dan satu-satunya yang benar-benar mengubah perilaku.

### K3 — Aplikasi bicara duluan

Aplikasi yang menunggu dibuka hanya melayani orang yang sudah sadar. Notifikasi ambang, pengingat, dan rekap mingguan adalah mekanisme utama, bukan pelengkap. **Tetapi** notifikasi adalah dorongan, bukan sumber kebenaran — setiap notifikasi wajib punya padanan di dalam aplikasi (§8.4).

---

## 3. Keputusan yang Sudah Terkunci

Diambil lewat wawancara berjenjang, lalu diuji lewat review adversarial (§13).

| # | Keputusan | Pilihan | Alasan |
|---|---|---|---|
| D1 | Filosofi | Kesadaran / perubahan perilaku | Mencatat sudah bisa; yang belum, berubah |
| D2 | Data lama | Dibuang total | Taksonomi baru tidak kompatibel; riwayat lama akan mengotori insight |
| D3 | Stack | Svelte + Vite + Capacitor | Paling sedikit kode, dev loop instan di Termux, tetap dapat APK |
| D4 | Tata letak | Input dulu, insight sekali sentuh | Kalau input lambat, tidak ada data untuk disadari |
| D5 | Angka jangkar | Jatah harian, runway lapis kedua | Jatah = actionable, runway = konteks |
| D6 | Taksonomi | Niat: Terencana/Rutin/Impulsif/**Darurat** | Darurat ditambah setelah review (§13.1, UX-02) |
| D7 | Notifikasi | Mode aktif | Sesuai K3 |
| D8 | Dompet | Multi-dompet, tanpa jenis transaksi transfer khusus | Saldo akurat tanpa kerumitan biaya admin |
| D9 | Cold start | Seed lewat onboarding 3 pertanyaan | Menyelesaikan kontradiksi D2 tanpa membatalkannya |
| D10 | Grafik | SVG/CSS manual, tanpa library | uPlot dibuang setelah review (§13) |

---

## 4. Model Domain dan Matematika

Ini bagian terpenting dari dokumen. Seluruh nilai aplikasi bergantung pada satu angka; kalau angka itu berbohong sekali saja, pemakainya berhenti percaya dan aplikasinya mati.

### 4.1 Definisi dasar

**Hari.** Satu hari kalender lokal yang dimulai pada `dayStartHour` (default `0`, boleh `0..6`). Pengaturan ini ada karena mencatat jajan pukul 00.30 seharusnya masuk hitungan "tadi malam", bukan "hari ini". Semua tanggal direpresentasikan sebagai string `YYYY-MM-DD` (`dayKey`), bukan aritmetika milidetik — ini menghilangkan seluruh kelas bug zona waktu dan DST.

```
dayKeyOf(at, dayStartHour) = format(new Date(at - dayStartHour * 3_600_000), 'YYYY-MM-DD')
```

`dayKey` **disimpan di baris transaksi** dan diindeks. Query harian jadi lookup indeks, bukan pemindaian dengan konversi tanggal.

**Selisih hari.** Didefinisikan eksplisit karena seluruh matematika siklus dan cold-start bergantung padanya, dan salah tafsir satu angka di sini menggeser setiap hitungan di dokumen ini:

```
selisihHari(a, b) = floor((tanggalDari(a) − tanggalDari(b)) / 86_400_000)
```

Kedua argumen berupa string `dayKey`, jadi `dayStartHour` sudah terserap di dalamnya dan tidak boleh diterapkan dua kali. **`selisihHari(x, x) === 0`.** Konsekuensinya mengikat: `sisaHari` di hari terakhir siklus bernilai `0 + 1 = 1` (bukan 2), dan `hariSejakMulai` di hari pertama bernilai `0` — yang lalu memicu penjagaan `N > 0` di §4.5. Menafsirkannya sebagai hitungan inklusif akan membelah dua jatah harian di hari terakhir siklus dan merusak ramp cold-start.

**Saldo dompet.**
```
saldoDompet(w) = w.initialBalance
               + Σ(in  → w)
               − Σ(out ← w)
               + Σ(move → w)
               − Σ(move ← w)
```
Hanya transaksi dengan `deletedAt == null`.

**Saldo belanja.** Jumlah saldo seluruh dompet ber-`kind: 'spendable'` yang tidak diarsipkan.
```
saldoBelanja = Σ saldoDompet(w)  untuk w.kind == 'spendable' && !w.archived
```
Dompet ber-`kind: 'reserve'` (tabungan, dana darurat) **tidak** ikut. Inilah pengganti kategori VAULT di v1, dan lebih jujur: di v1, VAULT hanyalah label pada pengeluaran; di v2, uang yang ditabung benar-benar keluar dari kolam yang boleh dibelanjakan.

### 4.2 Siklus

Tiga mode, karena penghasilan tidak selalu teratur.

| Mode | Perilaku | Untuk siapa |
|---|---|---|
| `monthly-day` (default) | Siklus berjalan dari tanggal `cycleAnchorDay` bulan ini sampai sehari sebelum tanggal yang sama bulan depan | Gajian tanggal tetap |
| `manual` | Pemakai menetapkan tanggal akhir siklus; saat terlewat, aplikasi meminta tanggal berikutnya | Penghasilan tidak teratur tapi bisa diperkirakan |
| `rolling` | `cycleEnd = hari ini + 29`, selalu horizon 30 hari | Penghasilan benar-benar tidak terduga |

**Edge case yang wajib ditangani:**

- `cycleAnchorDay = 31` di bulan Februari → dijepit ke hari terakhir bulan (28 atau 29). Berlaku juga untuk 29, 30, 31 di bulan-bulan pendek.
- Tahun kabisat.
- Mode `manual` yang tanggal akhirnya sudah lewat → status `cycle-expired`, aplikasi menampilkan prompt dan **sementara memakai perilaku `rolling`** supaya angka jangkar tidak pernah kosong.

```
sisaHari = max(1, selisihHari(cycleEnd, hariIni) + 1)
```

Penjepitan `max(1, …)` adalah pertahanan mutlak terhadap pembagian nol di hari terakhir siklus.

### 4.3 Komitmen

Entitas yang **tidak ada di desain awal** dan ditambahkan setelah review menemukan bahwa tanpanya angka jangkar berbohong setiap hari (§13.1, M-02).

```
Commitment { id, name, amount, kind: 'bill' | 'saving', dueDay: 1..31, walletId?, active }
```

**Status lunas tidak disimpan — ia diturunkan dari transaksi.** Ini keputusan yang menentukan, diambil setelah review kedua (§13.2) menunjukkan bahwa menyimpan daftar `paidCycles` melahirkan tiga cacat sekaligus: tulis-ganda tanpa atomisitas, tidak adanya sinkronisasi balik saat pembayaran dihapus, dan kunci siklus yang mustahil didefinisikan untuk mode `manual` dan `rolling`. Menurunkannya dari transaksi menghapus ketiganya di akar, dan menghasilkan kode yang lebih sedikit.

**Jendela komitmen.**
```
jendelaKomitmen = [awalBulanIni, cycleEnd]
```

Satu aturan yang berlaku untuk ketiga mode siklus. Batas bawahnya adalah awal bulan berjalan, bukan hari ini — inilah yang membuat tagihan yang **sudah lewat jatuh tempo tapi belum dibayar** tetap terhitung. Batas bawah `hariIni` pada desain sebelumnya menghasilkan perilaku yang justru merusak: kamu lupa bayar listrik tanggal 10, lalu tanggal 11 aplikasi memberi tahu bahwa uangmu **bertambah**. Angka jangkar yang mengganjar kelalaian lebih buruk daripada tidak ada angka sama sekali.

```
sudahDibayar(c) = ada transaksi aktif dengan
                    commitmentId == c.id
                 && dayKey ∈ jendelaKomitmen

komitmenBelumDibayar = Σ c.amount
  untuk c.active
   && kejadianJatuhTempo(c) ∈ jendelaKomitmen
   && !sudahDibayar(c)
```

Karena `sudahDibayar` adalah query, menghapus pembayaran ke trash otomatis membuat komitmennya kembali belum lunas, dan memulihkannya membuatnya lunas lagi. Tidak ada kode sinkronisasi yang perlu ditulis, jadi tidak ada kode sinkronisasi yang bisa salah.

**Membayar.** Dari layar Komitmen lewat tombol **Bayar**, yang membuat satu transaksi dengan `commitmentId` terisi dan `intent = 'routine'` otomatis. Satu penulisan, satu tabel — tidak butuh transaksi lintas-tabel. Tombolnya idempoten: bila `sudahDibayar(c)` sudah benar, tombol berubah jadi label "lunas" dan tidak bisa ditekan lagi. Tidak ada deteksi otomatis dari transaksi biasa — terlalu rawan salah tebak.

**Dua jenis komitmen.**

| `kind` | Dipenuhi dengan | Efek |
|---|---|---|
| `bill` | Transaksi `out` | Uang keluar dari sistem |
| `saving` | Transaksi `move` ke dompet `reserve` | Uang pindah ke tabungan |

Jenis `saving` ada untuk menyelesaikan cacat perilaku yang ditemukan review kedua: tanpanya, memindahkan Rp 500.000 ke tabungan **menurunkan jatah harian secara mendadak**, sehingga aplikasi terasa menghukum tepat pada perilaku yang seharusnya ia dorong. Dengan menabung dimodelkan sebagai komitmen, uangnya sudah dipotong di muka sejak awal siklus — memindahkannya ke `reserve` tidak mengubah jatah sama sekali, karena jatah itu memang sudah tidak pernah menghitungnya. Menabung berubah dari kejutan jadi rencana.

**Konsekuensi penting:** transaksi ber-`commitmentId` **dikecualikan dari belanja diskresioner**. Ia bukan cerminan kebiasaan; ia kewajiban yang sudah diperhitungkan di muka.

**Edge case.** Komitmen dengan `amount` melebihi `saldoBelanja` membuat `danaTersedia` negatif — ditangani sebagai kondisi minus (§4.4), bukan error. Komitmen yang dibuat di tengah siklus langsung ikut terhitung bila kejadian jatuh temponya masih di dalam jendela. `dueDay` 29–31 di bulan pendek dijepit ke hari terakhir bulan, sama seperti `cycleAnchorDay` (§4.2).

### 4.4 Jatah harian

Rumus final, sudah tahan double-counting:

```
terpakaiHariIni = Σ amount  untuk out, dayKey == hariIni, commitmentId == null
basisJatah      = saldoBelanja + terpakaiHariIni
danaTersedia    = basisJatah − komitmenBelumDibayar − endBuffer
jatahHariIni    = danaTersedia > 0 ? floor(danaTersedia / sisaHari) : 0
sisaJatah       = jatahHariIni − terpakaiHariIni
```

**Kenapa `basisJatah` menambahkan kembali belanja hari ini.** `saldoBelanja` sudah berkurang oleh pengeluaran hari ini. Kalau `jatahHariIni` dihitung langsung darinya lalu `terpakaiHariIni` dikurangkan lagi, pengeluaran yang sama dihukum dua kali dan angkanya bergerak liar sepanjang hari. Dengan menambahkannya kembali, `jatahHariIni` stabil dan hanya `sisaJatah` yang turun — persis seperti saldo amplop yang menipis. Efek "boros hari ini → jatah besok turun" tetap muncul, karena besok `saldoBelanja` sudah lebih kecil sementara `sisaHari` berkurang satu.

**Batas kestabilan itu, dinyatakan jujur.** Penambahan-kembali hanya menetralkan **pengeluaran diskresioner**. Ia tidak menetralkan apa pun yang lain, dan memang tidak seharusnya:

| Kejadian di tengah hari | `jatahHariIni` | Benar? |
|---|---|---|
| Belanja diskresioner | tidak berubah | ya — inti mekanismenya |
| Pemasukan diterima | **naik seketika** | ya — uangmu memang bertambah |
| Bayar komitmen | tidak berubah | ya — saldo dan kewajiban turun bersamaan |
| Pindah ke dompet `reserve` | tidak berubah bila lewat komitmen `saving` (§4.3) | ya |
| Riwayat lama diedit/dihapus | berubah | ya, tapi **wajib dijelaskan** (§7.1) |
| `endBuffer` diubah | berubah | ya, tapi **wajib dipratinjau** (§7.4) |

Klaim yang berlaku adalah "stabil terhadap pengeluaran diskresioner sepanjang hari", bukan "stabil sepanjang hari". Versi kedua dari klaim itu keliru, dan review kedua benar menangkapnya (§13.2, C-02).

**Perubahan yang tidak berasal dari hari ini wajib punya penjelasan.** Bila `jatahHariIni` berubah karena riwayat lama diedit, dihapus, dipulihkan, atau karena pengaturan diubah, layar Catat menampilkan banner sekali-lewat: *"Jatah berubah karena riwayat diubah"* atau *"Jatah berubah karena buffer diubah"*. Angka jangkar yang bergerak tanpa sebab yang terlihat adalah angka jangkar yang berhenti dipercaya.

**Verifikasi dengan kasus yang meruntuhkan desain awal:**

> Saldo Rp 3.000.000 di hari ke-5. Sewa Rp 2.000.000 jatuh tempo tanggal 25. Siklus berakhir tanggal 30.

| Tanpa komitmen (desain awal) | Dengan komitmen (final) |
|---|---|
| jatah = 3.000.000 / 26 = **Rp 115.384/hari** | dana = 3.000.000 − 2.000.000 = 1.000.000 |
| Pemakai belanja Rp 100rb/hari dengan tenang | jatah = 1.000.000 / 26 = **Rp 38.461/hari** |
| Tanggal 25 bayar sewa → saldo Rp 0 | Tanggal 25 bayar sewa → sisa ≈ Rp 200.000 |
| Jatah anjlok ke **Rp 0/hari** selama 5 hari | jatah = 200.000 / 6 = **Rp 33.333/hari** |
| **Angka jangkar berbohong 20 hari berturut-turut** | Tidak ada tebing. Konsisten dari awal. |

**Kondisi minus.** Bila `danaTersedia ≤ 0`, `jatahHariIni = 0` dan antarmuka **tidak menampilkan angka negatif di slot besar**. Yang ditampilkan:

```
Rp 0
Kamu minus Rp 420.000 sampai 25 Agu
```

Angka negatif raksasa itu menghukum tanpa memberi arah. Kalimat eksplisit memberi tahu besaran dan batas waktunya.

**Kondisi terlampaui.** Bila `sisaJatah < 0`, slot besar menampilkan `Rp 0` dengan baris merah `Lewat Rp 12.500 hari ini`.

### 4.5 Runway

```
hariSejakMulai    = selisihHari(hariIni, settings.startedAt)           // 0 pada hari pertama
belanjaHarian(d)  = Σ amount  untuk out, dayKey == d, commitmentId == null
N                 = min(28, hariSejakMulai)
jendelaRata       = [hariIni − N, hariIni − 1]                        // TIDAK termasuk hari ini
rataAktual        = N > 0 ? mean(belanjaHarian(d)) untuk d ∈ jendelaRata : 0   // hari tanpa belanja dihitung 0
w                 = min(1, hariSejakMulai / 14)
rataHarian        = w × rataAktual + (1 − w) × seedDailySpend
biayaKomitmenHarian = Σ(komitmen aktif) / panjangSiklus
biayaHarianTotal  = rataHarian + biayaKomitmenHarian
runway            = biayaHarianTotal > 0 ? floor(saldoBelanja / biayaHarianTotal) : null
```

Penjagaan `N > 0` bukan hiasan: tanpanya, `mean([])` menghasilkan `NaN`, dan `0 × NaN` di JavaScript tetap `NaN` — jadi bobot nol **tidak** menyelamatkan hari pertama. Ini harus diuji secara eksplisit (§10.1).

**Hari ini sengaja dikeluarkan dari jendela rata-rata.** Hari yang sedang berjalan adalah data separuh jadi. Kalau ikut dihitung, pukul sembilan pagi ia menyumbang Rp 0 dan menyeret rata-rata turun, sehingga runway terlihat lebih panjang justru di saat kamu belum belanja apa-apa — lalu memendek sepanjang hari. Runway yang berkedip sepanjang hari adalah runway yang tidak dipercaya.

**Tidak ada trimming outlier.** Desain awal membuang 2 hari terboros untuk meredam satu pembelian besar. Review menunjukkan itu justru membuang sewa, listrik, dan pupuk — pengeluaran terbesar dan paling nyata — sehingga runway jadi optimistis palsu (§13.1, M-03). Karena komitmen kini dimodelkan terpisah dan eksplisit, sumber distorsinya hilang di akar. Rumusnya jadi lebih jujur **dan** lebih pendek.

**Cold start.** `seedDailySpend` diisi saat onboarding ("sehari kira-kira habis berapa?"). Bobotnya meluruh linear selama 14 hari sampai murni data asli. Selama `w < 1`, antarmuka menandai angkanya dengan label `perkiraan`. Ini menyelesaikan kontradiksi antara D2 (buang semua data) dan metrik yang butuh 28 hari data (§13.1, CS-01), **tanpa** membatalkan keputusan buang-data.

**Bila `biayaHarianTotal == 0`** (belum ada belanja, tidak ada komitmen, seed nol): tampilkan `—`, bukan `Infinity`.

### 4.6 Rasio impuls

Angka utama dashboard.

```
periode     = [cycleStart, hariIni]                  // siklus berjalan, bukan bulan kalender
rasioImpuls = Σ(out, intent='impulse', diskresioner, periode)
            / Σ(out, diskresioner, periode)
```

Periodenya adalah **siklus berjalan**, karena itulah rentang yang sama dengan jatah harian — memakai bulan kalender akan membuat dua angka di layar yang sama mengukur rentang waktu berbeda. Bila siklus baru berjalan kurang dari 3 hari, tampilkan pembilangnya apa adanya dengan keterangan `<n> hari data` dan sembunyikan persentasenya; rasio dari dua transaksi bukan informasi, itu derau.

Dihitung **hanya atas belanja diskresioner**. Kalau pembayaran komitmen ikut penyebut, rasionya terlihat kecil secara palsu — sewa besar akan mengencerkan angka impuls dan menghilangkan sinyalnya.

Disajikan konkret, bukan sebagai persentase telanjang:

> **Impuls bulan ini Rp 420.000** — setara **9 hari runway**

Konversi ke hari (`nilaiImpuls / biayaHarianTotal`) adalah inti terapi perilakunya: mengubah angka abstrak jadi waktu hidup yang hilang.

**Darurat mendapat perlakuan yang sama persis.** Ini penting dan sengaja. Niat `emergency` ditambahkan supaya pengeluaran yang benar-benar tak terhindarkan tidak mencemari rasio impuls (§13.1, UX-02) — tapi persis karena ia bebas dari beban rasa bersalah, ia jadi tempat pelarian yang nyaman untuk apa pun yang ingin dibenarkan. Kalau `IMPULSIF` berkonsekuensi dan `DARURAT` tidak, setiap pengeluaran yang canggung akan bermigrasi ke sana, dan metrik yang seluruh aplikasi ini dibangun untuk menghasilkannya jadi kosong.

Karena itu belanja darurat disajikan dengan bingkai yang identik — *"Darurat bulan ini Rp 800.000 — setara 17 hari runway"* — dan bila belanja darurat melampaui **20% belanja diskresioner** dalam satu siklus, layar Sadar memunculkan satu pertanyaan tanpa menghakimi: *"Pengeluaran darurat siklus ini tinggi. Semuanya benar-benar darurat?"* Memaksa refleksi, tidak memblokir input.

### 4.7 Metrik pendukung

| Metrik | Rumus | Muncul di |
|---|---|---|
| Banding minggu | `(belanja7HariIni − rata4Minggu) / rata4Minggu` | Sadar, rekap mingguan |
| Rincian tag | `Σ amount per tag`, 8 teratas + "lainnya" | Sadar |
| Sebaran niat | `Σ amount per intent` | Sadar |
| Seri sparkline | `belanjaHarian(d)` untuk 28 hari + garis `jatahHariIni` | Sadar |
| Beban darurat | `Σ(intent='emergency', 90 hari) / 3` per bulan | Sadar |

**Penjagaan data tipis.** Setiap metrik di atas wajib punya jalur "belum cukup data" dan tidak boleh pernah menampilkan `NaN`, `Infinity`, atau persentase yang dihitung dari penyebut nol:

- Banding minggu disembunyikan bila `hariSejakMulai < 7`. Bila `rata4Minggu == 0`, tampilkan `belum cukup data`, bukan pembagian nol. Bila data kurang dari 4 minggu penuh, pakai minggu yang tersedia dan beri keterangan jumlah minggunya.
- Rincian tag dan sebaran niat menampilkan keadaan kosong bila belum ada transaksi keluar.
- Sparkline menggambar hari kosong sebagai nol, bukan melompatinya — celah pada grafik membohongi mata.

---

## 5. Model Data

```ts
type Kind   = 'out' | 'in' | 'move'
type Intent = 'planned' | 'routine' | 'impulse' | 'emergency'

interface Transaction {
  id: string                   // uuid v4
  kind: Kind
  amount: number               // rupiah bulat, > 0, selalu positif
  intent: Intent | null        // wajib bila kind==='out', selain itu null
  tag: string | null           // TEPAT SATU tag atau tidak sama sekali — bukan array
  note: string | null          // maks 200 karakter, tersembunyi di balik "tambah catatan"
  walletId: string             // sumber untuk out/move, tujuan untuk in
  toWalletId: string | null    // wajib bila kind==='move', selain itu null
  commitmentId: string | null   // terisi bila out ini membayar komitmen
  at: number                   // epoch ms
  dayKey: string               // 'YYYY-MM-DD', turunan, diindeks
  createdAt: number
  updatedAt: number
  deletedAt: number | null     // soft delete
}

interface Wallet {
  id: string
  name: string
  kind: 'spendable' | 'reserve'
  initialBalance: number
  archived: boolean
  order: number
}

interface Commitment {
  id: string
  name: string
  amount: number
  kind: 'bill' | 'saving'      // 'saving' dipenuhi dengan move ke dompet reserve
  dueDay: number               // 1..31, dijepit ke akhir bulan bila perlu
  walletId: string | null
  active: boolean
  // TIDAK ada paidCycles. Status lunas diturunkan dari transaksi (§4.3).
}

interface NotifSettings {
  jatahTerlampaui: boolean     // saat sisaJatah < 0, foreground
  belumMencatat: boolean       // 20:00 bila hari ini kosong
  ringkasanHarian: boolean     // 21:00
  rekapMingguan: boolean       // Minggu 20:00
  jamHarian: number            // 0..23, default 21
  jamBelumMencatat: number     // 0..23, default 20
  hariRekap: number            // 0=Minggu, default 0
  jamRekap: number             // 0..23, default 20
}

interface Settings {
  cycleMode: 'monthly-day' | 'manual' | 'rolling'
  cycleAnchorDay: number
  cycleManualEnd: string | null
  endBuffer: number
  dayStartHour: number         // 0..6
  seedDailySpend: number
  startedAt: string            // 'YYYY-MM-DD', untuk ramp cold-start
  notif: NotifSettings
  bigDeleteThreshold: number   // default 1_000_000
  schemaVersion: number
}
```

### 5.1 Aturan integritas

Divalidasi di lapisan repository, bukan hanya di UI — UI bisa dilewati, repository tidak.

| Aturan | Penegakan |
|---|---|
| `amount > 0` dan bilangan bulat | Tolak tulis |
| `intent != null` ⟺ `kind === 'out'` | Tolak tulis |
| `toWalletId != null` ⟺ `kind === 'move'` | Tolak tulis |
| `walletId !== toWalletId` | Tolak tulis |
| `commitmentId != null` ⟹ `kind === 'out'`, atau `kind === 'move'` dengan tujuan dompet `reserve` | Tolak tulis |
| **`at` tidak boleh melewati akhir hari ini** | Tolak tulis |
| Dompet yang masih dirujuk transaksi aktif tidak boleh dihapus | Tolak, tawarkan arsip |
| **Dompet `spendable` bersaldo bukan-nol tidak boleh diarsipkan** | Tolak, minta pindahkan dananya dulu |
| `note` maksimal 200 karakter | Potong di UI, tolak di repository |
| `dayKey` selalu turunan `at` + `dayStartHour` | Dihitung ulang saat tulis |

**Kenapa tanggal masa depan dilarang.** `saldoDompet` (§4.1) tidak menyaring tanggal, sementara `terpakaiHariIni` (§4.4) hanya menjumlah `dayKey` hari ini. Transaksi bertanggal besok karena itu mengurangi saldo **tanpa** ikut dikembalikan oleh mekanisme penambahan-kembali, sehingga jatah hari ini menyusut diam-diam lalu dihitung sekali lagi besok. Melarang tanggal masa depan di lapisan repository mematikan seluruh kelas bug ini dengan satu aturan, jauh lebih murah daripada menambal rumusnya.

**Kenapa arsip dompet bersaldo diblokir.** Ini justru cacat yang lahir dari aturan keamanan di baris sebelumnya: dompet yang masih dirujuk tidak boleh dihapus, dan penggantinya adalah arsip — padahal arsip mengeluarkan dompet itu dari `saldoBelanja`, sehingga jalur "aman" itulah yang justru melenyapkan uang dari basis jatah tanpa penjelasan. Mewajibkan dana dipindahkan lebih dulu membuat perubahan saldonya terlihat sebagai transaksi `move` yang nyata.

### 5.1.1 Aturan penyuntingan

§7.3 mengizinkan menyentuh entri untuk diedit. Yang boleh berubah dibatasi, karena tiap kolom punya konsekuensi ke rumus:

| Kolom | Boleh diedit? | Alasan |
|---|---|---|
| `amount` | ya | Koreksi salah ketik, kasus paling umum |
| `intent` | ya, hanya untuk `kind === 'out'` | Koreksi salah tap — ini yang membuat §7.1 aman |
| `tag`, `note` | ya | Tanpa efek ke rumus |
| `walletId`, `toWalletId` | ya | Divalidasi ulang terhadap aturan §5.1 |
| `at` / `dayKey` | ya, tapi tidak boleh ke masa depan | Mengubah hari mana yang terbebani |
| `kind` | **tidak** | Mengubah `out` jadi `in` membalik arah uang dan membatalkan seluruh aturan integritas sekaligus. Hapus lalu buat ulang. |
| `commitmentId` | **tidak** | Status lunas diturunkan darinya (§4.3); hanya alur Bayar yang boleh menetapkannya |

Setiap penyuntingan menjalankan ulang seluruh validasi §5.1 dan memperbarui `updatedAt`. Menyunting entri hari lampau mengubah jatah hari ini — itu benar secara aritmetika, dan wajib dijelaskan lewat banner (§4.4).

Aturan terakhir penting: mengubah `dayStartHour` **wajib** memicu perhitungan ulang `dayKey` seluruh baris. Ini migrasi data, diperlakukan sebagai migrasi (§9.3).

### 5.2 Skema Dexie

```js
db.version(1).stores({
  transactions: 'id, dayKey, kind, intent, walletId, toWalletId, commitmentId, deletedAt, at',
  wallets:      'id, order, archived',
  commitments:  'id, active, dueDay',
  settings:     'key'
})
```

`toWalletId` **wajib diindeks.** Rumus saldo (§4.1) memuat `Σ(move → w)`, yang berarti mencari transaksi dengan `toWalletId == w`. Tanpa indeks, setiap perhitungan saldo per dompet memindai seluruh tabel. Skalanya memang kecil, tapi saldo dihitung ulang di setiap render angka jangkar — ini jalur terpanas di aplikasi.

Uang disimpan sebagai **rupiah bulat dalam `number`**. Rupiah tidak punya satuan pecahan dalam praktik sehari-hari, dan `Number.MAX_SAFE_INTEGER` ≈ 9 kuadriliun — tidak ada risiko presisi pada skala keuangan pribadi. Tidak perlu BigInt, tidak perlu desimal.

---

## 6. Arsitektur

```
src/
  lib/
    domain/            ← fungsi murni. TIDAK BOLEH mengimpor db/svelte/capacitor.
      money.ts           formatRupiah, parseRupiah
      day.ts             dayKeyOf, selisihHari, rentangHari
      cycle.ts           cycleFor(tanggal, settings) → {start,end,panjang,sisaHari}
      commitment.ts      jendelaKomitmen, sudahDibayar, komitmenBelumDibayar
      allowance.ts       hitungJatah(input) → {jatah, terpakai, sisa, status}
      runway.ts          hitungRunway(input) → {hari, perkiraan} | null
      insight.ts         rasioImpuls, rincianTag, bandingMinggu, seriSparkline
      types.ts
    db/
      schema.ts
      repo/              transactions, wallets, commitments, settings
      backup.ts          serialisasi, parsing, pratinjau
    stores/            ← store Svelte: menyambungkan db ke domain
    notify/
      Notifier.ts        antarmuka
      capacitor.ts       implementasi asli
      mock.ts            implementasi browser/uji
    ui/                ← komponen
  routes/
    +page.svelte         Catat (beranda)
    sadar/+page.svelte
    riwayat/+page.svelte
    atur/+page.svelte
    mulai/+page.svelte   onboarding
```

### 6.1 Kenapa `domain/` diisolasi total

`domain/` menerima masukan berupa data biasa (array angka dan objek polos) dan mengembalikan hasil berupa data biasa. Ia tidak tahu Dexie ada, tidak tahu Svelte ada, tidak tahu Android ada.

Konsekuensinya:

1. **Seluruh kebenaran numerik bisa diuji dalam milidetik** dengan vitest, tanpa emulator, tanpa build APK, tanpa CI. Ini yang menyelamatkan siklus pengembangan di Termux.
2. Bug angka hanya punya satu tempat bersembunyi. Kalau jatah harian salah, penyebabnya pasti di `domain/`, bukan di UI atau query.
3. Aturan lint wajib: `domain/` tidak boleh punya `import` selain dari sesama `domain/`. Ditegakkan dengan `eslint-plugin-boundaries` atau satu tes yang memindai impor.

Batas ini bukan hiasan arsitektur. Ini satu-satunya alasan aplikasi keuangan bisa dikembangkan dari HP tanpa toolchain berat.

---

## 7. Layar

### 7.1 Catat (beranda)

```
┌────────────────────────────────────┐
│ Rp 87.400                          │  ← sisa jatah hari ini (K1)
│ dari Rp 120.000 · runway 19 hari   │  ← lapis kedua
├────────────────────────────────────┤
│  [ KELUAR ]  masuk   pindah        │  ← mode, default KELUAR
├────────────────────────────────────┤
│            25.000                  │
│  7 8 9                             │
│  4 5 6      ⌫                      │  ← keypad, tombol 000
│  1 2 3                             │
│  0 000                             │
├────────────────────────────────────┤
│  #makan #bensin #kopi  + tag       │  ← chip dipelajari dari riwayat
│  CASH ▾                            │
├────────────────────────────────────┤
│  TERENCANA   │   RUTIN             │  ← grid 2×2, INI tombol simpan
│  IMPULSIF    │   DARURAT           │
├────────────────────────────────────┤
│  ↩ 25.000 #kopi impulsif   [batal] │  ← undo 5 detik
└────────────────────────────────────┘
```

**Gerakan inti: tombol niat adalah tombol simpan.** Ketik nominal → tap `IMPULSIF` → tersimpan. Niat menjadi wajib dengan **biaya nol tap tambahan**, dan tidak ada nilai default yang bisa diterima secara malas. Inilah yang membuat K1 (input cepat) dan K2 (niat wajib) tidak saling meniadakan.

**Baris aksi bersifat dinamis** — ini menutup lubang yang ditemukan review (§13.1, UX-01):

| Mode | Baris aksi |
|---|---|
| `KELUAR` (default) | Grid 2×2 empat niat |
| `masuk` | Satu tombol lebar `SIMPAN PEMASUKAN` |
| `pindah` | Pemilih dompet tujuan + `PINDAHKAN` |

Grid 2×2 dipilih ketimbang empat tombol sebaris: target sentuhnya jauh lebih besar, sehingga justru **menurunkan** angka salah-tap dibanding tiga tombol sempit di desain awal.

**Undo.** Setiap simpan memunculkan snackbar 5 detik dengan tombol batal. Entri terakhir juga tetap tampil dan bisa disentuh untuk diedit. Ini menjawab keberatan bahwa simpan-instan mahal saat salah tap (§13.1, UX-03): koreksi butuh satu tap, bukan empat.

**Chip tag** diambil dari 5 tag paling sering dipakai 30 hari terakhir untuk mode yang sedang aktif. Chip bersifat **pilih-satu**, bukan menumpuk: menyentuh chip kedua menggantikan yang pertama. Satu transaksi punya tepat satu tag atau tidak sama sekali (§5). Ini menjaga `rincian tag` bebas dari ambiguitas hitung-ganda, dan menjaga input tetap satu ketukan. Tag opsional dan tidak pernah menghalangi simpan.

**Catatan** disembunyikan di balik tautan kecil `+ catatan` di bawah baris tag. Ia tidak pernah tampil secara default, karena kolom teks bebas adalah musuh utama input cepat. Maksimal 200 karakter, bisa dicari lewat filter di Riwayat.

#### Melawan pembiasaan

Ancaman terbesar aplikasi ini bukan salah hitung, melainkan **mata yang berhenti melihat**. Angka statis di posisi tetap akan berubah jadi latar belakang dalam dua sampai tiga minggu, persis seperti jam dinding. Kalau itu terjadi, aplikasi ini kembali jadi pencatat — tepat yang ingin dihindari (§13.2, P-01).

Tiga mekanisme wajib, bukan opsional:

1. **Angkanya berubah wujud, bukan cuma berubah digit.** Perlakuan visual mengikuti persentase jatah yang terpakai: tenang (0–60%), waspada (60–90%), mendesak (90–100%), terlampaui (>100%). Yang berubah adalah warna, bobot huruf, dan latar — perubahan bentuk tertangkap mata jauh lebih lama daripada perubahan angka.

2. **Intervensi di detik keputusan.** Begitu nominal yang sedang diketik akan melewati sisa jatah, area tombol niat menampilkan baris peringatan **sebelum** disimpan: *"Ini akan melewati jatah Rp 12.500."* Inilah satu-satunya mekanisme di aplikasi ini yang bekerja pada saat keputusan masih bisa dibatalkan — sisanya bekerja setelah uang keluar. Ia tidak memblokir; ia hanya membuat pilihannya sadar.

3. **Konsekuensi masa depan dinyatakan, bukan disimpulkan sendiri.** Saat jatah terlampaui, tampilkan akibatnya secara langsung: *"Jatah besok turun jadi Rp 33.100."* Menyerahkan penarikan kesimpulan itu ke pemakai berarti tidak ada yang menariknya.

**Batasan yang mengikat semua ini:** tidak ada nada menghakimi, tidak ada warna merah untuk niat, tidak ada streak atau lencana. Pemakai adalah pelabel sekaligus pihak yang dinilai — begitu sebuah label terasa menghukum, ia akan berhenti dipakai secara jujur, dan datanya mati (§13.2, P-02). Urutan tombol di grid 2×2 tidak boleh menyiratkan peringkat moral.

### 7.2 Sadar (dashboard)

Satu tap dari beranda. Berisi, berurutan dari paling menyadarkan:

1. **Rasio impuls** — cincin/bar CSS + kalimat konkret: *"Impuls bulan ini Rp 420.000 — setara 9 hari runway."*
2. **Sparkline 28 hari** — SVG buatan sendiri (~30 baris), batang belanja harian dengan garis horizontal jatah. Tanpa library.
3. **Banding minggu** — *"Minggu ini 23% lebih boros dari rata-rata 4 minggu."*
4. **Sebaran niat** — empat bar bertumpuk.
5. **Rincian tag** — 8 teratas.
6. **Komitmen** — daftar tagihan dan target tabungan di siklus ini, dengan tombol Bayar dan penanda lunas.
7. **Audit niat** — sekali per siklus, tampilkan 10 entri `RUTIN` bernilai terbesar dan tanyakan: *"Mana yang sebenarnya impulsif?"* Setiap baris bisa dipindahkan ke `IMPULSIF` dengan satu ketukan.

Butir terakhir adalah satu-satunya pertahanan terhadap pembusukan data yang paling mungkin terjadi. Karena tombol niat merangkap tombol simpan, pemakai yang sedang buru-buru akan memilih label yang paling murah secara emosional, dan `RUTIN` adalah laci sampah yang sempurna: tanpa rasa bersalah, tanpa drama, tanpa kewajiban merencanakan. Tanpa audit, rasio impuls perlahan menuju nol sementara perilaku aslinya tidak berubah sama sekali (§13.2, P-02). Audit ini murah, dilakukan saat tidak terburu-buru, dan mengoreksi tepat pada arah bias yang diketahui.

Semua grafik memakai SVG/CSS tanpa dependensi (D10). Library grafik dicoret setelah review menunjukkan CSS sudah cukup untuk semua bentuk visual di atas kecuali sparkline, dan sparkline itu 30 baris.

### 7.3 Riwayat

Daftar dikelompokkan per hari dengan subtotal harian. Filter: rentang tanggal, niat, tag, dompet, dan isi catatan. Sentuh untuk edit sesuai aturan penyuntingan §5.1.1, geser **tidak** menghapus (aturan warisan v1 yang benar: geser-untuk-hapus terlarang di aplikasi keuangan).

Tab **Trash** berisi entri terhapus dengan tombol pulihkan dan hapus permanen. Retensi tidak terbatas; tidak ada pembersihan otomatis — pembersihan otomatis di aplikasi keuangan adalah jalur kehilangan data.

### 7.4 Atur

Siklus (mode, tanggal jangkar, buffer akhir), dompet (tambah/arsip/urutkan, tandai reserve), komitmen, jam mulai hari, notifikasi (empat sakelar terpisah), ambang hapus besar, cadangan & ekspor/impor, versi aplikasi.

**Setiap pengaturan yang menggeser angka jangkar wajib menampilkan akibatnya sebelum disimpan**, bukan sesudah:

| Perubahan | Pratinjau yang wajib muncul |
|---|---|
| `endBuffer` | "Jatah harianmu akan turun dari Rp 60.000 ke Rp 30.000." |
| Mode atau tanggal jangkar siklus | Tanggal akhir siklus baru + jatah harian barunya |
| Menandai dompet jadi `reserve` | "Rp X keluar dari saldo belanja. Jatah turun ke Rp Y." |
| Mengarsipkan dompet `spendable` | Ditolak bila saldonya bukan nol (§5.1); minta pindahkan dulu |
| `dayStartHour` | Peringatan bahwa ini menghitung ulang seluruh `dayKey` (§9.3) |

Pengaturan yang diam-diam membelah dua angka jangkar akan dibaca sebagai bug, dan kepercayaan pada angka itu tidak pulih setelahnya.

**Sesuaikan saldo.** Seluruh matematika di dokumen ini berdiri di atas `saldoBelanja` yang benar, dan satu transaksi yang lupa dicatat membuat setiap angka melenceng diam-diam. Karena itu tiap dompet punya tindakan "sesuaikan saldo": pemakai memasukkan saldo sebenarnya, aplikasi membuat **transaksi koreksi yang terlihat** sebesar selisihnya (`in` atau `out`, `intent = 'routine'`, tag `#koreksi`).

Aplikasi tidak pernah menimpa saldo secara diam-diam. Menulis ulang angka tanpa jejak akan merusak seluruh riwayat yang jadi dasar runway dan rata-rata harian — dan menyembunyikan dari pemakai bahwa ada uang yang tak terlacak, yaitu justru informasi yang paling perlu ia sadari.

### 7.5 Mulai (onboarding)

Tiga pertanyaan, satu layar per pertanyaan, semua bisa diubah nanti di Atur:

1. **"Uangmu sekarang berapa?"** → membuat dompet `CASH` dengan `initialBalance`
2. **"Sehari kira-kira habis berapa?"** → `seedDailySpend`
3. **"Gajian tanggal berapa?"** — tiga jalur, karena penghasilan tidak selalu punya bentuk yang sama:
   - Tanggal tetap tiap bulan → `monthly-day` + `cycleAnchorDay`
   - "Aku tahu tanggal masuk berikutnya, tapi tidak tetap" → `manual` + `cycleManualEnd`
   - "Tidak tentu" → `rolling`

Lalu satu layar keempat yang meminta izin notifikasi dan menawarkan tautan langsung ke pengaturan optimasi baterai (§8.5).

Onboarding inilah yang membuat angka jangkar dan runway berfungsi sejak **hari pertama** meski database kosong (D9).

---

## 8. Notifikasi

### 8.1 Katalog

| Pemicu | Isi | Keandalan |
|---|---|---|
| Jatah terlampaui | "Jatah hari ini lewat Rp 12.500. Jatah besok turun jadi Rp 33.100." | **Tinggi** — foreground |
| 20:00, belum ada catatan | "Belum ada catatan hari ini." | Sedang |
| 21:00 harian | "Hari ini habis Rp 87.000. Jatah besok Rp 120.000." | Sedang |
| Minggu 20:00 | "Minggu ini 23% lebih boros. Impuls Rp 210.000 = 4 hari runway." | Sedang |

Keempatnya bisa dimatikan satu per satu.

### 8.2 Kendala teknis yang menentukan desain

Notifikasi lokal Capacitor **dijadwalkan dengan teks tetap**. Tidak ada JavaScript yang berjalan saat notifikasi berbunyi. Artinya "hari ini habis Rp X" tidak bisa dihitung pada saat pemicuan.

**Solusi: penjadwalan ulang saat setiap penulisan.** Setiap kali transaksi disimpan (di-debounce 5 detik), notifikasi ringkasan pukul 21:00 hari itu dijadwalkan ulang dengan angka terkini. Karena mencatat berarti membuka aplikasi, angkanya nyaris selalu mutakhir. Batasnya jujur: bila pemakai belanja pukul 20.55 dan mencatatnya pukul 22.00, ringkasan pukul 21:00 sudah basi. Ini diterima; alternatifnya adalah plugin background task yang menambah banyak kode dan justru lebih rapuh terhadap Doze.

Notifikasi **"belum ada catatan"** ditangani terbalik dan bersih: dijadwalkan saat hari dimulai, lalu **dibatalkan** begitu ada transaksi pertama hari itu.

Notifikasi mingguan dihitung dan dijadwalkan setiap aplikasi dibuka pada hari Sabtu atau Minggu.

### 8.3 Antarmuka `Notifier`

```ts
interface Notifier {
  requestPermission(): Promise<boolean>
  schedule(id: number, at: Date, title: string, body: string): Promise<void>
  cancel(id: number): Promise<void>
  cancelAll(): Promise<void>
}
```

Dua implementasi: `capacitor.ts` (asli) dan `mock.ts` (browser dan uji, mencatat ke konsol). Dengan begitu **seluruh logika penjadwalan tetap bisa dikembangkan dan diuji di browser Termux** — hanya pengirimannya yang butuh build device. Ini mitigasi langsung terhadap kelemahan stack yang ditemukan review (§13.1, P-03).

### 8.4 Notifikasi bukan sumber kebenaran

Konsekuensi K3 yang wajib ditegakkan: **setiap notifikasi punya padanan di dalam aplikasi.** Beranda menampilkan banner "hari ini" berisi persis kalimat yang akan/sudah dikirim notifikasi. Bila OEM membunuh alarm terjadwal, siklus kesadarannya tidak putus — hanya jadi tarik (pull), bukan dorong (push).

### 8.5 Bertahan dari Doze dan OEM

- Deklarasikan `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`, jadwalkan sebagai alarm presisi.
- Saat onboarding, tampilkan permintaan pengecualian optimasi baterai dengan tautan langsung ke pengaturan sistem.
- Jadwalkan ulang seluruh notifikasi 7 hari ke depan setiap aplikasi dibuka, supaya pembatalan sepihak oleh sistem otomatis pulih.
- Layar Atur menampilkan diagnostik: kapan notifikasi terakhir dijadwalkan, dan apakah pengecualian baterai aktif.

Xiaomi, Oppo, Vivo, dan Samsung tetap bisa membunuhnya. §8.4 adalah jaring pengaman, bukan pelengkap.

---

## 9. Keamanan Data

Aplikasi keuangan punya satu mode kegagalan yang tidak termaafkan: kehilangan catatan.

### 9.1 Ketahanan penyimpanan

IndexedDB di dalam WebView Capacitor bersifat privat-aplikasi dan jauh lebih tahan daripada penyimpanan browser biasa. Meski begitu, pertahanannya murah, jadi tidak perlu diperdebatkan:

1. `navigator.storage.persist()` dipanggil saat peluncuran pertama.
2. **Cadangan otomatis**: 30 detik setelah penulisan terakhir (debounce), tulis snapshot JSON penuh ke `Directory.Data/backups/latest.json` lewat Capacitor Filesystem.
3. **Rotasi harian**: simpan 7 snapshot bertanggal.
4. **Salinan mingguan** ke `Directory.Documents/MalasFinance/` supaya terlihat pemakai dan bisa disalin keluar. Bersifat *best-effort* — tunduk pada scoped storage Android.
5. Layar Atur menampilkan **kapan cadangan terakhir berhasil**. Bila lebih dari 3 hari, tampilkan peringatan.

**Format berkas cadangan.** Amplopnya wajib membawa versi skemanya sendiri. Tanpa penanda versi di dalam berkas, impor lintas-versi mustahil dilakukan dengan aman — kode impor tidak punya cara untuk tahu bentuk apa yang sedang ia baca, bahkan tidak tahu bahwa ia perlu memberi nilai bawaan.

```json
{
  "format": "malasfinance-backup",
  "schemaVersion": 1,
  "appVersion": "2.0.0",
  "exportedAt": 1785000000000,
  "settings":    { },
  "wallets":     [ ],
  "commitments": [ ],
  "transactions":[ ]
}
```

Impor membaca `schemaVersion` lebih dulu, menjalankan migrasi maju bila perlu, baru menulis. `schemaVersion` lebih besar dari yang dikenal aplikasi → tolak dengan pesan jelas ("cadangan ini dari versi aplikasi yang lebih baru"), **jangan** coba dibaca sebagian. Transaksi terhapus ikut disertakan lengkap dengan `deletedAt`-nya, karena ini cadangan penuh, bukan ekspor laporan.

Cadangan otomatis masuk **Fase 1**, bukan fase akhir. Meluncurkan input data sebelum ada cadangan adalah kesalahan urutan yang ditemukan review (§13.1, S-01).

### 9.2 Impor selalu pratinjau dulu

Diwarisi dari `next-spec.md` ITEM-3 karena memang benar. Alur: pilih berkas → parse → **pratinjau** → konfirmasi.

Pratinjau menampilkan: jumlah entri, rentang tanggal, total masuk, total keluar, dompet baru yang akan dibuat, dan komitmen baru yang akan dibuat.

Dua mode:

| Mode | Perilaku | Konfirmasi |
|---|---|---|
| **Gabung** | Semua entri mendapat `id` baru; tidak ada dedup | Tombol `<n> ENTRI — IMPOR` |
| **Ganti total** | Basis data dikosongkan lalu diisi | **Ketik `GANTI`** untuk konfirmasi |

Berkas rusak, JSON tidak valid, atau nol entri valid → *"Tidak ada entri yang bisa dibaca — berkas mungkin rusak"*, bukan sukses diam-diam.

### 9.3 Migrasi

- Perubahan skema Dexie **wajib** punya fungsi upgrade eksplisit.
- Tidak ada padanan `fallbackToDestructiveMigration()`. Bila upgrade gagal, aplikasi menolak jalan dan menawarkan ekspor, **bukan** menghapus.
- Mengubah `dayStartHour` diperlakukan sebagai migrasi: hitung ulang `dayKey` seluruh baris di dalam satu transaksi, dengan cadangan otomatis dipicu lebih dulu.

### 9.4 Penghapusan

- Hapus → trash (`deletedAt`), selalu bisa dipulihkan.
- Tidak ada geser-untuk-hapus.
- Hapus permanen entri dengan `amount ≥ bigDeleteThreshold` (default Rp 1.000.000) butuh **konfirmasi ketik**.
- Mengosongkan seluruh trash butuh konfirmasi ketik tanpa memandang jumlah.
- Dompet yang masih dirujuk transaksi aktif tidak bisa dihapus — hanya diarsipkan.

---

## 10. Pengujian

### 10.1 Domain (mayoritas, vitest, tanpa emulator)

Daftar kasus yang **wajib** ada, karena masing-masing mewakili cara aplikasi ini bisa berbohong:

**`cycle.ts`**
- `cycleAnchorDay = 31` di Februari (28 dan 29 hari)
- `cycleAnchorDay = 30` di Februari
- Hari terakhir siklus → `sisaHari === 1`, tidak pernah 0
- Mode `manual` yang tanggalnya sudah lewat → `cycle-expired`, jatuh ke perilaku `rolling`
- Pergantian tahun

**`allowance.ts`**
- Belanja hari ini tidak dihitung dua kali: `jatahHariIni` stabil terhadap pengeluaran diskresioner
- Pemasukan di tengah hari **menaikkan** `jatahHariIni` seketika (perilaku yang disengaja, dikunci lewat tes)
- Boros hari ini → `jatahHariIni` besok turun
- Komitmen belum dibayar mengurangi jatah sejak hari pertama siklus
- Komitmen dibayar di tengah siklus tidak menimbulkan lonjakan maupun tebing
- Komitmen `saving` dibayar lewat `move` ke `reserve` **tidak** mengubah jatah
- `danaTersedia ≤ 0` → jatah 0 dan status `minus`, bukan angka negatif
- `endBuffer` lebih besar dari saldo
- Dompet `reserve` tidak ikut `saldoBelanja`
- Nol dompet spendable
- Transaksi bertanggal masa depan ditolak (§5.1) sehingga tidak pernah mencapai rumus ini

**`commitment.ts`**
- Komitmen lewat jatuh tempo tapi belum dibayar **tetap** terhitung — lupa bayar tidak boleh menaikkan jatah
- Membayar komitmen membuatnya lunas; menghapus pembayaran ke trash membuatnya **kembali** belum lunas
- Memulihkan pembayaran dari trash membuatnya lunas lagi
- Tombol Bayar idempoten: komitmen yang sudah lunas tidak bisa dibayar dua kali
- Jendela `[awalBulanIni, cycleEnd]` berperilaku benar di ketiga mode siklus, termasuk `rolling`
- `dueDay = 31` di bulan pendek dijepit ke hari terakhir
- Komitmen dibuat di tengah siklus langsung terhitung bila jatuh temponya masih di jendela
- `amount` melebihi saldo → kondisi minus, bukan error

**`runway.ts`**
- Nol hari data → seed murni, ditandai `perkiraan`, dan hasilnya **bukan `NaN`**
- Hari ke-7 → campuran seed dan aktual
- Hari ke-14 dan ke-15 → seed berbobot nol
- Nol belanja dan nol komitmen → `null`, bukan `Infinity`
- Hari tanpa belanja dihitung sebagai 0, bukan dilewati
- **Hari ini tidak masuk jendela rata-rata** — runway tidak berubah saat transaksi hari ini disimpan
- Pembayaran komitmen tidak mencemari rata-rata diskresioner

**`day.ts`**
- `selisihHari(x, x) === 0` — dikunci lewat tes karena setiap rumus siklus bergantung padanya
- `dayStartHour = 3`: transaksi pukul 01:30 masuk `dayKey` kemarin
- Pergantian bulan dan tahun
- Konsistensi saat perangkat berpindah zona waktu

**`insight.ts`**
- Rasio impuls dengan penyebut nol
- Rasio impuls mengecualikan pembayaran komitmen dari penyebut
- Rasio impuls memakai rentang siklus berjalan, bukan bulan kalender
- Banding minggu saat data kurang dari 4 minggu
- Banding minggu saat `rata4Minggu == 0` → "belum cukup data", bukan pembagian nol
- Tidak ada satu pun metrik yang bisa mengembalikan `NaN` atau `Infinity` untuk basis data kosong

### 10.2 Repository (`fake-indexeddb`)

Setiap aturan integritas di §5.1 punya satu tes yang membuktikan penulisan ditolak — termasuk penolakan tanggal masa depan dan penolakan mengarsipkan dompet `spendable` bersaldo. Ditambah: siklus soft-delete/pulihkan, penghapusan dompet yang masih dirujuk, setiap aturan penyuntingan §5.1.1 (khususnya `kind` dan `commitmentId` yang tidak boleh berubah), dan idempotensi tombol Bayar.

### 10.3 Cadangan dan impor

Bolak-balik serialisasi, JSON rusak, berkas kosong, `id` duplikat, dompet tak dikenal, angka pratinjau cocok dengan hasil impor. Ditambah: berkas tanpa `schemaVersion` ditolak, `schemaVersion` lebih tinggi dari yang dikenal ditolak dengan pesan jelas, dan transaksi terhapus ikut terbawa lengkap dengan `deletedAt`-nya.

### 10.4 Yang tidak diuji

Tidak ada uji E2E maupun screenshot. Aplikasi satu pemakai, dan biaya perawatannya melebihi manfaatnya. Verifikasi UI dilakukan manual di browser. Ini keputusan sadar, bukan kelalaian.

---

## 11. Build dan Rilis

### 11.1 Siklus pengembangan

```
npm run dev     → server Vite, dibuka di browser HP. Fitur native memakai mock.
npm run test    → vitest, milidetik
npm run build   → aset statis
npx cap sync android && ./gradlew assembleRelease   → hanya di CI
```

**Batas yang harus dinyatakan terang-terangan:** fitur native — notifikasi, Filesystem — **tidak bisa diuji di browser**. Fase 3 kehilangan dev loop instan dan kembali bergantung pada build device. Antarmuka `Notifier` (§8.3) memperkecil kerugiannya dengan membuat logika penjadwalan tetap teruji di browser, tapi pengiriman sesungguhnya tetap butuh APK.

### 11.2 Termux

Halangan nyata yang perlu diakali sekali di awal:

- **Phantom process killer** (Android 12+) membunuh proses anak Termux. Nonaktifkan lewat `settings put global settings_enable_monitor_phantom_procs false` (butuh adb/Shizuku), atau terima restart sesekali.
- **`termux-wake-lock`** sebelum sesi panjang.
- **File watching** lewat inotify bisa meleset di storage Android. Bila terjadi, aktifkan `server.watch.usePolling` di `vite.config.ts` — dengan konsekuensi baterai lebih boros.

### 11.3 CI dan rilis

- Pemicu: perubahan yang mempengaruhi APK saja, sama seperti v1.
- Langkah: `npm ci` → `npm test` → `npm run build` → `cap sync` → `assembleRelease` → tanda tangan → rilis.
- **Keystore dan password wajib berasal dari GitHub Secrets.** Repo v2 tidak boleh memuat `.keystore`, `.base64`, atau password dalam bentuk apa pun. Ini utang yang tidak lunas di v1 dan tidak boleh diwarisi.
- Tag `v<versi>-b<build>`, APK `MalasFinance-v<versi>-b<build>.apk`, catatan rilis berisi SHA commit dan changelog sejak tag sebelumnya.
- **Versi bersumber tunggal** dari `package.json`, disuntikkan lewat `define` Vite, ditampilkan di layar Atur. Tidak ada string versi yang ditulis tangan di mana pun — ini menutup penyakit menahun v1 (drift tiga arah antara build.gradle, README, dan UI).

---

## 12. Fase Implementasi

| Fase | Isi | Selesai bila |
|---|---|---|
| **1 — Fondasi** | Model data, Dexie, repository + aturan integritas (§5.1, §5.1.1), `domain/` lengkap dengan tesnya, onboarding, layar Catat, angka jangkar, mekanisme anti-pembiasaan (§7.1), komitmen `bill` + `saving`, sesuaikan saldo, trash, **cadangan otomatis** | Bisa mencatat sehari penuh dan angkanya benar; data selamat dari uninstall-reinstall lewat cadangan |
| **2 — Sadar** | Dashboard, sparkline SVG, rasio impuls, rincian tag, banding minggu, audit niat, layar Riwayat dengan filter | Semua metrik §4.7 tampil dan cocok dengan hitungan manual |
| **3 — Suara** | `Notifier`, penjadwalan, penjadwalan ulang saat tulis, banner dalam aplikasi, permintaan pengecualian baterai | Empat notifikasi terkirim di perangkat nyata; mematikan notifikasi tidak merusak apa pun |
| **4 — Rilis** | Ekspor/impor lengkap dengan pratinjau, ekspor Markdown, pipeline APK, GitHub Secrets | APK bertanda tangan terbit dari CI; impor bolak-balik menghasilkan data identik |

Cadangan otomatis sengaja diletakkan di Fase 1, bukan Fase 4.

---

## 13. Review Adversarial dan Penyelesaiannya

Desain ini melewati **dua ronde** review adversarial dengan model berbeda sebelum dibekukan. Ronde 1 menyerang desain awal; ronde 2 menyerang dokumen hasil revisinya dan dilarang mengulang temuan ronde 1.

### 13.1 Ronde 1 — `gemini-3.6-flash-high`

Tiga belas temuan; dua belas diterima seluruhnya atau sebagian, satu ditolak.

| ID | Temuan | Penyelesaian |
|---|---|---|
| **M-01** | Pembagian nol di hari terakhir siklus | Jepitan `max(1, sisaHari)` (§4.2); kondisi minus dispesifikasikan eksplisit (§4.4) |
| **M-02** | Jatah harian mengabaikan tagihan tetap yang belum jatuh tempo — **angka jangkar berbohong setiap hari** | Entitas `Commitment` ditambahkan; `komitmenBelumDibayar` dikurangkan dari dana tersedia (§4.3, §4.4) |
| **M-03** | Membuang 2 hari terboros justru menyembunyikan sewa dan listrik | Trimming dihapus total; runway kini dihitung atas belanja diskresioner dengan komitmen eksplisit (§4.5) |
| **P-01** | Penggusuran IndexedDB oleh Android | Klaim tentang OEM mengabaikan `persist()` tidak terverifikasi dan diragukan, tapi pertahanannya murah: cadangan otomatis naik ke Fase 1 (§9.1) |
| **UX-01** | Tombol niat sebagai tombol simpan tidak menyediakan jalan untuk pemasukan dan pindah dompet | Baris aksi dibuat dinamis per mode (§7.1) |
| **P-02** | Doze dan OEM mematikan notifikasi terjadwal | Diterima untuk yang terjadwal; alert ambang berjalan di foreground dan tetap andal. Prinsip §8.4 ditambahkan: setiap notifikasi punya padanan dalam aplikasi |
| **CS-01** | Membuang seluruh data sementara metrik butuh 28 hari data | Seed lewat onboarding dengan peluruhan bobot 14 hari (§4.5, §7.5). Keputusan buang-data tetap berlaku |
| **UX-02** | Taksonomi tidak punya tempat untuk pengeluaran darurat; memaksanya jadi impulsif merusak metrik dan menimbulkan rasa bersalah palsu | Niat keempat `emergency` ditambahkan; tata letak jadi grid 2×2 (§7.1) |
| **P-03** | Termux: phantom process killer, inotify, dan fitur native tak bisa diuji di browser | Diakui terang-terangan (§11.1, §11.2); antarmuka `Notifier` memperkecil dampaknya (§8.3) |
| **UX-03** | Simpan-instan tanpa undo mahal saat salah tap | Snackbar undo 5 detik + entri terakhir bisa disentuh; grid 2×2 memperbesar target sentuh (§7.1) |
| **S-01** | Cadangan diletakkan di Fase 4 sementara input diluncurkan di Fase 1 | Cadangan otomatis dipindah ke Fase 1 (§9.1, §12) |
| **YAGNI** | Library grafik uPlot berlebihan | **Diterima** — dicoret; SVG/CSS manual (§7.2, D10) |
| **YAGNI** | Multi-dompet dengan `move` disebut "kerumitan skema tanpa manfaat" | **Ditolak.** `move` diperlukan agar saldo per dompet benar, dan pemisahan dompet `reserve` justru yang membuat `saldoBelanja` tidak menghitung tabungan. Tanpanya angka jangkar rusak. |

### 13.2 Ronde 2 — `claude-opus-4-6-thinking`

Dua puluh empat temuan, nol pengulangan dari ronde 1. Semuanya diterima; tiga di antaranya diselesaikan dengan cara **berbeda dan lebih kuat** daripada yang diusulkan.

> Penomoran kedua ronde berdiri sendiri dan **bertabrakan**: `P-01` di §13.1 berarti penggusuran IndexedDB, sementara `P-01` di §13.2 berarti pembiasaan. Setiap rujukan di dokumen ini karena itu selalu menyebut nomor ronde-nya.

**Satu perubahan struktural mematikan tiga temuan sekaligus.** C-01 (tulis-ganda tanpa atomisitas), H-01 (tidak ada sinkronisasi balik saat pembayaran dihapus), dan H-10 (`cycleKey` mustahil didefinisikan untuk mode `manual` dan `rolling`) semuanya berakar pada satu keputusan: menyimpan status lunas di `paidCycles`. Menurunkannya dari transaksi (§4.3) menghapus ketiganya sekaligus, dan menghasilkan kode yang lebih sedikit — bukan lebih banyak.

| ID | Tingkat | Temuan | Penyelesaian |
|---|---|---|---|
| **C-01** | Kritis | Tombol Bayar menulis ke dua tabel tanpa atomisitas; gagal di tengah → komitmen dipotong dua kali | `paidCycles` dihapus; status lunas diturunkan dari transaksi (§4.3). Satu penulisan, tidak ada jendela rusak. |
| **H-01** | Kritis | Menghapus pembayaran ke trash tidak mengembalikan status belum-lunas | Hilang dengan sendirinya oleh perubahan yang sama — `sudahDibayar` adalah query atas transaksi aktif (§4.3) |
| **H-10** | Tinggi | `cycleKey` dipakai tapi tidak pernah didefinisikan; mustahil untuk `manual` dan `rolling` | Tidak ada lagi `cycleKey`. Jendela komitmen jadi satu aturan tunggal `[awalBulanIni, cycleEnd]` (§4.3) |
| **H-02** | Tinggi | Tagihan lewat jatuh tempo yang belum dibayar hilang dari hitungan — lupa bayar justru **menaikkan** jatah | Batas bawah jendela diubah dari `hariIni` ke `awalBulanIni` (§4.3) |
| **C-02** | Tinggi | Klaim "jatah stabil sepanjang hari" keliru — pemasukan di tengah hari mengubahnya | Klaim dikoreksi jadi "stabil terhadap pengeluaran diskresioner", dengan tabel eksplisit kejadian mana yang mengubah jatah dan mana yang tidak (§4.4) |
| **C-03** | Tinggi | Pindah ke `reserve` menurunkan jatah — aplikasi menghukum menabung | **Cara berbeda:** menabung dimodelkan sebagai komitmen `kind: 'saving'` sehingga terpotong di muka. Memindahkan uang jadi tidak mengubah jatah sama sekali. Nol konsep baru. (§4.3) |
| **C-04** | Tinggi | Mengedit riwayat lama menggeser jatah hari ini tanpa penjelasan | Banner sekali-lewat di layar Catat (§4.4) |
| **C-05** | Sedang | Transaksi bertanggal masa depan menggerus jatah tanpa dikembalikan | Tanggal masa depan ditolak di lapisan repository — satu aturan mematikan seluruh kelas bug (§5.1) |
| **C-06** | Sedang | Mengarsipkan dompet menurunkan jatah diam-diam | **Cara berbeda:** bukan sekadar dialog peringatan — mengarsipkan dompet `spendable` bersaldo **ditolak**, dananya harus dipindahkan dulu (§5.1) |
| **C-07** | Sedang | Mengubah `endBuffer` menurunkan jatah diam-diam | Pratinjau wajib sebelum simpan, untuk semua pengaturan yang menggeser jatah (§7.4) |
| **P-01** | Tinggi | Angka statis jadi hiasan dinding dalam ~3 minggu | Tiga mekanisme anti-pembiasaan, termasuk intervensi di detik keputusan sebelum uang keluar (§7.1) |
| **P-02** | Sedang | Niat wajib mendorong pelabelan tidak jujur ke arah `RUTIN` | Audit niat sekali per siklus + larangan nada menghakimi pada label (§7.1, §7.2) |
| **P-03** | Sedang | `DARURAT` jadi pintu keluar bebas rasa bersalah | Bingkai "setara X hari runway" yang sama persis + pertanyaan refleksi bila darurat > 20% (§4.6) |
| **U-01** | Tinggi | `selisihHari` dipakai di mana-mana tapi tidak pernah didefinisikan | Didefinisikan formal, dengan konsekuensinya dijabarkan dan dikunci lewat tes (§4.1, §10.1) |
| **U-02** | Sedang | "N hari terakhir" ambigu — termasuk hari ini atau tidak? | Hari ini dikeluarkan secara eksplisit; alasannya dijelaskan (§4.5) |
| **U-03** | Sedang | Tipe `NotifSettings` menggantung | Didefinisikan (§5) |
| **U-04** | Sedang | Model data bilang satu tag, wireframe menyiratkan banyak | Diputuskan tepat satu; chip jadi pilih-satu (§5, §7.1) |
| **U-05** | Sedang | Aturan penyuntingan transaksi tidak ada sama sekali | Subbagian §5.1.1 ditambahkan |
| **U-06** | Rendah | Kolom `note` ada di model tapi tidak ada di UI | Dispesifikasikan: tersembunyi di balik tautan, maks 200 karakter, bisa dicari (§7.1) |
| **U-07** | Sedang | Berkas cadangan tanpa versi skema → impor lintas-versi mustahil | Amplop cadangan berversi didefinisikan (§9.1) |
| **U-08** | Sedang | `toWalletId` tidak diindeks padahal dipakai tiap hitung saldo | Ditambahkan ke indeks Dexie (§5.2) |
| **U-09** | Rendah | Periode `rasioImpuls` tidak pernah ditentukan | Siklus berjalan, dengan penjagaan data tipis (§4.6) |
| **U-10** | Rendah | Banding minggu bisa membagi nol | Penjagaan data tipis untuk semua metrik (§4.7) |
| **U-11** | Rendah | Onboarding tidak punya jalan ke mode `manual` | Pertanyaan ketiga jadi tiga jalur (§7.5) |

---

## 14. Di Luar Cakupan

Ditolak secara sadar. Menambahkan salah satunya butuh alasan baru yang eksplisit, bukan sekadar "sekalian".

Multi-mata-uang · multi-pemakai · sinkronisasi/cloud · amplop budget · foto struk · OCR · transaksi berulang otomatis (komitmen sudah menutup kebutuhan nyatanya) · pelacakan utang-piutang · library grafik · terjemahan (Bahasa Indonesia saja) · iOS · widget layar utama · impor mutasi bank.

---

## 15. Risiko yang Diketahui

Dicatat supaya tidak jadi kejutan, bukan supaya diperdebatkan lagi.

| Risiko | Dampak | Sikap |
|---|---|---|
| Notifikasi terjadwal dibunuh OEM | K3 melemah | Diterima; §8.4 adalah jaring pengamannya |
| Fitur native tak bisa diuji di browser | Fase 3 kehilangan dev loop instan | Diterima; harga dari D3 |
| Isi notifikasi bisa basi | Ringkasan harian sesekali meleset | Diterima; alternatifnya lebih rapuh |
| Seed cold-start hanyalah tebakan | Runway 14 hari pertama tidak presisi | Diterima; ditandai `perkiraan` di UI |
| Termux dibunuh phantom process killer | Dev sesekali terputus | Bisa diakali (§11.2) |
| Ketahanan IndexedDB tak sepenuhnya pasti | Kehilangan data | Dimitigasi berlapis (§9.1), tidak dihilangkan |
| Empat niat terasa terlalu banyak saat dipakai | Input melambat | Pantau; taksonomi bisa diciutkan tanpa migrasi karena `intent` cuma string |
| **Pembiasaan: angka jangkar berhenti dilihat** | Aplikasi diam-diam kembali jadi pencatat — kegagalan total terhadap K1 | Dimitigasi (§7.1) tapi **tidak** dihilangkan. Ini risiko eksistensial aplikasi ini, bukan risiko teknis. Bila setelah dua bulan pemakaian rasio impuls tidak bergerak sama sekali, mekanisme anti-pembiasaannya yang gagal, bukan pemakainya. |
| **Pelabelan tidak jujur ke arah `RUTIN`** | Rasio impuls menuju nol sementara perilaku tidak berubah | Audit niat per siklus (§7.2) mengoreksi tepat pada arah biasnya, tapi bergantung pada kejujuran saat tidak terburu-buru |
| Seluruh matematika bergantung pada `saldoBelanja` yang benar | Satu dompet lupa dicatat → semua angka salah | Tidak ada rekonsiliasi bank otomatis. Layar Atur perlu jalur "sesuaikan saldo" yang membuat transaksi koreksi eksplisit, bukan menulis ulang saldo diam-diam. |

---

## 16. Definisi Selesai

Versi 2.0.0 layak rilis bila:

1. Mencatat pengeluaran butuh **maksimal tiga tap** dari aplikasi terbuka (mode default, tanpa tag).
2. Sisa jatah hari ini terlihat **tanpa scroll** saat aplikasi dibuka.
3. Setiap kasus uji di §10.1 lulus.
4. Uninstall lalu install ulang, kemudian impor cadangan otomatis, menghasilkan data yang **identik**.
5. Keempat notifikasi terkirim di perangkat nyata dengan pengecualian baterai aktif.
6. Tidak ada satu pun rahasia di dalam repositori.
7. Versi yang tampil di layar Atur cocok dengan `package.json` tanpa pengeditan manual.
8. Angka jatah harian dan runway cocok dengan hitungan manual di atas kertas untuk satu siklus penuh berisi data nyata.

Kriteria kedelapan yang paling penting. Sisanya bisa ditambal; angka yang berbohong tidak.
