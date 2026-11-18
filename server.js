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
const TUR_SURESI = 10;
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

function yeniSoruGonder(odaKodu) {
  const oda = odalar[odaKodu];
  if (!oda) return;

  clearTimeout(oda.zamanlayici);
  clearTimeout(oda.botZamanlayici);
  oda.turKilitli = false;

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

  if (oda.botAktif && oda.oyuncular['BOT']) {
    const hizAraligi = oda.botZorluk === 'zor' ? [1800, 1200] : (oda.botZorluk === 'kolay' ? [5500, 2000] : [3500, 2000]);
    const botSuresi = hizAraligi[0] + Math.floor(Math.random() * hizAraligi[1]);
    oda.botZamanlayici = setTimeout(() => {
      if (!oda.turKilitli && oda.aktifSoru && odalar[odaKodu]) {
        cevapIsle(odaKodu, 'BOT', oda.aktifSoru.en);
      }
    }, botSuresi);
  }

  oda.zamanlayici = setTimeout(() => {
    if (!oda.turKilitli && oda.aktifSoru && odalar[odaKodu]) {
      oda.turKilitli = true;
      clearTimeout(oda.botZamanlayici);
      oda.sonKazananId = null;
      oda.seriSayaci = 0;
      if (!oda.hataDefteri.some(k => k.en === oda.aktifSoru.en)) {
        oda.hataDefteri.push({ tr: oda.aktifSoru.tr, en: oda.aktifSoru.en });
      }
      io.to(odaKodu).emit('sureDoldu', { dogruCevap: oda.aktifSoru.en });
      setTimeout(() => yeniSoruGonder(odaKodu), 2000);
    }
  }, TUR_SURESI * 1000);
}

function cevapIsle(odaKodu, oyuncuId, secilenSik) {
  const oda = odalar[odaKodu];
  if (!oda || !oda.aktifSoru || oda.turKilitli || !oda.oyuncular[oyuncuId]) return;

  if (secilenSik === oda.aktifSoru.en) {
    oda.turKilitli = true;
    clearTimeout(oda.zamanlayici);
    clearTimeout(oda.botZamanlayici);

    // Seri (Combo) hesaplama
    if (oda.sonKazananId === oyuncuId) {
      oda.seriSayaci += 1;
    } else {
      oda.sonKazananId = oyuncuId;
      oda.seriSayaci = 1;
    }

    let kazanilanPuan = 10;
    let comboMesaji = '';
    if (oda.seriSayaci >= 3) {
      kazanilanPuan += 5;
      comboMesaji = ' 🔥 ' + oda.seriSayaci + 'x Seri (+5p)!';
    }

    oda.oyuncular[oyuncuId].puan += kazanilanPuan;

    if (oda.oyuncular[oyuncuId].puan >= HEDEF_PUAN) {
      io.to(odaKodu).emit('oyunBitti', {
        sampiyon: oda.oyuncular[oyuncuId].isim,
        oyuncular: oda.oyuncular,
        hataDefteri: oda.hataDefteri
      });
      return;
    }

    io.to(odaKodu).emit('turSonucu', {
      kazanan: oda.oyuncular[oyuncuId].isim + comboMesaji,
      dogruCevap: oda.aktifSoru.en,
      oyuncular: oda.oyuncular
    });

    setTimeout(() => yeniSoruGonder(odaKodu), 2000);
  } else {
    if (!oda.hataDefteri.some(k => k.en === oda.aktifSoru.en)) {
      oda.hataDefteri.push({ tr: oda.aktifSoru.tr, en: oda.aktifSoru.en });
    }
    io.to(oyuncuId).emit('yanlisCevap');
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
        delete odalar[odaKodu];
      } else {
        io.to(odaKodu).emit('oyuncuGuncelle', {
          oyuncular: odalar[odaKodu].oyuncular,
          kategori: odalar[odaKodu].kategori
        });
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
        sorulanIndeksler: [],
        kategori: kategori || 'hepsi',
        hataDefteri: [],
        zamanlayici: null,
        botZamanlayici: null,
        botAktif: Boolean(botOlsun),
        botZorluk: botZorluk || 'orta',
        sonKazananId: null,
        seriSayaci: 0
      };
      if (botOlsun) {
        const botAdi = botZorluk === 'zor' ? '🤖 ProBot' : (botZorluk === 'kolay' ? '🤖 ÇırakBot' : '🤖 KelimeBot');
        odalar[odaKodu].oyuncular['BOT'] = { isim: botAdi, puan: 0 };
      }
    }
    odalar[odaKodu].oyuncular[socket.id] = { isim, puan: 0 };
    io.to(odaKodu).emit('oyuncuGuncelle', {
      oyuncular: odalar[odaKodu].oyuncular,
      kategori: odalar[odaKodu].kategori
    });
  });

  socket.on('yeniSoruIste', (odaKodu) => yeniSoruGonder(odaKodu));
  socket.on('cevapVer', ({ odaKodu, secilenSik }) => cevapIsle(odaKodu, socket.id, secilenSik));

  socket.on('oyunuSifirla', (odaKodu) => {
    const oda = odalar[odaKodu];
    if (!oda) return;
    clearTimeout(oda.zamanlayici);
    clearTimeout(oda.botZamanlayici);
    for (const id in oda.oyuncular) oda.oyuncular[id].puan = 0;
    oda.sorulanIndeksler = [];
    oda.hataDefteri = [];
    oda.sonKazananId = null;
    oda.seriSayaci = 0;
    io.to(odaKodu).emit('oyunSifirlandi', oda.oyuncular);
  });

  socket.on('odadanCik', () => oyuncuyuOdadanCikar(socket));
  socket.on('disconnect', () => oyuncuyuOdadanCikar(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('Final Pro Sunucu Aktif! http://localhost:' + PORT);
});
