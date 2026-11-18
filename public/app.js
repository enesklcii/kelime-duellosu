var socket = typeof io !== 'undefined' ? io() : null;
var aktifOda = "";
var sayacInterval = null;
var AudioContextClass = window.AudioContext || window.webkitAudioContext;
var audioCtx = AudioContextClass ? new AudioContextClass() : null;

window.addEventListener('DOMContentLoaded', function () {
  var durumEl = document.getElementById('baglantiDurumu');
  if (!socket) {
    durumEl.style.color = '#f38ba8';
    durumEl.innerText = '❌ Hata: Sayfayı http://localhost:3000 adresinden açmalısın!';
  } else {
    socket.on('connect', function () {
      durumEl.style.color = '#a6e3a1';
      durumEl.innerText = '🟢 Sunucuya bağlı';
    });
  }
});

function sesCal(tip) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (tip === 'dogru') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } else if (tip === 'yanlis') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } else if (tip === 'zafer') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12);
    osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.24);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
  }
}

function ekranDegistir(hedefId) {
  var ekranlar = ['girisEkrani', 'kelimeEkleEkrani', 'oyunEkrani', 'bitisEkrani'];
  for (var i = 0; i < ekranlar.length; i++) {
    document.getElementById(ekranlar[i]).classList.add('gizli');
  }
  document.getElementById(hedefId).classList.remove('gizli');
}

function kelimeKaydet() {
  var tr = document.getElementById('yeniTr').value.trim();
  var en = document.getElementById('yeniEn').value.trim();
  var kategori = document.getElementById('yeniKat').value;
  var mesajKutusu = document.getElementById('eklemeMesaji');

  if (!tr || !en) {
    mesajKutusu.style.color = '#f38ba8';
    mesajKutusu.innerText = 'Lütfen hem Türkçe hem İngilizce kelimeyi yaz!';
    return;
  }

  fetch('/api/kelime-ekle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tr: tr, en: en, kategori: kategori })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.basarili) {
        mesajKutusu.style.color = '#a6e3a1';
        mesajKutusu.innerText = '✅ ' + data.mesaj;
        document.getElementById('yeniTr').value = '';
        document.getElementById('yeniEn').value = '';
      } else {
        mesajKutusu.style.color = '#f38ba8';
        mesajKutusu.innerText = '❌ ' + data.mesaj;
      }
    });
}

function oyunaGir(botOlsun) {
  if (!socket) return alert("Sunucu bağlantısı yok!");
  var isim = document.getElementById('isimInput').value.trim() || 'Oyuncu';
  var odaKodu = botOlsun ? ('bot_' + Date.now()) : document.getElementById('odaInput').value.trim();
  var kategori = document.getElementById('kategoriInput').value;
  var botZorluk = document.getElementById('botZorlukInput').value;

  if (!odaKodu) return alert('Lütfen bir oda kodu yaz!');
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  aktifOda = odaKodu;
  socket.emit('odayaKatil', {
    odaKodu: odaKodu,
    isim: isim,
    kategori: kategori,
    botOlsun: botOlsun,
    botZorluk: botZorluk
  });
  ekranDegistir('oyunEkrani');
}

function odadanAyril() {
  clearInterval(sayacInterval);
  if (socket) socket.emit('odadanCik');
  aktifOda = "";
  document.getElementById('kelimeAlani').innerText = 'Hazır mısınız?';
  document.getElementById('siklarAlani').innerHTML = '';
  document.getElementById('baslatBtn').classList.remove('gizli');
  ekranDegistir('girisEkrani');
}

function soruIste() { socket.emit('yeniSoruIste', aktifOda); }
function cevapGonder(secilenSik) { socket.emit('cevapVer', { odaKodu: aktifOda, secilenSik: secilenSik }); }
function tekrarOyna() { socket.emit('oyunuSifirla', aktifOda); }

function skorlariCiz(oyuncular, hedefElementId) {
  var pano = document.getElementById(hedefElementId);
  pano.innerHTML = '';
  for (var id in oyuncular) {
    pano.innerHTML += '<div class="oyuncu-kart">' + oyuncular[id].isim + ': ' + oyuncular[id].puan + 'p</div>';
  }
}

function geriSayimBaslat(saniye) {
  clearInterval(sayacInterval);
  var cubuk = document.getElementById('sureCubugu');
  cubuk.style.transition = 'none';
  cubuk.style.width = '100%';
  cubuk.style.background = '#f9e2af';

  setTimeout(function () {
    cubuk.style.transition = 'width ' + saniye + 's linear, background 0.3s';
    cubuk.style.width = '0%';
  }, 50);

  var kalan = saniye;
  sayacInterval = setInterval(function () {
    kalan--;
    if (kalan <= 3) cubuk.style.background = '#f38ba8';
    if (kalan <= 0) clearInterval(sayacInterval);
  }, 1000);
}

