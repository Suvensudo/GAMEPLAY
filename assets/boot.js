/* NEON DASH — boot layer
   Sıra önemli: oyun kodundan ÖNCE çalışır. Oyunun kendi dosyalarına dokunmaz. */
(function () {
  'use strict';

  /* ---------- 0) DİL ----------
     Oyun arayüzü İngilizce. Bizim eklediğimiz katman (uyarılar, yedek menüsü,
     yasal linkler, yükleme yazısı) tarayıcı diline göre iki dilli çalışır. */
  var TR = String(navigator.language || navigator.userLanguage || '').toLowerCase().indexOf('tr') === 0;
  function L(tr, en) { return TR ? tr : en; }

  /* ---------- 1) SES KİLİDİ ----------
     Tarayıcılar ilk kullanıcı etkileşimine kadar AudioContext'i askıya alır.
     Oyunun oluşturduğu tüm context'leri yakalayıp ilk dokunuşta açar. */
  (function () {
    var Orig = window.AudioContext || window.webkitAudioContext;
    if (!Orig) return;
    var list = [], unlocked = false;

    function Wrapped() {
      var ctx = new (Function.prototype.bind.apply(Orig, [null].concat([].slice.call(arguments))))();
      try { list.push(ctx); } catch (e) {}
      if (unlocked) { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    Wrapped.prototype = Orig.prototype;
    try { window.AudioContext = Wrapped; } catch (e) {}
    if (window.webkitAudioContext) { try { window.webkitAudioContext = Wrapped; } catch (e) {} }

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      for (var i = 0; i < list.length; i++) {
        try { if (list[i].state === 'suspended') list[i].resume(); } catch (e) {}
      }
      ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
        document.removeEventListener(ev, unlock, true);
      });
    }
    ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
      document.addEventListener(ev, unlock, true);
    });
    window.__ndUnlockAudio = unlock;
  })();

  /* ---------- 2) OTOMATİK PERFORMANS ----------
     Yüksek DPI'lı telefonlarda piksel oranını sınırlar (en büyük FPS kazancı). */
  (function () {
    try {
      var dpr = window.devicePixelRatio || 1;
      var cores = navigator.hardwareConcurrency || 4;
      var cap = cores <= 4 ? 1.25 : 2;
      if (dpr > cap) {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: function () { return cap; } });
      }
    } catch (e) {}
  })();

  /* ---------- 3) HATA GÖRÜNÜRLÜĞÜ ----------
     Oyun ortasında hata olursa ekran donmak yerine mesaj gösterir. */
  (function () {
    var shown = false;
    function banner(msg) {
      if (shown || !document.body) return;
      shown = true;
      var el = document.createElement('div');
      el.id = 'nd-errbar';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#7f1d1d;color:#fecaca;' +
        'font:12px/1.5 system-ui,sans-serif;padding:10px 14px;text-align:center;box-shadow:0 -4px 20px rgba(0,0,0,.5)';
      el.appendChild(document.createTextNode(
        L('Beklenmeyen hata: ', 'Unexpected error: ') + msg +
        L(' — sayfayı yenilemeyi dene. ', ' — try reloading the page. ')));
      var b = document.createElement('button');
      b.textContent = L('Kapat', 'Dismiss');
      b.style.cssText = 'margin-left:10px;background:#fecaca;color:#7f1d1d;border:0;border-radius:4px;padding:2px 10px;cursor:pointer';
      b.onclick = function () { el.remove(); };
      el.appendChild(b);
      document.body.appendChild(el);
    }
    window.addEventListener('error', function (e) {
      if (e.target && e.target.tagName) return;           // kaynak yüklenemedi, JS hatası değil
      banner(String(e.message || 'bilinmeyen').slice(0, 110));
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      banner(String((r && (r.message || r)) || L('promise hatası', 'promise error')).slice(0, 110));
    });
  })();

  /* ---------- 4) KAYIT YEDEĞİ ----------
     localStorage silinirse ilerleme kaybolmasın diye dışa/içe aktarma.
     Sadece menü ekranındayken görünür, oynanışa karışmaz. */
  (function () {
    var PREFIX = 'nd_';

    function exportSave() {
      var data = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) data[k] = localStorage.getItem(k);
      }
      var d = new Date();
      var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var blob = new Blob([JSON.stringify({ game: 'neon-dash', savedAt: d.toISOString(), data: data }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'neon-dash-save-' + stamp + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }

    function importSave() {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var obj = JSON.parse(fr.result);
            var data = obj && obj.data ? obj.data : obj;
            var n = 0;
            for (var k in data) {
              if (k.indexOf(PREFIX) === 0) { localStorage.setItem(k, data[k]); n++; }
            }
            alert(L(n + ' kayıt geri yüklendi. Oyun yeniden başlatılıyor.',
                    n + ' save entries restored. The game will restart.'));
            location.reload();
          } catch (e) { alert(L('Dosya okunamadı: ', 'Could not read the file: ') + e.message); }
        };
        fr.readAsText(f);
      };
      inp.click();
    }

    var panel = null, btn = null;
    function build() {
      btn = document.createElement('button');
      btn.id = 'nd-save-btn';
      btn.title = L('Kayıt yedekle / geri yükle', 'Back up / restore save data');
      btn.textContent = '💾';
      btn.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;width:34px;height:34px;border-radius:9px;' +
        'border:1px solid rgba(103,232,249,.35);background:rgba(5,7,13,.72);color:#67e8f9;font-size:15px;cursor:pointer;' +
        'opacity:.28;transition:opacity .2s;display:none';
      btn.onmouseenter = function () { btn.style.opacity = '1'; };
      btn.onmouseleave = function () { btn.style.opacity = '.28'; };
      btn.onclick = function (ev) {
        ev.stopPropagation();
        if (panel) { panel.remove(); panel = null; return; }
        panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;left:12px;bottom:54px;z-index:9999;background:rgba(5,7,13,.96);' +
          'border:1px solid rgba(103,232,249,.35);border-radius:11px;padding:9px;display:flex;flex-direction:column;gap:6px;' +
          'font:12px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6)';
        [[L('Yedek indir', 'Download backup'), exportSave],
         [L('Yedek yükle', 'Restore backup'), importSave]].forEach(function (p) {
          var b = document.createElement('button');
          b.textContent = p[0];
          b.style.cssText = 'background:#0e7490;color:#e0f2fe;border:0;border-radius:7px;padding:6px 14px;cursor:pointer;font:12px system-ui,sans-serif;white-space:nowrap';
          b.onclick = function (ev2) { ev2.stopPropagation(); p[1](); };
          panel.appendChild(b);
        });
        document.body.appendChild(panel);
      };
      document.body.appendChild(btn);

      setInterval(function () {
        var onMenu = [].slice.call(document.querySelectorAll('button')).some(function (b) {
          return /START CAMPAIGN/i.test(b.textContent);
        });
        btn.style.display = onMenu ? 'block' : 'none';
        if (!onMenu && panel) { panel.remove(); panel = null; }
      }, 900);
    }
    function boot() { if (document.body) build(); else setTimeout(boot, 120); }
    boot();

    /* Klavye kısayolları: Ctrl+Shift+S kaydet, Ctrl+Shift+A geri yükle */
    document.addEventListener('keydown', function (e) {
      if (!e.ctrlKey || !e.shiftKey) return;
      if (e.code === 'KeyS') { e.preventDefault(); exportSave(); }
      if (e.code === 'KeyA') { e.preventDefault(); importSave(); }
    });
  })();

  /* ---------- 5) PWA ----------
     http(s) üzerinden sunulunca service worker kaydeder (offline + kurulabilir). */
  (function () {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  })();

  /* ---------- 6) GERİ SAYIM ----------
     Oyundaki "NEXT CHALLENGE" sayacı sabit yazılmıştı. Gerçek gece yarısına bağlar. */
  (function () {
    window.__ndCountdown = function () {
      var now = new Date();
      var mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      var s = Math.max(0, Math.floor((mid.getTime() - now.getTime()) / 1000));
      function p(n) { return String(n).padStart(2, '0'); }
      return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
    };
    setInterval(function () {
      if (window.__ndCountdownSet) {
        try { window.__ndCountdownSet(window.__ndCountdown()); } catch (e) {}
      }
    }, 1000);
  })();

  /* ---------- 7) YASAL SAYFALAR ----------
     Gizlilik / Kullanım Şartları / Lisanslar sayfalarına menüden erişim.
     Sadece ana menüdeyken görünür, oynanışa ve oyun koduna karışmaz. */
  (function () {
    var PAGES = [
      [L('Gizlilik', 'Privacy'), './gizlilik.html'],
      [L('Kullanım Şartları', 'Terms'), './sartlar.html'],
      [L('Lisanslar', 'Licenses'), './lisanslar.html']
    ];
    var bar = null;

    function build() {
      bar = document.createElement('div');
      bar.id = 'nd-legal';
      bar.style.cssText = 'position:fixed;top:9px;right:12px;z-index:9998;display:none;' +
        'justify-content:flex-end;align-items:center;gap:9px;flex-wrap:wrap;max-width:58vw;' +
        'font:11px system-ui,sans-serif;pointer-events:none';

      PAGES.forEach(function (p, i) {
        if (i) {
          var sep = document.createElement('span');
          sep.textContent = '·';
          sep.style.cssText = 'color:rgba(148,163,184,.4)';
          bar.appendChild(sep);
        }
        var a = document.createElement('a');
        a.href = p[1];
        a.textContent = p[0];
        a.style.cssText = 'color:rgba(148,163,184,.7);text-decoration:none;pointer-events:auto;' +
          'border-bottom:1px solid rgba(148,163,184,.26);padding-bottom:1px;transition:color .15s';
        a.onmouseenter = function () { a.style.color = '#67e8f9'; a.style.borderBottomColor = '#67e8f9'; };
        a.onmouseleave = function () { a.style.color = 'rgba(148,163,184,.7)'; a.style.borderBottomColor = 'rgba(148,163,184,.26)'; };
        bar.appendChild(a);
      });
      document.body.appendChild(bar);

      setInterval(function () {
        var onMenu = [].slice.call(document.querySelectorAll('button')).some(function (b) {
          return /START CAMPAIGN/i.test(b.textContent);
        });
        bar.style.display = onMenu ? 'flex' : 'none';
      }, 900);
    }
    function boot() { if (document.body) build(); else setTimeout(boot, 120); }
    boot();
  })();

  /* ---------- 8) YÜKLEME YAZISI ----------
     index.html'deki yükleme metnini tarayıcı diline göre düzeltir. */
  (function () {
    function fix() {
      var el = document.getElementById('nd-msg');
      if (el) el.textContent = L('Yükleniyor...', 'Loading...');
    }
    if (document.body) fix();
    else document.addEventListener('DOMContentLoaded', fix);
  })();

  /* ---------- 9) EKRAN YÖNÜ + GÜVENLİ ALAN DÜZELTMELERİ ----------
     Oyun yatay ekran için tasarlandı. Dikeyde ve çentikli telefonlarda:
       - üstteki skor paneli dar ekrana sığmıyor (sağ küme 433px, ekran 412px)
       - alttaki kontroller en dipte kalıyor, rozet/jest çubuğu üstüne biniyor
       - viewport-fit=cover açık olduğu için içerik çentiğin/durum çubuğunun altına giriyor
     Oyunun kendi CSS'ine dokunmadan sadece bu noktaları düzeltiyoruz.
     #root seçicisi Tailwind sınıflarından daha güçlü olduğu için !important gerekmez. */
  (function () {
    var TOP = '#root > div > div.absolute.inset-x-0.top-0';
    var BAR = '#root > div > div.absolute.inset-x-0.bottom-4';
    /* çentik/durum çubuğu: p-4 (1rem) korunur, üstüne güvenli alan eklenir */
    var topSafe = TOP + '{padding-top:calc(1rem + env(safe-area-inset-top,0px));' +
                        'padding-left:calc(1rem + env(safe-area-inset-left,0px));' +
                        'padding-right:calc(1rem + env(safe-area-inset-right,0px))}';
    /* alt çubuk: px-6 (1.5rem) korunur, yan çentikler eklenir */
    var barSafe = BAR + '{padding-left:calc(1.5rem + env(safe-area-inset-left,0px));' +
                        'padding-right:calc(1.5rem + env(safe-area-inset-right,0px))}';
    var css = [
      '@media (orientation:portrait){',
        /* üst HUD sığmıyor -> sağ kümeyi alt satıra indir */
        TOP + ' > div:first-child{flex-wrap:wrap;justify-content:center;row-gap:8px}',
        /* kontrolleri yukarı al: rozet + jest çubuğu */
        BAR + '{bottom:calc(84px + env(safe-area-inset-bottom,0px))}',
        /* dikeyde ekran dar -> butonlar orantısız büyük kalıyor, küçült */
        BAR + ' > button{transform:scale(.86);transform-origin:center bottom}',
        topSafe, barSafe,
      '}',
      '@media (orientation:landscape){',
        BAR + '{bottom:calc(1rem + env(safe-area-inset-bottom,0px))}',
        topSafe, barSafe,
      '}',
      /* Çok dar ekran (Galaxy Fold kapalı ~280px): kök yazı boyutunu küçült,
         Tailwind rem ile ölçeklediği için tüm arayüz orantılı küçülür. */
      '@media (max-width:340px){',
        'html{font-size:13px}',
        TOP + ' > div:nth-child(2){flex-wrap:wrap;justify-content:center;row-gap:2px}',
      '}',
      /* Menü / seviye sonu kaplamaları yüksekliği aşınca: justify-content:center
         yüzünden üst kısım (logo + başlık) kaydırılarak da erişilemiyor.
         "safe center" sığarsa ortalar, taşarsa üstten başlatır. */
      '#root > div > div.absolute.inset-0{justify-content:safe center}'
    ].join('');
    function put() {
      if (document.getElementById('nd-orient')) return;
      var s = document.createElement('style');
      s.id = 'nd-orient';
      s.appendChild(document.createTextNode(css));
      document.head.appendChild(s);
    }
    if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
  })();
})();
