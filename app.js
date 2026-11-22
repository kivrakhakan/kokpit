/* Şoför Bey Kokpit (web paneli)
   Veri: eklentinin buluta yazdığı özet (durum tablosu). Panelden yapılan işler komutlar tablosuna yazılır,
   açık olan eklenti yürütür (şoför atama dahil). Demo: adrese ?demo=1 eklenir (bulut kullanılmaz). */
(function () {
  'use strict';
  const C = window.SB_CONFIG;
  const ADMIN = 'https://soforbey.com/';
  const LOGO = C.logo || 'ikon-192.png';
  const DEMO = /[?&]demo=1/.test(location.search);
  // Panelin "Yenilikler" kartı (her yeni sürümde surum değişir, maddeler yenilenir)
  const YENILIK = {
    surum: '2026-11-22d', tarih: '22 Kasım',
    maddeler: [
      ['Hız uyarısı. ', 'İşteki bir şoför art arda iki ölçümde 130 km/s\'i geçerse Telegram ve telefon bildirimi gelir, Özet\'te uyarı satırı çıkar.'],
      ['Şoför hızı görünür. ', 'Şoför listesinde ve haritada, işteki şoförün son ölçülen hızı yazar.'],
      ['Telefona bir şey kurulmaz. ', 'Hız, şoför uygulamasının zaten gönderdiği konumdan hesaplanır; uygulama kapalıysa ölçülemez.']
    ]
  };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { db: null, kul: null, ekip: null, durum: null, guncelleme: 0, komutlar: [], tikler: {}, ata: null, secili: null, tumu: false, sekme: 'ozet' };
  try { S.sekme = localStorage.getItem('sb_sekme') || 'ozet'; } catch (e) { /* önemsiz */ }

  /* ---------------- yardımcılar ---------------- */
  const trSaat = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  function sure(ms) {
    const m = Math.max(0, Math.floor(ms / 60000));
    if (m < 1) return 'az önce';
    if (m < 60) return m + ' dk';
    if (m < 1440) return Math.floor(m / 60) + ' saat';
    return Math.floor(m / 1440) + ' gün';
  }
  function km(a1, o1, a2, o2) {
    const R = 6371, r = Math.PI / 180;
    const x = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const kmYaz = (k) => (k < 10 ? k.toFixed(1).replace('.', ',') : String(Math.round(k))) + ' km';
  const sayiMi = (v) => v !== null && v !== undefined && v !== '' && !isNaN(+v);
  const ikon = (ad) => '<svg aria-hidden="true"><use href="#i-' + ad + '"/></svg>';
  // Maskot "Kepli Bey" (logodan: noktalar göz, kemer omuz, ok gövde). Pozlar: yolunda, sos, bekliyor, uyku.
  const maskot = (poz) => {
    const gece = poz === 'uyku';
    const kep = '<use href="#m-kep" fill="' + (gece ? '#00b621' : '#0a5a1c') + '"' + (poz === 'sos' ? ' transform="translate(0 -8)"' : gece ? ' transform="rotate(-12 120 30)"' : '') + '/>';
    const goz = (cx, bx, by, r) => '<g class="m-goz"><circle cx="' + cx + '" cy="74" r="' + (r || 17) + '" fill="#fff"/><circle cx="' + bx + '" cy="' + by + '" r="6.5" fill="#13261a"/></g>';
    const yuz = {
      yolunda: '<path d="M79 80 Q94 62 109 80M131 80 Q146 62 161 80" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M104 96 Q120 116 136 96 Z" fill="#13261a" stroke="#13261a" stroke-width="3" stroke-linejoin="round"/>',
      sos: '<circle cx="94" cy="76" r="20" fill="#fff"/><circle cx="94" cy="76" r="5" fill="#13261a"/><circle cx="146" cy="76" r="20" fill="#fff"/><circle cx="146" cy="76" r="5" fill="#13261a"/><ellipse cx="120" cy="106" rx="7" ry="9" fill="#13261a"/>',
      bekliyor: goz(94, 89, 68) + goz(146, 141, 68) + '<path d="M110 100 H130" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>',
      uyku: '<path d="M80 76 Q94 88 108 76M132 76 Q146 88 160 76" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="120" cy="102" r="5" fill="#13261a"/><text x="180" y="62" font-size="26" font-weight="800" fill="#fff" font-family="Barlow,sans-serif">z</text>'
    }[poz] || '';
    return '<svg class="maskot" viewBox="0 0 240 240" aria-hidden="true"><rect width="240" height="240" fill="' + (gece ? '#06401a' : '#00b621') + '"/>' +
      '<g transform="translate(18 14) scale(.85)">' + kep + yuz + '<use href="#m-govde"/></g></svg>';
  };
  const maskotBos = (poz, baslik, alt) => '<div class="maskot-bos">' + maskot(poz) + '<b>' + esc(baslik) + '</b>' + (alt ? '<span>' + esc(alt) + '</span>' : '') + '</div>';
  const ik = (ad) => '<svg class="ik" aria-hidden="true"><use href="#i-' + ad + '"/></svg>'; // yazı içi ikon (eski emojilerin yerine)
  let bildTimer = 0;
  function bildir(t) {
    const b = $('bildirim');
    b.textContent = t;
    b.classList.add('goster');
    clearTimeout(bildTimer);
    bildTimer = setTimeout(() => b.classList.remove('goster'), 3500);
  }
  function seviye(yasDk, e) {
    if (yasDk >= e.acil) return ['acil', 'ACİL', 'var(--kirmizi)'];
    if (yasDk >= e.alarm) return ['alarm', 'ALARM', 'var(--turuncu)'];
    if (yasDk >= e.soft) return ['uyari', 'UYARI', 'var(--sari)'];
    return ['ok', 'yeni', 'var(--yesil)'];
  }
  function yerYaz(y) {
    if (!y) return '?';
    return y.ilce || y.il || y.adres || '?';
  }

  /* ---------------- çizim ---------------- */
  // adim: giris | kayit | unuttum | yenisifre | bilgi
  function cizGiris(adim, email, mesaj, iyi) {
    const baslik = { giris: 'Giriş', kayit: 'İlk kez: hesap oluştur', unuttum: 'Şifremi unuttum', yenisifre: 'Yeni şifre belirle', bilgi: '' }[adim];
    let h = '<div class="giris"><img class="logo" src="' + LOGO + '" alt="Şoför Bey"><h1>Şoför Bey Kokpit</h1><p>' + esc(baslik) + '</p>';
    if (adim !== 'yenisifre' && adim !== 'bilgi') {
      h += '<input id="eposta" type="email" autocomplete="email" placeholder="E-posta" value="' + esc(email || '') + '">';
    }
    if (adim === 'giris' || adim === 'kayit' || adim === 'yenisifre') {
      h += '<input id="sifre" type="password" autocomplete="' + (adim === 'giris' ? 'current-password' : 'new-password') + '" placeholder="' + (adim === 'giris' ? 'Şifre' : 'Şifre (en az 8 karakter)') + '">';
    }
    if (adim !== 'bilgi') {
      h += '<button class="btn mavi" id="tamam">' + { giris: 'Giriş yap', kayit: 'Hesap oluştur', unuttum: 'Sıfırlama bağlantısı gönder', yenisifre: 'Kaydet' }[adim] + '</button>';
    }
    h += '<div class="hata" id="hata" style="' + (iyi ? 'color:#8fe3b0' : '') + '">' + esc(mesaj || '') + '</div>';
    if (adim === 'giris') h += '<p style="margin-top:14px"><a href="#" data-git="kayit" style="color:var(--mavi)">İlk kez mi giriyorsun? Hesap oluştur</a><br><a href="#" data-git="unuttum" style="color:var(--soluk);font-size:13px">Şifremi unuttum</a></p>';
    else if (adim !== 'yenisifre') h += '<p style="margin-top:14px"><a href="#" data-git="giris" style="color:var(--mavi)">Girişe dön</a></p>';
    $('uygulama').innerHTML = h + '</div>';
    document.querySelectorAll('[data-git]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); cizGiris(a.dataset.git, $('eposta') ? $('eposta').value : email); }; });
    const btn = $('tamam');
    if (!btn) return;
    const calis = () => girisIslem(adim);
    btn.onclick = calis;
    document.querySelectorAll('.giris input').forEach((i) => { i.onkeydown = (e) => { if (e.key === 'Enter') calis(); }; });
  }
  async function girisIslem(adim) {
    const email = $('eposta') ? $('eposta').value.trim().toLowerCase() : '';
    const sifre = $('sifre') ? $('sifre').value : '';
    const hata = (t) => { $('hata').textContent = t; $('tamam').disabled = false; };
    if (adim !== 'yenisifre' && !/^\S+@\S+\.\S+$/.test(email)) return hata('Geçerli bir e-posta yazın.');
    if ((adim === 'kayit' || adim === 'yenisifre') && sifre.length < 8) return hata('Şifre en az 8 karakter olmalı.');
    $('tamam').disabled = true;
    const donus = location.origin + location.pathname;
    if (adim === 'giris') {
      const { error } = await S.db.auth.signInWithPassword({ email, password: sifre });
      if (error) return hata(/confirm/i.test(error.message) ? 'Önce e-postana gelen onay bağlantısına tıkla.' : 'E-posta ya da şifre yanlış.');
      return basla();
    }
    if (adim === 'kayit') {
      const { data, error } = await S.db.auth.signUp({ email, password: sifre, options: { emailRedirectTo: donus } });
      if (error) return hata(/registered|exists/i.test(error.message) ? 'Bu e-postayla hesap zaten var, giriş yapın.' : /rate|seconds/i.test(error.message) ? 'Çok sık denendi, biraz bekleyin.' : 'Olmadı: ' + error.message);
      if (data.session) return basla();
      return cizGiris('giris', email, 'Onay e-postası gönderildi. E-postadaki bağlantıya tıkla, sonra buradan giriş yap.', true);
    }
    if (adim === 'unuttum') {
      const { error } = await S.db.auth.resetPasswordForEmail(email, { redirectTo: donus });
      if (error) return hata(/rate|seconds/i.test(error.message) ? 'Çok sık denendi, biraz bekleyin.' : 'Olmadı: ' + error.message);
      return cizGiris('giris', email, 'Sıfırlama bağlantısı gönderildi. E-postadaki bağlantıya tıkla.', true);
    }
    if (adim === 'yenisifre') {
      const { error } = await S.db.auth.updateUser({ password: sifre });
      if (error) return hata('Olmadı: ' + error.message);
      history.replaceState(null, '', donus);
      basladi = false;
      return basla();
    }
  }

  function ciz() {
    const d = S.durum || {};
    const now = Date.now();
    const e = d.esikler || { soft: 3, alarm: 5, acil: 10 };
    const yas = S.guncelleme ? now - S.guncelleme : Infinity;
    const bayat = yas > C.bayatSn * 1000;
    const talepler = (d.talepler || []).map((t) => Object.assign({}, t, { yasDk: (now - t.olusma) / 60000 }))
      .sort((a, b) => (!!a.sessiz - !!b.sessiz) || (a.olusma - b.olusma));
    const aktif = talepler.filter((t) => !t.sessiz);
    const soforler = d.soforler || [];
    const musait = soforler.filter((s) => s.durum === 'Müsait');
    const od = d.odemeler || {};
    const odSayi = Math.max(+od.rozet || 0, (od.iban || []).length);

    let h = '';
    if (DEMO) h += '<div class="etiket">DEMO · örnek veri</div>';
    const sosList = Array.isArray(d.sos) ? d.sos : [];
    // Üst yeşil bant (logodaki kemerle biter). SOS varsa beyaz şerit bandın içinde; Operasyon'da kartın kendisi görünür.
    h += '<div class="bant"><header><img class="logo" src="' + LOGO + '" alt="Şoför Bey"><div><h1>Kokpit</h1><small>' +
      esc(S.ekip ? S.ekip.ad : '') + (d.merkez ? ', kaynak ' + esc(d.merkez) : '') + '</small></div>' +
      '<div class="saat">' + trSaat(now) + '<br><small>' + (S.guncelleme ? (yas < 60000 ? 'az önce güncellendi' : sure(yas) + ' önce güncellendi') : 'veri yok') + '</small></div>' +
      (window.ReactNativeWebView ? '<button class="ikonbtn" id="bildAyar" title="Bildirim ayarları" aria-label="Bildirim ayarları">' + ikon('zil') + '</button>' : '') +
      (DEMO ? '' : '<button class="ikonbtn" id="cikis" title="Çıkış" aria-label="Çıkış">' + ikon('cikis') + '</button>') + '</header>' +
      (sosList.length && S.sekme !== 'talep' ? '<a class="sos-bant" href="#" data-sekme="talep">' + ikon('uyari') + (sosList.length > 1 ? sosList.length + ' SOS bildirimi var' : 'SOS bildirimi var') + '<u>Aç</u></a>' : '') +
      '</div>';

    // Yenilikler: panel güncellenince her telefonda bir kez (Tamam'a basılana kadar) görünür.
    // Yeni sürümde YENILIK.surum değiştirilir ve maddeler yazılır.
    let yenilikGordu = '';
    try { yenilikGordu = localStorage.getItem('sb_yenilik_gordu') || ''; } catch (e) { yenilikGordu = YENILIK.surum; }
    if (yenilikGordu !== YENILIK.surum) {
      h += '<div class="kart yenilik"><h2>Yenilikler <span>' + esc(YENILIK.tarih) + '</span></h2><ul>' +
        YENILIK.maddeler.map((m) => '<li><b>' + esc(m[0]) + '</b>' + esc(m[1]) + '</li>').join('') +
        '</ul><button class="btn yesil" id="yenilikTamam">Tamam</button></div>';
    }

    // Telefon bildirimi
    if (S.bildirim === 'kapali') h += '<div class="serit sari" style="display:flex;align-items:center;gap:10px"><span style="flex:1">🔔 Alarm gelince telefonun çalsın mı?</span><button class="atabtn" id="bildirimAc">Bildirimleri aç</button></div>';
    else if (S.bildirim === 'ios') h += '<div class="serit sari">🔔 Bildirim için: Safari\'de alttaki Paylaş düğmesi → <b>Ana Ekrana Ekle</b>, sonra paneli ana ekrandaki simgeden açın.</div>';
    else if (S.bildirim === 'engelli') h += '<div class="serit sari">🔔 Bildirimler engellenmiş. Telefon ayarlarından bu uygulamaya bildirim izni verin.</div>';

    // Uyarı şeritleri
    if (!S.guncelleme) h += '<div class="serit kirmizi">⚠ Henüz veri gelmedi. Bir bilgisayarda Şoför Bey eklentisi açık olmalı.</div>';
    else if (bayat) h += '<div class="serit kirmizi">⚠ İZLEME KAPALI: ' + sure(yas) + ' önceden beri eklentiden veri gelmiyor. Bir bilgisayarda Operasyon Merkezi\'ni açın. Aşağıdaki bilgiler eski.</div>';
    if (!bayat && d.sayfa === 'logout') h += '<div class="serit kirmizi">⚠ Bilgisayardaki panel oturumu kapanmış, tekrar giriş yapılmalı.</div>';
    else if (!bayat && d.sayfa && d.sayfa !== 'atama') h += '<div class="serit sari">Bilgisayarda Operasyon Merkezi sayfası açık değil; talepler izlenmiyor olabilir.</div>';

    // SOS (v9.30 özeti): ayrıntı kartı Operasyon'un en üstünde. Durum değişikliği komutla, eklenti siteye yazar.
    const telA = (t, yazi) => (t ? '<a class="tel" href="tel:' + esc(String(t).replace(/[^\d+]/g, '')) + '">' + yazi + '</a>' : '');
    let sosH = '';
    if (sosList.length) {
      sosH += '<div class="kart sos-kart"><h2><b class="sos-bas">' + maskot('sos') + 'SOS</b><span>' + sosList.length + ' kayıt</span></h2>';
      sosList.forEach((x) => {
        const bek = S.komutlar.find((k) => k.tur === 'sos_durum' && String(k.ilan_id) === String(x.id) && k.durum === 'bekliyor');
        const aktifMi = x.durum === 'Aktif';
        sosH += '<div class="sos-satir"><b>SOS #' + esc(x.id) + (x.is_id ? ' · iş #' + esc(x.is_id) : '') + ' <span class="rozet ' + (aktifMi ? 'r-acil' : 'r-uyari') + '">' + esc(x.durum || '?') + '</span></b>' +
          '<small>' + (x.zaman ? trSaat(x.zaman) + ' · ' : '') + 'Bildiren: ' + esc(x.bildiren || '-') + (x.kullanici_tipi ? ' (' + esc(x.kullanici_tipi) + ')' : '') +
          (x.musteri ? ' · Müşteri: ' + esc(x.musteri) : '') + (x.sofor ? ' · Şoför: ' + esc(x.sofor) : '') + '</small>' +
          (x.neden ? '<p>' + esc(x.neden) + '</p>' : '') +
          '<div class="sos-dugme">' + telA(x.bildiren_tel, ik('tel') + 'Bildiren') + telA(x.musteri_tel, ik('tel') + 'Müşteri') + telA(x.sofor_tel, ik('tel') + 'Şoför') +
          (sayiMi(x.enlem) && sayiMi(x.boylam) ? '<a class="tel" href="https://www.google.com/maps?q=' + (+x.enlem) + ',' + (+x.boylam) + '" target="_blank" rel="noopener">' + ik('harita') + 'Konum</a>' : '') + '</div>' +
          (bek ? '<span class="rozet r-gri">güncelleniyor…</span>' : '<div class="ikili">' +
            (aktifMi ? '<button class="btn" data-sos="' + esc(x.id) + '" data-sosd="İnceleniyor">' + ik('ara') + 'İnceleniyor</button>' : '') +
            '<button class="btn kirmizi" data-sos="' + esc(x.id) + '" data-sosd="Çözüldü">' + ik('tamam') + 'Çözüldü</button></div>') + '</div>';
      });
      sosH += '</div>';
    }

    // Bölümler: §ad§ işaretinden sonrası o sekmeye ait; işaretten öncesi (başlık + uyarı şeritleri) her sekmede görünür
    h += '§ozet§';
    // Ana durum kartı
    const enEski = aktif[0];
    const al = d.alarm || {};
    const susKalan = al.susturma_bitis && al.susturma_bitis > now ? Math.ceil((al.susturma_bitis - now) / 60000) : 0;
    if (enEski) {
      const sv = seviye(enEski.yasDk, e);
      // Ana kart: logonun yeşili; ACİL eşiği geçince kırmızıya döner
      const dk = Math.floor(enEski.yasDk);
      h += '<div class="durum ana' + (sv[0] === 'acil' ? ' acil' : '') + '">' +
        '<span class="bekleme ' + sv[0] + '">' + (dk < 1 ? 'Az önce geldi' : dk + ' dakikadır bekliyor') + '</span>' +
        '<b>' + (aktif.length > 1 ? aktif.length + ' talep şoför bekliyor' : 'Talep şoför bekliyor') + '</b>' +
        '<p class="rota"><i></i><span>' + esc(yerYaz(enEski.nereden)) + '</span><span class="hat"></span><s></s><span>' + esc(yerYaz(enEski.nereye)) + '</span></p>' +
        (susKalan ? '<p class="sus">Alarm ' + susKalan + ' dakika susturuldu</p>' : '') +
        '<div class="ikili"><button class="btn saydam" data-kom="gordum">Gördüm</button>' +
        '<button class="btn beyaz" data-kom="ilgileniyorum">İlgileniyorum</button></div></div>';
    } else if (odSayi) {
      h += '<div class="durum ana"><span class="bekleme">Ödemeler</span><b>' + odSayi + ' ödeme onay bekliyor</b><p>Ödemeler sayfasından onaylayın.</p>' +
        '<div class="ikili"><button class="btn saydam" data-kom="gordum">Gördüm</button><button class="btn beyaz" data-kom="ilgileniyorum">İlgileniyorum</button></div></div>';
    } else {
      h += (!S.guncelleme || bayat)
        ? '<div class="durum ana sakin uyuyor">' + maskot('uyku') + '<div><b>İzleme kapalı</b><p>Bilgisayardaki eklentiden haber gelmiyor.</p></div></div>'
        : '<div class="durum ana sakin">' + maskot('yolunda') + '<div><b>Her şey yolunda</b><p>Bekleyen talep ve ödeme yok.</p></div></div>';
    }

    // Admin panelde bakılması gerekenler (dokununca ilgili sayfa açılır)
    const say = d.sayilar || {};
    const yap = [];
    if (!bayat && d.sayfa === 'logout') yap.push(['anahtar', 'Bilgisayardaki panel oturumu kapanmış: tekrar giriş yap', 'admin/']);
    if (+say.aktif_sos > 0 && !sosList.length) yap.push(['uyari', say.aktif_sos + ' SOS bildirimi var', 'admin/operasyon-merkezi']);
    if (odSayi) yap.push(['kart', odSayi + ' ödeme onay bekliyor', 'admin/odemeler']);
    if (aktif.some((t) => t.yasDk >= e.acil)) yap.push(['arac', 'ACİL: ' + aktif.filter((t) => t.yasDk >= e.acil).length + ' talep ' + e.acil + ' dk\'dan uzun süredir şoför bekliyor', 'admin/operasyon-merkezi']);
    if (aktif.length && !musait.length) yap.push(['uyari', 'Müsait şoför yok; şoförleri arayın', 'admin/soforler']);
    if (!bayat) soforler.filter((s) => s.hiz_uyari).forEach((s) => yap.unshift(['uyari', 'Hız uyarısı: ' + (s.ad || 'Şoför') + ' ~' + s.hiz_uyari.kmh + ' km/s' + (s.hiz != null ? ' (şu an ' + s.hiz + ')' : ''), 'admin/operasyon-merkezi']));
    if (+say.incelenen_sos > 0 && !sosList.length) yap.push(['ara', say.incelenen_sos + ' SOS incelemede', 'admin/operasyon-merkezi']);
    const basv = Array.isArray(d.basvurular) ? d.basvurular : [];
    // "Cevap gerekmiyor" işaretlenenler kişi yeniden yazana kadar gizli (anahtar son mesaja bağlı)
    const destek = (Array.isArray(d.destek) ? d.destek : []).filter((t) => !S.tikler[destekAnahtar(t)]);
    if (destek.length) yap.push(['destek', destek.length + ' destek talebi cevap bekliyor', '#destek']);
    if (S.karne && S.ekip && S.karne.okuyanlar.indexOf(S.ekip.ad) === -1) yap.unshift(['karne', 'Haftalık rapor hazır: okuyup "Okudum" de', '#karne']);
    const bakilmamis = basv.filter((b) => !S.tikler[String(b.no)]).length;
    if (bakilmamis) yap.push(['belge', bakilmamis + ' şoför başvurusuna henüz bakılmadı', 'admin/sofor-basvurulari']);
    if (yap.length) {
      h += '<div class="kart"><h2>Kontrol et <span>' + yap.length + ' iş</span></h2>' + yap.map((y) =>
        (y[2] === '#karne' ? '<a class="satir yap" href="#" data-sekme="karne">' : y[2] === '#destek' ? '<a class="satir yap" href="#" data-sekme="destek">' : '<a class="satir yap" href="' + ADMIN + y[2] + '" target="_blank" rel="noopener">') + ik(y[0]) + '<div class="ad">' + esc(y[1]) + '</div><span class="ok">›</span></a>').join('') + '</div>';
    }

    h += '<div class="sayilar">' +
      '<div class="sayi"><b style="color:' + (aktif.length ? 'var(--kirmizi)' : 'var(--yazi)') + '">' + aktif.length + '</b><span>Bekleyen talep</span></div>' +
      '<div class="sayi"><b style="color:' + (odSayi ? 'var(--sari)' : 'var(--yazi)') + '">' + odSayi + '</b><span>Bekleyen ödeme</span></div>' +
      '<div class="sayi"><b style="color:' + (musait.length ? 'var(--yesil)' : 'var(--kirmizi)') + '">' + musait.length + '</b><span>Müsait şoför</span></div></div>';
    // 2026-11-22: "Aktif şoförler" Özet'ten kaldırıldı (kullanıcı: Özet ile Operasyon aynı); şoför listesi yalnız Operasyon'da

    // Harita (talepler + şoförler). Harita bir kez kurulur, her çizimde yerine taşınır (yeniden yüklenmesin)
    h += '§harita§';
    if (window.L) {
      h += '<div class="kart"><h2>Harita <span>' + talepler.filter((t) => t.nereden && sayiMi(t.nereden.enlem)).length + ' talep · ' +
        soforler.filter((s) => sayiMi(s.enlem)).length + ' şoför</span></h2><div id="haritaYer"></div>' +
        '<div class="hr-lejant"><span><i style="background:var(--kirmizi)"></i>ACİL</span><span><i style="background:var(--turuncu)"></i>alarm</span>' +
        '<span><i style="background:var(--sari)"></i>uyarı</span><span><i style="background:#fff;border:2px solid var(--yesil)"></i>müsait şoför</span>' +
        '<span><i style="background:#fff;border:2px solid var(--sari)"></i>meşgul</span><span>kesik çizgi = eski konum</span></div></div>';
    }

    // Talepler
    h += '§talep§';
    h += sosH;
    h += '<div class="kart"><h2>Atama bekleyen talepler <span>' + e.soft + ' · ' + e.alarm + ' · ' + e.acil + ' dk</span></h2>';
    if (!talepler.length) h += maskotBos('yolunda', 'Bekleyen talep yok', 'Yeni talep gelince burada görünür.');
    talepler.forEach((t, i) => {
      const sv = seviye(t.yasDk, e);
      const yuzde = Math.min(100, (t.yasDk / e.acil) * 100);
      const on = oneri(t, musait);
      const kom = S.komutlar.find((k) => k.tur === 'ata' && String(k.ilan_id) === String(t.id) && k.durum === 'bekliyor');
      h += '<div class="satir' + (t.sessiz ? ' soluk' : '') + '"><div class="ad tikla" data-detay="' + i + '">' + esc(yerYaz(t.nereden)) + ' → ' + esc(yerYaz(t.nereye)) +
        '<small>' + Math.floor(t.yasDk) + ' dk' + (t.tutar ? ' · ' + esc(t.tutar) + ' TL' : '') + (t.sessiz ? ' · uyarı dışı' : '') + '</small>' +
        (on ? '<div class="oneri">' + on + '</div>' : '') +
        (t.sessiz ? '' : '<div class="cubuk"><i style="width:' + yuzde + '%;background:' + sv[2] + '"></i></div>') + '</div>' +
        (kom ? '<span class="rozet r-gri">atanıyor…</span>' : '<button class="atabtn" data-ata="' + i + '">Şoför ata</button>') + '</div>';
    });
    h += '</div>';

    // Aktif yolculuklar ve ileri rezervasyonlar (v9.30 özeti; eski eklentide bu alanlar yok → kart çıkmaz)
    const guz = (x) => esc(yerYaz(x.nereden)) + ' → ' + esc(yerYaz(x.nereye));
    if (Array.isArray(d.isler)) {
      h += '<div class="kart"><h2>Aktif yolculuklar <span>' + d.isler.length + '</span></h2>';
      if (!d.isler.length) h += '<div class="bos">Şu an aktif yolculuk yok.</div>';
      d.isler.forEach((j) => {
        h += '<div class="satir"><div class="ad">İş #' + esc(j.id) + ' · ' + guz(j) +
          '<small>' + esc(j.durum || '-') + ' · Şoför: ' + esc(j.sofor || '-') + ' · Müşteri: ' + esc(j.musteri || '-') + (j.tutar ? ' · ' + esc(j.tutar) + ' TL' : '') + '</small></div>' +
          telA(j.sofor_tel, 'Şoför') + telA(j.musteri_tel, 'Müşteri') + '</div>';
      });
      h += '</div>';
    }
    if (Array.isArray(d.rezervasyonlar)) {
      const rz = d.rezervasyonlar.slice().sort((a, b) => (a.zaman || 9e15) - (b.zaman || 9e15));
      const atanmamis = rz.filter((r) => !r.sofor_id).length;
      h += '<div class="kart"><h2>İleri rezervasyonlar <span>' + rz.length + (atanmamis ? ' · ' + atanmamis + ' atanmamış' : '') + '</span></h2>';
      if (!rz.length) h += '<div class="bos">İleri rezervasyon yok.</div>';
      rz.forEach((r) => {
        const kalan = r.zaman ? r.zaman - now : null;
        const gun = r.zaman ? new Date(r.zaman).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short' }) + ' ' + trSaat(r.zaman) : '-';
        const acil = !r.sofor_id && kalan !== null && kalan < 2 * 3600000;
        h += '<div class="satir"><div class="ad">' + esc(gun) + ' · ' + guz(r) +
          '<small>#' + esc(r.id) + ' · Müşteri: ' + esc(r.musteri || '-') + (r.tutar ? ' · ' + esc(r.tutar) + ' TL' : '') + (r.sofor_id ? ' · Şoför: ' + esc(r.sofor || '#' + r.sofor_id) : '') + '</small></div>' +
          (r.sofor_id ? '<span class="rozet r-ok">atandı</span>' :
            S.komutlar.find((k) => k.tur === 'ata' && k.ilan_tipi === 'rezervasyon' && String(k.ilan_id) === String(r.id) && k.durum === 'bekliyor') ? '<span class="rozet r-gri">atanıyor…</span>' :
            '<span class="rozet ' + (acil ? 'r-acil' : 'r-uyari') + '">atanmamış</span><button class="atabtn" data-rata="' + esc(r.id) + '">Şoför ata</button>') + '</div>';
      });
      h += '</div>';
    }

    // Ödemeler
    if (odSayi) {
      h += '<div class="kart"><h2>Ödeme bildirimleri <span>menüde 🔴 ' + (+od.rozet || 0) + '</span></h2>';
      (od.iban || []).forEach((p) => {
        h += '<a class="satir yap" href="' + ADMIN + 'admin/odemeler" target="_blank" rel="noopener"><div class="ad">' + esc(p.ref || 'Ödeme') + (p.tutar ? ' · ' + esc(p.tutar) : '') + '<small>Onay bekleniyor · ' + Math.floor(p.yas_dk || 0) + ' dk</small></div>' +
          '<span class="rozet ' + ((p.yas_dk || 0) >= 10 ? 'r-uyari' : 'r-ok') + '">' + ((p.yas_dk || 0) >= 10 ? '10 dk geçti' : 'yeni') + '</span></a>';
      });
      if (!(od.iban || []).length) h += '<div class="bos">Ayrıntı için bilgisayarda Ödemeler sayfasını açın.</div>';
      h += '</div>';
    }

    // Şoförler sekmesi: ehliyet yenilemeleri, anlık durum, başvurular, kayıtlar (yalnızca görüntüleme; işlem sitede)
    h += '§sofor§';
    const sk = d.sofor_kayit && typeof d.sofor_kayit === 'object' ? d.sofor_kayit : null;
    const ehl = sk && Array.isArray(sk.ehliyet) ? sk.ehliyet : [];
    const skOku = sk && sk.at ? ' · ' + sure(now - sk.at) + ' önce okundu' : '';
    if (ehl.length) {
      h += '<div class="kart"><h2>Ehliyet yenileme <span>' + ehl.length + ' onay bekliyor</span></h2>';
      ehl.forEach((x) => {
        h += '<a class="satir yap" href="' + ADMIN + 'admin/soforler" target="_blank" rel="noopener">' + ik('belge') + '<div class="ad">' + esc(x.ad || 'Şoför') +
          '<small>#' + esc(x.no) + ' · ' + esc(x.mevcut || '?') + ' → <b>' + esc(x.yeni || '?') + '</b> · talep ' + esc(x.talep || '') + '</small></div><span class="ok">›</span></a>';
      });
      h += '<div class="bos" style="padding-top:6px">Onay ve red sitede yapılır; satıra dokununca açılır.</div></div>';
    }
    const sira = { 'Müsait': 0, 'Meşgul': 1 };
    h += '<div class="kart"><h2>Anlık durum <span>' + musait.length + ' müsait / ' + soforler.length + '</span></h2>';
    if (!soforler.length) h += '<div class="bos">Şoför bilgisi yok.</div>';
    const sfSira = soforler.slice().sort((a, b) => (sira[a.durum] ?? 2) - (sira[b.durum] ?? 2));
    sfSira.forEach((s, i) => {
      const renk = s.durum === 'Müsait' ? 'var(--yesil)' : s.durum === 'Meşgul' ? 'var(--sari)' : '#555b69';
      h += '<div class="sf"><span class="nokta" style="background:' + renk + '"></span><div class="ad tikla" data-sofor="' + i + '">' + esc(s.ad) +
        '<small>' + esc(s.durum || '?') + (s.hiz != null ? ' · ' + esc(String(s.hiz)) + ' km/s' : '') + (s.konum_ms ? ' · konum ' + sure(now - s.konum_ms) + ' önce' : '') + '</small></div>' +
        (s.telefon ? '<a class="tel" href="tel:' + esc(String(s.telefon).replace(/[^\d+]/g, '')) + '">Ara</a>' : '') + '</div>';
    });
    h += '</div>';

    // Destek talepleri (son mesajı kişinin yazdığı = cevap bekleyen)
    h += '§destek§';
    if (!destek.length) h += '<div class="kart">' + maskotBos('yolunda', 'Cevap bekleyen destek talebi yok') + '</div>';
    if (destek.length) {
      h += '<div class="kart" id="destekKart"><h2>Destek talepleri <span>' + destek.length + ' cevap bekliyor</span></h2>';
      destek.forEach((t, i) => {
        const son = (t.mesajlar || []).filter((m) => m.kim === 'kisi').slice(-1)[0];
        const gidiyor = S.komutlar.find((k) => k.tur === 'destek_cevap' && String(k.ilan_id) === String(t.id) && k.durum === 'bekliyor');
        h += '<div class="satir"><div class="ad tikla" data-destek="' + i + '">' + esc(t.ad || 'Kişi') + ' · ' + esc(t.konu) +
          '<small>' + esc(kimlik(t, basv).yazi) + ' · ' + esc(son ? son.metin.slice(0, 70) : '') + ' · ' + esc(t.son_hareket || '') + '</small></div>' +
          (gidiyor ? '<span class="rozet r-gri">gönderiliyor…</span>' : '<button class="atabtn" data-destek="' + i + '">Yanıtla</button>') + '</div>';
      });
      h += '</div>';
    }

    // Şoför başvuruları (yalnızca bekleyenler; onay/ret admin panelden) — Şoförler sekmesinde
    h += '§sofor§';
    if (basv.length) {
      const gun = (b) => { const m = String(b.tarih || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '?'; };
      const trGun = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
      const bugun = trGun(now), dun = trGun(now - 86400000);
      const gunAd = (g) => g === bugun ? 'Bugün' : g === dun ? 'Dün' : g === '?' ? 'Tarihsiz' : g.split('-').reverse().join('.');
      const bakilan = basv.filter((b) => S.tikler[String(b.no)]).length;
      const bugunku = basv.filter((b) => gun(b) === bugun).length;
      const yuzde = Math.round((bakilan / basv.length) * 100);
      h += '<div class="kart basv"><h2>Şoför başvuruları <span>' + bakilan + '/' + basv.length + ' bakıldı</span></h2>' +
        '<div class="basv-ust">' + (bugunku ? '✨ <b>Bugün ' + bugunku + ' yeni başvuru</b>' : 'Bugün yeni başvuru yok') +
        (bakilan === basv.length ? ' · <b style="color:var(--yesil)">Hepsine bakıldı 🎉</b>' : '') + '</div>' +
        '<div class="cubuk" style="margin:6px 0 4px"><i style="width:' + yuzde + '%;background:var(--yesil)"></i></div>';
      const gruplar = {};
      basv.forEach((b, i) => { const g = gun(b); (gruplar[g] = gruplar[g] || []).push([b, i]); });
      Object.keys(gruplar).sort().reverse().forEach((g) => {
        h += '<div class="basv-gun">' + gunAd(g) + ' · ' + gruplar[g].length + '</div>';
        gruplar[g].forEach(([b, i]) => {
          const tik = S.tikler[String(b.no)];
          const eksik = [!b.src ? 'SRC' : '', !b.psiko ? 'psikoteknik' : ''].filter(Boolean).join(', ');
          h += '<div class="satir' + (tik ? ' basv-tamam' : '') + '"><button class="tik' + (tik ? ' on' : '') + '" data-tik="' + i + '" aria-label="Baktım">' + (tik ? '✓' : '') + '</button>' +
            '<div class="ad tikla" data-basvuru="' + i + '">' + esc(b.ad || 'Başvuru') +
            '<small>' + (tik ? '✓ ' + esc(tik.kim) + ' · ' + trSaat(Date.parse(tik.zaman)) + ' · ' : '') + '#' + esc(b.no) + ' · ' + esc(String(b.tarih || '').split(' ')[1] || '') +
            (b.arac ? ' · ' + esc(b.arac) : '') + (eksik ? ' · eksik: ' + eksik : '') + '</small></div></div>';
        });
      });
      h += '</div>';
    }

    // Şoför kayıtları (soforbey.com /admin/soforler): eksik belgeler önce
    const kay = sk && Array.isArray(sk.kayitlar) ? sk.kayitlar : [];
    const eksikler = (k) => (k.belgeler || []).filter((b) => !b.var).map((b) => b.ad);
    h += '<div class="kart"><h2>Şoför kayıtları <span>' + kay.length + skOku + '</span></h2>';
    if (!sk) h += maskotBos('bekliyor', 'Kayıtlar henüz gelmedi', 'Bilgisayardaki eklenti 5 dakikada bir okur.');
    kay.slice().sort((a, b) => eksikler(b).length - eksikler(a).length).forEach((k) => {
      const ek = eksikler(k);
      const tel = String(k.tel || '').replace(/[^\d+]/g, '');
      h += '<div class="sf"><span class="nokta" style="background:' + (ek.length ? 'var(--sari)' : 'var(--yesil)') + '"></span><div class="ad">' + esc(k.ad || 'Şoför') +
        '<small>#' + esc(k.no) + ' · ' + esc(k.arac || '?') + (k.durum && k.durum !== 'Aktif' ? ' · ' + esc(k.durum) : '') + '</small>' +
        '<small style="color:' + (ek.length ? 'var(--sari)' : 'var(--yesil)') + '">' + (ek.length ? 'Eksik: ' + esc(ek.join(', ')) : 'Belgeler tamam') + '</small>' +
        (k.edevlet ? '<small>e-Devlet: ' + esc(k.edevlet) + (k.edevlet_kontrol ? ' · ' + esc(k.edevlet_kontrol) : '') + '</small>' : '') + '</div>' +
        (tel ? '<a class="tel" href="tel:' + esc(tel) + '">' + ik('tel') + 'Ara</a>' : '') + '</div>';
    });
    if (sk) h += '<a class="satir yap" href="' + ADMIN + 'admin/soforler" target="_blank" rel="noopener">' + ik('belge') + '<div class="ad">Belgeleri ve düzenlemeyi sitede aç</div><span class="ok">›</span></a>';
    h += '</div>';

    // Son işlemler (özet sekmesinde)
    h += '§ozet§';
    const son = S.komutlar.slice(0, 6);
    if (son.length) {
      h += '<div class="kart"><h2>Son işlemler</h2>';
      son.forEach((k) => {
        const ne = k.tur === 'ata' ? 'şoför atama' : k.tur === 'sos_durum' ? 'SOS #' + esc(k.ilan_id) + ' → ' + esc(k.metin || '') : k.tur === 'gordum' ? '"Gördüm"' : k.tur === 'destek_cevap' ? 'destek cevabı #' + esc(k.ilan_id) : '"İlgileniyorum"';
        const sonuc = k.durum === 'tamam' ? '✅' : k.durum === 'hata' ? '❌ ' + esc(k.mesaj || '') : '⏳ bekliyor';
        h += '<div class="kom"><b>' + esc(k.kim) + '</b> · ' + ne + ' · ' + trSaat(Date.parse(k.olusturma)) + ' · ' + sonuc + '</div>';
      });
      h += '</div>';
    }

    // Karne sekmesi
    h += '§karne§';
    // Gün sonu özeti (karne sekmesinde, haftalık karnenin üstünde): eklenti her gün özet saatinde üretir
    if (d.gunsonu && d.gunsonu.metin) {
      h += '<div class="kart"><h2>Günlük rapor <span>' + esc(d.gunsonu.tarih || '') + '</span></h2>' +
        '<div class="kom" style="white-space:pre-line">' + esc(d.gunsonu.metin) + '</div></div>';
    }
    h += '<div class="kart">' + karneIcerik() + '</div>';

    // Yalnızca açık sekmeyi göster; alt menü
    const B = S.sekme || 'ozet';
    const parca = h.split(/§(\w+)§/);
    let goster = parca[0];
    for (let i = 1; i < parca.length; i += 2) if (parca[i] === B) goster += parca[i + 1];
    const kOkunmadi = S.karne && S.ekip && S.karne.okuyanlar.indexOf(S.ekip.ad) === -1;
    const sekmeler = [
      ['ozet', 'ozet', 'Özet', yap.length],
      ['harita', 'harita', 'Harita', 0],
      ['talep', 'op', 'Operasyon', sosList.length ? '!' : aktif.length],
      ['destek', 'destek', 'Destek', destek.length],
      ['sofor', 'sofor', 'Şoförler', ehl.length + bakilmamis],
      ['karne', 'karne', 'Rapor', kOkunmadi ? '!' : 0]
    ];
    goster += '<nav class="altmenu">' + sekmeler.map((s) => '<button data-sekme="' + s[0] + '" class="' + (s[0] === B ? 'on' : '') + '"><span class="am-ik">' + ikon(s[1]) +
      (s[3] ? '<em>' + esc(s[3]) + '</em>' : '') + '</span>' + s[2] + '</button>').join('') + '</nav>';

    const eskiHarita = S.haritaEl && S.haritaEl.parentNode ? S.haritaEl.parentNode.removeChild(S.haritaEl) : S.haritaEl;
    $('uygulama').innerHTML = goster;
    if (window.L && $('haritaYer')) haritaCiz(talepler, soforler, e, eskiHarita, musait, sosList);
    document.querySelectorAll('[data-sos]').forEach((b) => {
      b.onclick = () => {
        const durum = b.dataset.sosd;
        if (durum === 'Çözüldü' && !confirm('SOS #' + b.dataset.sos + ' çözüldü olarak kapatılsın mı?')) return;
        komutGonder({ tur: 'sos_durum', ilan_id: String(b.dataset.sos), metin: durum }, b, 'SOS #' + b.dataset.sos);
      };
    });
    if ($('yenilikTamam')) $('yenilikTamam').onclick = () => { try { localStorage.setItem('sb_yenilik_gordu', YENILIK.surum); } catch (e) { /* önemsiz */ } ciz(); };
    document.querySelectorAll('[data-kom]').forEach((b) => { b.onclick = () => komutGonder({ tur: b.dataset.kom }, b); });
    document.querySelectorAll('[data-ata]').forEach((b) => { b.onclick = () => ataAc(talepler[+b.dataset.ata]); });
    document.querySelectorAll('[data-rata]').forEach((b) => {   // rezervasyona şoför atama (ileri tarihli: tüm şoförler listelenir)
      b.onclick = () => {
        const r = ((S.durum && S.durum.rezervasyonlar) || []).find((x) => String(x.id) === b.dataset.rata);
        if (r) ataAc(Object.assign({ tip: 'rezervasyon' }, r), true);
      };
    });
    document.querySelectorAll('[data-detay]').forEach((b) => { b.onclick = () => talepDetay(talepler[+b.dataset.detay], musait); });
    document.querySelectorAll('[data-sofor]').forEach((b) => { b.onclick = () => soforDetay(sfSira[+b.dataset.sofor]); });
    document.querySelectorAll('[data-basvuru]').forEach((b) => { b.onclick = () => basvuruDetay(basv[+b.dataset.basvuru]); });
    document.querySelectorAll('[data-tik]').forEach((b) => { b.onclick = () => tikle(basv[+b.dataset.tik], b); });
    document.querySelectorAll('[data-destek]').forEach((b) => { b.onclick = () => destekAc(destek[+b.dataset.destek], basv); });
    if ($('cikis')) $('cikis').onclick = async () => { await S.db.auth.signOut(); location.reload(); };
    if ($('bildirimAc')) $('bildirimAc').onclick = bildirimAc;
    if ($('bildAyar')) $('bildAyar').onclick = () => window.ReactNativeWebView.postMessage('bildirim-ayar');
    document.querySelectorAll('[data-karne]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); sekmeAc('karne'); }; });
    document.querySelectorAll('[data-sekme]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); sekmeAc(a.dataset.sekme); }; });
    if (B === 'karne') karneBagla();
    if (S.ata) cizAta();
  }
  function sekmeAc(s) {
    S.sekme = s;
    try { localStorage.setItem('sb_sekme', s); } catch (e) { /* önemsiz */ }
    ciz();
    window.scrollTo(0, 0);
  }

  function oneri(t, musait) {
    const n = t.nereden;
    if (!n || !sayiMi(n.enlem) || !sayiMi(n.boylam)) return '';
    const l = musait.filter((s) => sayiMi(s.enlem) && sayiMi(s.boylam))
      .map((s) => ({ s, k: km(+n.enlem, +n.boylam, +s.enlem, +s.boylam) })).sort((a, b) => a.k - b.k);
    if (!l.length) return ik('harita') + 'Konumu bilinen müsait şoför yok';
    const eski = l[0].s.konum_ms && Date.now() - l[0].s.konum_ms > 30 * 60000;
    return ik('harita') + 'En yakın: ' + esc(l[0].s.ad) + ' ~' + kmYaz(l[0].k) + (l[0].s.konum_ms ? ' (konum ' + sure(Date.now() - l[0].s.konum_ms) + ' önce' + (eski ? ' ⚠' : '') + ')' : '');
  }

  /* ---------------- detay pencereleri ---------------- */
  const harita = (y) => 'https://www.google.com/maps/search/?api=1&query=' + (sayiMi(y.enlem) && sayiMi(y.boylam) ? (+y.enlem) + ',' + (+y.boylam) : encodeURIComponent([y.adres, y.ilce, y.il].filter(Boolean).join(', ')));
  function pencere(h) {
    let p = $('detayPerde');
    if (!p) { p = document.createElement('div'); p.id = 'detayPerde'; p.className = 'perde'; document.body.appendChild(p); }
    p.innerHTML = '<div class="pencere">' + h + '<button class="btn" id="detayKapat" style="margin-top:10px">Kapat</button></div>';
    p.onclick = (e) => { if (e.target === p) p.remove(); };
    $('detayKapat').onclick = () => p.remove();
    return p;
  }
  function bilgi(ad, deger) { return deger ? '<div class="kom"><span style="color:var(--soluk)">' + esc(ad) + ':</span> <b>' + deger + '</b></div>' : ''; }
  function talepDetay(t, musait) {
    const n = t.nereden || {}, v = t.nereye || {};
    const dk = Math.floor((Date.now() - t.olusma) / 60000);
    let h = '<h3>' + esc(yerYaz(n)) + ' → ' + esc(yerYaz(v)) + '</h3><div class="alt">' + (t.sessiz ? 'Uyarı dışı · ' : '') + dk + ' dk bekliyor</div>';
    h += bilgi('Nereden', esc([n.adres, n.ilce, n.il].filter(Boolean).join(', ')));
    h += bilgi('Nereye', esc([v.adres, v.ilce, v.il].filter(Boolean).join(', ')));
    h += bilgi('Oluşturma', new Date(t.olusma).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
    h += bilgi('Tutar', t.tutar ? esc(t.tutar) + ' TL' : '');
    h += bilgi('Tür', t.tip === 'planli' ? 'Planlı' : t.tip === 'anlik' ? 'Anlık' : '');
    const l = sayiMi(n.enlem) ? musait.filter((s) => sayiMi(s.enlem)).map((s) => ({ s, k: km(+n.enlem, +n.boylam, +s.enlem, +s.boylam) })).sort((a, b) => a.k - b.k) : [];
    if (l.length) {
      h += '<div class="kom" style="color:var(--soluk)">Müsait şoförler (yakından uzağa):</div>' + l.map((x) =>
        '<div class="kom"><b>' + esc(x.s.ad) + '</b> · ~' + kmYaz(x.k) + (x.s.konum_ms ? ' · konum ' + sure(Date.now() - x.s.konum_ms) + ' önce' : '') + '</div>').join('');
    }
    h += '<div class="ikili" style="margin-top:12px"><a class="btn" style="text-align:center;text-decoration:none" href="' + harita(n) + '" target="_blank" rel="noopener">' + ik('harita') + 'Haritada aç</a>' +
      (t.id ? '<a class="btn" style="text-align:center;text-decoration:none" href="' + ADMIN + 'admin/ilanlar/' + encodeURIComponent(t.tip || 'anlik') + '/' + encodeURIComponent(t.id) + '" target="_blank" rel="noopener">Admin\'de aç</a>' : '<span></span>') + '</div>';
    if (t.id) h += '<button class="btn yesil" id="detayAta" style="margin-top:8px">Şoför ata</button>';
    pencere(h);
    if ($('detayAta')) $('detayAta').onclick = () => { $('detayPerde').remove(); ataAc(t); };
  }
  function soforDetay(s) {
    let h = '<h3>' + esc(s.ad) + '</h3><div class="alt">' + esc(s.durum || '?') + (s.cevrimici ? ' · uygulama açık' : ' · uygulama kapalı') + '</div>';
    h += bilgi('Konum', s.konum_ms ? sure(Date.now() - s.konum_ms) + ' önce alındı' + (Date.now() - s.konum_ms > 30 * 60000 ? ' (eski olabilir)' : '') : 'bilinmiyor');
    h += bilgi('Telefon', s.telefon ? esc(s.telefon) : '');
    h += '<div class="ikili" style="margin-top:12px">' +
      (sayiMi(s.enlem) ? '<a class="btn" style="text-align:center;text-decoration:none" href="' + harita(s) + '" target="_blank" rel="noopener">' + ik('harita') + 'Haritada aç</a>' : '<span></span>') +
      (s.telefon ? '<a class="btn mavi" style="text-align:center;text-decoration:none" href="tel:' + esc(String(s.telefon).replace(/[^\d+]/g, '')) + '">' + ik('tel') + 'Ara</a>' : '<span></span>') + '</div>';
    pencere(h);
  }

  /* ---------------- harita ---------------- */
  function haritaCiz(talepler, soforler, e, el, musait, sosList) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'harita';
      S.haritaEl = el;
    }
    $('haritaYer').appendChild(el);
    if (!S.harita) {
      S.harita = L.map(el, { zoomControl: true, attributionControl: true }).setView([37.86, 27.26], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(S.harita);
      S.haritaKatman = L.layerGroup().addTo(S.harita);
    }
    setTimeout(() => S.harita.invalidateSize(), 0);
    const kat = S.haritaKatman;
    kat.clearLayers();
    const noktalar = [];
    soforler.filter((s) => sayiMi(s.enlem) && sayiMi(s.boylam)).forEach((s) => {
      const eski = !s.konum_ms || Date.now() - s.konum_ms > 30 * 60000;
      const renk = s.durum === 'Müsait' ? '#2ecc71' : s.durum === 'Meşgul' ? '#f5b041' : '#8a90a0';
      const m = L.circleMarker([+s.enlem, +s.boylam], { radius: 8, color: renk, weight: 3, fillColor: '#fff', fillOpacity: eski ? 0.35 : 1, opacity: eski ? 0.6 : 1, dashArray: eski ? '3 3' : null })
        .bindPopup('<b>' + esc(s.ad) + '</b><br>' + esc(s.durum || '') + (s.hiz != null ? ' · ' + esc(String(s.hiz)) + ' km/s' : '') + (s.konum_ms ? '<br>konum ' + sure(Date.now() - s.konum_ms) + ' önce' : ''));
      kat.addLayer(m);
      noktalar.push([+s.enlem, +s.boylam]);
    });
    talepler.filter((t) => !t.sessiz && t.nereden && sayiMi(t.nereden.enlem) && sayiMi(t.nereden.boylam)).forEach((t) => {
      const sv = seviye(t.yasDk, e);
      const renk = { acil: '#ff4757', alarm: '#ff7a2f', uyari: '#f5b041', ok: '#2ecc71' }[sv[0]];
      const m = L.circleMarker([+t.nereden.enlem, +t.nereden.boylam], { radius: 11, color: '#111', weight: 2, fillColor: renk, fillOpacity: 0.95 })
        .bindTooltip(esc(yerYaz(t.nereden)) + ' · ' + Math.floor(t.yasDk) + ' dk', { direction: 'top' });
      m.on('click', () => talepDetay(t, musait));
      kat.addLayer(m);
      noktalar.push([+t.nereden.enlem, +t.nereden.boylam]);
    });
    (sosList || []).filter((x) => sayiMi(x.enlem) && sayiMi(x.boylam)).forEach((x) => {
      const m = L.circleMarker([+x.enlem, +x.boylam], { radius: 14, color: '#fff', weight: 3, fillColor: '#ff1f3d', fillOpacity: 1, className: 'sos-nokta' })
        .bindTooltip('🆘 SOS #' + esc(x.id) + ' · ' + esc(x.durum || ''), { direction: 'top', permanent: true });
      kat.addLayer(m);
      noktalar.push([+x.enlem, +x.boylam]);
    });
    // İlk açılışta (ya da nokta sayısı değişince) tümünü sığdır; kullanıcı yakınlaştırdıysa bozma
    const imza = noktalar.length;
    if (noktalar.length && S.haritaImza !== imza) {
      S.haritaImza = imza;
      S.harita.fitBounds(noktalar, { padding: [30, 30], maxZoom: 13 });
    }
  }

  /* ---------------- destek talepleri: yanıt önerisi ---------------- */
  const kucuk = (s) => String(s || '').toLocaleLowerCase('tr-TR');
  const ayni = (a, b) => kucuk(a).replace(/\s+/g, ' ').trim() === kucuk(b).replace(/\s+/g, ' ').trim();
  // Kural tabanlı öneri: konu + mesajdaki kelimeler + kendi verimiz (başvuru listesi). Yapay zekâ değil, ücretsiz.
  // Destek talebindeki kişi kim? Kabul edilmiş şoför (eklenti telefonla eşleştirir, t.sofor_no) / aday (bekleyen başvuru) / üye
  const tel10 = (s) => (String(s || '').replace(/\D/g, '').match(/5\d{9}$/) || [''])[0];
  function kimlik(t, basv) {
    const b = (basv || []).find((x) => ayni(x.ad, t.ad) || (t.tel && tel10(x.telefon) === t.tel));
    if (t.sofor_no) return { tur: 'sofor', b: b, yazi: '✅ Kabul edilmiş şoför #' + t.sofor_no };
    if (b) return { tur: 'aday', b: b, yazi: '🕓 Aday · başvuru #' + b.no + ' incelemede' };
    if (t.red) return { tur: 'red', b: null, yazi: '⛔ ' + (/Çıkar/i.test(t.red.durum) ? 'Şoförlükten çıkarıldı' : 'Başvurusu reddedildi') + ' · başvuru #' + t.red.no };
    if (t.sofor_no == null) return { tur: '?', b: null, yazi: '❔ Şoför mü bilinmiyor' };
    return { tur: 'uye', b: null, yazi: '👤 Üye · şoför değil, bekleyen başvurusu yok' };
  }
  function yanitOner(t, basv) {
    const ad = String(t.ad || '').split(' ')[0];
    const kisi = (t.mesajlar || []).filter((m) => m.kim === 'kisi');
    // Önce kişinin kendi yazdığına bakılır; konu (ör. "Şoför / Üye") yalnızca mesajdan bir şey çıkmazsa kullanılır
    const metin = kucuk(kisi.map((m) => m.metin).join(' '));
    const konu = kucuk(t.konu);
    const sonKisa = kisi.length > 1 && /^[\s?.!]+$/.test(kisi[kisi.length - 1].metin);   // "?", "?????" gibi hatırlatma
    const var_ = (...k) => k.some((x) => metin.includes(x));
    const kim = kimlik(t, basv);
    const basvurusu = kim.b;
    let govde;
    const belgeKonusu = var_('src', 'psikotek', 'psiko tek');
    const belgeHazir = belgeKonusu && !var_('yok', 'var mı', 'var mi', 'şart mı', 'gerekli mi', 'zorunlu mu') &&
      (var_('hazır', 'aldım', 'tamamladım', 'yükled', 'elimde', 'mevcut') || /\bvar\b/.test(metin));
    // Son mesaj yalnızca teşekkürse (soru yok, kısa) eski mesajlara bakmadan kısa karşılık (kullanıcı, 2026-11-19: başvurusu olana inceleme mesajı gidiyordu)
    const sonMesaj = kucuk(kisi.length ? kisi[kisi.length - 1].metin : '');
    const tesekkurKalip = /teşekkür\w*|tesekkur\w*|sağ ?ol\w*|sagol\w*|eyvallah|allah razı olsun|eline sağlık/g;
    // Teşekkür ve nezaket sözcükleri çıkınca geriye anlamlı söz kalmamalı ("başvurdum ekranım kapalı teşekkürler" teşekkür sayılmaz)
    const kalan = sonMesaj.replace(tesekkurKalip, ' ').replace(/[^a-zçğıöşü\s]/g, ' ').split(/\s+/)
      .filter((w) => w && !['ederim', 'ederiz', 'çok', 'cok', 'size', 'siz', 'sizlere', 'de', 'da', 'abi', 'hocam', 'kardeşim', 'iyi', 'günler', 'akşamlar', 'çalışmalar', 'geceler', 'tamam', 'tamamdır', 'peki', 'ok', 'okey', 'anladım', 'anlaşıldı', 'bilgi', 'bilgilendirme', 'için', 'ilginiz', 'ilginize', 'yardımınız', 'merhaba', 'selam', 'hayırlı', 'olsun', 'kolay', 'gelsin', 'rica'].includes(w));
    const sadeceTesekkur = tesekkurKalip.test(sonMesaj) && !sonMesaj.includes('?') && kalan.length <= 1;
    if (sadeceTesekkur && kim.tur === 'aday') {
      return '';   // Teşekkür eden adaya cevap yazılmaz (kullanıcı, 2026-11-19)
    } else if (sadeceTesekkur) {
      govde = 'Rica ederiz, ' + ((kim.tur === 'sofor' || kim.tur === 'aday') ? 'iyi çalışmalar dileriz.' : 'iyi yolculuklar dileriz.');
    } else if (belgeHazir && kim.tur === 'aday') {
      // Kabul edilmeden "belgem hazır" diyen aday → önce başvurunun sonuçlanması beklenir (kullanıcı, 2026-11-19)
      govde = 'Teşekkürler! Başvurunuz #' + basvurusu.no + ' şu an inceleme aşamasında. Başvurunuz kabul edildikten sonra SRC, psikoteknik belgenizi ve profil fotoğrafınızı uygulamadan nasıl yükleyeceğinizi size ileteceğiz.';
    } else if (belgeHazir && kim.tur === 'red') {
      // Reddedilmiş/çıkarılmış kişiye yükleme talimatı verilmez; nötr cevap, kararı ekip verir
      govde = 'Mesajınız için teşekkürler. Başvurunuzun durumunu kontrol edip size dönüş yapacağız.';
    } else if (belgeHazir && kim.tur === 'uye') {
      govde = 'Teşekkürler! Belgeleri yükleyebilmek için önce uygulamadan şoför başvurusu yapmanız gerekiyor. Başvurunuz kabul edildikten sonra SRC, psikoteknik belgenizi ve profil fotoğrafınızı yükleyebileceksiniz.';
    } else if (belgeHazir) {
      // Kabul edilmiş şoför (ya da bilinmiyor) → uygulamadan kendisi yüklesin (kullanıcı, 2026-11-19)
      govde ='Teşekkürler! Uygulamada Profil > Belgelerim bölümünden SRC, psikoteknik belgenizi ve profil fotoğrafınızı yükleyin. Profil > Kişisel Bilgiler\'in en altındaki "Kendimi tanıtıyorum" alanını da doldurun. Ardından kontrol edip dönüş yapacağız.' +
        (basvurusu ? ' Başvurunuz #' + basvurusu.no + ' sistemimizde kayıtlı.' : '');
    } else if (belgeKonusu) {
      // "SRC/psikoteknik şart mı?" → şart (kullanıcı, 2026-11-19); başvuru için değil, işe başlamak için
      govde = 'Evet, SRC ve psikoteknik belgesi bizimle şoför olarak çalışabilmek için şarttır; bu belgeler olmadan çalışmaya başlamak mümkün değil. ' +
        'Başvurunuzu belgeler henüz yokken de yapabilirsiniz; başvurunuz incelenir ve sizinle görüşülür. Ancak işe başlamadan önce SRC ve psikoteknik belgelerinizi tamamlamanız gerekiyor. ' +
        'SRC belgesi sürücü kursları üzerinden, psikoteknik belgesi ise yetkili psikoteknik merkezlerinden alınabiliyor.' +
        (basvurusu ? ' Başvurunuz #' + basvurusu.no + ' sistemimizde kayıtlı ve inceleme aşamasında.' : '');
    } else if (var_('başvur', 'şoför ol', 'evrak', 'belge', 'ehliyet', 'adli sicil', 'ekranım kapalı', 'onay') || (basvurusu && !var_('ödeme', 'iptal', 'gecik'))) {
      const b = basvurusu;
      if (b) {
        // SRC/psikoteknik başvuruda istenmiyor; görüşmeden sonra, işe başlamadan önce isteniyor (kullanıcı, 2026-11-19)
        govde = 'Şoför başvurunuz #' + b.no + ' (' + b.tarih + ') sistemimizde kayıtlı ve şu an inceleme aşamasında. ' +
          'İncelemenin ardından sizinle görüşeceğiz; görüşmeden sonra, çalışmaya başlamadan önce SRC ve psikoteknik belgelerinizi de isteyeceğiz.' +
          ((b.src && b.psiko) ? '' : ' Hazırlamaya şimdiden başlarsanız süreç hızlanır.');
      } else {
        govde = 'Şoför başvurunuzla ilgili kontrol yaptık ancak başvuruyu bekleyenler arasında göremedik. Uygulamadaki "Şoför Başvurusu" adımlarını tamamlayıp ehliyet ve adli sicil belgenizi yüklediğinizden emin olur musunuz? Tamamladıysanız başvuruda kullandığınız telefon numarasını yazmanız yeterli, hemen bakalım.';
      }
    } else if (var_('kazanç', 'kazan', 'şoför olsa', 'şoför olmak', 'şöför olsa', 'çalışmak ist', 'etkin mi', 'aktif mi', 'hangi şehir', 'bölge')) {
      govde = 'İlginiz için teşekkür ederiz. Şoför olarak çalışmak için uygulamadaki şoför başvurusu adımını tamamlamanız yeterli. Başvurunuz incelendikten sonra ekibimiz çalışma bölgeleri ve kazanç detayları hakkında sizinle görüşecek. Çalışmaya başlamadan önce SRC ve psikoteknik belgesi gerekiyor; görüşmeden sonra bunları isteyeceğiz.';
    } else if (var_('üyelik', 'üye ol', 'kayıt', 'tamamla', 'hesap aç', 'hesabımı aç')) {
      govde = 'Üyeliğinizi tamamlamanıza yardımcı olalım. Hangi adımda takıldığınızı yazar mısınız? Uygulamayı yolcu olarak mı kullanmak istiyorsunuz, yoksa şoför olarak mı çalışmak istiyorsunuz? Buna göre size adım adım yol gösterelim.';
    } else if (var_('gecik', 'gelmedi', 'bekledim') && var_('iade', 'ücret', 'para')) {
      govde = 'Yaşadığınız gecikme için özür dileriz. Yolculuğun tarih ve saatini yazarsanız şoförümüzle görüşüp ücret iadesi talebinizi inceleyecek ve en kısa sürede size dönüş yapacağız.';
    } else if (var_('ödeme', 'ücret', 'para', 'iade', 'kart', 'iban', 'fatura', 'çekildi', 'tahsil')) {
      govde = 'Ödemenizle ilgili kontrol yapıyoruz. Ödemenin tarihini ve tutarını, varsa dekontunu yazarsanız konuyu hızlıca sonuçlandırırız.';
    } else if (var_('iptal')) {
      govde = 'İptal talebinizi aldık. Yolculuğun tarih ve saatini yazarsanız işlemi hemen yapıp size bilgi verelim.';
    } else if (var_('gelmedi', 'gecik', 'bekledim', 'bekliyorum', 'nerede', 'ulaşamadım', 'kaba', 'şikayet')) {
      govde = 'Yaşadığınız durum için özür dileriz. Yolculuğun tarih ve saatini yazarsanız şoförümüzle görüşüp en kısa sürede size dönüş yapacağız.';
    } else if (var_('hata', 'açılmıyor', 'giriş', 'şifre', 'çalışmıyor', 'kod', 'sms', 'uygulama', 'teknik', 'donuyor')) {
      govde = 'Sorunu çözmek için uygulamayı güncelleyip yeniden açmayı deneyebilir misiniz? Devam ederse telefonunuzun modelini ve gördüğünüz hata mesajını (mümkünse ekran görüntüsüyle) yazarsanız hemen ilgileniriz.';
    } else if (var_('sil', 'kapat')) {
      govde = 'Hesabınızla ilgili talebinizi aldık. İşlemi güvenle yapabilmemiz için hesabınızda kayıtlı telefon numarasını yazar mısınız?';
    } else if (var_('teşekkür', 'sağol', 'tamam', 'eyvallah')) {
      govde = 'Rica ederiz, iyi yolculuklar dileriz.';
    } else if (konu.includes('teknik')) {
      govde = 'Yaşadığınız teknik sorunu çözmek için biraz daha bilgiye ihtiyacımız var: hangi ekranda ne oluyor, telefonunuzun modeli nedir? Mümkünse ekran görüntüsü de ekleyebilirsiniz.';
    } else if (konu.includes('yolculuk')) {
      govde = 'Yolculuğunuzla ilgili mesajınızı aldık. Yolculuğun tarih ve saatini yazarsanız hemen inceleyip size dönüş yapalım.';
    } else {
      govde = 'Mesajınız için teşekkür ederiz. Konuyu inceleyip en kısa sürede size dönüş yapacağız.';
    }
    // "Merhaba" yalnızca ilk cevapta; daha önce biz yazdıysak konuşma devam ediyor (kullanıcı, 2026-11-19)
    const ilkCevap = !(t.mesajlar || []).some((m) => m.kim === 'destek');
    return (ilkCevap ? 'Merhaba' + (ad ? ' ' + ad : '') + ',\n' : '') + (sonKisa ? 'Geç dönüş için kusura bakmayın. ' : '') + govde + '\n\nŞoför Bey Destek Ekibi';
  }
  // Kişinin son mesajına bağlı anahtar: yeniden yazınca anahtar değişir, talep tekrar görünür (basvuru_takip tablosunda, ekip ortak)
  function destekAnahtar(t) {
    const son = (t.mesajlar || []).filter((m) => m.kim === 'kisi').slice(-1)[0] || {};
    return 'd:' + t.tip + ':' + t.id + ':' + (son.zaman || '') + ':' + String(son.metin || '').length;
  }
  function destekAc(t, basv) {
    let h = '<h3>💬 ' + esc(t.ad || 'Kişi') + '</h3><div class="alt">' + esc(t.konu) + ' · #' + esc(t.id) + '</div><div class="alt"><b>' + esc(kimlik(t, basv).yazi) + '</b></div>';
    h += '<div class="sohbet">' + (t.mesajlar || []).map((m) => '<div class="balon ' + (m.kim === 'destek' ? 'biz' : 'o') + '">' + esc(m.metin) + '<small>' + esc(m.zaman) + '</small></div>').join('') + '</div>';
    h += '<div class="basv-gun">Önerilen yanıt (düzeltebilirsin)</div><textarea id="destekMetin" rows="7" maxlength="3000"></textarea>' +
      '<div class="ikili" style="margin-top:8px"><a class="btn" style="text-align:center;text-decoration:none" href="' + ADMIN + 'admin/destek-talepleri/' + encodeURIComponent(t.tip) + '/' + encodeURIComponent(t.id) + '" target="_blank" rel="noopener">Admin\'de aç</a>' +
      '<button class="btn yesil" id="destekGonder">Gönder</button></div>' +
      '<label class="alt" style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="destekGerekmez"> Cevap gerekmiyor (tekrar yazana kadar gizle)</label>' +
      '<p class="alt" style="margin-top:8px">Cevabı açık olan bilgisayardaki eklenti gönderir; birkaç saniye sürer.</p>';
    pencere(h);
    $('destekMetin').value = yanitOner(t, basv);
    if (!$('destekMetin').value) $('destekMetin').placeholder = 'Aday yalnızca teşekkür etmiş, cevap gerekmiyor. Aşağıdaki kutucuğu işaretleyebilirsin.';
    $('destekGerekmez').onchange = async (e) => {
      if (!e.target.checked) return;
      await tikle({ no: destekAnahtar(t), ad: t.ad || 'Talep' }, e.target);
      const p = $('detayPerde'); if (p) p.remove();
    };
    $('destekGonder').onclick = () => {
      const m = $('destekMetin').value.trim();
      if (!m) { bildir('Yanıt boş olamaz'); return; }
      komutGonder({ tur: 'destek_cevap', ilan_tipi: t.tip, ilan_id: String(t.id), metin: m }, $('destekGonder'), t.ad || 'Kişi');
      $('detayPerde').remove();
    };
  }

  /* ---------------- haftalık karne ---------------- */
  async function karneYukle() {
    if (DEMO) return;
    const { data } = await S.db.from('karneler').select('hafta,veri,olusturma').order('hafta', { ascending: false }).limit(1);
    if (!data || !data.length) { S.karne = null; ciz(); return; }
    const k = data[0];
    const { data: ok } = await S.db.from('karne_okuma').select('kim,zaman').eq('hafta', k.hafta);
    const { data: ek } = await S.db.from('ekip').select('ad');
    S.karne = { hafta: k.hafta, veri: k.veri, okuyanlar: (ok || []).map((x) => x.kim), okuma: ok || [], ekip: (ek || []).map((x) => x.ad) };
    ciz();
  }
  function cubuklar(dizi, etiketler, renk) {
    const en = Math.max(1, ...dizi);
    return '<div class="kr-grafik">' + dizi.map((n, i) => '<div class="kr-sut" title="' + esc(etiketler[i]) + ': ' + n + '"><i style="height:' + Math.round((n / en) * 100) + '%;background:' + renk + '"></i><span>' + esc(etiketler[i]) + '</span></div>').join('') + '</div>';
  }
  function liste(a, bos) {
    return a && a.length ? a.map((x) => '<div class="kom"><b>' + esc(x.kim || x.ad) + '</b> · ' + x.n + '</div>').join('') : '<div class="bos">' + bos + '</div>';
  }
  function karneAc() { sekmeAc('karne'); }
  // Karnenin içeriği (Karne sekmesinde gösterilir); "Okudum" düğmesi karneBagla ile bağlanır
  function karneIcerik() {
    const k = S.karne;
    if (!k) return '<h3>Haftalık rapor</h3><div class="alt">Henüz rapor yok. İlk rapor, veriler biriktikten sonra pazartesi sabahı hazırlanır.</div>';
    const v = k.veri || {};
    const tarih = String(k.hafta).split('-').reverse().join('.');
    const fark = v.onceki_talep != null && v.onceki_talep > 0 ? Math.round(((v.talep - v.onceki_talep) / v.onceki_talep) * 100) : null;
    const hizliYuzde = v.talep ? Math.round((v.hizli / v.talep) * 100) : 0;
    const saatler = (v.saatler || []).map((n, i) => n);
    const yogun = saatler.length ? saatler.indexOf(Math.max(...saatler)) : -1;
    const okudum = S.ekip && k.okuyanlar.indexOf(S.ekip.ad) !== -1;
    let h = '<h3>Haftalık rapor</h3><div class="alt">' + tarih + ' haftası (pazartesi–pazar)</div>' +
      '<div class="sayilar" style="margin-top:6px">' +
      '<div class="sayi"><b>' + (v.talep || 0) + '</b><span>Talep' + (fark != null ? ' · ' + (fark >= 0 ? '▲' : '▼') + Math.abs(fark) + '%' : '') + '</span></div>' +
      '<div class="sayi"><b>' + (v.ort_dk != null ? String(v.ort_dk).replace('.', ',') : '–') + '</b><span>Ort. atama (dk)</span></div>' +
      '<div class="sayi"><b style="color:' + (v.acil ? 'var(--kirmizi)' : 'var(--yesil)') + '">' + (v.acil || 0) + '</b><span>ACİL</span></div></div>' +
      '<div class="kom">⚡ 5 dakikada atanan: <b>%' + hizliYuzde + '</b> · en uzun bekleme: <b>' + (v.en_uzun_dk != null ? v.en_uzun_dk + ' dk' : '–') + '</b>' + (yogun >= 0 && saatler[yogun] ? ' · en yoğun saat: <b>' + String(yogun).padStart(2, '0') + ':00</b>' : '') + '</div>' +
      '<div class="basv-gun">Günlere göre talep</div>' + cubuklar(v.gunler || [], ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'], 'var(--mavi)') +
      '<div class="basv-gun">Saatlere göre talep</div>' + cubuklar(saatler, saatler.map((_, i) => (i % 3 === 0 ? String(i) : '')), 'var(--sari)') +
      '<div class="basv-gun">En çok talep gelen yerler</div>' + liste(v.ilceler, 'Veri yok') +
      '<div class="basv-gun">Ekip: alarm "Gördüm"</div>' + liste(v.gordum, 'Kayıt yok') +
      '<div class="basv-gun">Ekip: başvuru tiki</div>' + liste(v.basvuru_tik, 'Kayıt yok') +
      '<div class="basv-gun">Ekip: panelden şoför atama</div>' + liste(v.panel_atama, 'Kayıt yok') +
      (v.destek ? '<div class="basv-gun">Destek talepleri</div><div class="kom">💬 Cevap bekleyen talep: <b>' + (v.destek.talep || 0) + '</b> · mesaj: <b>' + (v.destek.mesaj || 0) + '</b> · panelden gönderilen cevap: <b>' + (v.destek.cevap || 0) + '</b></div>' +
        '<div class="basv-gun">Ekip: panelden destek cevabı</div>' + liste(v.destek.cevaplayan, 'Kayıt yok') : '') +
      '<div class="basv-gun">Kim okudu</div>' + (k.ekip || []).map((a) => {
        const o = k.okuma.find((x) => x.kim === a);
        return '<div class="kom">' + (o ? '✅ <b>' + esc(a) + '</b> · ' + new Date(o.zaman).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '⏳ <b>' + esc(a) + '</b> · henüz okumadı') + '</div>';
      }).join('') +
      (okudum ? '<div class="serit" style="background:var(--yesilAcik);color:var(--mavi);margin-top:12px">✅ Okudun, teşekkürler.</div>' : '<button class="btn yesil" id="okudum" style="margin-top:12px">Okudum ✓</button>');
    return h;
  }
  function karneBagla() {
    const k = S.karne;
    if ($('okudum')) $('okudum').onclick = async () => {
      $('okudum').disabled = true;
      if (!DEMO) {
        const { error } = await S.db.from('karne_okuma').insert({ hafta: k.hafta, kim: S.ekip.ad });
        if (error && error.code !== '23505') { bildir('Kaydedilemedi: ' + error.message); $('okudum').disabled = false; return; }
        await karneYukle();
      } else { k.okuyanlar.push(S.ekip.ad); k.okuma.push({ kim: S.ekip.ad, zaman: new Date().toISOString() }); }
      bildir('✅ Rapor okundu olarak işaretlendi');
      ciz();
    };
  }

  /* ---------------- telefon bildirimi (Web Push) ---------------- */
  const FN = C.url + '/functions/v1/push';
  const ayrik = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // Android uygulaması (ŞB Kokpit APK) kendi bildirim adresini verir; panel onu giriş yapan kişi adına kaydeder
  async function expoKaydet() {
    const t = window.SB_EXPO_TOKEN;
    if (!t || !S.ekip || !S.db) return;
    const { error } = await S.db.from('push_abone').insert({ endpoint: 'expo:' + t, abonelik: { expo: t }, kim: S.ekip.ad });
    if (!error || error.code === '23505') { S.bildirim = 'acik'; ciz(); }
  }
  window.addEventListener('sb-expo-token', expoKaydet);
  async function bildirimDurum() {
    if (window.ReactNativeWebView || C.uygulama) { if (window.SB_EXPO_TOKEN) await expoKaydet(); return window.SB_EXPO_TOKEN ? 'acik' : 'yok'; }
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios && !ayrik() ? 'ios' : 'yok';
    if (Notification.permission === 'denied') return 'engelli';
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        const { data } = await S.db.from('push_abone').select('endpoint').eq('endpoint', sub.endpoint);
        if (data && data.length) return 'acik';
      }
    } catch (e) { /* kapalı say */ }
    return 'kapali';
  }
  function anahtarDiz(b64) {
    const p = '='.repeat((4 - (b64.length % 4)) % 4);
    const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }
  async function bildirimAc() {
    const btn = $('bildirimAc');
    if (btn) btn.disabled = true;
    try {
      const izin = await Notification.requestPermission();
      if (izin !== 'granted') { S.bildirim = izin === 'denied' ? 'engelli' : 'kapali'; ciz(); return; }
      const reg = await navigator.serviceWorker.ready;
      const { anahtar } = await fetch(FN + '?islem=anahtar').then((r) => r.json());
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarDiz(anahtar) });
      const { error } = await S.db.from('push_abone').insert({ endpoint: sub.endpoint, abonelik: sub.toJSON(), kim: S.ekip.ad });
      if (error && error.code !== '23505') throw new Error(error.message);
      S.bildirim = 'acik';
      bildir('🔔 Bildirimler açıldı. Alarm gelince telefonun çalacak.');
      ciz();
    } catch (e) {
      bildir('Bildirim açılamadı: ' + (e && e.message ? e.message : e));
      if (btn) btn.disabled = false;
    }
  }

  // Başvuruya "baktım" tiki: bulutta ortak (herkes görür); ikinci dokunuş geri alır
  async function tikle(b, btn) {
    const no = String(b.no);
    const vardi = S.tikler[no];
    btn.disabled = true;
    if (DEMO) {
      if (vardi) delete S.tikler[no]; else S.tikler[no] = { kim: 'Demo', zaman: new Date().toISOString() };
      ciz();
      return;
    }
    const { error } = vardi
      ? await S.db.from('basvuru_takip').delete().eq('no', no)
      : await S.db.from('basvuru_takip').insert({ no: no, kim: S.ekip.ad });
    if (error) { bildir('Kaydedilemedi: ' + error.message); btn.disabled = false; return; }
    if (!vardi) bildir('✓ ' + (b.ad || 'Başvuru') + ' işaretlendi');
    await tikleriYukle();
  }
  async function tikleriYukle() {
    const { data } = await S.db.from('basvuru_takip').select('no,kim,zaman');
    S.tikler = {};
    (data || []).forEach((t) => { S.tikler[t.no] = t; });
    ciz();
  }
  function basvuruDetay(b) {
    let h = '<h3>' + esc(b.ad || 'Başvuru') + '</h3><div class="alt">Başvuru #' + esc(b.no) + ' · ' + esc(b.tarih) + ' · ' + esc(b.durum || '') + '</div>';
    h += bilgi('Telefon', esc(b.telefon));
    h += bilgi('Araç türleri', esc(b.arac));
    h += bilgi('Ehliyet bitiş', esc(b.ehliyet_bitis));
    h += bilgi('SRC belgesi', b.src ? 'var' : 'yok');
    h += bilgi('Psikoteknik', b.psiko ? 'var' : 'yok');
    h += '<div class="ikili" style="margin-top:12px">' +
      (b.telefon ? '<a class="btn mavi" style="text-align:center;text-decoration:none" href="tel:' + esc(String(b.telefon).replace(/[^\d+]/g, '')) + '">' + ik('tel') + 'Ara</a>' : '<span></span>') +
      '<a class="btn" style="text-align:center;text-decoration:none" href="' + ADMIN + 'admin/sofor-basvurulari" target="_blank" rel="noopener">Admin\'de aç</a></div>' +
      '<p class="alt" style="margin-top:10px">Onay ve ret admin panelden yapılır (belgeler orada).</p>';
    pencere(h);
  }

  /* ---------------- şoför atama penceresi ---------------- */
  function ataAc(t, tumu) { S.ata = t; S.secili = null; S.tumu = !!tumu; cizAta(); }
  function cizAta() {
    let p = $('ataPerde');
    if (!p) { p = document.createElement('div'); p.id = 'ataPerde'; p.className = 'perde'; document.body.appendChild(p); }
    const t = S.ata;
    const n = t.nereden || {};
    const sf = (S.durum && S.durum.soforler) || [];
    const liste = sf.filter((s) => S.tumu || s.durum === 'Müsait').map((s) => {
      const k = sayiMi(n.enlem) && sayiMi(s.enlem) ? km(+n.enlem, +n.boylam, +s.enlem, +s.boylam) : null;
      return { s, k };
    }).sort((a, b) => (a.k == null) - (b.k == null) || (a.k || 0) - (b.k || 0));
    let h = '<div class="pencere"><h3>Şoför ata</h3><div class="alt">' + esc(yerYaz(t.nereden)) + ' → ' + esc(yerYaz(t.nereye)) + ' · ' + (t.tip === 'rezervasyon'
      ? 'Rezervasyon #' + esc(t.id) + (t.zaman ? ' · ' + esc(new Date(t.zaman).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short' }) + ' ' + trSaat(t.zaman)) : '')
      : Math.floor((Date.now() - t.olusma) / 60000) + ' dk bekliyor') + '</div>';
    if (!liste.length) h += '<div class="bos">Müsait şoför yok.</div>';
    liste.forEach((x) => {
      const s = x.s;
      h += '<button class="secim' + (S.secili === String(s.id) ? ' sec' : '') + '" data-sid="' + esc(s.id) + '"><span class="nokta" style="background:' +
        (s.durum === 'Müsait' ? 'var(--yesil)' : s.durum === 'Meşgul' ? 'var(--sari)' : '#555b69') + '"></span><span class="ad">' + esc(s.ad) +
        '<small>' + esc(s.durum || '') + (x.k != null ? ' · ~' + kmYaz(x.k) : '') + (s.konum_ms ? ' · konum ' + sure(Date.now() - s.konum_ms) + ' önce' : '') + '</small></span></button>';
    });
    h += '<p style="margin:4px 0 12px"><a href="#" id="tumu" style="color:var(--mavi);font-size:13px">' + (S.tumu ? 'Yalnızca müsaitleri göster' : 'Meşgul / çevrimdışı şoförleri de göster') + '</a></p>' +
      '<div class="ikili"><button class="btn" id="ataVazgec">Vazgeç</button><button class="btn yesil" id="ataOnay"' + (S.secili ? '' : ' disabled') + '>Şoförü ata</button></div>' +
      '<p class="alt" style="margin-top:10px">Atamayı açık olan bilgisayardaki eklenti yapar; birkaç saniye sürer.</p></div>';
    p.innerHTML = h;
    p.onclick = (e) => { if (e.target === p) ataKapat(); };
    p.querySelectorAll('[data-sid]').forEach((b) => { b.onclick = () => { S.secili = b.dataset.sid; cizAta(); }; });
    $('tumu').onclick = (e) => { e.preventDefault(); S.tumu = !S.tumu; cizAta(); };
    $('ataVazgec').onclick = ataKapat;
    $('ataOnay').onclick = () => {
      const s = sf.find((x) => String(x.id) === S.secili);
      if (!s) return;
      komutGonder({ tur: 'ata', ilan_tipi: t.tip, ilan_id: String(t.id), sofor_id: String(s.id) }, $('ataOnay'), s.ad);
      ataKapat();
    };
  }
  function ataKapat() { S.ata = null; const p = $('ataPerde'); if (p) p.remove(); }

  /* ---------------- bulut işlemleri ---------------- */
  async function komutGonder(k, btn, ad) {
    if (btn) btn.disabled = true;
    if (DEMO) {
      S.komutlar.unshift(Object.assign({ id: Date.now(), kim: 'Demo', durum: 'tamam', olusturma: new Date().toISOString() }, k));
      bildir(k.tur === 'ata' ? ad + ' atandı (demo)' : 'Gönderildi (demo)');
      ciz();
      return;
    }
    const kayit = Object.assign({ kim: S.ekip.ad }, k);
    const { error } = await S.db.from('komutlar').insert(kayit);
    if (error) { bildir('Gönderilemedi: ' + error.message); if (btn) btn.disabled = false; return; }
    bildir(k.tur === 'ata' ? ad + ' için atama gönderildi, bilgisayar yapıyor…' : k.tur === 'destek_cevap' ? ad + ' için cevap gönderiliyor…' : k.tur === 'sos_durum' ? ad + ': "' + k.metin + '" gönderildi, bilgisayar yapıyor…' : k.tur === 'gordum' ? 'Alarm susturuluyor…' : 'Ekibe bildirildi');
    if (Date.now() - S.guncelleme > C.bayatSn * 1000) bildir('Uyarı: şu an veri gelmiyor, işlemi yapacak açık bilgisayar olmayabilir.');
    komutlariYukle();
  }
  async function durumYukle() {
    const { data, error } = await S.db.from('durum').select('veri,kaynak,guncelleme').eq('id', 1).maybeSingle();
    if (error) { bildir('Veri okunamadı: ' + error.message); return; }
    if (data) { S.durum = data.veri; S.guncelleme = data.veri && data.veri.at ? Math.min(Date.parse(data.guncelleme), Date.now()) : 0; }
    ciz();
  }
  async function komutlariYukle() {
    const { data } = await S.db.from('komutlar').select('*').order('olusturma', { ascending: false }).limit(10);
    const once = S.komutlar;
    S.komutlar = data || [];
    // Benim attığım komutun sonucu geldiyse haber ver
    S.komutlar.forEach((k) => {
      const eski = once.find((o) => o.id === k.id);
      if (eski && eski.durum === 'bekliyor' && k.durum !== 'bekliyor' && k.kim === S.ekip.ad) {
        bildir(k.durum === 'tamam' ? '✅ ' + (k.mesaj || 'Tamamlandı') : '❌ ' + (k.mesaj || 'Yapılamadı'));
      }
    });
    ciz();
  }
  let basladi = false;
  let KURTARMA = false;
  async function basla() {
    if (KURTARMA) { cizGiris('yenisifre'); KURTARMA = false; return; }
    const { data } = await S.db.auth.getSession();
    if (!data.session) { cizGiris('giris'); return; }
    if (basladi) return;
    basladi = true;
    if (location.hash) history.replaceState(null, '', location.origin + location.pathname);
    S.kul = data.session.user;
    const { data: ek } = await S.db.from('ekip').select('ad,rol').maybeSingle();
    if (!ek) {
      $('uygulama').innerHTML = '<div class="giris"><img class="logo" src="' + LOGO + '" alt="Şoför Bey"><h1>Yetki yok</h1><p>' + esc(S.kul.email) +
        ' ekip listesinde değil. Yöneticiden eklenmeyi isteyin.</p><button class="btn" id="cikis2">Çıkış</button></div>';
      $('cikis2').onclick = async () => { await S.db.auth.signOut(); location.reload(); };
      return;
    }
    S.ekip = ek;
    await durumYukle();
    await komutlariYukle();
    await tikleriYukle();
    karneYukle();
    if (location.hash === '#karne') setTimeout(karneAc, 800);
    bildirimDurum().then((d) => { S.bildirim = d; ciz(); });
    S.db.channel('kokpit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'basvuru_takip' }, () => tikleriYukle())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'karne_okuma' }, () => karneYukle())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'durum' }, (p) => {
        if (p.new && p.new.veri) { S.durum = p.new.veri; S.guncelleme = Math.min(Date.parse(p.new.guncelleme), Date.now()); ciz(); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'komutlar' }, () => komutlariYukle())
      .subscribe();
    // Canlı bağlantı koparsa diye yedek yenileme + süreleri güncel tut
    setInterval(() => { if (!document.hidden) durumYukle(); }, 20000);
    setInterval(() => { if (!document.hidden) komutlariYukle(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { durumYukle(); komutlariYukle(); } });
  }

  /* ---------------- demo ---------------- */
  function demo() {
    const n = Date.now(), dk = 60000;
    S.ekip = { ad: 'Demo', rol: 'yonetici' };
    S.guncelleme = n - 8000;
    S.durum = {
      v: 1, at: n - 8000, merkez: 'Ofis bilgisayarı', sayfa: 'atama', esikler: { soft: 3, alarm: 5, acil: 10 },
      sos: [{ id: 12, is_id: 345, durum: 'Aktif', zaman: n - 4 * dk, bildiren: 'Ayşe K.', bildiren_tel: '+905550000009', kullanici_tipi: 'Üye', musteri: 'Ayşe K.', musteri_tel: '+905550000009', sofor: 'Ali K.', sofor_tel: '+905550000002', neden: 'Araç arızalandı', enlem: 37.9, boylam: 27.3 }],
      isler: [{ id: 345, durum: 'Yolculukta', musteri: 'Ayşe K.', musteri_tel: '+905550000009', sofor: 'Ali K.', sofor_tel: '+905550000002', sofor_id: 2, tutar: '950', nereden: { ilce: 'Kuşadası', il: 'Aydın' }, nereye: { ilce: 'Selçuk', il: 'İzmir' } }],
      rezervasyonlar: [
        { id: 77, zaman: n + 90 * dk, musteri: 'Can T.', sofor_id: null, sofor: '', tutar: '1200', nereden: { ilce: 'Didim' }, nereye: { ilce: 'Bodrum' } },
        { id: 78, zaman: n + 26 * 60 * dk, musteri: 'Ece D.', sofor_id: 1, sofor: 'Mehmet Y.', tutar: '800', nereden: { ilce: 'Kuşadası' }, nereye: { ilce: 'Söke' } }
      ],
      talepler: [
        { tip: 'anlik', id: 153, olusma: n - 11 * dk, nereden: { ilce: 'Kuşadası', il: 'Aydın', enlem: 37.8575, boylam: 27.261 }, nereye: { ilce: 'Adnan Menderes Havalimanı', il: 'İzmir' }, tutar: '1.850' },
        { tip: 'anlik', id: 154, olusma: n - 6 * dk, nereden: { ilce: 'Selçuk', il: 'İzmir', enlem: 37.95, boylam: 27.37 }, nereye: { ilce: 'Kuşadası Limanı', il: 'Aydın' } },
        { tip: 'anlik', id: 150, olusma: n - 25 * dk, nereden: { ilce: 'Davutlar' }, nereye: { ilce: 'Söke' }, sessiz: true }
      ],
      soforler: [
        { id: 1, ad: 'Mehmet Y.', durum: 'Müsait', cevrimici: true, enlem: 37.86, boylam: 27.27, konum_ms: n - 3 * 1440 * dk, telefon: '+905550000001' },
        { id: 2, ad: 'Ali K.', durum: 'Müsait', cevrimici: true, enlem: 37.94, boylam: 27.36, konum_ms: n - 4 * dk },
        { id: 3, ad: 'Hasan D.', durum: 'Meşgul', cevrimici: true, hiz: 118, hiz_uyari: { t: n - 4 * dk, kmh: 137 } },
        { id: 4, ad: 'Emre C.', durum: 'Çevrimdışı', cevrimici: false }
      ],
      odemeler: { rozet: 1, iban: [{ ref: 'SB-48213', tutar: '1.850 TL', yas_dk: 12 }] },
      destek: [
        { tip: 'uye', id: 16, ad: 'Örnek Başvuran', konu: 'Hesap ve Profil', son_hareket: '18.11.2026 23:40', mesajlar: [
          { kim: 'kisi', metin: 'Şoför olmak için üyelik başvurusu yaptım ekranım henüz kapalı sebebini merak ediyorum, evrakları eksiksiz ekledim', zaman: '18.11.2026 23:39' },
          { kim: 'kisi', metin: '?', zaman: '18.11.2026 23:40' }] },
        { tip: 'uye', id: 12, ad: 'Ayşe Demo', konu: 'Yolculuk', son_hareket: '18.11.2026 21:05', mesajlar: [
          { kim: 'kisi', metin: 'Şoför 20 dakika gecikti, ücret iadesi alabilir miyim?', zaman: '18.11.2026 21:05' }] }
      ],
      gunsonu: { tarih: '2026-11-18', metin: 'BUGÜN (18.11.2026 23:55, Türkiye saati)\nListeden çıkan (atanan/iptal) talep: 12\n10 dk üstü bekleyen: 1\nOrtalama bekleme: 4.2 dk, en uzun: 13 dk\n\nTOPLAM (46 talep)\nEn yoğun saatler: 9:00 (6), 15:00 (5), 8:00 (5)\nEn çok talep gelen alış bölgeleri: Kuşadası (21), Selçuk (9), Davutlar (6)' },
      sofor_kayit: {
        at: n - 3 * 60000,
        ehliyet: [{ no: 7, ad: 'Ali K.', mevcut: '12.03.2026', yeni: '12.03.2036', talep: '21.11.2026 14:05' }],
        kayitlar: [
          { no: 7, ad: 'Ali K.', tel: '+90 5550000001', arac: 'Otomobil', durum: 'Aktif', belgeler: [{ ad: 'Ehliyet', var: true }, { ad: 'Adli Sicil', var: true }, { ad: 'İkametgah', var: true }, { ad: 'SRC', var: false }, { ad: 'Psikoteknik', var: false }], edevlet: 'Belge bulunmuyor', edevlet_kontrol: 'Henüz kontrol edilmedi' },
          { no: 9, ad: 'Mehmet Y.', tel: '+90 5550000002', arac: 'Motosiklet', durum: 'Aktif', belgeler: [{ ad: 'Ehliyet', var: true }, { ad: 'Adli Sicil', var: true }, { ad: 'İkametgah', var: true }, { ad: 'SRC', var: true }, { ad: 'Psikoteknik', var: true }], edevlet: 'Belge bulunmuyor', edevlet_kontrol: 'Henüz kontrol edilmedi' },
          { no: 12, ad: 'Hasan D.', tel: '', arac: 'Araç atanmamış', durum: 'Aktif', belgeler: [{ ad: 'Ehliyet', var: false }, { ad: 'Adli sicil', var: false }, { ad: 'İkametgah', var: false }, { ad: 'SRC', var: false }, { ad: 'Psikoteknik', var: false }], edevlet: 'Belge bulunmuyor', edevlet_kontrol: 'Henüz kontrol edilmedi' }
        ]
      },
      basvurular: [
        { no: 21, ad: 'Örnek Başvuran', durum: 'Beklemede', tarih: new Date(n - 2 * 3600000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ''), telefon: '+905550000009', arac: 'Otomobil', ehliyet_bitis: '2032-04-29', src: false, psiko: true },
        { no: 20, ad: 'İkinci Başvuran', durum: 'Beklemede', tarih: new Date(n - 3600000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ''), arac: 'Otomobil, Minibüs', src: true, psiko: true },
        { no: 17, ad: 'Dünkü Başvuran', durum: 'Beklemede', tarih: new Date(n - 86400000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ''), arac: 'Otomobil', src: false, psiko: false }
      ],
      alarm: { aktif: true, susturma_bitis: null }
    };
    S.komutlar = [{ id: 1, kim: 'Burhan', tur: 'gordum', durum: 'tamam', olusturma: new Date(n - 2 * dk).toISOString() }];
    S.tikler = { 17: { kim: 'Cio', zaman: new Date(n - 20 * dk).toISOString() } };
    S.karne = { hafta: '2026-11-09', okuyanlar: ['Cio'], okuma: [{ kim: 'Cio', zaman: new Date(n - 3 * 3600000).toISOString() }], ekip: ['Burhan', 'Cio', 'Demo'],
      veri: { talep: 46, onceki_talep: 39, ort_dk: 4.3, en_uzun_dk: 17, hizli: 38, acil: 2, gunler: [5, 6, 7, 6, 8, 9, 5],
        saatler: [1, 0, 0, 0, 0, 1, 2, 4, 5, 3, 2, 2, 3, 2, 2, 3, 4, 3, 2, 2, 1, 1, 1, 1],
        ilceler: [{ ad: 'Kuşadası', n: 21 }, { ad: 'Selçuk', n: 9 }, { ad: 'Davutlar', n: 6 }],
        gordum: [{ kim: 'Burhan', n: 7 }, { kim: 'Cio', n: 4 }], basvuru_tik: [{ kim: 'Cio', n: 12 }], panel_atama: [{ kim: 'Burhan', n: 3 }],
        destek: { talep: 9, mesaj: 14, cevap: 11, cevaplayan: [{ kim: 'Hakan', n: 8 }, { kim: 'Cio', n: 3 }] } } };
    ciz();
    setInterval(ciz, 15000);
  }

  /* ---------------- açılış ---------------- */
  if (!C.uygulama && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (DEMO) { demo(); return; }
  if (!window.supabase) { $('uygulama').innerHTML = '<div class="giris"><h1>Bağlantı yok</h1><p>İnternet bağlantısını kontrol edip sayfayı yenileyin.</p></div>'; return; }
  // Şifre sıfırlama bağlantısından gelindiyse (adres #...type=recovery) önce yeni şifre sorulur
  KURTARMA = /type=recovery/.test(location.hash);
  S.db = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  S.db.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') cizGiris('yenisifre'); });
  setInterval(() => { if (S.durum && !document.hidden) ciz(); }, 15000);
  basla();
})();
