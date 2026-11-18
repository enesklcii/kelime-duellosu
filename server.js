const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const KELIME_DOSYASI = path.join(__dirname, 'kelimeler.json');
let tumKelimeler = JSON.parse(fs.readFileSync(KELIME_DOSYASI, 'utf8'));

const HEDEF_PUAN = 100;
const TUR_SURESI = 15; // Her soru 15 saniye
const MAC_SURESI = 300; // Maksimum maç süresi 5 dakika (300 saniye)
const odalar = {};

function kategoriHavuzuGetir(kategori) {
  if (kategori === 'hepsi' || !tumKelimeler[kategori]) {
    return [...tumKelimeler.gunluk, ...tumKelimeler.fiiller, ...tumKelimeler.soyut];
  }
  return tumKelimeler[kategori];
}

app.post('/api/kelime-ekle', (req, res) => {
  const { tr, en, kategori } = req.body;
  if (!tr || !en || !tumKelimeler[kategori]) {
    return res.status(400).json({ basarili: false, mesaj: 'Eksik bilgi!' });
  }
  const temizTr = tr.trim();
  const temizEn = en.trim().charAt(0).toUpperCase() + en.trim().slice(1);
  const tumHavuz = kategoriHavuzuGetir('hepsi').map(k => k.en).filter(k => k.toLowerCase() !== temizEn.toLowerCase());
  const karisikYanlislar = tumHavuz.sort(() => Math.random() - 0.5).slice(0, 3);
  while (karisikYanlislar.length < 3) karisikYanlislar.push('Word' + (karisikYanlislar.length + 1));

  tumKelimeler[kategori].push({ tr: temizTr, en: temizEn, siklar: [temizEn, ...karisikYanlislar] });
  fs.writeFileSync(KELIME_DOSYASI, JSON.stringify(tumKelimeler, null, 2), 'utf8');
  res.json({ basarili: true, mesaj: '"' + temizTr + ' - ' + temizEn + '" eklendi!' });
});

function maciBitir(odaKodu, sebep) {
  const oda = odalar[odaKodu];
  if (!oda || oda.macBitti) return;

  oda.macBitti = true;
  oda.turKilitli = true;
  clearTimeout(oda.zamanlayici);
  clearTimeout(oda.botZamanlayici);
  clearTimeout(oda.macZamanlayici);
  clearTimeout(oda.sonrakiSoruTimer);

  const oyuncuListesi = Object.values(oda.oyuncular).sort((a, b) => b.puan - a.puan);
  let sampiyonMetni = 'Kimse';
  if (oyuncuListesi.length > 0) {
    if (oyuncuListesi.length > 1 && oyuncuListesi[0].puan === oyuncuListesi[1].puan) {
      sampiyonMetni = 'Berabere (' + oyuncuListesi[0].isim + ' & ' + oyuncuListesi[1].isim + ')';
    } else {
      sampiyonMetni = oyuncuListesi[0].isim;
    }
  }

  io.to(odaKodu).emit('oyunBitti', {
    sampiyon: sampiyonMetni,
    sebep: sebep, // 'puan' veya 'sure'
    oyuncular: oda.oyuncular,
    hataDefteri: oda.hataDefteri
  });
}

function turuSonuclandir(odaKodu) {
  const oda = odalar[odaKodu];
  if (!oda || !oda.aktifSoru || oda.turKilitli || oda.macBitti) return;

  oda.turKilitli = true;
  clearTimeout(oda.zamanlayici);
  clearTimeout(oda.botZamanlayici);

  const dogruCevap = oda.aktifSoru.en;
  let enHizliId = null;
  let enKisaZaman = Infinity;
  const dogruBilenIsimler = [];
  let hataYapildiMi = false;

  // En hızlı doğru cevabı bul
  for (const id in oda.cevaplar) {
    const kayit = oda.cevaplar[id];
    if (kayit.dogruMu && kayit.zaman < enKisaZaman) {
      enKisaZaman = kayit.zaman;
      enHizliId = id;
    }
  }

  // Tüm oyuncuların puan ve serilerini hesapla
  for (const id in oda.oyuncular) {
    const oyuncu = oda.oyuncular[id];
    const kayit = oda.cevaplar[id];

    if (kayit && kayit.dogruMu) {
      oyuncu.seri = (oyuncu.seri || 0) + 1;
      let kazanilan = 10;
      let etiket = oyuncu.isim;

      // Birden fazla oyuncu varsa en hızlıya +2 puan
      if (id === enHizliId && Object.keys(oda.oyuncular).length > 1) {
        kazanilan += 2;
        etiket += ' ⚡';
      }
      // 3 ve üzeri seriye +5 combo puanı
      if (oyuncu.seri >= 3) {
        kazanilan += 5;
        etiket += ' 🔥' + oyuncu.seri + 'x';
      }

      oyuncu.puan += kazanilan;
      dogruBilenIsimler.push(etiket + ' (+' + kazanilan + 'p)');
    } else {
      oyuncu.seri = 0;
      hataYapildiMi = true;
    }
  }

  if (hataYapildiMi) {
    if (!oda.hataDefteri.some(k => k.en === oda.aktifSoru.en)) {
      oda.hataDefteri.push({ tr: oda.aktifSoru.tr, en: oda.aktifSoru.en });
    }
  }

  // 100 puana ulaşan var mı kontrol et
  const kazananVarMi = Object.values(oda.oyuncular).some(o => o.puan >= HEDEF_PUAN);
  if (kazananVarMi) {
    maciBitir(odaKodu, 'puan');
    return;
  }

  io.to(odaKodu).emit('turSonucu', {
    dogruCevap: dogruCevap,
    bilenler: dogruBilenIsimler,
    oyuncular: oda.oyuncular
  });

  oda.sonrakiSoruTimer = setTimeout(() => yeniSoruGonder(odaKodu), 2500);
}