if (socket) {
  socket.on('oyuncuGuncelle', function (data) {
    skorlariCiz(data.oyuncular, 'skorPanosu');
    var katIsimleri = { hepsi: 'Karışık', gunluk: 'Günlük', fiiller: 'Fiiller', soyut: 'Soyut' };
    document.getElementById('kategoriEtiketi').innerText = 'Kategori: ' + (katIsimleri[data.kategori] || 'Karışık');
  });

  socket.on('soruGeldi', function (data) {
    geriSayimBaslat(data.sure);
    document.getElementById('durumMesaji').innerText = 'İlk doğru basan puanı kapar!';
    document.getElementById('durumMesaji').style.color = '#00d2ff';
    document.getElementById('kelimeAlani').innerText = data.tr;
    document.getElementById('baslatBtn').classList.add('gizli');

    var siklarAlani = document.getElementById('siklarAlani');
    siklarAlani.innerHTML = '';
    data.siklar.forEach(function (sik) {
      var btn = document.createElement('button');
      btn.className = 'btn-sik';
      btn.innerText = sik;
      btn.onclick = function () { cevapGonder(sik); };
      siklarAlani.appendChild(btn);
    });
  });

  socket.on('yanlisCevap', function () {
    sesCal('yanlis');
    if (navigator.vibrate) navigator.vibrate(200);
    var mesaj = document.getElementById('durumMesaji');
    mesaj.innerText = '❌ Yanlış! 2 saniye kilitlendin...';
    mesaj.style.color = '#f38ba8';

    var butonlar = document.querySelectorAll('.btn-sik');
    butonlar.forEach(function (b) { b.disabled = true; });

    setTimeout(function () {
      butonlar.forEach(function (b) { b.disabled = false; });
      mesaj.innerText = 'Tekrar dene!';
      mesaj.style.color = '#00d2ff';
    }, 2000);
  });

  socket.on('sureDoldu', function (data) {
    clearInterval(sayacInterval);
    sesCal('yanlis');
    var mesaj = document.getElementById('durumMesaji');
    mesaj.innerText = '⏰ Süre doldu! Doğrusu: ' + data.dogruCevap;
    mesaj.style.color = '#fab387';

    document.querySelectorAll('.btn-sik').forEach(function (b) {
      b.disabled = true;
      if (b.innerText === data.dogruCevap) b.classList.add('dogru-sik');
    });
  });

  socket.on('turSonucu', function (data) {
    clearInterval(sayacInterval);
    sesCal('dogru');
    var mesaj = document.getElementById('durumMesaji');
    mesaj.innerText = '🎉 ' + data.kazanan + ' bildi!';
    mesaj.style.color = '#a6e3a1';

    document.querySelectorAll('.btn-sik').forEach(function (b) {
      b.disabled = true;
      if (b.innerText === data.dogruCevap) b.classList.add('dogru-sik');
    });

    skorlariCiz(data.oyuncular, 'skorPanosu');
  });

  socket.on('oyunBitti', function (data) {
    clearInterval(sayacInterval);
    sesCal('zafer');
    if (navigator.vibrate) navigator.vibrate();

    ekranDegistir('bitisEkrani');
    document.getElementById('sampiyonMetni').innerText = 'Şampiyon: ' + data.sampiyon + '!';
    skorlariCiz(data.oyuncular, 'finalSkorlar');

    var defter = document.getElementById('hataDefteriAlani');
    if (data.hataDefteri.length === 0) {
      defter.innerHTML = '<h3>🌟 Harika! Hiç hata yapılmadı!</h3>';
    } else {
      var html = '<h3>📖 Maçın Hata Defteri (Tekrar Et!)</h3>';
      data.hataDefteri.forEach(function (item) {
        html += '<div class="hata-satir"><span>' + item.tr + '</span><strong style="color:#a6e3a1">' + item.en + '</strong></div>';
      });
      defter.innerHTML = html;
    }
  });

  socket.on('oyunSifirlandi', function (oyuncular) {
    ekranDegistir('oyunEkrani');
    document.getElementById('kelimeAlani').innerText = 'Yeni Maç!';
    document.getElementById('siklarAlani').innerHTML = '';
    document.getElementById('baslatBtn').classList.remove('gizli');
    skorlariCiz(oyuncular, 'skorPanosu');
  });
}
