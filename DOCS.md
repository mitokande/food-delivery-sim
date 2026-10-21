# Food Delivery Simulator — tasarım dokümanı

Yaşayan doküman. Web, mobil öncelikli (dikey ekran), three.js 0.186 (importmap, build yok), kayıt localStorage.
Adres: `mithatck.com/food-delivery-sim/`. Konsept görseller: `design/concept-1.webp`, `design/concept-2.webp`.

## 1. Özet

Beş parasız bir kurye olarak, külüstür bir motorla **Saffron Bay** şehrinde yemek dağıtıyoruz. Motor kendi gider
(otomatik pilot); biz **hareket güçleri** (Turbo, Zıpla, Sollama, Kestirme, Korna, Işıkta Geç) ile zamanı kazanırız,
bazı teslimatlarda **rastgele olaylar** (QTE / seçim kartı) çıkar. Kazandıkça motoru değiştirir, parçalarını geliştirir,
kendimizi geliştirir (beceriler), daha kârlı bölgelerde işe gireriz. Sonra **kendi kurye filomuzu** kurarız: freelance
kuryeler pasif gelir getirir, şehirde gerçekten dolaşırlar.

Tek teslimat ≈ 40–90 sn. Mobil oturum: 3–5 teslimat + yükseltme.

## 2. Çekirdek döngü

```
Şehir (hub, izometrik)  →  sipariş seç (1..kapasite)  →  sürüş: restorana git  →  teslim al
     ↑                                                           ↓
yükselt / işe gir / kurye kirala  ←  fiş (ücret + bahşiş − yakıt) ←  sürüş: müşteriye git → kapı sahnesi
```

- **Şehir** tek ve gerçek: hub'da yukarıdan gördüğümüz sokaklar, sürüşte içinden geçtiğimiz sokaklarla aynı.
  Sürüş başlarken kamera izometrikten motorun arkasına iner, bitince geri kalkar.
- Konum önemli: teslimattan sonra müşterinin sokağındayız; yakın restoranların siparişleri daha verimli.
- **Gün** 08:00'de başlar, 24:00'te biter. Saat sadece sürerken ilerler (1 gerçek sn ≈ 20 oyun sn). Öğle (11:30–13:30)
  ve akşam (18:30–21:00) yoğunluğu: daha çok sipariş, ücret çarpanı. Işık sabah → öğle → gün batımı → gece (sokak
  lambaları, neon). Gün sonu: rapor (kazanç, gider, filo geliri, günlük hedefler).

## 3. Sürüş (teslimat)

Motor rotayı A* ile bulur ve kendi sürer: virajda yavaşlar, öndeki arabanın arkasında yavaşlar, kırmızıda durur,
yayaya yol verir. Oyuncu sürmez — **ne zaman** ve **hangi gücü** kullanacağına karar verir.

| Güç | Tetik | Etki | Risk |
|---|---|---|---|
| **Turbo** | basılı tut (her zaman) | hız +%45; enerji barı harcar | virajda/çukurda daha çok sarsıntı |
| **Zıpla** | yukarı kaydır / buton | çukur, koni, su birikintisi, kaldırım üstünden geç | yanlış zaman → sert iniş |
| **Sollama** | öndeki araç yavaşlatınca parlar | karşı şeride çıkıp geçer | karşıdan araç varsa çarpışma |
| **Işıkta geç** | kırmızıda durunca parlar | beklemeden geçer | çapraz trafik, ceza olayı |
| **Korna** | yaya / yavaş araç | yol açar | kaba → küçük puan kaybı (bazı olaylarda) |
| **Kestirme** | bazı kavşaklarda belirir | ara sokak / park içinden kısa yol | sarsıntılı, yiyecek hasarı |

- **Yiyecek durumu**: *Sıcaklık* (zamanla düşer, kutu yalıtımı yavaşlatır; dondurma tersine erir) ve *Bütünlük*
  (sarsıntı, çarpışma, sert fren). İçecek/çorba/pasta daha hassas.