function yeniSoruGonder(odaKodu) {
  const oda = odalar[odaKodu];
  if (!oda || oda.macBitti) return;

  // Maç ilk kez başlıyorsa 5 dakikalık genel sayacı başlat
  if (!oda.macBasladi) {
    oda.macBasladi = true;
    oda.macBitisZamani = Date.now() + MAC_SURESI * 1000;
    io.to(odaKodu).emit('macBasladi', { sure: MAC_SURESI });

    oda.macZamanlayici = setTimeout(() => {
      maciBitir(odaKodu, 'sure');
    }, MAC_SURESI * 1000);
  }

  clearTimeout(oda.zamanlayici);
  clearTimeout(oda.botZamanlayici);
  oda.turKilitli = false;
  oda.cevaplar = {};

  const havuz = kategoriHavuzuGetir(oda.kategori);
  if (havuz.length === 0) return;
  if (oda.sorulanIndeksler.length >= havuz.length) oda.sorulanIndeksler = [];

  let rastgeleIndex;
  do {
    rastgeleIndex = Math.floor(Math.random() * havuz.length);
  } while (oda.sorulanIndeksler.includes(rastgeleIndex));

  oda.sorulanIndeksler.push(rastgeleIndex);
  const soru = havuz[rastgeleIndex];
  const karisikSiklar = [...soru.siklar].sort(() => Math.random() - 0.5);
  oda.aktifSoru = { tr: soru.tr, en: soru.en, siklar: karisikSiklar };

  io.to(odaKodu).emit('soruGeldi', {
    tr: oda.aktifSoru.tr,
    siklar: oda.aktifSoru.siklar,
    sure: TUR_SURESI
  });

  // Bot aktifse belirlenen sürede cevabını gizlice kaydeder
  if (oda.botAktif && oda.oyuncular['BOT']) {
    const hizAraligi = oda.botZorluk === 'zor' ? 2500 : (oda.botZorluk === 'kolay' ? 7000 : 4500);
    const botSuresi = hizAraligi + Math.floor(Math.random() * 2500);
    oda.botZamanlayici = setTimeout(() => {
      if (!oda.turKilitli && oda.aktifSoru && odalar[odaKodu]) {
        cevapKaydet(odaKodu, 'BOT', oda.aktifSoru.en);
      }
    }, botSuresi);
  }

  // 15 saniye dolduğunda herkes işaretlemese bile turu bitir
  oda.zamanlayici = setTimeout(() => {
    turuSonuclandir(odaKodu);
  }, TUR_SURESI * 1000);
}

function cevapKaydet(odaKodu, oyuncuId, secilenSik) {
  const oda = odalar[odaKodu];
  if (!oda || !oda.aktifSoru || oda.turKilitli || oda.macBitti || !oda.oyuncular[oyuncuId]) return;

  // Oyuncu bu turda zaten cevap verdiyse tekrar işlemesini engelle
  if (oda.cevaplar[oyuncuId]) return;

  oda.cevaplar[oyuncuId] = {
    secilenSik: secilenSik,
    dogruMu: secilenSik === oda.aktifSoru.en,
    zaman: Date.now()
  };

  const toplamOyuncu = Object.keys(oda.oyuncular).length;
  const cevaplayanSayisi = Object.keys(oda.cevaplar).length;

  // Sadece cevabı veren oyuncuya "Kaydedildi" bilgisi gönder (doğru/yanlış henüz gizli!)
  if (oyuncuId !== 'BOT') {
    io.to(oyuncuId).emit('cevapKaydedildi', {
      secilenSik: secilenSik,
      kalanKisi: toplamOyuncu - cevaplayanSayisi
    });
  }

  // Odadaki tüm oyuncular işaretlediyse 15 saniyeyi beklemeden turu sonuçlandır
  if (cevaplayanSayisi >= toplamOyuncu) {
    turuSonuclandir(odaKodu);
  }
}

