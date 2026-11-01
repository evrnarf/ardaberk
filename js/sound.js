/*
 * Ses motoru: tüm efektler Web Audio ile kodda üretilir (ses dosyası yok).
 *
 * iPhone sessiz mod notu:
 * iOS, Web Audio seslerini normalde "zil sesi" gibi sayar ve yan tuş
 * sessizdeyken susturur. İki yöntemle "medya" sesi olarak çalmasını sağlıyoruz:
 *  1) navigator.audioSession.type = "playback"  (iOS 17+ Safari)
 *  2) İlk dokunuşta döngüde sessiz bir <audio> çalmak (eski iOS sürümleri için).
 *     Sayfada bir HTML medya öğesi çalarken iOS ses oturumunu "playback"
 *     moduna alır ve Web Audio da sessiz modda duyulur.
 */
const Sound = (() => {
  let ctx = null;
  let master = null;
  let silentEl = null;
  let noiseBuf = null;

  // iPhone / iPad (yeni iPad'ler kendini Mac gibi tanıtır)
  const IS_IOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function setPlaybackSession() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (e) { /* desteklenmiyorsa sorun değil */ }
  }

  // Sessiz bir WAV dosyası üretir (data URI)
  function silentWavURI(sampleRate, seconds) {
    const n = Math.floor(sampleRate * seconds);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return "data:audio/wav;base64," + btoa(bin);
  }

  // Kullanıcı dokunuşu içinde çağrılmalı
  function unlock() {
    setPlaybackSession();

    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp);
      comp.connect(ctx.destination);
    }

    // Sessiz <audio> hilesi sadece iOS'ta gerekli. Android'de medya sesi
    // zaten sessiz moddan etkilenmez; orada açarsak bildirimde
    // "medya oynatılıyor" görünebilir.
    if (IS_IOS) {
      if (!silentEl) {
        silentEl = document.createElement("audio");
        silentEl.setAttribute("playsinline", "");
        silentEl.setAttribute("x-webkit-airplay", "deny");
        silentEl.preload = "auto";
        silentEl.loop = true;
        silentEl.src = silentWavURI(ctx.sampleRate || 44100, 0.5);
      }
      if (silentEl.paused) {
        const p = silentEl.play();
        if (p && p.catch) p.catch(() => {});
      }
    }

    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
    }

    // eski iOS: boş bir buffer çalmak bağlamı açar
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) {}
  }

  // Sekme gizlenince sessiz döngüyü durdur, dönünce devam et
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) {
      if (silentEl) silentEl.pause();
      ctx.suspend().catch(() => {});
    } else {
      setPlaybackSession();
      if (silentEl) { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); }
      ctx.resume().catch(() => {});
    }
  });

  // Her dokunuşta kilidi tazele (ucuz ve güvenli)
  ["touchend", "pointerup", "click", "keydown"].forEach((ev) =>
    window.addEventListener(ev, unlock, { capture: true, passive: true })
  );

  // ---------- temel parçalar ----------
  const ready = () => ctx && master;
  const T = (t) => ctx.currentTime + 0.02 + (t || 0);

  function tone({ f = 440, to = null, t = 0, d = 0.15, type = "square", v = 0.2, a = 0.005, vib = 0 }) {
    if (!ready()) return;
    const st = T(t);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, st);
    if (to) o.frequency.exponentialRampToValueAtTime(to, st + d);
    if (vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = vib;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(st); lfo.stop(st + d + 0.05);
    }
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(v, st + a);
    g.gain.exponentialRampToValueAtTime(0.0001, st + d);
    o.connect(g); g.connect(master);
    o.start(st); o.stop(st + d + 0.05);
  }

  function noise({ t = 0, d = 0.1, v = 0.2, f = 1000, to = null, q = 1, type = "bandpass" }) {
    if (!ready()) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const st = T(t);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, st);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, st + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(v, st + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, st + d);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(st, Math.random() * 0.5); s.stop(st + d + 0.05);
  }

  // ---------- efektler ----------

  // Komik ayak sesi: "bup-bip" diye sıçrayan tonlar + arada gıcırdayan ayakkabı
  function step(i, t) {
    if (i % 2 === 0) {
      tone({ f: 330, to: 170, t, d: 0.13, type: "triangle", v: 0.45 });
      tone({ f: 165, to: 90, t, d: 0.1, type: "square", v: 0.08 });
    } else {
      tone({ f: 620, to: 470, t, d: 0.09, type: "square", v: 0.12 });
    }
    noise({ t, d: 0.035, v: 0.12, f: 2500, type: "highpass" });
    if (i % 4 === 3) {
      tone({ f: 1300, to: 2100, t: t + 0.05, d: 0.09, type: "sine", v: 0.12 }); // gıcırt
    }
  }

  function walk(steps, interval) {
    for (let i = 0; i < steps; i++) step(i, i * interval);
  }

  // Durunca ayakkabı kayması
  function skid() {
    noise({ d: 0.18, v: 0.16, f: 2200, to: 700, q: 3 });
    tone({ f: 900, to: 1400, d: 0.12, type: "sine", v: 0.08 });
  }

  // Dönme "bıvıp"
  function turn() {
    tone({ f: 260, to: 980, d: 0.14, type: "sine", v: 0.28 });
    tone({ f: 520, to: 1960, d: 0.1, type: "triangle", v: 0.06, t: 0.02 });
  }

  // Zıplama "boing"
  function hop() {
    tone({ f: 200, to: 640, d: 0.16, type: "sine", v: 0.22, vib: 30 });
  }

  // Kağıt hışırtısı (buket arkadan çıkarken)
  function rustle() {
    for (let k = 0; k < 6; k++) {
      noise({ t: k * 0.07 + Math.random() * 0.02, d: 0.07, v: 0.16, f: 2500 + Math.random() * 2500, q: 0.8 });
    }
  }

  // Hızlı "vuuş"
  function whoosh() {
    noise({ d: 0.3, v: 0.22, f: 500, to: 3500, q: 1.2 });
  }

  // TA-DAA! + parıltı
  function tada() {
    tone({ f: 392.0, d: 0.09, type: "square", v: 0.14 });
    tone({ f: 392.0, d: 0.09, type: "square", v: 0.14, t: 0.11 });
    const t = 0.24;
    [523.25, 659.25, 783.99, 1046.5].forEach((f) =>
      tone({ f, t, d: 1.1, type: "square", v: 0.09, a: 0.01, vib: 6 })
    );
    tone({ f: 130.81, t, d: 1.1, type: "triangle", v: 0.3 });
    [2093, 2637, 3136, 4186, 3136, 4186].forEach((f, k) =>
      tone({ f, t: t + 0.12 + k * 0.07, d: 0.18, type: "triangle", v: 0.07 })
    );
  }

  // Doğru cevap: yükselen arpej
  function correct() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, k) =>
      tone({ f, t: k * 0.08, d: k === 3 ? 0.45 : 0.1, type: "square", v: 0.13 })
    );
    [1568, 2093].forEach((f, k) => tone({ f, t: 0.36 + k * 0.08, d: 0.25, type: "triangle", v: 0.08 }));
  }

  // Yanlış cevap: "bonk bonk"
  function wrong() {
    tone({ f: 230, to: 160, d: 0.16, type: "square", v: 0.16 });
    tone({ f: 170, to: 105, d: 0.32, type: "square", v: 0.16, t: 0.17 });
  }

  // Yazı makinesi tıkı
  function blip() {
    tone({ f: 820 + Math.random() * 160, d: 0.045, type: "square", v: 0.06 });
  }

  // Küçük "pop"
  function pop() {
    tone({ f: 600, to: 1300, d: 0.07, type: "sine", v: 0.12 });
  }

  // Sonda kısa müzik kutusu melodisi
  function melody() {
    const notes = [
      [659.25, 0.3], [783.99, 0.3], [1046.5, 0.6], [987.77, 0.3], [783.99, 0.3],
      [880.0, 0.6], [783.99, 0.3], [659.25, 0.3], [698.46, 0.3], [783.99, 0.9],
    ];
    let t = 0;
    notes.forEach(([f, d]) => {
      tone({ f, t, d: d + 0.25, type: "triangle", v: 0.16 });
      tone({ f: f * 2, t, d: 0.2, type: "sine", v: 0.03 });
      t += d;
    });
  }

  return { unlock, walk, skid, turn, hop, rustle, whoosh, tada, correct, wrong, blip, pop, melody };
})();