- **Süre**: ETA rotadan hesaplanır. Erken → bonus, geç → bahşiş düşer, çok geç → puan düşer.
- **Fiş**: taban ücret × bölge × yoğunluk + bahşiş (puan, Cazibe becerisi) − yakıt (araç verimi × mesafe).
- **Puan**: 5 yıldız ortalaması; yeni bölgelerin kapısı.

### Rastgele olaylar

Teslimatların bir kısmında olay çıkar; zaman yavaşlar, kart veya QTE gelir. Tepki penceresi Refleks becerisiyle uzar.

- *Seçim kartı*: sarı ışık (bas / dur), yol çalışması (dolambaç / kaldırımdan), müşteri mesajı ("ketçap alır mısın?"),
  yaşlı teyze karşıya geçiyor (bekle / korna), rakip kurye yarışa davet ediyor, yağmur başladı, polis çevirmesi,
  hayranın selfie isteği, sipariş hazır değil (bekle / mutfağa yardım et).
- *Refleks QTE*: köpek kovalıyor (hızlı tıkla), açılan araba kapısı (yöne kaydır), yola top kaçtı (zıpla),
  güvercin sürüsü (korna).
- *Ritim QTE*: külüstür motor stop etti (yeşil bölgede bas, marş), lastik patladı (pompala).
- Külüstüre özel arızalar; araç iyileştikçe arıza olayları azalır.

## 4. İlerleme

