(() => {
  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const IMG = {
    bouquetSide: "assets/img/bouquet-side.png",
    bouquetFront: "assets/img/bouquet-front.png",
  };
  const LOVE_TEXT = "BENİM ÇİÇEĞİM|DE SENSİN"; // "|" = alt satır
  const STEP = 0.32; // saniye, CSS'teki yürüme animasyonuyla aynı

  // ---------- piksel grafikler ----------
  const HEART_PATH = "M1 0h2v1h1V0h2v1h1v2h-1v1h-1v1h-1v1h-1V5H2V4H1V3H0V1h1z";
  const HEART_COLORS = ["#ff4d8d", "#ff6fa5", "#e8336f", "#ff9ec4", "#c9184a", "#ff85b3", "#fff0f6"];
  const svgURI = (svg) => "data:image/svg+xml," + encodeURIComponent(svg);
  const heartCache = {};
  function heartURI(color) {
    if (!heartCache[color]) {
      heartCache[color] = svgURI(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 6' shape-rendering='crispEdges'>` +
        `<path fill='${color}' d='${HEART_PATH}'/>` +
        `<rect x='1' y='1' width='1' height='1' fill='#fff' opacity='.85'/></svg>`
      );
    }
    return heartCache[color];
  }
  function sparkleURI(color) {
    return svgURI(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 5' shape-rendering='crispEdges'>` +
      `<rect x='2' y='0' width='1' height='5' fill='${color}'/>` +
      `<rect x='0' y='2' width='5' height='1' fill='${color}'/>` +
      `<rect x='2' y='2' width='1' height='1' fill='#fff'/></svg>`
    );
  }

  // ---------- uçuşan kalpler ----------
  function spawnFloatHeart(layer, preWarm) {
    const s = pick([2, 3, 3, 4, 4, 5, 6]);
    const el = document.createElement("img");
    el.className = "float-heart";
    el.alt = "";
    el.src = heartURI(pick(HEART_COLORS));
    el.style.width = 7 * s + "px";
    el.style.height = 6 * s + "px";
    el.style.left = rand(-2, 98) + "%";
    layer.appendChild(el);

    const H = layer.clientHeight + 140;
    const sway = rand(15, 45) * (Math.random() < 0.5 ? -1 : 1);
    const dur = rand(7000, 13000);
    const anim = el.animate(
      [
        { transform: "translate(0px, 0px)", opacity: 0 },
        { transform: `translate(${sway}px, ${-H * 0.2}px)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${-sway}px, ${-H * 0.6}px)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${sway * 0.6}px, ${-H}px)`, opacity: 0 },
      ],
      { duration: dur, easing: "linear" }
    );
    if (preWarm) anim.currentTime = rand(0, dur * 0.85);
    anim.onfinish = () => el.remove();
  }

  function startHearts(layer, everyMs, preWarmCount) {
    for (let i = 0; i < (preWarmCount || 0); i++) spawnFloatHeart(layer, true);
    const id = setInterval(() => {
      if (!document.hidden) spawnFloatHeart(layer, false);
    }, everyMs);
    return () => clearInterval(id);
  }

  // ---------- patlama efektleri ----------
  const fx = $("#fx");

  function burst(x, y, count, kind) {
    for (let i = 0; i < count; i++) {
      const el = document.createElement("img");
      el.alt = "";
      let w, h;
      if (kind === "sparkle") {
        const s = pick([3, 4, 5]);
        w = h = 5 * s;
        el.src = sparkleURI(pick(["#ffe066", "#fff6b0", "#ffffff", "#ffd1f0"]));
      } else {
        const s = pick([2, 3, 4]);
        w = 7 * s; h = 6 * s;
        el.src = heartURI(pick(HEART_COLORS));
      }
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.style.left = x - w / 2 + "px";
      el.style.top = y - h / 2 + "px";
      fx.appendChild(el);

      const ang = rand(0, Math.PI * 2);
      const dist = kind === "sparkle" ? rand(60, 170) : rand(80, 220);
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist - (kind === "sparkle" ? 0 : 40);
      const a = el.animate(
        [
          { transform: "translate(0px, 0px) scale(0.3)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.65 },
          { transform: `translate(${dx * 1.1}px, ${dy + 50}px) scale(0.8)`, opacity: 0 },
        ],
        { duration: rand(900, 1400), easing: "cubic-bezier(.2,.8,.3,1)" }
      );
      a.onfinish = () => el.remove();
    }
  }

  // ======================================================
  // 1. EKRAN: SORU
  // ======================================================
  const quiz = $("#quiz");
  const form = $("#answer-form");
  const input = $("#answer");
  const feedback = $("#feedback");
  const dialog = $("#dialog");
  const banner = $("#correct-banner");
  const fader = $("#fader");

  const stopQuizHearts = startHearts($("#quiz-hearts"), 380, 18);

  // Klavye açılınca (iPhone + Android) soru kutusunu görünen alanın ortasına al
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const centerDialog = () => {
      const visibleCenter = vv.offsetTop + vv.height / 2;
      const dh = dialog.offsetHeight;
      let center = visibleCenter;
      // kutu sığmıyorsa (yatay ekran + klavye) en azından yazı kutusu görünsün
      if (dh > vv.height - 16) {
        const inputMid = input.offsetTop + input.offsetHeight / 2;
        center = visibleCenter - inputMid + dh / 2;
      }
      dialog.style.setProperty("--dlg-top", center + "px");
    };
    vv.addEventListener("resize", centerDialog);
    vv.addEventListener("scroll", centerDialog);
    centerDialog();
  }

  // "Kasımpatı", "KASIMPATI", "kasım patı", "kasimpati" ... hepsi kabul
  function normalize(s) {
    let t;
    try { t = s.toLocaleLowerCase("tr-TR"); } catch (e) { t = s.toLowerCase(); }
    return t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // ç→c, ş→s, ğ→g, ö→o, ü→u, i̇→i
      .replace(/ı/g, "i")
      .replace(/[^a-z]/g, "");          // boşluk ve işaretleri at
  }
  function isCorrect(answer) {
    const n = normalize(answer);
    return n.includes("kasimpati") || n.includes("krizantem");
  }

  const WRONG_MSGS = [
    "HMM, O DEĞİL. TEKRAR DENE!",
    "OLMADI :( BİR DAHA DÜŞÜN",
    "YOK YOK, BAŞKA BİR ÇİÇEK...",
  ];
  let wrongCount = 0;
  let solved = false;

  function shake() {
    dialog.classList.remove("shake");
    void dialog.offsetWidth; // animasyonu yeniden başlat
    dialog.classList.add("shake");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    Sound.unlock();
    if (solved) return;

    const val = input.value;
    if (!val.trim()) {
      feedback.className = "feedback";
      feedback.textContent = "ÖNCE BİR ŞEY YAZMALISIN :)";
      Sound.pop();
      shake();
      return;
    }

    if (isCorrect(val)) {
      onCorrect();
    } else {
      wrongCount++;
      Sound.wrong();
      shake();
      if (wrongCount >= 3) {
        feedback.className = "feedback hint";
        feedback.textContent = "İPUCU: ADI BU AYIN ADIYLA BAŞLIYOR";
      } else {
        feedback.className = "feedback";
        feedback.textContent = WRONG_MSGS[(wrongCount - 1) % WRONG_MSGS.length];
      }
    }
  });

  async function onCorrect() {
    solved = true;
    input.blur();
    feedback.textContent = "";
    Sound.correct();

    dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "steps(4)", fill: "forwards" });
    banner.classList.add("show");
    const r = quiz.getBoundingClientRect();
    burst(r.width / 2, r.height / 2, 26, "heart");
    burst(r.width / 2, r.height / 2, 12, "sparkle");

    await wait(1800);
    fader.classList.add("on");
    await wait(650);
    stopQuizHearts();
    showScene();
    await wait(150);
    fader.classList.remove("on");
    await wait(450);
    playScene();
  }

  // ======================================================
  // 2. EKRAN: SAHNE
  // ======================================================
  const scene = $("#scene");
  const walker = $("#walker");
  const hero = $("#hero");
  const bouquet = $("#bouquet");
  const bouquetImg = $("#bouquet-img");
  const loveText = $("#love-text");
  const replayBtn = $("#replay");
  const sceneHeartsLayer = $("#scene-hearts");

  let stopSceneHearts = null;
  let runId = 0;
  let anims = [];
  const track = (a) => { anims.push(a); return a; };

  function showScene() {
    quiz.classList.remove("is-active");
    quiz.setAttribute("aria-hidden", "true");
    scene.classList.add("is-active");
    scene.removeAttribute("aria-hidden");
    resetScene();
  }

  const startX = () => window.innerWidth / 2 + walker.offsetWidth;

  function resetScene() {
    anims.forEach((a) => { try { a.cancel(); } catch (e) {} });
    anims = [];
    if (stopSceneHearts) { stopSceneHearts(); stopSceneHearts = null; }
    hero.className = "hero";
    bouquet.className = "bouquet";
    bouquet.style.opacity = "";
    bouquet.style.transform = "";
    bouquetImg.src = IMG.bouquetSide;
    loveText.innerHTML = "";
    loveText.className = "love-text";
    replayBtn.classList.remove("show");
    walker.style.transform = `translateX(${startX()}px)`;
  }

  function buildLoveText() {
    loveText.innerHTML = "";
    const chars = [];
    const hearts = [];
    const addHeart = (parent) => {
      const h = document.createElement("i");
      h.className = "px-heart";
      parent.appendChild(h);
      hearts.push(h);
    };
    // "|" satır sonu; kalpler son satırın iki yanında
    const lines = LOVE_TEXT.split("|");
    lines.forEach((line, li) => {
      const isLast = li === lines.length - 1;
      const words = line.split(" ");
      words.forEach((word, wi) => {
        const ws = document.createElement("span");
        ws.className = "word";
        if (isLast && wi === 0) addHeart(ws);
        for (const c of word) {
          const cs = document.createElement("span");
          cs.className = "ch";
          cs.textContent = c;
          ws.appendChild(cs);
          chars.push(cs);
        }
        if (isLast && wi === words.length - 1) addHeart(ws);
        loveText.appendChild(ws);
        if (wi < words.length - 1) loveText.appendChild(document.createTextNode(" "));
      });
      if (!isLast) loveText.appendChild(document.createElement("br"));
    });
    return { chars, hearts };
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  async function playScene() {
    const id = ++runId;
    const w = async (ms) => {
      await wait(ms);
      if (id !== runId) throw "cancel";
    };

    try {
      resetScene();
      await w(500);

      // 1) Yan profilde, komik adımlarla ekranın dışından yürüyerek gelir
      const from = startX();
      const steps = Math.max(9, Math.min(16, Math.round(from / 120 / STEP)));
      const dur = steps * STEP * 1000;
      track(walker.animate(
        [{ transform: `translateX(${from}px)` }, { transform: "translateX(0px)" }],
        { duration: dur, easing: "linear", fill: "forwards" }
      ));
      hero.classList.add("walking");
      Sound.walk(steps, STEP);
      await w(dur);
      walker.style.transform = "translateX(0px)";
      hero.classList.remove("walking");
      Sound.skid();
      await w(600);

      // 2) Ekrana döner
      Sound.turn();
      track(hero.animate(
        [{ transform: "scaleX(1)" }, { transform: "scaleX(0)", offset: 0.5 }, { transform: "scaleX(1)" }],
        { duration: 260, easing: "steps(6, end)" }
      ));
      await w(130);
      hero.classList.add("facing");
      await w(200);
      Sound.hop();
      track(hero.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(-6%)" }, { transform: "translateY(0)" }],
        { duration: 300, easing: "ease-out" }
      ));
      await w(1000);

      // 3) Buketi arkasından çıkarır
      const h = hero.offsetHeight;
      const P = (x, y, r, s, sx) =>
        `translate(${x * h}px, ${y * h}px) rotate(${r}deg) scale(${sx === undefined ? s : sx}, ${s})`;

      bouquet.style.transform = P(0, -0.12, 0, 0.7);
      bouquet.style.opacity = "1";

      Sound.rustle();
      track(bouquet.animate(
        [{ transform: P(0, -0.12, 0, 0.7) }, { transform: P(0.36, -0.22, 25, 0.75) }],
        { duration: 450, easing: "ease-out", fill: "forwards" }
      ));
      await w(450);

      Sound.rustle();
      track(bouquet.animate(
        [
          { transform: P(0.36, -0.22, 25, 0.75) },
          { transform: P(0.36, -0.22, 13, 0.75) },
          { transform: P(0.36, -0.22, 29, 0.75) },
          { transform: P(0.36, -0.22, 20, 0.75) },
        ],
        { duration: 420, easing: "steps(4, end)", fill: "forwards" }
      ));
      await w(420);

      Sound.whoosh();
      track(bouquet.animate(
        [{ transform: P(0.36, -0.22, 20, 0.75) }, { transform: P(0.36, -0.42, 8, 0.8) }],
        { duration: 240, easing: "ease-out", fill: "forwards" }
      ));
      await w(240);

      // öne geçer ve kendi etrafında dönüp önden görünür
      bouquet.classList.add("in-front");
      track(bouquet.animate(
        [
          { transform: P(0.36, -0.42, 8, 0.8) },
          { transform: P(0.36, -0.42, 8, 0.8, 0) },
          { transform: P(0.36, -0.42, 8, 0.8) },
        ],
        { duration: 180, easing: "steps(4, end)", fill: "forwards" }
      ));
      await w(90);
      bouquetImg.src = IMG.bouquetFront;
      await w(90);

      track(bouquet.animate(
        [
          { transform: P(0.36, -0.42, 8, 0.8) },
          { transform: P(0.04, 0.03, -10, 1.18), offset: 0.7 },
          { transform: P(0, 0, -6, 1) },
        ],
        { duration: 420, easing: "ease-out", fill: "forwards" }
      ));
      await w(300);

      // TA-DAA!
      Sound.tada();
      const c = centerOf(bouquet);
      burst(c.x, c.y, 16, "sparkle");
      burst(c.x, c.y, 18, "heart");
      track(hero.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(-4%)" }, { transform: "translateY(0)" }],
        { duration: 320, easing: "ease-out" }
      ));
      await w(320);
      bouquet.classList.add("sway");
      hero.classList.add("idle");
      await w(900);

      // 4) Yukarıda yazı belirir
      const { chars, hearts } = buildLoveText();
      loveText.classList.add("show");
      Sound.pop();
      await w(300);
      hearts[0].classList.add("on");
      await w(150);
      for (const ch of chars) {
        ch.classList.add("on");
        Sound.blip();
        await w(95);
      }
      hearts[1].classList.add("on");
      Sound.pop();
      const tc = centerOf(loveText);
      burst(tc.x, tc.y, 14, "heart");

      stopSceneHearts = startHearts(sceneHeartsLayer, 260, 0);
      await w(400);
      Sound.melody();

      await w(2500);
      replayBtn.classList.add("show");
    } catch (err) {
      if (err !== "cancel") console.error(err);
    }
  }

  replayBtn.addEventListener("click", () => {
    Sound.unlock();
    playScene();
  });

  // Ekran boyutu değişirse (telefon döndürme vb.) bekleme konumunu güncelle
  window.addEventListener("resize", () => {
    if (scene.classList.contains("is-active") && !hero.classList.contains("walking") && !hero.classList.contains("facing")) {
      walker.style.transform = `translateX(${startX()}px)`;
    }
  });

  // Test için: adres sonuna ?sahne eklenirse direkt sahneye geçer
  if (/[?&]sahne\b/.test(location.search)) {
    stopQuizHearts();
    showScene();
    playScene();
  }
})();
