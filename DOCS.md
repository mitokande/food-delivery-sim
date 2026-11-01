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
                                        ↓ "Collect & ride on" (1 ⚡)
                                   yakındaki sipariş, kapıdan sürüş devam (hub'a dönmeden)
```

- **Şehir** tek ve gerçek: hub'da yukarıdan gördüğümüz sokaklar, sürüşte içinden geçtiğimiz sokaklarla aynı.
  Sürüş başlarken kamera izometrikten motorun arkasına iner, bitince geri kalkar.
- Konum önemli: teslimattan sonra müşterinin sokağındayız; yakın restoranların siparişleri daha verimli.
- **Sürmeye devam** (2026-10-30): kapı sahneleri kendiliğinden oynar (dokunuş yok: çalışan / müşteri motora yürür,
  poşet orada el değiştirir; kart en az 0,9 sn ne olduğunu söyler). Teslimat arasında müşterinin yıldızları kısa bir an
  (sürüş 0,7 sn sonra devam eder, kart 2 sn'de kendiliğinden kalkar ve dokunuşları yola geçirir); son teslimattan sonra
  1,3 sn, sonra fiş. Fiş, rehber bittiyse ve gün bitmediyse, **kapının yakınında bir sipariş** önerir (4 adaydan restoranı
  en yakın olan): "Collect & ride on" (1 ⚡) hub'a dönmeden, kamera uçuşu olmadan, motorun durduğu yerden yeni işi başlatır;
  "Collect & back to hub" eskisi gibi. Enerji yetmezse buton "Out of energy" der ve enerji panelini açar (kahve alınınca
  buton yeniden yanar). Hub'a iniş/kalkış kamerası 1,5 / 1,3 sn'den 1,0 / 0,9 sn'ye kısaldı. Kod: `main.js` `nextOffer`,
  `rideOn`, `ui.js` `receipt` / `rated` / `sceneCard`, `ride.js` "arrival scenes" (`SCENE_MS`, `start(..., { blend })`).
  Test: `tools/keepriding.mjs`. Analitik: `next_offer` (`take`), `job_start.chain`.
- **Gün** 08:00'de başlar, 24:00'te biter. Saat sadece sürerken ilerler (1 gerçek sn ≈ 20 oyun sn). Öğle (11:30–13:30)
  ve akşam (18:30–21:00) yoğunluğu: daha çok sipariş, ücret çarpanı. Işık sabah → öğle → gün batımı → gece (sokak
  lambaları, neon). Gün sonu: rapor (kazanç, gider, filo geliri). Oyun günü yoğun saatlerin ritmidir; hedefler, hediye
  ve kontratlar gerçek takvimde.
- **Gerçek takvim** (cihazın yerel tarihi): **3 günlük hedef** her gece yarısı yenilenir (oyun günü bitince değil);
  **haftalık kontrat** pazartesi 00:00'da. Her gerçek günün ilk ziyaretinde **günlük hediye** kartı kendiliğinden açılır
  (hub'da, rehber bittikten sonra, ekranda başka kart yokken; uygulama gece boyu açık kalıp geri gelince de). Arka arkaya
  günler `data.js` `GIFTS`'i tırmanır: 1× tipik teslimat, 3 ⚡, 2×, 5 ⚡, 3×, 2× + 5 ⚡, 7. gün 6× + 10 ⚡; sonra başa
  döner, seri saymaya devam eder. Bir gün atlanınca 1. güne döner ("You missed a day"). City sekmesinde "Today"
  başlığında yeni hedeflere kalan süre; hedeflerin üstünde hediye satırı (bekliyorsa "Open", alındıysa "N days in a row ·
  Tomorrow's gift"). Saat koruması: takvim geri gitmez — saat ileri alınıp hediye alındıktan sonra geri alınırsa en son
  görülen günde bekler (ikinci hediye yok, hedefler yenilenmez); 7 günden fazla geri alınması yanlış saatin
  düzeltilmesi sayılır (bugünden devam, bugünün hediyesi alınmış sayılır). Sunucu kaydı (MIT-12) gelince sunucu saati.
  Ödüllü reklamlar (MIT-14) gelince hediyeye ×2: `claimGift(2)`. Kod: `state.js` `calDay` / `giftToday` / `claimGift`,
  `ui.js` `gift`, `main.js` `offerGift`. Test: `tools/daily.mjs`.
- **Enerji ⚡** (iş almanın bedeli; sayılar `data.js` `ENERGY`'de): her sipariş **1 ⚡**, START'a basınca düşer. Depo 10
  (Dayanıklılık becerisi seviye başına +2, en çok 20). Gerçek zamanla dolar: **6 dakikada 1**, oyun kapalıyken de (zaman
  damgasından hesaplanır; saat geri alınırsa sayaç sıfırdan başlar), ama zamanla depodan fazlası dolmaz. Seviye atlamak
  depoyu doldurur; alınan her günlük hedef +2 ⚡; günlük hediye 3–10 ⚡; kahve +5 ⚡ (nakitle: günün ilk fincanı tipik bir teslimatın 2 katı,
  sonra 4×, 8×, gerçek günde 3 fincan; hedef ve kahve depoyu aşabilir). Filo enerji harcamaz: oyuncu dinlenirken filo
  kazanır. Ekonomi: bir teslimat ~2 dk sürer, zaman harcananın ~üçte birini geri verir; hiç durmayan oyuncu ~15–20
  teslimattan sonra boş depoya çarpar, yeni oyuncu çok daha geç (ilk seviyeler birkaç teslimatta bir gelir, her biri
  depoyu doldurur). Yeterli enerji yokken sipariş alınmaz, START bar griye döner; ikisi de enerji panelini açar.

## 3. Sürüş (teslimat)

Motor rotayı A* ile bulur ve direksiyonu kendisi kırar. **Telefonda Kurye Koşusu** (30 Ekim'den beri): yol kendini
sürer (hız, virajlar, kapı), kalabalık trafik oyuncunun — **BRAKE** pedalı ve şerit kaydırma; kırmızı ışık ve karşıdan
karşıya geçen yaya da oyuncunun (aşağıda *Kurye Koşusu*). QA için başka sürüşler `?ctl` ile: `?ctl=b` fren (basılı tut,
28–30 Ekim telefonun sürüşü), `?ctl=a` şerit koşusu, `?ctl=stop` eski otopilot (güçler + STOP).

**Masaüstünde serbest sürersin** (Ayarlar → *Auto-drive* kapalıyken; masaüstünde varsayılan kapalı). *Auto-drive* açıkken
masaüstü de Kurye Koşusu'nu sürer (↓ / S / Space fren, ← → şerit, ↑ zıplama).
Ray yok: motor şehirde gidebildiği her yere gider (asfalt, kaldırım, ara sokak, park çimi); rota yalnızca GPS.

| Tuş | İş |
|---|---|
| W / ↑ | gaz (basılı tut); bırakınca motor yavaşça süzülür |
| S / ↓ | fren; durmuşken basılı tutunca geri vites (~10 km/s) |
| A / D, ← / → | direksiyon. Hızlandıkça tam kilit küçülür; dururken motoru olduğu yerde çevirirsin (U dönüşü) |
| Space · Shift · E · H | zıpla · turbo · olay butonu · korna |

- **Fizik** (`ride.js` serbest sürüş bölümü): bisiklet modeli (dingil arası 1,3 m), tutuş = 11 m/s² × lastik × (turbo 1,22)
  × (yağmur −%20) × (çim 0,7). En sıkı dönüş tutuşun biraz üstünde: sert virajda motor kayar (kayma açısı, lastik izi,
  ses, hız kaybı, yiyecek sarsılır; büyük kaymada Flow bozulur). Çimde hız ×0,6 ve sarsıntı; kaldırıma çıkış/iniş
  (0,1 m bordür) yaylara tekme, hızlıysa yiyeceğe darbe.
- **Çarpışma** (`ride/world.js`): bina tabanları, ağaç/lamba/trafik lambası/tabela direkleri, bank, saksı, kafe masası,
  çöp kutusu, konteyner, viyadük ayakları, saat kulesi, oturan/duran insanlar, şehir sınırı ve rıhtım; trafik arabaları,
  filo kuryeleri, çift park etmiş araçlar, olay arabaları, yayalar. Çarpınca motor dışarı itilir, o yöndeki hızını kaybeder;
  hızlıysa kaza (duvar 7, direk 6,5, eşya 6, araba 4,5, yaya 2,4 m/s üstü), değilse sarsıntı. Arabalar önlerindeki motoru
  görüp durur (`traffic.blockers`). Çukur/su birikintisi/koni/bariyer/kasa dünyada bir yerde durur: üstünden geçersen
  çarparsın, etrafından dolaşabilir ya da zıplayabilirsin; para/enerji üstünden geçince alınır.
- **GPS:** rota motorun en yakın noktasına izdüşürülür. Çizgiden 6,5 m uzaklaşınca ya da 1 sn ters yöne gidince
  bulunduğun sokaktan, baktığın yönde yeni rota çizilir (aynı kapıya). Yoldaki engeller yerinde kalır, yeni yola birkaç
  tane daha eklenir; gelecek olay yeni yola taşınır. "GPS shortcut" butonu ara sokağı GPS'e koyar; kestirme ancak ara
  sokaktan öbür caddeye çıkınca sayılır.
- **Varış:** kapının önünde parlayan halka (iki şerit + kaldırım, 4,6 m). Halkada gaz bırakılınca motor kendiliğinden
  durur; durunca alım/teslim sahnesi başlar (çalışan/müşteri motora yürür, poşet motorda el değiştirir; dokunuş yok).
- Kırmızıda kavşağa girmek ışık ihlali (kamera cezası şansı, sağ salim çıkınca Flow). **Kamera şansı bölgeye göre**
  (her sürüşte aynı, `DPROFILE.cams`): Downtown %70, Harbor %45, Old Town %35, Green Hills %20; kamera yoksa ceza yok
  (ekranda bir şey de yazmaz). Sollama: aynı yöne giden aracı
  geçmek. Ara sokaktan geçmek kestirme. Sollama ve "Go" butonları serbest sürüşte yok.

Güçler yalnız `?ctl=stop` otopilotunda (Turbo, Zıpla, Korna serbest sürüşte de); frende hiçbiri yok:

| Güç | Tetik | Etki | Risk |
|---|---|---|---|
| **Turbo** | basılı tut (her zaman) | hız +%45; enerji barı harcar | virajda/çukurda daha çok sarsıntı |
| **Zıpla** | HOP butonu | çukur, koni, su birikintisi, kaldırım üstünden geç | yanlış zaman → sert iniş |
| **Sollama** | öndeki araç yavaşlatınca parlar | karşı şeride çıkıp geçer | karşıdan araç varsa çarpışma |
| **STOP** | kırmızı ışık, geçen yaya, kapı (otopilot) | motor orada durur, yeşilde / yol açılınca kendi devam eder | basmazsan kırmızıyı geçer, yayayı ürkütür, kapıyı geçer |
| **Korna** | yaya / yavaş araç | yol açar | kaba → küçük puan kaybı (bazı olaylarda) |
| **Kestirme** | bazı kavşaklarda belirir | ara sokak / park içinden kısa yol | sarsıntılı, yiyecek hasarı |

- **Yiyecek durumu**: *Sıcaklık* (zamanla düşer, kutu yalıtımı yavaşlatır; dondurma tersine erir) ve *Bütünlük*
  (sarsıntı, çarpışma, sert fren). İçecek/çorba/pasta daha hassas.
- **Süre**: ETA rotadan hesaplanır. Erken → bonus, geç → bahşiş düşer, çok geç → puan düşer.
- **Fiş**: taban ücret × bölge × yoğunluk + bahşiş (puan, Cazibe becerisi) − yakıt (araç verimi × mesafe).
- **Puan**: 5 yıldız ortalaması; yeni bölgelerin kapısı.

### Rastgele olaylar

Teslimatların bir kısmında olay çıkar; zaman yavaşlar, kart veya QTE gelir. Tepki penceresi Refleks becerisiyle uzar.

- *Seçim kartı*: sarı ışık (bas / dur; otopilotta ve frende yok: ışıklar STOP'un / frenin), yol çalışması (dolambaç / kaldırımdan), müşteri mesajı ("ketçap alır mısın?"),
  yaşlı teyze karşıya geçiyor (bekle / korna), rakip kurye yarışa davet ediyor, yağmur başladı, polis çevirmesi,
  hayranın selfie isteği, sipariş hazır değil (bekle / mutfağa yardım et).
- *Refleks QTE*: köpek kovalıyor (hızlı tıkla), açılan araba kapısı (yöne kaydır), yola top kaçtı (zıpla),
  güvercin sürüsü (korna).
- *Ritim QTE*: külüstür motor stop etti (yeşil bölgede bas, marş), lastik patladı (pompala).
- Külüstüre özel arızalar; araç iyileştikçe arıza olayları azalır.

### Fren (`?ctl=b`; 28–30 Ekim telefonda varsayılan)

30 Ekim'den beri telefonun sürüşü *Kurye Koşusu* (aşağıda); fren `?ctl=b` ile duruyor, sağ altta "Prototype B · brake".

Denetim raporunun "ustalaşılacak tek bir hareket yok" bulgusu üzerine (2026-10-28, kullanıcı: "yap"): telefonda dört ayrı
sürüş biçimi yerine tek fiil, **basılı tut = fren**. Aşağıdaki *Şerit ve fren prototipi*nin B'si ("Geç Fren") varsayılan
oldu; STOP'un "ne zaman duracağın senin kararın" fikri onun içine katlandı (dokunuş yerine basılı tutmak: ne zaman ve ne
kadar), şerit değiştirme kalktı. Kod: `ride.js` "Lanes & brake" bölümü (`R.scheme === 'b'`), test `tools/ctl.mjs b`.
B'nin kuralları (viraj sınırı, vites, halka, geri sayım, kavşakta dönüş) prototip bölümünde; farklar:

- **Kontrol:** gaz hep açık; ekranın herhangi bir yerine basılı tut = fren (~0,15 sn'de tam güç, 9,5 m/s²), bırakınca
  motor yine hızlanır. Kaydırma yalnız sokak seçilecek bir an varken sayılır (kavşağın okları, kestirme); başka zaman
  freni tutan başparmak yana kaysa da fren sürer. **Şerit yok:** şeridi kapatan engel de yok — çift park etmiş araç ve
  yol çalışması bariyeri frende koni olur (yavaş geç). Yalnız *yol çalışması* kartının bariyerinde otopilot işçiyi bekler;
  6 sn'den uzun takılırsa yedek kural olarak karşı şeritten dolanır, o sırada karşıdan gelen araba motoru görüp fren
  yapar (`traffic.blockers`, serbest sürüşteki gibi). Klavye: ↓ / S / Space fren; ← / ↑ / → kavşakta sokak.
- **Kırmızı oklar ve tabela** (hız göstergesinin yanında) en yakın fren noktasını gösterir (tam frenin %80'i):
  viraj (hız sınırı, km/s), kırmızı ışık (yalnız vardığımızda hâlâ kırmızı / sarı olacaksa ve önümüzde ışıkta bekleyen
  araba yoksa — yeşile yetişeceksen ok yok), **karşıya geçen yaya** (yürümeye başlamış ve vardığımızda yolumuzda olacak;
  olay kartlarının yayalarını otopilot bekler), **yolumuzdaki çukur / su birikintisi / koni / kasa** (16 km/s; otopilot
  koni ve kasa için kendisi yavaşlamaz), kapı.
- **Ödüller (Flow → bahşiş):** PERFECT CORNER, PERFECT STOP (halkanın ortası), GREEN WAVE (kırmızıyken görülen ışığa
  durmadan yeşilde yetişmek), **SMOOTH** (çukur / su birikintisi / koni / kasa üstünden ≤ 16 km/s ile, son 3 sn içinde fren
  yapılmışsa: yemek sarsılmaz), SMART TURN, vites.
  Motor dururken Flow süresi işlemez (kırmızıda beklemek kimsenin suçu değil; bedeli vitesin 1'e düşmesi).
- **Cezalar:** viraj sınırının %106–145'i dışa kayma, üstü kaza; **kırmızıyı geçmek** STOP'taki gibi Flow'u bitirir, kavşakta
  kamera varsa (bölgenin şansı, yukarıda) ceza (1 + 2 × bölge ücret çarpanı, ilk iki teslimatta uyarı; "RED RUNNER" Flow'u
  yok), yan yolda gerçekten araba varsa
  "T-boned"; ışık çizgiden geçmeden en fazla 0,5 sn önce kırmızıya döndüyse sarıda girilmiş sayılır (kaçınılmaz ikilem
  yok; bu kural her sürüşte). **Yayayı ürkütmek** (yaya sıçrar, motor yavaşlar, yemeğe 9, Flow biter). Yaya tahmini
  frende motorun bırakınca hızlanacağını hesaba katar (yoksa tabelaya uyan oyuncu da ürkütüyordu). Engele hızlı: eski hasar
  (çukur 11, su 4, koni 8, kasa 10, hız kaybı, Flow biter). Kapıyı geçmek: kayarak durur, geri geri halkaya.
- **Olaylar:** sarı ışık kartı çıkmaz (ışıklar frenin). Öbür kartlar ve QTE'ler değişmedi.
- **Süreler** (`orders.js`): frende dikkatli sürücü her motorda aşağı yukarı aynı hızda (`SEED=7 BOT=1 tools/speed.mjs`,
  6'şar sürüş, Külüstür / Vespetta / Viper: Old Town 5,5 / 5,7 / 6,7 · Downtown 5,9 / 5,5 / 6,5 · Harbor 5,6 / 5,7 / 5,2 m/s;
  ilk ölçümde Zippy 5,7, Volt 6,0 — hızı viraj, ışık ve yaya belirliyor, tepe hız değil; STOP'ta da aynı: Old Town
  Vespetta 5,6, Viper 5,9, ama orada turbo var). Bu yüzden frende süre motoru ^0,15 ile izler (eskiden ^0,45),
  Sv 10'un "turbosuz zamanında"sından sonra daralmaz (`etaSlack` en az 1,06) ve hızlı siparişlerin sıkıştırması yarıya
  iner (Rush ×0,78 → ×0,89, VIP ×0,95, Express ×0,85). Hesapla dikkatli sürücü Sv 10'dan sonra standart siparişte
  sürenin ~%80–95'inde, Rush'ta ~%90–105'inde; erken gelmek geç frene, yeşil dalgaya ve vitese kalıyor. Sipariş
  kartındaki "you ~" tahmini de frende motoru ^0,15 ile izler. Kısa rotalarda iki kırmızı ışık sürenin sabit 6 sn'lik
  payını aşıyordu (ölçümde kısa bir standart siparişte dikkatli sürücü %140): 2026-10-30'dan beri frende ve koşuda
  sabit pay 12 sn (bir tam kırmızı, duruş ve kalkış; `FIXED_STOP`). Şehirde rotalar ~40 m'de bir ışığa rastlar (Hills'te
  hiç): ışık başına süre de denendi, ama ışıklar mesafeyle orantılı olduğundan uzun siparişleri de %30 uzatıyordu.
- **İlk sürüş:** yeni kart (`seen.brakeTip`, STOP'u görmüş oyunculara da), karşılama slaytı "The gas is always on".
  İlk karşılaşmada ağır çekimli ipuçları `seen.c_lb_*` (şeridin "sola kaydır" ipucu frende çıkmaz).
- **Henüz eski oynanışa göre** (sonraki adım): turbo'ya bağlı Sürüş / Dayanıklılık becerileri ve araçların `boost`
  değeri (frende işe yaramıyor; fren gücü / viraj tutuşuna dönmeli), parçalara "Fren", tıklama QTE'leri (köpek, stop
  eden motor, patlak lastik), enerji kutuları paraya döner, kırmızıyı geçince kameranın çapraz trafiği göstermesi.

### Kurye Koşusu (telefon; masaüstünde *Auto-drive*)

Kullanıcı (2026-10-29): "bu dönüşlerin de hızını ayarlama olayını hiç sevmedim ya, biraz subway surfers, temple run gibi
oyunlardan ilham alalım" → önerdiğim *Kurye Koşusu*: "yap". İlk hâli yalnız kaydırmaydı: otopilot kendi şeridinde
mesafeyi koruyor, kırmızıda bekliyordu (↑ ile geçilirdi). Kullanıcı (2026-10-30): "sürüş yapısı şöyle olsun, yol auto
drive olsun, şeritlerde sağ sol yapmak zorunda kalalım, araba sıklığı artsın gerçek hayattaki gibi, kuryeler arabaların
arasından geçmiş olacak. frenleme butonu olsun hem ışıklarda hem de çarpışma önlemek için". Şimdiki hâli bu: **yol
kendini sürer, trafik oyuncunun.** 30 Ekim'den beri telefonun ve masaüstü *Auto-drive*'ın sürüşü (denetim raporundan
çıkan yol haritasının 1. maddesi "tek sürüşe karar ver"; kullanıcı: "Kurye Koşusu"); `?ctl=run` her cihazda zorlar.
Yeni oyuncunun ilk iki teslimatında trafik daha seyrek (arabalar yarı yarıya, sonra dörtte üç). Kod: `ride.js` "the
courier run" bölümü ve `R.scheme === 'run'` dalları (şerit koşusunun şeritleri, kaldırımı, sapanı ve kavşakta dönüşü
üstüne), test `tools/ctl.mjs run`.

- **Kontrol:** sağ altta **BRAKE** pedalı (basılı tut = fren, 9,5 m/s²; bırakınca gaz yine açık). Pedal bir araba fren
  pedalı (`PEDAL`, `ui.js`, SVG): kolu yukarıda cıvatalı mafsalda, çelik plaka, nervürlü kauçuk. Basılıyken menteşesinden
  öne yatar (CSS `rotateX`), etrafı fren lambası gibi kırmızı parlar; klavyeyle frende de iner. Ekranın başka her yeri
  kaydırma: **← / →** şerit (karşı şerit, kendi şeridin, kaldırım; kaldırım yalnız düz bloklarda), **↑** zıpla (çukur, su
  birikintisi, koni, yol çalışması bariyeri, kasa; son kısımda zıplamak PERFECT HOP). Bir başparmak freni tutarken öbürü
  kaydırabilir. Yolda basılı tutmak bir şey yapmaz. **Kaydırma hep şerit, kavşakta seçim yok:** her dönüşü GPS alır,
  kavşak okları çıkmaz (`updateJunction` koşuda `R.junc`'u hep boş bırakır). İlk hâlinde kavşak penceresinde kaydırma
  dönüştü; kalabalık trafikte kavşaktan önce yavaş arabayı geçmek için sola kaydıran oyuncu yan sokağa sapıyordu (test
  botu bu yüzden kavşak yakınında hiç şerit değiştiremedi, kısa bir siparişte sürenin %179'u); sonra oklara dokunularak
  seçiliyordu, 2026-10-30'da kullanıcının isteğiyle oklar da kalktı. HUD'da şeridi gösteren üç kutu yok (yalnız draft
  barı kalır). Klavye: ← / → (A / D) şerit, ↓ / S / Space fren, ↑ / W zıpla.
- **Otopilot** yalnız tempoyu, virajı (şeridin çizgisinden, viraj hızı oyuncunun derdi değil) ve kapıdaki duruşu tutar.
  Öndeki araba, çift park etmiş araç, karşıdan geçen yaya ve kırmızı ışık için **durmaz**: fren ya da başka şerit.
  Öndeki arabaya kapanma hızı 4,5 m/s üstüyse kaza ("Rear-ended a car!"), altıysa sarsıntı ve arabanın hızına inme; park
  etmiş araca 4,5 m/s üstü kaza, değilse durur (6 sn sonra karşı şerit boşsa kendisi dolanır). Kırmızıyı geçmek Flow'u
  bitirir, kamera bölgenin şansıyla ceza keser (frendeki gibi), yan yolda araba varsa "T-boned"; ışık çizgiden 0,5 sn önce kırmızıya döndüyse
  sarıda girilmiş sayılır. Durmadan yeşile yetişmek GREEN WAVE. Yaya ürkütmek frendeki gibi.
- **Trafik:** rotanın çevresi kalabalık (`denseTick`). 0,4 sn'de bir önümüzdeki 160 m sayılır: bölgenin payından az araba
  varsa bisikletten en uzaktaki (170 m+, görünmeyen) araba alınıp rotanın 105–160 m ilerisine konur (sisin içi). Kendi
  şeridimizde ağır aksak (3–6,5 m/s, motorlardan yavaş: arkasında kalan fren yapar ya da araya girer), karşı şeritte
  5–8 m/s akan bir sıra; en az bir sonraki kavşağa kadar rotayı izlerler. Aralık Downtown'da kendi yönümüzde ~30 m,
  karşıdan ~40 m, sakin bölgelerde daha seyrek (`traffic` 0,4–1,0 → yoğunluk ×0,67–1). Sürüş bitince arabalar eski
  hızlarına döner. Karşı şeritte neredeyse durmuş (2,5 m/s altı) bir motoru karşıdan gelen araba görüp fren yapar; üstüne
  sürülen motoru görmez (kafa kafaya kaza).
- **Oyuncunun riskleri:** karşı şerit hızlı ama karşıdan gelenle kafa kafaya; kaldırımda araba yok ama masa, direk ve
  insan (çarpınca kaza; bordürden iniş-çıkış yemeği sarsar). Zıplanmayan alçak engel **sendeletir**: hız %35'e düşer (su
  birikintisinde %60), motor sallanır, Flow biter, yemek 1,5 kat hasar alır (çukur 16,5, su 6, koni 12, bariyer 18, kasa
  15); frenle 16 km/s altında üstünden geçmek yalnız sarsıntı (son 3 sn'de fren yapılmışsa SMOOTH).
- **Paralar:** düzlüklerde para sıraları (kendi şeridinde 5, karşı şeritte ve kaldırımda 7: riskli şeritte daha çok),
  tane başı $0,15 × bölge ücret çarpanı, art arda toplanınca ses inceliyor, Flow serisini canlı tutar; fişte "Cash found
  on the road". Banknotlar eskisi gibi (bir kısmı kaldırımda), enerji kutuları paraya döner.
- **Flow** (kusursuz zıplama, sollama, sapan, kıl payı, akıllı dönüş, kestirme, yeşil dalga) tepe hızı %20'ye kadar açar.
- **Yemek = can barı:** kutu barı 5 dilimli. Sıfıra inerse sipariş **bozulur**: ücret, bahşiş yok, 1★ ("FOOD RUINED",
  fişte "food ruined").
- **Süreler:** kalabalık trafikte dikkatli sürücü frendekiyle aynı hızda (`SEED=7 CTL=run BOT=1 tools/speed.mjs`, 5'er
  sürüş, Külüstür / Vespetta / Viper Old Town 5,2 / 6,2 / 6,6, Downtown Vespetta 6,1 m/s; trafik oyuncunun olmadan önce
  6,4–7,3). Bu yüzden koşu da frenin sürelerini alır: motor ^0,15, Sv 10'dan sonra daralmaz (`etaSlack` en az 1,06),
  hızlı siparişlerin sıkıştırması yarıya iner, sabit pay 12 sn (frendeki gibi; kısa bir standart siparişte dikkatli
  sürücü 6 sn'lik payla sürenin %178'iydi). Sipariş kartındaki "you ~" dikkatli sürücüye göre (taban ×1,1).
  **Dokunmayan sürücü daha hızlı** (Downtown Vespetta 6,8 m/s): kırmızıları geçer, arabaya çarpıp onun hızıyla devam eder
  (kaza 1,8 sn). Bedelini yemekle ve cezayla öder (aşağıda *Ölçüm*); zaman farkı istenirse kazanın süresi uzatılabilir.
- **Karşı şeritte sıkışma** (her şeritli sürüşte): burun buruna duran iki araç kaza sayılmaz; kafa kafaya kazadan sonra
  karşıdan gelenler motoru görüp durur; karşı şeritte bir arabanın önünde durup yanındaki şeride (park etmiş araç
  yüzünden) dönemeyen motor geri geri çekilip şeridine girer. Otopilotun kendi dolanışı ancak önündeki ışığa kadar
  bitebilecekse başlar (karşı şerit 40 m boş) ve karşıdan araba gelirse yavaşlayıp ona yol verir.
- **Kalabalık trafikte bulunan hatalar** (2026-10-30, her şeritli sürüşte): (1) araba motoru yalnız düz bir ışınla
  arıyordu; köşeyi dönerek gelen araba karşı şeritte duran motoru görmüyordu, kazadan sonra her kalkışında yeniden
  çarpıyordu (bir siparişte 5 kafa kafaya). Artık kendi yolu boyunca bakar (bu karodaki eğrisi, sonra çıkış yönünde düz,
  40 m; serbest sürüşte de). (2) Duran motor için duran arabanın durma noktası kafa kafaya kontrolünün 1,2 m'sinin
  içindeydi: fren yapıp duran araba yine kaza sayılıyordu (`blocker.pad` 0,8 m). (3) Kavşakta dönüp giden ya da
  dönüp gelen araba "karşıdan gelen" sayılıyordu: yanından dönen arabaya kafa kafaya kaza yazılıyordu. Artık yalnız
  bizim yolumuzu ters yönde izleyen araba karşıdan gelendir. (4) "Yan şerit boş mu" yalnız bulunduğu karoya bakıyordu
  (karo sınırındaki arabayı görmüyordu); artık öncekine ve sonrakine de. (5) Kapıya ya da ara sokağa 15 m kala ve
  kaldırımın ucunda motorun kendi şeridine kendiliğinden dönüşü önündeki arabaya bakmıyordu; koşuda artık arabanın
  arkasında frenle durabilecek yer yoksa beklemeye devam eder.
- **İpuçları:** ilk sürüşte kart (`seen.lbTip_run2`; trafik oyuncunun olunca yeniden), karşılama slaytı "Weave through
  traffic"; ilk karşılaşmada ağır çekimli `seen.c_run_hop / lane / red / onc / coins / light` (öndeki araba, kırmızı ve
  karşıdan gelen için BRAKE butonu parlar; draft, kestirme ve dönüş ipuçları şerit koşusunun `c_lb_*`'ı).
- **Yapılmayanlar (sonra):** iki şeridin arasından (şerit çizgisinin üstünden) geçmek, güçlendirmeler (termos, mıknatıs,
  roket kutu), aynı siparişe yarışan rakip kurye, kırmızıyı geçince polis kovalaması, "yeni kutu, devam et" ödüllü
  reklamı, olay kartları ve QTE'ler (değişmedi; olay kartı açıkken BRAKE butonu gizli), koşu oyunlarına özgü kamera.
- **Ölçüm** (`PAIRS=3 tools/ctl.mjs run`, Vespetta, Sv 6, aynı 3 sipariş, olaylar kapalı, her bacakta bir yaya; dikkatli
  sürücü `runBot`: zıplanacak şeye son anda zıplar, öndeki yavaş arabayı, park etmiş aracı ya da yayayı karşıdan gelen
  sırada yeterli boşluk varsa karşı şeritten geçer, geçemediğine fren yapar, kırmızıda durur; karşı şeritte dönemezse
  durur ve araba durunca ağır ağır ilerler). Son tur: önümüzdeki 160 m'de ortalama 4,2 araba bizim yönde, 2,5 karşıdan;
  dikkatli 4,7★, yemek %86, $51,3, 61 sn (sürenin %71'i), 0 geç, 0 kaza, 0 kırmızı · dokunmayan 2,3★, %36, $6,3, 69 sn
  (%83), 1 geç, 7 kaza, 8 kırmızı (8 kamera cezası), 6 ürkütülen yaya, 1 bozulan sipariş. Önceki turlarda aynı sürücü
  siparişe göre 0–1 kaza yaptı; dokunmayan sürücü hep 7–26 kaza. Dokunmayan bazen daha hızlı (kırmızıları geçer, çarpıp
  devam eder) ama kazanamaz: cezalar ve bozulan yemek. Fren, şerit koşusu, STOP ve serbest sürüş testleri de hatasız.

### STOP (`?ctl=stop`; 26–28 Ekim telefonda varsayılan)

Kullanıcı (2026-10-26): "kırmızıda kendimiz duruyoruz, geçmek için buton var — sürücü kendiliğinden durmasın, kırmızıysa
STOP butonu çıksın; ayrıca ekrana hiç dokunmadan teslimat bitirilebiliyor, akışa net ama yumuşak engeller koy". Kural tek
cümle: *motor kendi sürer ama durmak senin işin*. Kod: `ride.js` "STOP is the rider's" bölümü, test `tools/stop.mjs`.

- **Ne zaman çıkar:** alt ortada büyük kırmızı sekizgen (yatay ekranda HOP'un solunda), şu üçünden en yakını için
  (~2–3,5 sn önceden: konfor fren mesafesi + 2,2 sn'lik yol + 8 m): **kırmızı ışık** (vardığımızda hâlâ kırmızı / sarıysa
  ve önümüzde ışıkta bekleyen araba yoksa; etikette yeşile kalan saniye), **yaya** (yürümeye başlamış ve vardığımızda
  yolumuzda olacak bir yaya — olay kartlarının yayaları hariç, onları otopilot bekler), **kapı** (son 70 m, kapıda halka).
  Işık geri sayımı (§3 prototip) otopilotta da sinyal direğinin üstünde.
- **Basınca:** motor durma noktasına kadar sürer, normal fren eğrisiyle (7,5 m/s²) durur; ışık yeşile dönünce / yaya
  geçince kendi devam eder, kapıda halkada durunca sahne başlar. Beklerken buton söner ("wait · 4 s").
- **Zamanlama:** fren noktasından (7,5 m/s²) önceki son ~1 sn (hız + 2 m) butonun **yeşil yandığı** an: o an basmak
  **PERFECT STOP** (Flow → bahşiş; kapıda özellikle değerli, Flow teslimde bahşişe çarpılır; STOP ile durulan yerde
  beklerken Flow süresi işlemez, yoksa 8 sn'lik kırmızı her seriyi bitirirdi). GPS okları fren noktasından
  durma noktasına kadar kırmızı. Daha geç (sarsılır): **sert fren**, yemeğe küçük darbe; artık duramayacak kadar geçse
  (11 m/s² ile bile) buton ışık/yaya için kaybolur.
- **Basmazsan:** *kırmızı ışık* → geçersin: kavşakta kamera varsa (30 Ekim'e kadar her seferinde; artık bölgenin şansı,
  §3 başı) patlar (beyaz flaş + deklanşör), küçük
  ceza (1 + 2 × bölge ücret çarpanı: Old Town $3, Downtown $5, Harbor $6, Hills $8; ilk iki teslimatta yalnızca uyarı),
  Flow kamera olmasa da biter. Yemek ve yıldız etkilenmez. Yan yolda gerçekten araba varsa çarpışma ("T-boned"), ama çapraz trafik
  şehrin kendi trafiği: 27 Ekim'e kadar STOP çıkınca yan yola görüş dışından bir araba gönderiliyor, geçen oyuncu için
  frene asılıp korna çalıyor ve motoru yarı hıza düşürüyordu — kullanıcı "yalandan" buldu, kaldırıldı. *Yaya* → yaya sıçrayıp
  kaçar, motor savrulur ve yavaşlar, yemeğe 9 darbe, Flow biter (Honk da işe yarar: yaya koşar, STOP kaybolur). *Kapı* →
  motor geçer, kayarak durur (yemeğe 4), geri geri halkaya döner (~5 sn). "Run it!" butonu kalktı; otopilotta "RED RUNNER"
  ve "GREEN WAVE" Flow'u yok.
- **Ölçüm** (`tools/stop.mjs`, Vespetta, Sv 6, aynı 4 sipariş, her bacakta bir yaya, olaylar kapalı): dikkatli sürücü
  (`game.ride.autoBot()`, yeşil anında basar, turbo yok) 3,8★, yemek %84, ortalama $35,5, 115 sn; hiç dokunmayan 3,0★,
  yemek %47, $9,8 (iş başı $14–46 kamera cezası, bazen eksiye düşüyor), 77 sn — bu ölçüm sahte çapraz trafik ve %35
  kamera şansıyla. 27 Ekim'den sonra (her kırmızıya kamera, sahte çapraz trafik yok; aynı ilk 3 sipariş): dikkatli 4,7★,
  yemek %86, $40, 99 sn; hiç dokunmayan 4,0★, yemek %72, $21, 75 sn (iş başı 4–6 kırmızı, $14–22 ceza, kısa bir işte
  −$5). Hiç dokunmayan iki kapıyı da geçip geri dönüyor; kilitlenme yok. Kırmızıda gerçek bir araba çarparsa ("T-boned")
  bu o kırmızıda bir kez olur, sonra yan yoldaki arabalar motor kavşaktan çıkana kadar durur (önceden motor kalkarken
  aynı araba tekrar tekrar çarpabiliyordu: bir işte 4 kez). Dikkatli sürüş ≈ eski
  otopilotun süresi (o da kırmızıda ve yayada bekliyordu), yani `etaFor` kalibrasyonu geçerli (Acil siparişlerde turbosuz
  geç kalıyor, tasarım gereği); dokunmayan daha hızlı ama ceza ve yemek kaybı ağır basıyor. İlk ölçümde (çapraz trafik
  5 darbe, Flow beklerken sönüyordu) iki sürücü aynı yıldızı alıyordu: dikkatli olan geç kalıyor, dokunmayan yemeği
  bozuyordu — bu yüzden Flow beklerken donar ve çapraz trafik hız da aldırır.
- **Tuşlar** (Auto-drive açıkken): S / ↓ STOP, A / ← sollama, D / → kestirme (eski G "Run it" ve S kestirme kalktı).
- **İpuçları:** ilk sürüşte yeni kart (`seen.rideTip2`: "stopping is your job"); her durak türünün ilk karşılaşmasında
  ağır çekimli ipucu (`seen.c_stop_light / c_stop_ped / c_stop_door`), deneyimli oyunculara da (STOP herkese yeni).

### Şerit ve fren prototipi (`?ctl=a`, `?ctl=b`; B 28–30 Ekim varsayılandı, yukarıda *Fren*)

QA geri bildirimi (2026-10-25): "turbo buton falan olmadan tüm mekaniği sağ sola geçme ve fren üzerinden kurgula".
`?ctl=a` / `?ctl=b` / `?ctl=run` / `?ctl=stop` cihaza yazılır (`localStorage` `fds_ctl`), `?ctl=off` siler. Her cihazda
çalışır (masaüstünde serbest sürüşün yerine geçer); sağ altta A'da "Prototype A · lane run", B'de "Prototype B · brake"
yazar. Kod: `ride.js` "Lanes & brake" bölümü. B'nin aşağıdaki kurallarını *Fren* bölümündeki farklarla oku (yayalar,
çukurlar, kırmızı ışık kamerası, şerit yok).

- **Kontrol:** gaz hep açık. Ekranın herhangi bir yerine **basılı tut = fren** (parmak değdiği an tutar, ~0,15 sn'de tam güç,
  9,5 m/s²). Parmak 24 px yana kayarsa fren bırakılır ve **bir şerit** geçilir; yukarı kaydırmak düz giden kestirmeyi alır.
  Klavye: ←/→ (A/D) şerit, ↓/S/Space fren, ↑/W düz kestirme. Turbo, HOP, korna ve bağlam butonları (Overtake, Run it, Honk)
  yok, serbest bakış kapalı. Kestirme çıkınca alt ortada hangi yöne kaydırılacağı yazar; o yöne kaydırmak ara sokağa sokar
  (şerit değişmez). Yan tarafta bir şey varken (park etmiş araba, yanımızdaki araba, kaldırımda masa/insan) o şeride geçilmez:
  sürtme + küçük yemek hasarı. Motorun arkasında fren lambası, frende hız göstergesi kırmızı.
- **A — Şerit Koşusu:** otopilot direksiyonu ve virajları yapar; öndeki araba, kırmızı ışık, karşıya geçen yaya ve şeritteki her
  şey oyuncunun. Üç şerit: **karşı şerit** (kendi şeridimizin 3,2 m solu; karşıdan gelen araçla kafa kafaya = kaza),
  **kendi şeridimiz**, **kaldırım** (3,9 m sağı = yol ortasından 5,5 m: ağaç/lamba sırası ile kafe masaları arasındaki yaya
  çizgisi). Kaldırımda araba yok ama yürüyen ve oturan insanlar, kafe masaları var; hız ×0,8, bordürden çıkış/iniş yemeği
  sarsar (çıkarken ağaç aralarından geçilir, çarpışma sayılmaz). Kaldırım yalnız düz bloklarda: kavşaktan, virajdan ve kapıya
  20 m kala biter, motor kendiliğinden yola iner (yol doluysa kaldırımın ucunda bekler).
  Öndeki arabaya kapanma hızı 4,5 m/s üstüyse kaza (masaüstü serbest sürüşle aynı eşik), altıysa sarsıntı ve arabanın
  hızına inme; çift park: 4,5 m/s üstü kaza, değilse durur (6 sn sonra karşı şerit boşsa kendisi dolanır). Kırmızıda geçmek
  oyuncunun kararı (kamera cezası şansı, çapraz trafik — klasik "Run it!" kuralları). **Draft:** kendi şeridimizde 10 m'den
  yakın bir arabanın arkasında ~1,2 sn → dolu (kopunca 1,5 sn'de boşalır);
  şerit değiştirince **sapan**: anında +1,2–3,4 m/s, 0,9–2,5 sn tepe hız ×(1 + 0,3 × aracın turbo değeri), turbo alevi.
  Flow tepe hızı %12'ye kadar açar. Enerji kutuları paraya döner; paraların bir kısmı kaldırımda ve karşı şeritte.
- **B — Geç Fren:** otopilot trafikte mesafeyi korur (öndeki araba, çift park, yol çalışması, yaya), ama **viraj, kırmızı ışık
  ve kapı** oyuncunun. Her virajın hız sınırı √(8,5 × tutuş × yarıçap), yarıçap girilen şeride göre (dış şeritten geniş yay =
  daha hızlı viraj). Girişte sınırın %86–106'sı ve son 2,5 sn'de fren yapılmışsa PERFECT CORNER; %106–145 arası dışa kayma
  (sağ dönüşte karşı şeride, solda bordüre doğru; yemek hasarı, Flow biter); %145 üstü kaza. Viraj içinde gaz tutuşun üstüne
  çıkaramaz. GPS okları fren noktasından hedefe kadar kırmızı (tam frenin %80'iyle hesap); hız göstergesinin yanında sıradaki
  şeyin tabelası (viraj sınırı km/s, STOP, kapı), fren geç kalınca tabela ve gösterge yanıp söner. Kapıda 2,6 m'lik halka:
  içinde dur (merkeze 0,9 m'den yakın = PERFECT STOP, Flow → bahşiş); geçersen motor kayarak durur ve geri geri halkaya döner.
  **Vites:** tam durmadan geçilen her kavşak +1 vites (en çok 5, her biri tepe hıza +%4), tam duruş (olay beklemeleri hariç)
  1'e indirir. Kırmızıyken görülen ışığa durmadan yeşilde yetişmek GREEN WAVE.
- **Kavşakta dönüş (iki şemada):** rotada başka sokağa çıkışı olan bir kavşağa ~2 sn kala (16 m ya da 2,2 sn'lik yol) motorun
  üstünde oklar belirir: GPS'in yolu mavi, öbür çıkışlar ne kazandırdığıyla etiketli ("−20 m", "skip 1 light", "+30 m",
  "same"; kazandıranlar yeşil ve yanıp söner, belirince kısa bir tık sesi). Kaydırmazsan GPS'in yolu; sağa/sola kaydırmak
  (ya da yukarı = düz) ya da oka dokunmak o sokağa sokar (Kurye Koşusu'nda oklar hiç çıkmaz: dönüşleri GPS alır), GPS
  aynı kapıya yeniden rota çizer (`replaceRoute`, engeller yeniden, olay taşınır).
  Pencere dönüş yayının başladığı yerde kapanır ve yalnız kendi şeridinden açılır: karşı şeritte ya da kaldırımdayken
  (ve şeritte takılı kaldıysan, `blockHz`) kaydırma şerit değişimi olarak kalır — kendi şeridine dönüş olarak değil. Kazandıran
  dönüş SMART TURN (Flow). Her çıkış için A* bir kez hesaplanır (`updateJunction`, kavşak başına). Masaüstünde oklar tıklanır.
- **Işık ritmi (iki şemada):** rotadaki bir sonraki ışığın (70 m içinde) kendi yönümüzdeki sinyal direğinin üstünde geri sayım
  (kırmızıda yeşile, yeşilde sarıya kalan saniye; ışık döngüsü 17 sn: 7 yeşil, 1,5 sarı). B'nin STOP tabelasında da
  "red · 4 s". Kırmızıyken görülen ışığa durmadan yeşilde yetişmek artık her iki şemada GREEN WAVE.
- **İpuçları:** ilk sürüşte şemaya özel kart (`seen.lbTip_a/b`); ilk karşılaşmada ağır çekimli tek seferlik ipuçları
  (`seen.c_lb_*`: fren, kırmızı oklar, şeritte engel → sola kaydır, draft dolu → çık, halka, kestirme, kazandıran dönüş, geri sayım). Olay kartları ve
  QTE'ler değişmedi (tıklama QTE'leri iki fiile uymuyor; yön seçilince dönüştürülecek). Turbo'ya bağlı Riding/Stamina
  becerileri, araçların `boost` değeri ve `etaFor` süre kalibrasyonu da henüz eski oynanışa göre.

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
Cazibe (bahşiş), Refleks (QTE penceresi), Dayanıklılık (enerji deposu seviye başına +2 ⚡; masaüstünde turbo deposu +%20).

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

Dikey, tek elle. Üst bar: seviye/XP, enerji (⚡ dolu/depo; dolarken altında bir sonrakine kalan süre; dokununca enerji
paneli: depo, geri sayım, enerjinin yolları, kahve), nakit, puan, saat. START barının sağ üstünde işin enerji bedeli. Alt sekmeler: **City · Garage · Courier · Jobs · Fleet**.
Görsel dil konseptten: lacivert yarı saydam paneller, yeşil "oyun" butonları, krem menü zemini, kalın yuvarlak yazı
(Lilita One + Fredoka), kırmızı kask/kutu marka rengi. "D2 · Rozet" katmanı: başlıklar kırmızı kurdele, seviye altın
kalkan, önemli yazılar açılış logosu gibi koyu konturlu, süre altın kronometre. Masaüstünde de çalışır (Space turbo, W/↑ zıpla, E eylem,
H korna, 1–3 olay seçimi).

**Duraklatma** (sürüşte): sipariş kartının altında sol tarafta ‖ butonu; ayrıca Esc / P, Android'in geri tuşu ve sayfa ya
da uygulama gizlenince kendiliğinden. Menü: Resume / Settings / Cancel order. Menü açıkken sürüş, trafik ve yayalar
durur (`main.js` `game.paused`); kapı sahnesinde ya da olay kartı açıkken istenirse o bitince açılır. İptal iki kez
sorulur. Teslim edilmemiş her sipariş için ⚡ geri gelir ve son puanlara 2★ eklenir (`data.js` `CANCEL_STARS`). Hiçbiri
teslim edilmediyse fiş yoktur ve para ödenmez ya da kesilmez; sürülen süre saate eklenir. Tanıtım sürüşü iptal edilirse
rehber "bir sipariş seç" adımına döner.

## 6. Teknik

- `index.html` + `css/` + `js/` (ES modülleri, build yok). three 0.186.1 jsdelivr importmap, GLTFLoader + Draco.
- Şehir: ızgara (1 karo = 8 m), bölgeler, A* yol grafiği; görünüm Kenney karolarından parça parça (chunk) birleştirilir,
  her chunk ≈ kit başına 1 draw call. Gölge sadece oyuncu çevresinde.
- Trafik: yol grafiği üzerinde rastgele rotalı araçlar, takip mesafesi, trafik ışıkları; kaldırımda yayalar.
- Kayıt: `localStorage` `fds_save_v1`. Kapalıyken geçen süre filo gelirine.
- Analitik: `js/analytics.js` olayları toplayıp 15 sn'de bir (sayfa gizlenince `sendBeacon` ile) `api/collect.php`'ye yollar;
  PHP + SQLite (`api/`), panel `admin/` (şifreli). Ayrıntı: §10.
- Test: `tools/` altında headless Chrome ekran görüntüleri, birkaç telefon boyutunda taşma kontrolü.
- Mağaza uygulamaları: `mobile/` (Capacitor 8; Android + iOS, `com.mithatcanturan.fooddeliverysim`, ana ekranda "Delivery Sim").
  `mobile/scripts/build-web.mjs` oyunun dosyalarını `www/`'ye kopyalar, CDN'den gelenleri (three, Draco, es-module-shims,
  Google fontları) pakete koyar: uygulama internetsiz açılır ve oynanır. Oyunun uygulamaya özel tek kodu `js/native.js`:
  telefonun titreşimi (iOS'ta `navigator.vibrate` yok), Android geri tuşu (üstteki kartı kapatır, kart yoksa oyunu arka
  plana alır), kaydın uygulamanın kendi ayarlarında ikinci kopyası (web görünümünün deposu boşalırsa geri konur),
  analitiğin site adresi. Webde hiçbir şey yapmaz. Analitik uygulamadan da gelir: `collect.php` `https://localhost` ve
  `capacitor://localhost` kökenlerini kabul eder, panelde tarayıcı "App". Yayın adımları: `mobile/README.md`.

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
| `js/state.js` | kayıt (`fds_save_v1`), türetilmiş istatistikler, satın alma/yükseltme/işe girme/filo aksiyonları, enerji (`tickEnergy`, `useEnergy`, `buyCoffee`), gün saati, gerçek takvim (`calDay`, günlük hedef, haftalık kontrat, günlük hediye ve seri: `S.cal`) |
| `js/career.js` | başarımlar (istatistikten okunur, ödülü hemen verir) |
| `js/orders.js` | sipariş üretimi (bölge profiline göre mesafe ve tip karışımı, pano bölge filtresi), ücret, süre (`etaFor`: ölçülmüş otomatik pilot hızı × seviye payı), yıldız/bahşiş hesabı |
| `js/city/gen.js` | 45×45 karo şehir (4 bölge, yol segmenti silme, park/ara sokak kestirmeleri, parseller, restoran yerleşimi) |
| `js/city/graph.js` | A* (U dönüşü yok), şerit eğrileri (sağdan trafik), rota örnekleme |
| `js/city/view.js` | Kenney yol parçalarını chunk × malzeme birleştirme, asfalt/kaldırım shader'ı, binaları chunk'lara ekleme, çatı tabelaları, lamba ışık havuzları, deniz |
| `js/city/arch.js` · `archmat.js` | prosedürel mimari: her parsel bölgesine göre bina (Old Town cepheleri + dükkân, Downtown blok/kule, Harbor pastel ev/depo, Hills villa), tente, balkon, saksı, tabela atlası, şehir dışı sıraları + uzak gökdelenler, raylı viyadük, yön tabelaları; tek shader pencereleri/camı/kepengi/çatı kiremidini/tenteyi/gece ışıklarını çizer |
| `js/city/props.js` · `people.js` · `cars.js` | props.glb sokak eşyaları (tür başına InstancedMesh, kameraya göre doldurulur, uzak ağaçlar düşük poli), kafe müşterileri (Kenney karakterleri sabit poza pişirilir), oyuncak arabalar (instance boya rengi, gece farlar) |
| `js/city/backdrop.js` · `train.js` | ufuk dağları (sis renginde), doğu tepesindeki evler, körfez (mendirek + deniz feneri, iskele + dönme dolap), saat kulesi; viyadükte giden metro |
| `js/look.js` | renk derecelendirme (özel tone mapping: doygunluk, sıcak ışık/serin gölge, kontrast) ve parlak malzemeler için ortam haritası |
| `js/city/traffic.js` | instanced arabalar, trafik ışıkları, yayalar, filo kuryeleri (rider ajanları) |
| `js/ride/ride.js` | telefonun Kurye Koşusu, fren (`?ctl=b`) ve şerit koşusu (`?ctl=a`) prototipleri (§3 *Kurye Koşusu*, *Fren*), otomatik pilot ve STOP'u (`?ctl=stop`), masaüstünde serbest sürüş (fizik, çarpışma, GPS, varış halkası), güçler, sollama/kırmızıda geçme/kestirme, engeller, olaylar, teslim sahneleri, takip kamerası |
| `js/ride/world.js` | serbest sürüş için şehir: zemin (asfalt/kaldırım/çim ve yüksekliği), çarpılabilir her şey (10 m ızgarada), rota başlatılacak yol karosu |
| `js/ride/hazards.js` · `events.js` · `vehicle.js` · `ribbon.js` | engeller · olay kartları/QTE · motor + sürücü + kask · yol üstü ok şeridi |
| `js/ui/ui.js` + `css/game.css` | hub (üst bar, 5 sekme, alt panel), sürüş HUD'u, modallar, toast |
| `js/audio.js` | WebAudio: manifest'ten sesler, yoksa sentez; hızla perdesi değişen motor sesi; arka planda uyutulur, dönüşte (iOS'ta ilk dokunuşta) uyanır |
| `js/analytics.js` | anonim oyuncu kimliği (cihaz başına), oturum (sayfa açılışı ya da 30 dk+ arka plandan dönüş), olay kuyruğu, FPS örnekleri, hata yakalama; `track(ad, veri)` |
| `api/` | `collect.php` toplayıcı, `lib.php` şema + ingest, `config.php` (+ sunucuya özel `config.local.php`), `cli.php` (init / set-password / info / prune) |
| `admin/` | analitik paneli: `index.php` giriş + kabuk, `api.php` salt-okunur sorgular, `app.js` görünümler + SVG grafikler (isimleri oyunun `data.js`'inden alır) |

Test araçları (headless Chrome, swiftshader yavaş — `game.sim(sn)` render'sız ileri sarar, `game.skipTween()` kamera geçişini atlar):
`node tools/play.mjs` (bir teslimatı baştan sona oynar; `SIM=1.2 CTX=1 PRESS=boost`), `node tools/stop.mjs` (`?ctl=stop` otopilotunun STOP'u telefonda: ilk sürüş kartı, buton ve etiketleri, "Run it!" yok, kırmızıda basınca çizgide durup yeşilde devam, hiç dokunmadan kırmızı geçme + her birine kamera cezası, yaya ürkütme, kapıyı geçip geri dönme, dikkatli sürücü `game.ride.autoBot()` ile aynı siparişlerde kıyas; `JOBS=n`), `node tools/ctl.mjs [a|b|run|both|all]` (telefonun freni — `?ctl` olmadan varsayılan —, şerit koşusu ve Kurye Koşusu — basılı tutmak frenlemez, ↑ zıplar —: butonsuz HUD, basılı tut → fren, A'da kaydır → şerit, B'de kayan başparmak freni bırakmaz, B'de aynı siparişlerde dikkatli ve hiç dokunmayan sürücü kıyası (`PAIRS=n`), A'da draft → sapan ve kaldırım, kavşakta kaydırarak dönüş + GPS'in yeniden rotası, ışık geri sayımının döngüyle tutması, dikkatli sürücü botu `game.ride.schemeBot()` ile ve hiç dokunmadan tam teslimat), `node tools/tabs.mjs W H` (sekme görüntüleri),
`node tools/pause.mjs` (duraklatma: buton, Settings üstte, Resume, sayfa gizlenince, Esc / P, Android geri, kapıda bekleyen istek, iptal: ⚡ geri, 2★, fiş yok; analitik olayları), `node tools/keepriding.mjs` (sürmeye devam: kapı sahneleri butonsuz ve dokunuşsuz, puan kartı dokunuşları yola geçirir, fişte yakın sipariş, "ride on" hub'a dönmeden kapıdan başlar ve 1 ⚡ harcar, enerji yokken panel, kahveyle yeniden yanar), `node tools/energy.mjs` (enerji: START bedeli, yetmeyince sipariş/START yerine panel, zamanla ve kapalıyken dolma, kahve fiyatları ve günlük sınır, seviye/hedef/Dayanıklılık), `node tools/daily.mjs` (gerçek takvim, saat oynatılarak: gece yarısı yeni hedefler, hediye kartı açılışta ve geri gelince, seri artar, atlanan gün sıfırlar, pazartesi yeni kontrat, oyun günü bitince hiçbiri değişmez, geri alınan saat iki kez vermez, eski kayıt hedeflerini korur), `node tools/sweep.mjs` (9 ekran boyutunda taşma/çakışma), `node tools/shot.mjs <yol> <png>`, `node tools/look.mjs <önek> <görünümler>` (sokak seviyesi görüntüler: `oldtown`, `harbor2`, `x:z:yön`, `rest-bean`, `cam_x_y_z_tx_ty_tz`, `ride5`; `CLOCK=900`, `EVAL=…`), `node tools/speed.mjs <bölge> <araç,araç> [n]` (bir sürüşün gerçek ortalama hızı — süre kalibrasyonu için; telefonda fren, `CTL=stop|a` başka sürüş, `BOT=1` dikkatli sürücü, yoksa hiç dokunmadan; `BOOST=1` turbo ile). URL: `?fps` FPS sayacı, `?clock=1260` gökyüzü saati, `?noti` hoş geldin yok, `?energy=off` enerji harcanmaz (çok iş süren testler).
Reklam klibi: `node tools/fleetclip.mjs [oyun-kökü] [çıktı.mp4]` — 9:16, iki bölüm. Önce kurye sensin: 1. gün kaydında külüstürle
sürüş, gerçek "Engine stalled!" olayı + KICK, kapıda 5 yıldızlı teslim (aradaki yol `game.sim` ile kesilir; acelesi olan oyuncu gibi
turbo + kırmızıda geçiş, sipariş geç kalmasın). Sonra filo: tek kuryeden dört bölgede 10 kuryeye, gün batımı, oyunun kendi
"Your drivers kept working!" ekranı, bitiş kartı. Sanal zamanda kare kare; ekrandaki her şey oyunun kendisi, sayılar formüllerinden
(`fleetPerMin`, `ui.offline`); ses sürüş + hub müziği ve oyunun efektleri. `SCALE=3` 1080x1920, `STILLS=30,300` yalnız o kareler, `AUDIO=0` sessiz.
Trend edit (Tame Impala "Loser", doomer → hopecore; organik paylaşım için): `node tools/loserclip.mjs [çıktı-klasörü]` sahneleri
çeker, her biri kendi klasörüne, anahtar anları (kamera flaşı, dokunuş, yıldızlar) `<sahne>.json`'da. Doomer: 1. gün, 23:47, yağmur,
külüstür (gece sürüşü, motor stop, kırmızıda kamera cezası, kapı). Hopecore: haftalar sonra Vespetta ile (teyzeyi bekle, PERFECT STOP,
ketçap, hayran selfie'si, 5 yıldız), gün batımında filo, bitiş kartı. Oyun baştan sanal zamanda koşar (her çekim aynı çekim);
kırmızı ışık sahneleri sıradaki ışığın döngüsünü bize kırmızıya denk getirir (`redAhead`). `node tools/losercut.mjs [şarkı] [klasör]`
şarkının vuruşlarını çıkarır (`tools/beats.py`, librosa) ve sahneleri vuruşa keser (her sahnenin anahtar anı bir vuruşa düşer;
dönüş `CUT=chorus` ile nakarata, "I'm a loser, babe"ye (varsayılan), `CUT=bridge` ile köprüden sonra groove'un değiştiği yere,
`TURN=<sn>` ile elle; ikisinde de bitiş kartı şarkının boşa düştüğü ölçüde), doomer / hopecore renk ayarı, küçük harf altyazılar.
Çıktı: sessiz `loser-edit-<cut>.mp4` (şarkı uygulamada eklenir, başlangıç saniyesini araç yazar) ve kontrol için şarkılı
`loser-preview-<cut>.mp4`. Varsayılan
klasör web kökünün dışında (`/var/www/vhosts/mithatck.com/fds-trailer`): şarkı ve şarkılı önizleme asla bu klasöre (yayında) girmez.

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
- 2026-10-21: paket 3–6 (ödül dengesi, işverenler, filo, geç oyun). Mantık `state.js` + `career.js`, veriler `data.js`.
  - **Ödüller:** günlük hedef ≈ 2 teslimatlık para (`typicalPay()` = en iyi bölgedeki tipik teslimat ücreti; eskiden ~5 teslimat).
    Her seviye atlayışı ≈ 4 teslimatlık nakit bonus verir. Yakıt fiyatları ×3 (Külüstür $3,3/km; Volt'un ucuzluğu artık hissediliyor).
  - **İşverenler:** her bölgede rütbe (Rookie → Regular 15 teslimat ★4,2 → Pro 50 ★4,5 → Star 120 ★4,7), o bölgenin
    siparişlerine +%5/10/15 ücret ve +%5/10 bahşiş. Bölgedeki son 20 puanın ortalaması bölge şartının altına düşerse deneme
    süresi (avantajlar durur), 0,4 altına düşerse o gün askıya alınma (o bölgeden sipariş gelmez). Jobs kartında rütbe çubuğu.
  - **Filo:** pasif gelir ×0,45 (sürüşün altında kalsın), sen sürerken ×1,3 ("yolda dağıtım"). Günlük maaş = kuryenin
    10 dakikalık kazancı (gün sonunda önce kasadan, sonra nakitten; ödenemezse en zayıf kurye ayrılır). Ortalama 45 dakikalık
    filo zamanında bir karar: kaza (tamir / yedeğe al), zam isteği (+%5 pay / ayrılır), catering işi (peşin para + 1 saat ×2,5),
    yıldız kurye (kurs → +1 beceri). Bekleyen karar Fleet sekmesinde kırmızı nokta.
  - **Geç oyun:** 22 başarım (Courier sekmesi; ödül nakit ya da özel boya; eski kariyerler ilk açılışta toplu alır),
    5 oyun günü süren haftalık sözleşme (3 büyük hedef + üçü bitince premium boya), 7 premium boya (metalik/parlayan; Garage'da
    satın alınır ya da kazanılır; motor, kutu ve kaskta), kayıt kodu (Ayarlar → Copy / Load save code: cihazlar arası taşıma).
- 2026-10-21: parçacık efektleri yeniden yazıldı (`ride/fx.js`). Kodla çizilen tek sprite sayfası (çizgi film duman bulutları,
  alev dili, kıvılcım çizgisi, parıltı, yıldız, $'lı altın para, banknot, su damlası, halka, konfeti, moloz, rüzgâr çizgisi,
  "POW" patlaması, kalp) + iki instanced çizim (normal + toplamalı). Parçacıklar kameraya döner, döner/para gibi takla atar,
  hız yönünde uzar (kıvılcım, damla) ya da yere yatar (su halkası, toz halkası); duman gece kararır.
  Efektler: egzoz (külüstürde siyah duman + ara sıra geri tepme), katmanlı turbo alevi + kor (elektrikte mavi plazma),
  turbo başlangıç halkası, zıplama kalkış/iniş tozu (mükemmelde yıldız + parıltı), su birikintisi (halka + damla + sis),
  çukur (toz + moloz), kaza (POW + kıvılcım + moloz + başın etrafında dönen yıldızlar), para/enerji alma, motor arızası,
  kıl payı rüzgâr çizgileri, kapıda 4–5 yıldızda konfeti/kalp/bahşiş paraları, fren izinde lastik dumanı, yağmurda teker spreyi.
  Test: `node tools/fxshots.mjs` (her efektin ekran görüntüsü).
- 2026-10-21: arayüz "D2 · Rozet" görünümüne geçti (renkler, fontlar ve 3D ikonlar aynı; `css/game.css` + `ui/ui.js`).
  Açılış logosunun koyu konturlu yazısı oyun geneline taşındı. Üst bar: avatar + altın seviye kalkanı + isim/XP çubuğu,
  ikonu kenardan taşan para sayacı; altında saat rozeti (gece ay ikonu), yoğun saat/yağmur kurdeleleri, puan sayacı.
  Alt sayfanın üst kenarında sekme adı kırmızı kurdelede (sürüklenebilir), aktif sekme yükselen altın daire. Sipariş kartı:
  karttan taşan yemek tabağı, rozetler isim yanında, mesafe/süre/tahmin çipleri, para etiketi + "Take" butonu, kalan süre
  kartın alt kenarında. Start çubuğu tek büyük yeşil buton (sipariş sayısı kırmızı balonda). Harita işaretleri altın çerçeveli
  yuvarlak tabak; "You" ve müşteri avatar + etiket. Sürüş: taşan yemek/müşteri tabağı, mesafe altın hap, süre altın
  kronometre (kalan süre halkası `--p`), sıcaklık/kutu dikey tüpler (`--v`), harita altın çerçeve, akış logo yazısıyla,
  hız yay göstergesi, turbo halkası parçalı (`--e`). Fiş kutlama ekranı (kurdele, kavisli yıldızlar, büyük tutar,
  seviye kalkanları arası XP çubuğu), seviye atlamada büyük kalkan + kurdele, gün sonu kurdele başlık.
  Test: `node tools/d2shots.mjs` (yemek alınmış sürüş, puan kartı, seviye atlama, yemek alma kartı, fişin ortası ve
  uçan paralar, bildirimler, ilk açılış intro'su).
  - D2 cilası (aynı gün): kalan ekranlar da D2'de. Olay kartı lacivert + altın çerçeve, başlık kurdelede, ikon taşan tabakta;
    yemek alma/teslim kartında "PICK UP"/"DELIVERY" kurdelesi ve yuvarlak tabaklar; intro ve tüm pencere başlıkları açılış
    logosu gibi altın + koyu kontur, pencereler altın çerçeveli; Garage/Courier/Jobs/Fleet kartları sipariş kartı gibi
    kabartmalı; bildirimler oyun butonu gibi (yeşil/kırmızı/sarı, konturlu). Büyük butonlarda yazı kendi renginde konturlu.
  - Hareket: Collect / hedef ödülü / filo kasası / seviye bonusunda paralar butondan para sayacına uçar; sayaç yeni paraya
    doğru sayar ve zıplar (harcamada anında düşer). Fişte tutar sıfırdan sayar, yıldızlar sırayla patlar, XP çubuğu dolar;
    kurdeleler açılırken fırlar (sekme değişince de), seviye kalkanı yukarıdan düşer, aktif sekme dairesi zıplar,
    son 10 saniyede kronometre sallanır, START butonundan parlama geçer. `prefers-reduced-motion` hepsini kapatır.
- 2026-10-22: sürüşte yukarı kaydırarak zıplama kaldırıldı (yukarı sürükleyip kamerayı oynatmakla çakışıyordu); zıplama
  artık yalnızca HOP butonu. Sola fiske = sollama duruyor; top olayındaki "yukarı kaydır" görevi de aynen duruyor.
- 2026-10-22: masaüstünde manuel sürüş: W/S gaz-fren, A/D şerit + kavşakta yön seçimi (GPS aynı kapıya yeniden
  rota çizer; `replaceRoute` kestirme ile ortak), virajda hız uyarısı/kayma/kaza, öndeki arabaya ve park etmiş araca
  çarpma, park etmiş araçta "Go round A" ipucu. Ayarlar'da *Auto-drive* anahtarı (yalnızca dokunmatik olmayan cihazda).
  Test: `node tools/manual.mjs` (1280x720, dokunmasız; bir sürücü işi baştan sona bitirir). Dokunmatik testler
  (`play`, `onboard`, …) otomatik sürüşte kalır; `sweep`'in masaüstü boyutları artık manuel.
- 2026-10-22: analitik backend + admin paneli (§10).
- 2026-10-23: motor hissi paketi (telefon + masaüstü). Gövde yaylı süspansiyonla eğiliyor: frende burun dalar, gazda
  arka çöker, durunca küçük bir sekmeyle oturur; tekerlekler yerde kalır (arka dikey, ön çatal ekseninde sıkışır).
  Turbo kalkışında ön kalkar (spor motorda gerçek wheelie). Tümsek/iniş = yay sekmesi + kameraya aşağı tekme
  (eski rastgele titreme yalnızca kazada). Sürücü virajda gövdesini içeri atar, frende öne, gazda geriye kayar.
  Kamera: gazda geride kalır, frende yaklaşır; yatışın %15'i kadar ufuk eğilir; hızla artan ince yol titreşimi;
  ivmede FOV açılır. Ses: gaz açıkken motor parlak/yüksek, kapalıyken boğuk (lowpass); hızla artan yol uğultusu ve
  rüzgâr (gürültüden sentez, telefon hoparlöründe motorun 4–11 dB altında); motor örnekleri enerjisinin neredeyse
  tamamını telefon hoparlörünün çalamadığı 400 Hz altında tutar, bu yüzden scooter/spor/kargo motoru `tanh` ile yumuşak
  kırpılır (üst harmonikler; moped zaten parlak, elektrik temiz sentez); manuelde viraj sınırında lastik sesi; yüksek
  devirde gaz kesilince egzoz patlaması
  (spor motorda bol); sert frende `brake` sesi + kısa titreşim. Otopilot: kalkışta güçlü, tepe hıza yaklaşınca
  yumuşar (ortalama hız eskisiyle aynı tutuldu: `SEED=n node tools/speed.mjs`), fren birkaç onda birde oturur, son
  metre yumuşak durur. Önce/sonra klibi: `node tools/feelclip.mjs <oyun-kökü> <çıktı.mp4>` (sanal zaman, 360x640).
- 2026-10-23: düzeltme: masaüstü manuel sürüşte restoranın birkaç metre önünde durunca alım başlamıyordu (varış
  kapıya 0,6 m kala tetikleniyor, gazsız motor kıpırdamıyordu). Son 9 m'de fren basılı değilse motor kapıya yanaşıyor;
  `tools/manual.mjs` bunu test ediyor.
- 2026-10-23: alım/teslim bug taraması (`node tools/legs.mjs [touch|desktop|both]`: tek/çoklu sipariş, aynı restoran,
  üç restoran, aynı kapıya iki sipariş, restoranın önünden başlama, kapıda olay kartı, kapıda zıplama, manuelde karşı
  şeritte varış, karakter indirmesi yavaş/başarısız). Düzeltilenler:
  - Telefonda müşteri karakteri (12'den 7'si önceden yüklenmiyor, ~250 KB) kapıya gelince indiriliyordu: kart indirme
    bitene kadar açılmıyordu, indirme başarısızsa oyun sahnede sonsuza dek takılıyordu (yemek alınamıyor/teslim
    edilemiyor). Artık işin karakterleri sürüş başında yükleniyor, kapıda 2 s içinde hazır değilse sahne NPC'siz
    sürüyor; başarısız indirme önbellekte kalmıyor (sonra tekrar denenir).
  - Zaten kapıdaysan (aynı binaya iki sipariş, restoranın önünden başlama) motor bir karo ileri gidip sahneyi kapıdan
    11–15 m uzakta yapıyordu; artık sahne olduğu yerde.
  - Olay kartı açıkken kapıya varınca alım kartı onun üstüne açılıyordu; varış kart kapanana kadar bekliyor. Yeni rota
    (manuel kavşak/kestirme) olayı son 30 m'ye taşıyorsa olay iptal.
  - Kapıda zıplayınca sahne motor havadayken başlıyordu; inişi bekliyor.
  - Manuelde karşı şeritte kapıya varılabiliyordu; son 12 m'de (önünde park etmiş araç yoksa) kendi şeride dönüyor.
  - Manuelde virajın hemen önüne park etmiş araç varsa A ile dolaşılamıyordu ("viraja 9 m kala şeride dön" kuralı
    şerit değişimini anında iptal ediyordu) ve motor sonsuza dek arkasında bekliyordu; artık aracı geçene kadar karşı
    şeritte kalınıyor (otopilot gibi).
- 2026-10-23: düzeltme: müşteri motora yürürken "Complete Delivery"ye basılınca sevinme/üzülme animasyonu hemen
  başlıyor, karakter yürümeden kayarak geliyordu; artık yürümeye devam edip motora varınca tepki veriyor. Restoran
  çalışanı poşeti taşırken de kayıyordu ('holding-both' yalnızca kol pozu); yükleme sırasında üretilen 'walk-hold'
  klibiyle bacaklar yürüyor, kollar poşeti tutuyor. Poşet de hiç görünmüyordu (food kiti yüklenmiyordu): sürüş başında
  arka planda yükleniyor (~390 KB), hazır değilse çalışan poşetsiz geliyor. `tools/legs.mjs` artık yürüme animasyonu
  olmadan 0,6 m'den fazla kayan karakteri hata sayıyor.
- 2026-10-24: "Confirm Pickup"a erken basılınca çalışan motora varmadan dönüyor, poşet elinden yolda kayboluyordu;
  artık önce motora geliyor, poşet orada bagaja giriyor. Bekleme oyun zamanıyla ölçülüyor, yavaş telefonda da poşet
  motorun yanında veriliyor. `tools/legs.mjs` poşetin motordan 2,4 m'den uzakta verilmesini hata sayıyor.
- 2026-10-25: masaüstünde tam serbest sürüş (kullanıcı: "sürüşte hâlâ ray üzerinden yapıyoruz"). Motor artık rotaya
  bağlı değil: A/D direksiyon, S ile geri vites, dururken yerinde dönüş; binalara, sokak eşyalarına, arabalara ve yayalara
  dünyada çarpılıyor (`ride/world.js`); rota yalnızca GPS, rotadan çıkınca yeniden çiziliyor; kapıda parlayan halkada durunca
  sahne başlıyor. Eski şerit/kavşak seçimi ("Go round A", kavşak okları) kaldırıldı. Telefon/otomatik sürüş aynı.
  Ayar yolculuk ortasında değişirse bir sonraki işte geçerli. İlk serbest sürüşte yeni tuş ipucu (`seen.freeTip`).
  Test: `node tools/manual.mjs` (tuşlar, direksiyon, geri vites, duvarda durma, GPS'in yeniden rotası, baştan sona iş),
  `node tools/legs.mjs desktop` (karşı şeritte ve kaldırımda durma dahil). Testlerdeki sürücü `game.ride.bot()`.
- 2026-10-25: şerit + fren prototipi (QA: "turbo buton falan olmadan tüm mekaniği sağ sola geçme ve fren üzerinden
  kurgula"). Üç dinamik konuşuldu: A Şerit Koşusu (trafikte kıvrılmak), B Geç Fren (viraj/ışık/kapı zamanlaması),
  C Sallanan Yük (siparişler motorun arkasında sallanan bir yığın; yapılmadı). A ve B `?ctl=a|b` ile her cihazda
  denenebilir (§3). Ortak katman: gaz hep açık, basılı tut = fren, kaydır = şerit; turbo/HOP/korna/bağlam butonları, serbest
  bakış ve otomatik sollama kapalı; motora fren lambası (eski modlarda da otopilot frenlerken yanar). Admin "Sürüş modları"
  tablosu otomatik / elle / prototip A / prototip B'yi yan yana gösterir.
  Bot ölçümü (`tools/ctl.mjs`, Vespetta, Sv 6, Old Town/Downtown): dikkatli sürücü A'da teslimat başı ~45–70 sn, 15–25 sn
  fren, 4–16 şerit değişimi, 4–5★; B'de ~55–120 sn, iş başı 1–4 kusursuz viraj ve 2 kusursuz duruş, 3–5. vites, çoğu 4★.
  Hiç dokunmadan: A'da kırmızıları geçip öndeki arabalara çarparak bitiriyor (iş başı 0–4 kaza, 3–5 kırmızı, yemek çoğu
  zaman perişan, 1–4★); B'de 4–6 kaza, 3–6 dışa kayma, her kapıyı geçip geri dönüyor, 2★. Kilitlenme yok (park etmiş aracın
  arkasında 6 sn sonra kendisi dolanır, kapıyı geçince geri döner; sola dönüşte bordüre kayan motor viraj içinde takılı
  kalıyordu, düzeltildi). Açık sorular (QA'ya): kırmızıda beklemek için parmağı basılı tutmak yorucu mu; A'da fren yapmadan
  sürmenin cezası yeterli mi; süreler (`etaFor`) eski otopilota göre ölçülü, iki şemada geç/erken oranı admin panelinden izlenmeli.
  - Aynı gün, 2. tur (kullanıcı: "dönüş kaydırma ve ışık ritmini yap"): kavşakta kaydırarak dönüş (varsayılan GPS, çıkışlar
    fiyatlı) ve sinyal direğinde geri sayım, ikisi de her iki şemada (§3). Eski `chooseExit` (d1e5a94) fikri, şimdiki
    `replaceRoute` ile. Gerekçe: kırmızıya "bekle / geç" dışında üçüncü seçenek (sağa sap, dolaş); B'nin vitesleri ve yeşil
    dalga buna yaslanır; kestirmeler ayrı buton olmaktan çıkma yolunda (şimdilik alley ipucu duruyor). Konuşulup
    yapılmayanlar: polis kovalamacası (kırmızıda geçmenin bedeli), aynı siparişe rakip kurye, dur kilidi, telefon eğerek
    direksiyon.
- 2026-10-26: otopilotta **STOP** (kullanıcı: "kırmızıda kendiliğinden durmasın, STOP butonu çıksın; dokunmadan
  bitirilebiliyor, net ama yumuşak engeller koy"). Motor kırmızıda, geçen yayada ve kapıda artık kendisi durmuyor; üçü de
  tek butonla (§3 *STOP*). "Run it!" ve otopilotta sarı ışık kartı kalktı, kapıyı geçen motor geri geri döner. Şerit +
  fren prototipleri ve masaüstü serbest sürüş değişmedi.
- 2026-10-27: kırmızıyı geçmenin bedeli sahnelenmiş çapraz trafikti (yan yola araba gönderilir, frene asılır, motor yarı
  hıza düşer); kullanıcı "yalandan" buldu. Yerine her kırmızıda patlayan kamera (küçük ceza, ilk iki teslimatta uyarı);
  çapraz trafik yine şehrin kendi trafiği. Aynı kavşakta tekrarlayan "T-boned" çarpışması da düzeldi (§3 *STOP*).
- 2026-10-28: **telefonda tek fiil fren** (denetim raporu "ustalaşılacak tek bir hareket yok" dedi; önerim basılı tut =
  fren, kullanıcı: "yap"). B prototipi telefonun ve masaüstü *Auto-drive*'ın varsayılanı; STOP otopilotu `?ctl=stop`
  arkasına, şerit koşusu `?ctl=a`'da kaldı (§3 *Fren*). Frende yayalar ve yoldaki çukur / su birikintisi de oyuncunun
  (SMOOTH; çift park ve yol çalışması frende koni), her kırmızıya kamera, kayan başparmak freni bırakmaz. Turbo
  olmadığı için frende süreler Sv 10'dan sonra daralmıyor ve Rush / VIP / Express'in sıkıştırması yarıya iniyor
  (`orders.js` `setTimerRide`). Bütün sürüşlerde: ışık çizgiden en fazla 0,5 sn önce kırmızıya döndüyse sarıda
  girilmiş sayılır. Admin "Sürüş modları": "Fren (B)" / "Otomatik (STOP)".
  Ölçüm (`PAIRS=4 tools/ctl.mjs b`, Vespetta, Sv 6, aynı 4 sipariş, olaylar kapalı, her bacakta bir yaya): dikkatli
  sürücü (`schemeBot`) 3,3★, yemek %84, ortalama $55, 82 sn; 0 kaza, 0 kırmızı, 0 ürkütülen yaya, 0 kapı kaçırma; iş başı
  2–5 kusursuz viraj, 2 kusursuz duruş, 1–3 yeşil dalga, 1–6 SMOOTH. Hiç dokunmayan: 2,5★, yemek %33, $37,5, 75 sn;
  21 kaza (hepsi "Took the corner too fast!"), 24 dışa kayma, 11 kırmızı (11 kamera cezası), 8 kapı kaçırma. Dokunmayan
  daha hızlı değil (kazalar yediriyor). Açık: dikkatli sürücü 4 siparişin 2'sinde geç (kısa rotalar, %140 ve %155;
  zorla konan yayalar ve kırmızı ışık şansı sabit 6 sn'lik payı aşıyor) — testin "zamanında" maddesi bu yüzden FAIL.
  Şerit koşusu (`tools/ctl.mjs a`), STOP (`tools/stop.mjs`) ve serbest sürüş (`tools/manual.mjs`) testleri hatasız.
- 2026-10-29: **Kurye Koşusu** (`?ctl=run`, kullanıcı: "bu dönüşlerin de hızını ayarlama olayını hiç sevmedim ya, biraz
  subway surfers, temple run gibi oyunlardan ilham alalım" → "Kurye Koşusu yap"; §3 *Kurye Koşusu*). Fren yok, her şey
  kaydırma: ← / → şerit, ↑ zıpla (kırmızıda: geç), kavşakta sokak; otopilot tempo, viraj, kendi şeridinde mesafe ve
  kırmızı; şeritlerde para sıraları; yemek can barı, sıfırda sipariş bozulur. Telefonun varsayılanı hâlâ fren; koşu
  beğenilirse varsayılan olur. Aynı işte her şeritli sürüş için düzeltme: karşı şeritte bir araçla burun buruna kalan
  motor sonsuz kafa kafaya çarpışma döngüsüne girip kilitleniyordu (dokunmadan sürüşte 380 sn); artık durana kaza yok,
  kazadan sonra karşıdan gelenler durur, sıkışan motor geri çekilip şeridine girer, otopilot dolanışa ancak ışıktan önce
  bitecekse çıkar. Test: `tools/ctl.mjs run`, `CTL=run tools/speed.mjs`; fren ve şerit koşusu testleri yeniden hatasız.
- 2026-10-29: Kurye Koşusu, kullanıcı: "kırmızıda geçemiyorum". Işık kavşağın ağzında, kırmızıda beklerken dönüş penceresi
  açık olduğundan ↑ "düz git" sayılıyordu: GPS dönüyorsa rota değişiyor, düz yolu olmayan T kavşağında motor yalnız
  sallanıyordu; ışıkta bekleyen bir arabanın arkasında da kaydırma şerit değil dönüş seçiyordu. Artık kırmızıda ↑ (ve
  GPS'in yönü) geçer, kuyruktaysan kaydırma şerittir. Kırmızıda 37 kez ↑ (kuyrukta önce karşı şerit): 37'si de geçti
  (önce: 13'ün 10'u). `tools/ctl.mjs run` artık bunu da sınıyor ("red light job").
- 2026-10-30: **Kurye Koşusu: yol kendini sürer, trafik oyuncunun** (kullanıcı: "yol auto drive olsun, şeritlerde sağ
  sol yapmak zorunda kalalım, araba sıklığı artsın gerçek hayattaki gibi… frenleme butonu olsun hem ışıklarda hem de
  çarpışma önlemek için"; §3 *Kurye Koşusu*). Otopilot yalnız tempo, viraj ve kapı; öndeki araba, park etmiş araç, yaya ve
  kırmızı ışık oyuncunun: sağ altta BRAKE butonu ya da şerit. Rotanın çevresi kalabalık (`denseTick`: önümüzdeki 160 m'de
  ~4 araba bizim yönde, ~3 karşıdan). Kırmızıda ↑ ile geçme kalktı (frenle dur ya da geç). Kaydırma hep şerit; kavşakta
  başka sokak için oka dokunulur. Yeni kartlar ve ipuçları (`lbTip_run2`, `c_run_onc`). Trafikte bulunan beş hata
  (köşeden gelen arabanın duran motoru görmemesi, duran arabaya kaza yazılması, dönen arabanın "karşıdan gelen" sayılması,
  karo sınırındaki arabayı görmeyen şerit kontrolü, kendiliğinden şeride dönüşün öndeki arabaya bakmaması) her şeritli
  sürüşte düzeldi. Süreler: koşu da frenin sürelerini alır; frende ve koşuda sabit pay 6 → 12 sn. Test: `tools/ctl.mjs
  run` (BRAKE butonu, kırmızıda fren, kavşakta kaydırma şerit / ok dönüş, trafik yoğunluğu, dokunmayan sürücü kaza ve
  ceza), `CTL=run BOT=1 tools/speed.mjs`.
- 2026-10-30: Kurye Koşusu'nda kavşak okları ve alttaki üç kutulu şerit göstergesi kalktı (kullanıcı: "ortadaki yol
  seçeneğini kaldır ve aşağıdaki 3 kutulu lane olayını da kaldır göstergesel"). Dönüşleri hep GPS alır; draft barı kalır.
  Işık ipucu artık "başka sokağa sap" demiyor. Test: `tools/ctl.mjs run` kavşaktan oksuz geçildiğini ve HUD'da şerit
  kutusu olmadığını sınar.
- 2026-10-30: Kırmızıyı geçmek artık her seferinde ceza değil (kullanıcı: "not all red lights should give a fine, make it
  random with weighted distrubition to districts"). Her kırmızı geçişte bölgenin şansıyla kamera çıkar (`DPROFILE.cams`:
  Downtown %70, Harbor %45, Old Town %35, Green Hills %20). Bu şans her sürüşte aynı: serbest sürüşteki sabit %22 de
  kalktı. Kamera yoksa ceza yok ("No camera at this one — lucky!"). Fren, Kurye Koşusu ve STOP'ta Flow yine biter. Koşunun ilk
  sürüş kartında unutulan "kavşakta oka dokun" satırı da çıktı. Testler (`tools/ctl.mjs`, `tools/stop.mjs`) kamera
  şansını 0 ve 1'e sabitleyip iki ucu sınar.
- 2026-10-30: Kurye Koşusu'nun yuvarlak kırmızı BRAKE butonu gerçekçi bir fren pedalı oldu (kullanıcı: "change stop
  button to a realistic pedal"; §3 *Kurye Koşusu*).
- 2026-10-30: **Enerji** (kullanıcı: "lets add energy mechanic, we will need this to take a job. think about its filling
  mechanics and spending economics yourself to be fitted as a mobile game"; §2). Sipariş başına 1 ⚡, 6 dakikada 1 dolar,
  depo 10 (+2 Dayanıklılık seviyesi başına), seviye atlayınca dolu depo, günlük hedef +2, kahve +5 (artan fiyat, günde 3).
  Üst barda ⚡ çipi ve geri sayım, START barında bedel, enerji paneli ("Out of energy!"), seviye kartında "Energy full",
  hedef butonunda +2 ⚡. Dayanıklılık becerisi telefonda da işe yarıyor. Analitik: `energy_out`, `buy` (`k: 'coffee'`),
  `job_start.energy`. Çok iş süren test araçları `?energy=off` ile koşar. Test: `tools/energy.mjs`.
- 2026-10-30: **Kurye Koşusu telefonun varsayılanı** (denetim raporundan çıkan yol haritasının 1. maddesi "tek sürüşe
  karar ver ve onu varsayılan yap"; kullanıcı: "Kurye Koşusu"). Telefonda ve masaüstü *Auto-drive*'da `scheme()` artık
  `'run'`; fren `?ctl=b` prototipi oldu (sağ altta "Prototype B · brake"), koşunun "Prototype" etiketi kalktı. Yeni
  oyuncunun ilk iki teslimatında koşunun trafiği daha seyrek (yarı, sonra dörtte üç; olay ve engellerdeki `tutorial`
  gibi). Fren ipucunu görmüş oyuncu ilk koşusunda koşunun ipucunu bir kez görür. Reklam/klip araçları (`feelclip`,
  `fleetclip`, `loserclip`) frenle çekildiği için `?ctl=b` ile sabitlendi. Admin: sürüş modları notu güncellendi.
  Onboarding testinde bulunan iki şey: (1) hiç dokunmadan sürülen rehberli ilk teslimat koşuda "food ruined, −$0.74" ile
  bitiyor, rehberin ilk yükseltmesi alınamıyordu → ilk teslimatta yemek en kötü %35'te kalır (yıldız düşer, ücret
  kalır; `ride.js` `foodFloor`); (2) koşunun ilk sürüş kartı 360×560'ta ekrandan taşıyordu → kısa ekranlarda üstteki
  ipucu kartı 64 px'ten başlar ve kendi içinde kayar.
- 2026-10-30: Kamerasız kırmızıda "No camera at this one — lucky!" yazısı kalktı (kullanıcı: "dont print no camera at
  this one lucky text in red lights without a fine, no need to say anything"); kamera yoksa hiçbir şey yazmaz.
- 2026-10-30: **Sürmeye devam** (denetimden çıkan yol haritasının 2. maddesi, kullanıcı: "1. maddeyi yap"): kapıda
  "Confirm Pickup" / "Complete Delivery" dokunuşları kalktı (sahne kendiliğinden oynar, rehberin 3. ve 4. adımı el
  işaretsiz anlatır), teslimat arası puan kartı sürüşü durdurmuyor, son puan kartı 2,3 sn + dokunuş yerine 1,3 sn, fişte
  kapının yakınındaki sipariş ("Collect & ride on", 1 ⚡; rehber sürerken ve gün biterken yok), kamera uçuşları ~%30 kısa
  (§2 *Sürmeye devam*). Klip araçları (`fleetclip`, `loserclip`) kapı sahnesini artık tıklamadan izliyor. Yeni test
  `tools/keepriding.mjs`; `tools/sweep.mjs` fişi teklifle de ölçüyor.
- 2026-10-31: **Mağaza uygulamaları** (kullanıcı: "let's make a React Native mobile app version of this game, because I
  want to distribute this game in Google Play and App Store"). React Native bu three.js + DOM oyununu ancak bir WebView
  içinde ya da baştan yazılarak çalıştırabileceği için kullanıcı Capacitor'ı seçti: `mobile/` (§6). Simge kurye ile
  kırmızı Vespetta (`tools/blender/vehicles_render.py --mode appicon`, `mobile/scripts/icon.py`), açılış ekranının gün
  batımı renkleri. Emülatörde (Android 15) denendi: açılış, fontlar, WebGL, titreşim, kaydın geri gelmesi, geri tuşu,
  arka plana alınca analitik, sürüşte gerçek dokunuşla fren ve şerit. Bulunan iki şey: (1) `sendBeacon` kimlik bilgisiyle
  gider, `collect.php` başka kökene `Access-Control-Allow-Credentials` demiyordu (gömülü sayfalarda da kayıptı) →
  eklendi; (2) yavaş bir karede hızlı bir kaydırma `pointermove`'suz `pointerup` olarak geliyordu ve şerit değişmiyordu
  → parmak kalkınca da bakılıyor (`main.js` `slide`).
- 2026-11-01: **Gizlilik** (Linear MIT-11, kullanıcı: "lineardaki MIT-11 yap"; iki mağaza da gizlilik politikası adresi
  istiyor). `privacy/index.html` → `mithatck.com/food-delivery-sim/privacy/`, İngilizce + Türkçe (tarayıcının diline
  göre, `#en` / `#tr`). Oyunda: tanıtımın ilk sayfasında küçük bir not; tanıtımı görmemiş eski kariyerlere bir kerelik
  "Your privacy" kartı (`S.seen.privacy`); Settings'te **Share play data** anahtarı, Player ID ve politika bağlantısı
  (uygulamalarda telefonun tarayıcısında açılır). Saklama süresi, IP silme, `forget` ve Apple'a bildirilenler: §10.
- 2026-11-01: **Duraklatma menüsü** (Linear MIT-9; rapor §08: 28 Ekim'de 53 oturumun 13'ü sürüşün ortasında bitti).
  Sürüşte duraklatma ve siparişi iptal etme (§5). Android'in geri tuşu sürüşte artık oyunu arka plana atmıyor, menüyü
  açıyor: `native.js` önce `appback` olayını yollar, oyun onu alırsa uygulama küçülmez. Analitik: `pause`, `ride_cancel`.
  Test: `tools/pause.mjs`.
- 2026-11-01: **Gerçek takvim** (Linear MIT-10; denetim yol haritasının 5. maddesi). Günlük hedefler yerel gece
  yarısında, haftalık kontrat pazartesi yenilenir (`CONTRACT_DAYS` kalktı); 7 günlük giriş serisi ve günlük hediye; saat
  geri alınınca takvim bekler (§2 *Gerçek takvim*). Eski kayıtlar güncellemede hedeflerini ve kontratlarını bugünün / bu
  haftanın olarak korur. Bulunan bir şey: kontrat ilerlemesi haftayı yenilemiyordu (sürüş pazartesiye geçerse eski haftaya
  yazılırdı) → `weekProgress` artık `ensureWeek`'ten geçiyor. Analitik: `streak`, `daily_gift` (admin oturum akışında
  "Günlük hediye" / "Seri koptu"). Enerji panelinde "Daily gift · up to +10 ⚡" satırı. Test: `tools/daily.mjs`;
  `tools/sweep.mjs` hediye kartını da ölçüyor.
- Bilinen eksikler / sonraki adımlar: gerçek telefonda FPS ölçümü (otomatik kalite düşürme var), olay kartlarındaki
  karakterlerin dünyada görünmesi (büyükanne, köpek), müzik seçimi, Harbor iskeleleri, denge ayarı (ilk 30 dakika).

## 10. Analitik

Oyun olaylar yollar; panel `mithatck.com/food-delivery-sim/admin/` (tek şifre). Oyuncu = cihazdaki rastgele `fds_pid`,
isim = oyuncunun oyunda girdiği kurye adı. Her oturumla **IP adresi** (oturumun ilk adresi; oyuncuda son adres) ve cihaz bilgisi
saklanır: tür, model, OS ve tarayıcı sürümü. Model önce tarayıcının client hint'inden (`navigator.userAgentData`, Android
Chrome), sonra uygulama içi tarayıcı etiketlerinden (Instagram, Facebook `FBDV`), sonra Android UA'dan; iPhone'da ekran
boyutu + piksel oranından tahmin (`≈`). IP kişisel veridir (KVKK/GDPR); oyuncuya ne toplandığını `privacy/` sayfası
anlatır. O sayfa, `mobile/ios/App/App/PrivacyInfo.xcprivacy` ve mağaza formları (`mobile/README.md`) aynı şeyi söylemeli:
toplanan veri değişirse üçü birlikte değişir.
Site bir proxy/CDN arkasına girerse `api/config.local.php`'de `ip_header` ayarlanmalı (ör. Cloudflare: `HTTP_CF_CONNECTING_IP`).

- **Oyuncunun anahtarı:** Settings → Share play data (`fds_share` = `'0'`, kayıttan ayrı, "Reset progress" onu
  değiştirmez). Kapanınca kuyruktaki olaylar atılır ve hiçbir şey gitmez (açılıştaki hata işareti de); yeniden açılınca
  hemen yeni oturum başlar (`why: optin`). Settings oyuncunun `fds_pid`'ini de gösterir: silme isteğinde bu yazılır.
- **Saklama:** `api/lib.php` `housekeep()`, `collect.php`'den günde en fazla bir kez (veri klasöründe
  `housekeep.stamp`): 30 günden eski oturum/oyuncu IP'lerini siler, 2 yıldır gelmeyen oyuncuyu bütün oturum ve
  olaylarıyla siler. Silme isteği: `php api/cli.php forget <player_id>`. Elle çalıştırmak: `php api/cli.php housekeep`.
- **Oturum:** her sayfa açılışı; telefon 30 dakikadan uzun arka planda kalıp dönerse yeni oturum (`why: resume`).
  Süre = görünür kalınan süre (`active_ms`). 15 sn'de bir paket, boşsa 30 sn'de bir sinyal; "şu an oynuyor" = son 75 sn.
- **Olaylar:** `session_start`, `boot` (yükleme süresi), `boot_fail`, `error`, `intro_done`, `onboard_step`, `onboard_done`, `tab`,
  `job_start` (siparişler, araç, yağmur, `chain: 1` fişten "ride on" ile başlayan iş, `manual`, `ctl`: `run` Kurye Koşusu — 30 Ekim'den beri telefonda varsayılan, öncesi prototip —, `b` fren — 28–30 Ekim varsayılan —, `a` şerit koşusu, boş: otopilot / elle), `job_end` (sipariş başına yıldız/ücret/bahşiş/erken-geç, sürüş istatistikleri: sollama,
  zıplama, kestirme, kaza, turbo ve durma süresi, kıl payı, flow; elle sürüşte virajda kayma ve kavşakta rota değişikliği; prototipte fren süresi `brakeT`, şerit değişimi `lanes`, sapan `slings`, kusursuz viraj `corners`, dışa kayma `wide`, kusursuz duruş `stops`, kapıyı geçme `overshoots`, en yüksek vites `gearMax`, kaldırımda metre `walkM`, kırmızıda geçiş `reds`, kavşakta dönüş `turns`, yeşil dalga `waves`, frende ayrıca kamera cezası `tickets`, ürkütülen yaya `pedHits`, çukura yumuşak geçiş `smooth`; otopilotta STOP ile duruş `halts` (kapıyı geçip geri gelmek sayılmaz), kusursuz duruş `stops`, kırmızıda geçiş `reds`, kapıyı geçme `overshoots`, ürkütülen yaya `pedHits`, kamera cezası `tickets` (27 Ekim öncesi kayıtlarda yerine `crossCalls`: frene basan çapraz trafik)), `ride_event` (olay, seçenek, başarı, süre doldu mu), `crash`,
  `level_up` (o ana kadarki oynama dakikası), `buy` / `claim` / `equip` / `fleet` (`state.js` her ekonomi aksiyonunda `emit('act', …)`),
  `goal_done`, `contract_done`, `achievement`, `day_end`, `offline_earn`, `setting`, `quality_step`, `app_hide` / `app_show`,
  `streak` (hediye alınınca serinin gün sayısı `n`; seri koptuysa kopan seri `lost`), `daily_gift` (`day` 1–7, `streak`, `cash`, `energy`, `mult`),
  `energy_out` (enerji yetmedi), `next_offer` (fişteki yakın sipariş: `take` 1 = "ride on", 0 = hub'a döndü; `pick` m, `pay`, `energy`),
  `save_export` / `save_import` / `save_reset`, `pause` (`why`: `button` / `key` / `back` / `hidden`, sürüşün kaçıncı
  saniyesi, ayak), `ride_cancel` (teslim edilmeyen sipariş sayısı `n`, teslim edilmiş `done`, alınmış `picked`, geri
  verilen `energy`; oturum zaman çizelgesinde hiçbir şey teslim edilmediyse sürüş bloğunu kapatır). Her pakette kaydın özeti de gider (seviye, para, teslimat, bölgeler, bulunulan ekran).
- **Botlar:** önizleme/tarama tarayıcıları oturum açar ama oynamaz; `api/lib.php` `bot_reason()` her pakette oturumu yeniden
  değerlendirir (`sessions.bot`, `bot_why`): bot user agent (`ua`), Meta'nın IP aralığı (`meta-ip`), cihaz taklidi — 2000×2000
  "ekran" (`screen`) ya da 1× piksel oranlı, WebGL'i hiç açılmayan "telefon" (`nogpu`) — ve yazılım GPU (`softgpu`, headless).
  Bütün oturumları bot olan oyuncu da bot. Panel bunları varsayılan olarak sayılara katmaz ("Botları dahil et" ile görünür).
  Arka planda yüklenen sayfa (link önizleme, prefetch, prerender) ilk kez görünene kadar oturum başlatmaz.
- **Geliştirici cihazı:** oyunu bir kez `?an=dev` ile aç → o cihazın oturumları istatistiklere girmez (panelde "Geliştirici
  cihazları dahil" ile görünür). `?an=off` göndermeyi kapatır, `?an=on` sıfırlar. Headless testler (`navigator.webdriver`)
  hiçbir şey göndermez; `?an=force` ile açılır.
- **Panel:** Genel bakış (KPI'lar + önceki döneme göre, günlük grafik, yeni oyuncu hunisi, retention tablosu, saat, çıkış ekranı,
  cihaz/OS/tarayıcı, FPS ve GPU), Canlı (son 10 dk oturumlar + olay akışı, 10 sn'de bir yenilenir), Oturumlar (filtre, sıralama,
  oturum detayında zaman çizelgesi: her sürüş bir blok, yarım kalan sürüş işaretli), Oyuncular (oyuncu detayı: seviye süreleri,
  oturumlar, satın almalar), Oynanış (bölge/sipariş tipi tabloları, sürüş modları — otomatik / elle / prototip A ve B yan yana; otomatikte STOP, kırmızıda geçiş, kapıyı geçme, yaya ürkütme —, olay seçimleri, kaza nedenleri, satın almalar, seviye süreleri,
  tutorial adımları), Hatalar (mesaja göre gruplu, örnek oturum + stack).
- **Kurulum (sunucu):** veritabanı web kökünün dışında olmalı ve PHP kullanıcısı yazabilmeli:
  `php api/cli.php init /var/www/vhosts/mithatck.com/fds-analytics` → `api/config.local.php` yazar ve rastgele panel şifresini basar.
  Şifre değiştirmek: `php api/cli.php set-password`. Durum: `php api/cli.php info`. Eski ham olayları silmek: `php api/cli.php prune 180`.