**Araçlar** (her biri kendi parça yükseltmeleri: Motor / Süspansiyon / Kutu / Lastik, 5'er seviye; boya ve kutu rengi):

| Araç | Fiyat | Hız | Kapasite | Not |
|---|---|---|---|---|
| Külüstür (Rust Bucket) | başlangıç | 32 km/s | 1 | arızalı, yakıt yer, sarsar |
| Zippy 50 (ikinci el scooter) | $350 | 40 | 1 | güvenilir |
| Vespetta 125 | $1.500 | 52 | 2 | konseptteki kırmızı scooter |
| Volt E-Scooter | $4.000 | 58 | 2 | elektrik: yakıt ucuz, arıza yok |
| Mule kargo üç teker | $9.000 | 48 | 4 | sarsıntıya dayanıklı |
| Viper 600 (spor) | $12.000 | 75 | 2 | güçlü turbo |

**Kurye becerileri** (seviye atladıkça puan + nakit): Sürüş (turbo süresi/şarjı), Navigasyon (kestirmeler, ETA payı),
Cazibe (bahşiş), Refleks (QTE penceresi), Dayanıklılık (enerji barı).

**Bölgeler** (işe girme: seviye + puan + araç şartı + başvuru ücreti):

| Bölge | Şart | Ücret çarpanı | Karakter |
|---|---|---|---|
| Old Town | başlangıç | ×1 | dar sokak, küçük dükkanlar, kafeler |
| Downtown | Sv 3, ★4.0, scooter, $200 | ×1.8 | gökdelenler, yoğun trafik, sıkı süre |
| Harbor | Sv 6, ★4.2, $1.000 | ×2.6 | liman, sanayi, deniz ürünleri, geniş yol |
| Green Hills | Sv 10, ★4.5, ≥50 km/s, $4.000 | ×3.6 | banliyö, uzun yol, büyük bahşiş, köpekler |

**Filo** (Sv 5'te "Dispatch Office" kiralanır): freelance kurye işe al (işe alma ücreti + komisyon), bölgeye ata,
araç ver. Dakika başı gelir; kapalıyken de kazanır (ofis seviyesine göre 2–12 saat tavan). Hub'da kendi
kuryelerimiz şehirde dolaşır. "Your drivers kept working!" ekranı.

## 5. Arayüz

Dikey, tek elle. Üst bar: seviye/XP, nakit, puan, saat. Alt sekmeler: **City · Garage · Courier · Jobs · Fleet**.
Görsel dil konseptten: lacivert yarı saydam paneller, yeşil "oyun" butonları, krem menü zemini, kalın yuvarlak yazı
(Lilita One + Fredoka), kırmızı kask/kutu marka rengi. Masaüstünde de çalışır (Space turbo, W/↑ zıpla, E eylem,
H korna, 1–3 olay seçimi).

## 6. Teknik

- `index.html` + `css/` + `js/` (ES modülleri, build yok). three 0.186.1 jsdelivr importmap, GLTFLoader + Draco.
- Şehir: ızgara (1 karo = 8 m), bölgeler, A* yol grafiği; görünüm Kenney karolarından parça parça (chunk) birleştirilir,
  her chunk ≈ kit başına 1 draw call. Gölge sadece oyuncu çevresinde.
- Trafik: yol grafiği üzerinde rastgele rotalı araçlar, takip mesafesi, trafik ışıkları; kaldırımda yayalar.
- Kayıt: `localStorage` `fds_save_v1`. Kapalıyken geçen süre filo gelirine.
- Test: `tools/` altında headless Chrome ekran görüntüleri, birkaç telefon boyutunda taşma kontrolü.

## 7. Varlıklar

Hepsi CC0 veya burada yapıldı (CREDITS.md). Kenney: City Kit Commercial/Suburban/Roads/Industrial, Car Kit, Food Kit,
Mini Characters (animasyonlu: idle, walk, drive, sit, emote…). Oyuncu araçları, kask ve restoran binaları Blender'da
script ile (`tools/blender/`). Arama: 3d.shep.bot (24 kaynak, lisans bilgisiyle).

Dünya ölçeği: kit 1 birim = 8 m karo; Kenney arabaları ×1.5, mini karakterler ×2.2 (≈1.5 m, chibi).
Araç GLB kuralı: metre, +Y yukarı, ön +Z, orijin yerde iki teker arası; `seat`, `box`, `wheel_front`, `wheel_rear`,
`handlebar` düğümleri; boyanabilir malzemeler `paint` ve `box`.

## 8. Kod haritası

| Dosya | Ne yapar |
|---|---|
| `js/main.js` | açılış, ana döngü, hub ⇄ sürüş geçişi (kamera tween), sipariş panosu, harita işaretçileri, garaj vitrini, iş sonu fiş/XP/gün |
| `js/data.js` | tüm içerik tabloları: bölgeler, araçlar, parçalar, beceriler, yemekler, restoranlar, sipariş tipleri, filo, hedefler |
| `js/state.js` | kayıt (`fds_save_v1`), türetilmiş istatistikler, satın alma/yükseltme/işe girme/filo aksiyonları, gün saati |
| `js/orders.js` | sipariş üretimi (bölge profiline göre mesafe ve tip karışımı, pano bölge filtresi), ücret, süre (`etaFor`: ölçülmüş otomatik pilot hızı × seviye payı), yıldız/bahşiş hesabı |
| `js/city/gen.js` | 45×45 karo şehir (4 bölge, yol segmenti silme, park/ara sokak kestirmeleri, parseller, restoran yerleşimi) |
| `js/city/graph.js` | A* (U dönüşü yok), şerit eğrileri (sağdan trafik), rota örnekleme |
| `js/city/view.js` | Kenney yol parçalarını chunk × malzeme birleştirme, asfalt/kaldırım shader'ı, binaları chunk'lara ekleme, çatı tabelaları, lamba ışık havuzları, deniz |
| `js/city/arch.js` · `archmat.js` | prosedürel mimari: her parsel bölgesine göre bina (Old Town cepheleri + dükkân, Downtown blok/kule, Harbor pastel ev/depo, Hills villa), tente, balkon, saksı, tabela atlası, şehir dışı sıraları + uzak gökdelenler, raylı viyadük, yön tabelaları; tek shader pencereleri/camı/kepengi/çatı kiremidini/tenteyi/gece ışıklarını çizer |
| `js/city/props.js` · `people.js` · `cars.js` | props.glb sokak eşyaları (tür başına InstancedMesh, kameraya göre doldurulur, uzak ağaçlar düşük poli), kafe müşterileri (Kenney karakterleri sabit poza pişirilir), oyuncak arabalar (instance boya rengi, gece farlar) |
| `js/city/backdrop.js` · `train.js` | ufuk dağları (sis renginde), doğu tepesindeki evler, körfez (mendirek + deniz feneri, iskele + dönme dolap), saat kulesi; viyadükte giden metro |
| `js/look.js` | renk derecelendirme (özel tone mapping: doygunluk, sıcak ışık/serin gölge, kontrast) ve parlak malzemeler için ortam haritası |
| `js/city/traffic.js` | instanced arabalar, trafik ışıkları, yayalar, filo kuryeleri (rider ajanları) |
| `js/ride/ride.js` | otomatik pilot sürüş, güçler, sollama/kırmızıda geçme/kestirme, engeller, olaylar, teslim sahneleri, takip kamerası |
| `js/ride/hazards.js` · `events.js` · `vehicle.js` · `ribbon.js` | engeller · olay kartları/QTE · motor + sürücü + kask · yol üstü ok şeridi |
| `js/ui/ui.js` + `css/game.css` | hub (üst bar, 5 sekme, alt panel), sürüş HUD'u, modallar, toast |
| `js/audio.js` | WebAudio: manifest'ten sesler, yoksa sentez; hızla perdesi değişen motor sesi |

Test araçları (headless Chrome, swiftshader yavaş — `game.sim(sn)` render'sız ileri sarar, `game.skipTween()` kamera geçişini atlar):
`node tools/play.mjs` (bir teslimatı baştan sona oynar; `SIM=1.2 CTX=1 PRESS=boost`), `node tools/tabs.mjs W H` (sekme görüntüleri),
`node tools/sweep.mjs` (9 ekran boyutunda taşma/çakışma), `node tools/shot.mjs <yol> <png>`, `node tools/look.mjs <önek> <görünümler>` (sokak seviyesi görüntüler: `oldtown`, `harbor2`, `x:z:yön`, `rest-bean`, `cam_x_y_z_tx_ty_tz`, `ride5`; `CLOCK=900`, `EVAL=…`), `node tools/speed.mjs <bölge> <araç,araç> [n]` (otomatik pilotun gerçek ortalama hızı; `BOOST=1` turbo ile — süre kalibrasyonu için). URL: `?fps` FPS sayacı, `?clock=1260` gökyüzü saati, `?noti` hoş geldin yok.

## 9. Durum

- 2026-10-19/20: v0.1 oynanabilir dikey dilim. Tam döngü çalışıyor (sipariş → restoran → teslim al → müşteri → yıldız → fiş → hub).
  Garaj (6 araç, 4 parça × 5 seviye, boya), beceriler, 4 bölge + işe girme, filo (ofis, işe alma, bölge/araç atama, eğitim,
  çevrimdışı kazanç), günlük hedefler, gün döngüsü + yoğun saatler, gece ışıkları, 17 olay (kart + 4 QTE türü).
  Varlıklar ajanlarla: Kenney kitleri paketlendi + bölge paletleri, 10 restoran + garaj + ofis (Blender), 6 araç + kask (Blender),
  59 ikon + 6 araç ikonu (Blender render), 49 ses + 2 müzik döngüsü (CC0, `assets/audio/manifest.json`). Krediler: `CREDITS.md`.
- Ses notu: döngüler boşluksuz MP3 etiketiyle kodlandı; Safari etiketi yok sayarsa `audio.js` manifest süresine göre
  döngüyü kırpıyor. Sesleri ajan dinleyemedi (spektrogram/ölçümle seçti) — bir kez kulakla kontrol etmek iyi olur.
- 2026-10-20: dönüşler yeniden yazıldı (kullanıcı: "virajlarda açı adım adım değişiyor"). Rota artık şerit çizgilerinin
  köşeleri çember yaylarıyla yuvarlanmış tek parça bir yol (`graph.js` `buildGeo`, sağa 6,2 m / sola 8,6 m / ara sokak 4,6 m;
  dönüş kavşaktan önce başlıyor). Yön yolun teğeti, yatma `atan(v²κ/g)` (κ birkaç metrede ortalanıyor, en fazla ~29°),
  şerit değiştirirken burun döner, ayak geçişlerinde poz yumuşak harmanlanır, kamera gecikmeli döner ve yolun ilerisine bakar.
  Kırmızıda durma çizgisi yayın başına alındı. Arabaların karo içi dönüşleri de çeyrek çember.
- 2026-10-20: sürükleyicilik paketi 1.
  - **His:** `ride/fx.js` (egzoz — külüstürde siyah, elektrikte yok —, turbo alevi, toz, sıçrama, kıvılcım, para/yıldız
    parıltısı, fren izi), turboda CSS hız çizgileri, Android titreşimi (`haptics.js`).
  - **Flow serisi:** mükemmel zıplama, sollama, kıl payı (motorun yanından yakın geçen araç → kısa ağır çekim),
    kestirme, kırmızıda başarılı geçiş; ×2'ye kadar bahşiş çarpanı, turbo doldurur, çukur/çarpışma bozar.
  - **Sürücü tepkileri:** turboda eğilme, başarıda kol kaldırma, sollarken arkaya bakma (mixer sonrası kemik ofsetleri).
  - **Dünya içi olaylar** (`ride/actors.js`, kodla üretilen bloklu köpek ve güvercin): köpek yanında koşar, top yola
    zıplar, park etmiş arabanın kapısı açılır, güvercinler, rakip kurye, polis çevirmesi, yol çalışması.
    Kart alttaki panelde (`.evdock`), ağır çekim 0,12, kamera olay sırasında yükselir.
    Önceden yerleştirilen aksesuarlar hep düz yola konur.
  - **Yağmur** (`weather.js`): güne göre tohumlanmış yağmur saatleri, shader yağmuru, ıslak şehir, gri gök, sis.
    Ödeme ×1,25, bahşiş ×1,2, ETA +%8; viraj tutuşu −%20, daha çok su birikintisi, tekerden su sıçraması.
- 2026-10-20: onboarding + ilerleme sıfırlama (`ui/onboard.js`).
  - **İlk açılış:** 3 tanıtım slaytı → kurye seçimi (karakter, kask rengi, isim; isim üst barda görünür).
  - **İlk teslimat:** spot ışığı + el işaretiyle yönlendirme: sipariş al → Start → yemeği al → teslim et → fiş →
    Garage → motor yükselt → City. "Skip tutorial" her adımda var.
  - **Sonraki dürtmeler** (bir kez): başvurulabilir bölge çıkınca Jobs, ofis açılınca Fleet. Adım `S.onboard.step`
    (99 = bitti); eski kayıtlar onboarding'i atlar.
  - **Ayarlar:** "Replay tutorial", titreşim aç/kapa, "Reset progress" → neyin silineceğini listeleyen onay,
    1,6 sn basılı tutunca kayıt silinir ve sayfa yenilenir. Test: `node tools/onboard.mjs [WxH]`.
- 2026-10-20: sürüşte serbest bakış. Ekranı sürüklemek kamerayı motorun etrafında döndürür (yatay) ve yükseltir (dikey);
  iki parmak / tekerlek yakınlaştırır. Bırakınca ~1,3 sn sonra kamera arkaya döner. Yan açılarda kamera yükselir ve motora
  bakar. Hızlı fiske (yukarı = zıpla, sola = sollama) kamerayı değiştirmez; sollama kaydırması da 450 ms sınırına alındı.
- 2026-10-20: görsel elden geçirme (kullanıcının referans görseli `design/style-target.webp`: parlak, sıcak, "oyuncak şehir").
  - **Işık/renk:** özel tone mapping (doygunluk ×1.24, sıcak ışık + serin gölge, yumuşak S eğrisi), daha mavi gökyüzü + shader bulutları,
    güçlü hemisfer dolgu (gölgeler mavi-gri, siyah değil), mesafede mavi pus, araç/kask boyasına gökyüzü yansıması.
  - **Binalar:** Kenney binaları yerine kodla üretilen Avrupa cepheleri. Dükkân katı (vitrin, kapı, tabela bandı), çizgili fistolu
    tenteler, panjurlar, balkonlar, çiçek kutuları, kiremit çatı/korniş, bacalar; Downtown'da cam kuleler, Harbor'da pastel evler ve depolar,
    Hills'te villalar. Restoranlar aynı sistemle: marka renkli tente + isim tabelası + çatıda dev yiyecek. Binalar parselin arkasına
    çekildi, önde ~3,5 m kaldırım: ağaçlar, fenerler, kafe masaları, saksılar, oturan/duran insanlar (props.glb + pişmiş pozlar).
  - **Çevre:** şehir kenar yollarının dışında bina sıraları, uzak gökdelenler, dağlar, doğuda evlerle dolu tepe, körfezde deniz feneri
    ve dönme dolap, Old Town parkında saat kulesi, Downtown bulvarı boyunca viyadük + metro, kavşaklarda yeşil yön tabelaları,
    rıhtım korkuluğu. Klasik siyah trafik lambaları (3 lamba), kalın parlak chevron rota şeridi, HUD panelleri referansa göre.
  - **Performans:** binalar tüm şehir için ~210k üçgen (Kenney ~1M); sokak eşyaları kamera önündeki yarıçapla doldurulur,
    70 m ötesindeki ağaçlar ~100 üçgenlik kopyalar. Sürüşte gölgeler dahil ~0,75–0,85M üçgen, ~230 çizim çağrısı.
- 2026-10-21: oyun dengesi paket 1–2 (erken/orta/geç oyun incelemesinden).
  - **Bölge kimlikleri** (`data.js` `DPROFILE`): mesafe bandı (Old Town kısa, Harbor uzun, Green Hills uzun + şehir dışına
    giden müşteriler), bahşiş çarpanı (Downtown ×0,85, Hills ×1,6), engel yoğunluğu, olay sıklığı ve olay türü ağırlıkları
    (Hills'te köpek, Downtown'da polis/rakip, Harbor'da yol çalışması), sipariş tipi karışımı (Downtown acil/VIP/Express,
    Harbor grup siparişi, Hills VIP/hassas). Jobs kartlarında özellik etiketleri, pano üstünde bölge filtresi (`S.focus`).
  - **Zorluk eğrisi:** süre artık ölçülmüş otomatik pilot hızına göre (`orders.js` `etaFor`): bölge tabanı
    (Old Town 4,8 · Downtown 5,0 · Harbor 4,6 · Hills 6,9 m/s) × araç kazancı (en hız/8,9)^0,45 (gerçek kazanç ^0,6, yani daha
    iyi motor saatten hızlı kalır) × seviye payı (Sv 1–2: 1,3 → Sv 14+: 0,94). Sonuç: başta otomatik pilotla erken bonusu,
    Sv 10+ turbo/kestirme olmadan sadece zamanında; Express (Sv 8+, ×2,2 ücret, süre ×0,7) ve Acil siparişler turbo ister.
    Engel yoğunluğu ve olay şansı seviyeyle artar (en fazla ×1,5 / ×1,35). XP bölge ücretiyle ölçeklenir. Birden fazla siparişli
    işlerde her siparişin süresi kendi kapısına kadar olan yolun tamamını kapsar.
  - **Hata düzeltmesi:** yol çalışması bariyeri otomatik pilotu sonsuza kadar durduruyordu (zıplamayan oyuncu takılı kalıyordu;
    ölçümde 6 dakikalık duruşlar). Artık ~5 sn sonra karşı şerit boşalınca yavaşça yanından geçiyor.
  - Ölçüm: `tools/speed.mjs` (Old Town otomatik pilot: Külüstür 4,8 · Vespetta 6,3 · Viper 8,0 m/s; turbo ≈ ×1,35).
    Tahmini gelir: Old Town ~$10/dk → Downtown ~$27 → Harbor ~$44 → Hills (Viper) ~$99/dk.
- Bilinen eksikler / sonraki adımlar: gerçek telefonda FPS ölçümü (otomatik kalite düşürme var), olay kartlarındaki
  karakterlerin dünyada görünmesi (büyükanne, köpek), müzik seçimi, Harbor iskeleleri, denge ayarı (ilk 30 dakika).
