# ⚔️ Kelime Düellosu (Real-Time Multiplayer Vocabulary Game)

**Kelime Düellosu**, İngilizce kelime ezberlemeyi rekabetçi ve eğlenceli hale getirmek için geliştirilmiş, gerçek zamanlı (real-time) çok oyunculu bir web oyunudur.

🔗 **Canlı Demo:** https://kelime-duellosu-1dr4.onrender.com

---

## ✨ Öne Çıkan Özellikler

* **⚡ Gerçek Zamanlı Çok Oyunculu Düello:** Aynı oda kodunu giren oyunculara sorular milisaniyeler içinde aynı anda iletilir; ilk doğru cevabı veren puanı kapar.
* **🤖 Tek Oyunculu Bot Modu:** Kolay, Orta ve Zor olmak üzere 3 farklı zorluk seviyesinde yapay zeka botuna karşı pratik yapma imkânı.
* **🔥 Seri (Combo) Sistemi:** Üst üste 3 doğru cevap veren oyuncular ekstra **+5 combo puanı** kazanır.
* **📚 Kategori Seçimi & 180+ Kelimelik Havuz:** *Karışık*, *Günlük Kelimeler*, *Fiiller* ve *Soyut Kavramlar* kategorilerinde zengin kelime listesi.
* **➕ Dinamik Kelime Ekleme:** Arayüz üzerinden yeni kelime eklendiğinde sistem otomatik olarak 3 rastgele yanlış şık üretir ve veritabanına (`kelimeler.json`) kaydeder.
* **📖 Maç Sonu Hata Defteri:** Oyun boyunca yanlış cevaplanan veya süresi dolan kelimeler maç sonunda listelenerek kalıcı öğrenme sağlanır.
* **🔊 Web Audio API & Mobil Titreşim:** Harici ses dosyasına ihtiyaç duymadan tarayıcı üzerinden üretilen doğru/yanlış ses efektleri ve dokunsal titreşim desteği.

---

## 🛠️ Kullanılan Teknolojiler

* **Backend:** Node.js, Express.js
* **Real-Time İletişim:** Socket.io
* **Frontend:** HTML5, CSS3, Vanilla JavaScript, Web Audio API
* **Veri Yapısı:** JSON Tabanlı Dinamik Kelime Havuzu
* **Deployment:** Render Cloud

---

## 🚀 Yerel Ortamda Çalıştırma (Kurulum)

Projeyi kendi bilgisayarınızda çalıştırmak için:

1. Depoyu klonlayın:
   ```bash
   git clone https://github.com
   cd kelime-duellosu
   ```

2. Gerekli bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

3. Sunucuyu başlatın:
   ```bash
   npm start
   ```

4. Tarayıcınızdan `http://localhost:3000` adresine gidin.

---

## 🎮 Oyun Kuralları

1. Her turda ekrana bir Türkçe kelime ve 4 İngilizce seçenek gelir.
2. Cevap vermek için **10 saniye** süre vardır.
3. Doğru cevap **+10 puan** kazandırır; yanlış cevap veren oyuncu **2 saniye** boyunca kilitlenir.
4. **100 puana** ilk ulaşan oyuncu maçın şampiyonu olur.