function oyuncuyuOdadanCikar(socket) {
  for (const odaKodu in odalar) {
    if (odalar[odaKodu].oyuncular[socket.id]) {
      socket.leave(odaKodu);
      delete odalar[odaKodu].oyuncular[socket.id];
      const gercekOyuncular = Object.keys(odalar[odaKodu].oyuncular).filter(id => id !== 'BOT');
      if (gercekOyuncular.length === 0) {
        clearTimeout(odalar[odaKodu].zamanlayici);
        clearTimeout(odalar[odaKodu].botZamanlayici);
        clearTimeout(odalar[odaKodu].macZamanlayici);
        clearTimeout(odalar[odaKodu].sonrakiSoruTimer);
        delete odalar[odaKodu];
      } else {
        io.to(odaKodu).emit('oyuncuGuncelle', {
          oyuncular: odalar[odaKodu].oyuncular,
          kategori: odalar[odaKodu].kategori
        });
        // Kalan oyuncuların hepsi zaten cevapladıysa turu bitir
        if (!odalar[odaKodu].turKilitli && Object.keys(odalar[odaKodu].cevaplar).length >= Object.keys(odalar[odaKodu].oyuncular).length) {
          turuSonuclandir(odaKodu);
        }
      }
    }
  }
}

io.on('connection', (socket) => {
  socket.on('odayaKatil', ({ odaKodu, isim, kategori, botOlsun, botZorluk }) => {
    socket.join(odaKodu);
    if (!odalar[odaKodu]) {
      odalar[odaKodu] = {
        oyuncular: {},
        aktifSoru: null,
        turKilitli: false,
        cevaplar: {},
        sorulanIndeksler: [],
        kategori: kategori || 'hepsi',
        hataDefteri: [],
        zamanlayici: null,
        botZamanlayici: null,
        macZamanlayici: null,
        sonrakiSoruTimer: null,
        macBasladi: false,
        macBitti: false,
        macBitisZamani: null,
        botAktif: Boolean(botOlsun),
        botZorluk: botZorluk || 'orta'
      };
      if (botOlsun) {
        const botAdi = botZorluk === 'zor' ? '🤖 ProBot' : (botZorluk === 'kolay' ? '🤖 ÇırakBot' : '🤖 KelimeBot');
        odalar[odaKodu].oyuncular['BOT'] = { isim: botAdi, puan: 0, seri: 0 };
      }
    }
    odalar[odaKodu].oyuncular[socket.id] = { isim, puan: 0, seri: 0 };

    io.to(odaKodu).emit('oyuncuGuncelle', {
      oyuncular: odalar[odaKodu].oyuncular,
      kategori: odalar[odaKodu].kategori
    });

    // Maç devam ediyorsa yeni girene kalan maç süresini gönder
    if (odalar[odaKodu].macBasladi && !odalar[odaKodu].macBitti && odalar[odaKodu].macBitisZamani) {
      const kalanSaniye = Math.max(1, Math.floor((odalar[odaKodu].macBitisZamani - Date.now()) / 1000));
      socket.emit('macBasladi', { sure: kalanSaniye });
    }
  });
  socket.on('yeniSoruIste', (odaKodu) => yeniSoruGonder(odaKodu));
socket.on('cevapVer', ({ odaKodu, secilenSik }) => cevapKaydet(odaKodu, socket.id, secilenSik));
socket.on('oyunuSifirla', (odaKodu) => {
const oda = odalar[odaKodu];
if (!oda) return;
clearTimeout(oda.zamanlayici);
clearTimeout(oda.botZamanlayici);
clearTimeout(oda.macZamanlayici);
clearTimeout(oda.sonrakiSoruTimer);
for (const id in oda.oyuncular) {
oda.oyuncular[id].puan = 0;
oda.oyuncular[id].seri = 0;
}
oda.sorulanIndeksler = [];
oda.hataDefteri = [];
oda.cevaplar = {};
oda.macBasladi = false;
oda.macBitti = false;
oda.macBitisZamani = null;
io.to(odaKodu).emit('oyunSifirlandi', oda.oyuncular);
});
socket.on('odadanCik', () => oyuncuyuOdadanCikar(socket));
socket.on('disconnect', () => oyuncuyuOdadanCikar(socket));
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
console.log('Adil 15sn + 5dk Sunucu Aktif! http://localhost:' + PORT);
});




