// المصحف الأشرف — منطق التطبيق الرئيسي (نظام صفحات مصحف المدينة)
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    surahList: [],
    currentPage: 1,
    currentPageData: null,
    activeAyah: null, // {surah, ayah, text, surahNameAr}
    audioEl: null
  };

  /* ---------------------------------------------------------------- */
  /* أدوات مساعدة عامة                                                 */
  /* ---------------------------------------------------------------- */
  const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function toArabicDigits(n) {
    return String(n).split('').map((d) => (ARABIC_DIGITS[d] !== undefined ? ARABIC_DIGITS[d] : d)).join('');
  }

  // إزالة علامات التشكيل (الحركات) من النص العربي لتسهيل القراءة والبحث
  // يشمل الحركات، والتنوين، والشدة، والسكون، والمدّة، وعلامة التطويل
  const TASHKEEL_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/g;
  function stripTashkeel(str) {
    return String(str).replace(TASHKEEL_REGEX, '');
  }

  function cleanSurahName(nameAr) {
    return stripTashkeel(String(nameAr).replace(/^(سُورَةُ|سورة)\s*/, '').trim());
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function openOverlay(id) { $(id).classList.add('open'); document.body.classList.add('no-scroll'); }
  function closeOverlay(id) { $(id).classList.remove('open'); document.body.classList.remove('no-scroll'); }

  /* ---------------------------------------------------------------- */
  /* التبويبات السفلية                                                 */
  /* ---------------------------------------------------------------- */
  function initTabs() {
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.tab;

        $$('.view').forEach((v) => v.classList.remove('active'));
        $(`#view-${tab}`).classList.add('active');

        // تحديث عنوان الهيدر حسب التبويب
        $('#header-context').textContent =
          tab === 'quran' ? 'المصحف الأشرف' :
          tab === 'azkar' ? 'الأذكار' :
          tab === 'duas' ? 'الأدعية الصحيحة' : 'مواقيت الصلاة والقبلة';
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* إخفاء/إظهار الشريط السفلي أثناء القراءة                          */
  /* ---------------------------------------------------------------- */
  function initTabbarToggle() {
    const hideBtn = $('#btn-hide-tabbar');
    const showBtn = $('#btn-show-tabbar');

    if (hideBtn) {
      hideBtn.addEventListener('click', () => {
        document.body.classList.add('tabbar-hidden');
      });
    }
    if (showBtn) {
      showBtn.addEventListener('click', () => {
        document.body.classList.remove('tabbar-hidden');
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* شريط الدعاء للصدقة الجارية                                       */
  /* ---------------------------------------------------------------- */
  function initDuaBanner() {
    const aminBtn = $('#btn-amin');
    const duaBanner = $('#dua-banner');

    if (aminBtn && duaBanner) {
      aminBtn.addEventListener('click', () => {
        showToast('آمين، جزاك الله خيراً وتقبل منك الدعاء 🤍');
        duaBanner.classList.add('hidden');
        // حفظ إخفاء الشريط لعدة ساعات كي لا يزعج القارئ
        localStorage.setItem('almus-hraf:duaRead', String(Date.now()));
      });

      // إعادة إظهاره إذا مر أكثر من 12 ساعة
      const lastRead = Number(localStorage.getItem('almus-hraf:duaRead') || 0);
      if (Date.now() - lastRead < 12 * 60 * 60 * 1000) {
        duaBanner.classList.add('hidden');
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* فهرس السور                                                       */
  /* ---------------------------------------------------------------- */
  async function loadSurahIndex() {
    try {
      state.surahList = await QuranAPI.getSurahList();
      renderSurahList(state.surahList);
    } catch (e) {
      $('#surah-list').innerHTML = `<p class="error-text">تعذر تحميل فهرس السور. تأكد من اتصال الإنترنت ثم أعد المحاولة.</p>`;
    }
  }

  function renderSurahList(list) {
    const wrap = $('#surah-list');
    wrap.innerHTML = list
      .map(
        (s) => {
          const cleanName = cleanSurahName(s.nameAr);
          const revType = (s.revelationType === 'Meccan' || s.revelationType === 'مكية') ? 'مكية' : 'مدنية';
          return `
        <button class="surah-item" data-num="${s.number}">
          <span class="surah-item-num">${toArabicDigits(s.number)}</span>
          <span class="surah-item-info">
            <span class="surah-item-name">سورة ${cleanName}</span>
            <span class="surah-item-sub">${revType} · ${toArabicDigits(s.ayahCount)} آية</span>
          </span>
        </button>`;
        }
      )
      .join('');

    $$('.surah-item', wrap).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const surahNum = Number(btn.dataset.num);
        closeOverlay('#index-overlay');
        switchToQuranTab();
        try {
          const startPage = await QuranAPI.getSurahStartPage(surahNum);
          loadPage(startPage);
        } catch (e) {
          showToast('تعذر الانتقال لصفحة السورة');
        }
      });
    });
  }

  function switchToQuranTab() {
    $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'quran'));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-quran'));
    $('#header-context').textContent = 'المصحف الأشرف';
  }

  function initIndexOverlay() {
    $('#btn-index').addEventListener('click', () => openOverlay('#index-overlay'));
    $('#btn-close-index').addEventListener('click', () => closeOverlay('#index-overlay'));
    $('#surah-search').addEventListener('input', (e) => {
      // البحث بدون تشكيل حتى لا يضطر المستخدم لكتابة الحركات
      const q = stripTashkeel(e.target.value.trim());
      if (!q) return renderSurahList(state.surahList);
      const filtered = state.surahList.filter(
        (s) => stripTashkeel(s.nameAr).includes(q) || s.nameEn.toLowerCase().includes(q.toLowerCase())
      );
      renderSurahList(filtered);
    });
  }

  /* ---------------------------------------------------------------- */
  /* عرض المصحف (نظام الصفحات 604)                                    */
  /* ---------------------------------------------------------------- */
  async function loadPage(pageNumber) {
    if (pageNumber < 1) pageNumber = 1;
    if (pageNumber > 604) pageNumber = 604;

    const container = $('#ayat-container');
    container.innerHTML = `<p class="loading-text">جارٍ تحميل الصفحة ${toArabicDigits(pageNumber)}...</p>`;

    try {
      const pageData = await QuranAPI.getPage(pageNumber);
      state.currentPage = pageNumber;
      state.currentPageData = pageData;
      localStorage.setItem('almus-hraf:currentPage', String(pageNumber));

      const cleanHeaderName = cleanSurahName(pageData.headerSurahName);
      $('#surah-name-ar').textContent = `سورة ${cleanHeaderName}`;

      const firstAyah = pageData.ayahs && pageData.ayahs[0];
      if (firstAyah && firstAyah.surah) {
        const rev = (firstAyah.surah.revelationType === 'Meccan' || firstAyah.surah.revelationType === 'مكية') ? 'مكية' : 'مدنية';
        const ayahsCount = firstAyah.surah.numberOfAyahs || firstAyah.surah.ayahCount;
        $('#surah-meta').textContent = `${rev} · ${toArabicDigits(ayahsCount)} آية · الجزء ${toArabicDigits(pageData.juzNumber)} · الصفحة ${toArabicDigits(pageNumber)}`;
      } else {
        $('#surah-meta').textContent = `الجزء ${toArabicDigits(pageData.juzNumber)} · الصفحة ${toArabicDigits(pageNumber)}`;
      }

      renderPageContent(pageData);

      $('#surah-progress').textContent = `${toArabicDigits(pageNumber)} / ٦٠٤`;
      $('#mushaf-wrap').scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    } catch (e) {
      container.innerHTML = `<p class="error-text">تعذّر تحميل الصفحة. تحقّق من اتصال الإنترنت وحاول مجددًا.<br><button class="chip-btn" id="retry-page">إعادة المحاولة</button></p>`;
      const retry = $('#retry-page');
      if (retry) retry.addEventListener('click', () => loadPage(pageNumber));
    }
  }

  function renderPageContent(pageData) {
    const container = $('#ayat-container');
    const frag = document.createDocumentFragment();

    const bismillahEl = $('#bismillah');
    if (bismillahEl) bismillahEl.style.display = 'none';

    pageData.ayahs.forEach((a) => {
      if (a.isSurahStart) {
        if (a.numberInSurah === 1 && a.surah.number !== pageData.ayahs[0].surah.number) {
          const headerDiv = document.createElement('div');
          headerDiv.style.textAlign = 'center';
          headerDiv.style.margin = '22px 0 12px 0';
          headerDiv.style.fontWeight = 'bold';
          headerDiv.style.color = 'var(--gold-deep)';

          const cName = cleanSurahName(a.surah.nameAr);
          const rev = (a.surah.revelationType === 'Meccan' || a.surah.revelationType === 'مكية') ? 'مكية' : 'مدنية';

          headerDiv.innerHTML = `
            <div style="font-family: var(--font-display); font-size: 20px;">سورة ${cName}</div>
            <div style="font-size: 12px; color: var(--ink-soft); font-weight: normal; margin-top: 2px;">${rev} · ${toArabicDigits(a.surah.numberOfAyahs)} آية</div>
          `;
          frag.appendChild(headerDiv);
        }

        if (a.surah.number !== 1 && a.surah.number !== 9) {
          const bisDiv = document.createElement('div');
          bisDiv.style.textAlign = 'center';
          bisDiv.style.fontFamily = 'var(--font-quran)';
          bisDiv.style.fontSize = '24px';
          bisDiv.style.margin = '14px 0';
          bisDiv.style.color = 'var(--ink)';
          bisDiv.textContent = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
          frag.appendChild(bisDiv);
        }
      }

      const span = document.createElement('span');
      span.className = 'ayah';
      span.dataset.surah = a.surah.number;
      span.dataset.ayah = a.numberInSurah;
      span.dataset.page = pageData.pageNumber;

      span.textContent = a.text + ' ';

      const marker = document.createElement('span');
      marker.className = 'ayah-marker';
      marker.textContent = toArabicDigits(a.numberInSurah);
      span.appendChild(marker);

      span.addEventListener('click', () => openAyahModal(a.surah.number, a.numberInSurah, a.text, a.surah.nameAr));
      frag.appendChild(span);
    });

    container.innerHTML = '';
    container.appendChild(frag);
  }

  /* ---------------------------------------------------------------- */
  /* تقليب الصفحات بالسحب (Swipe / Drag) — إحساس المصحف الحقيقي        */
  /* يعمل باللمس وبالماوس معًا عبر Pointer Events.                     */
  /* المصحف يُقرأ من اليمين لليسار: الصفحة الأولى (الفاتحة) في أقصى    */
  /* اليمين، وكل صفحة تالية (البقرة...) تأتي بعدها ناحية اليسار.       */
  /* لذلك: السحب من اليسار إلى اليمين (تحريك الإصبع لليمين) يكشف ما    */
  /* هو "بعدها" في المصحف فيقدّم الصفحة التالية (goNextPage).          */
  /* والسحب من اليمين إلى اليسار يرجع للصفحة السابقة (goPrevPage).     */
  /* ---------------------------------------------------------------- */
  let isFlipAnimating = false;

  function flipToPage(pageNumber, direction) {
    if (isFlipAnimating) return;
    const flipEl = $('#mushaf-page');
    if (!flipEl) { loadPage(pageNumber); return; }

    isFlipAnimating = true;
    const pageWidth = flipEl.getBoundingClientRect().width || 320;
    const exitX = direction === 'next' ? -pageWidth * 1.05 : pageWidth * 1.05;
    const exitRotate = direction === 'next' ? -9 : 9;

    flipEl.style.transformOrigin = direction === 'next' ? 'right center' : 'left center';
    flipEl.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1), opacity .28s, box-shadow .28s';
    flipEl.style.transform = `translateX(${exitX}px) rotateY(${exitRotate}deg)`;
    flipEl.style.opacity = '0.25';
    flipEl.style.boxShadow = '0 14px 34px var(--shadow)';

    setTimeout(async () => {
      await loadPage(pageNumber);

      // إدخال الصفحة الجديدة من الجهة المقابلة لاتجاه السحب
      flipEl.style.transition = 'none';
      const enterX = direction === 'next' ? pageWidth * 1.05 : -pageWidth * 1.05;
      const enterRotate = direction === 'next' ? 9 : -9;
      flipEl.style.transformOrigin = direction === 'next' ? 'left center' : 'right center';
      flipEl.style.transform = `translateX(${enterX}px) rotateY(${enterRotate}deg)`;
      flipEl.style.opacity = '0.25';

      // إجبار إعادة الرسم قبل بدء انتقال الدخول حتى تعمل الحركة
      void flipEl.offsetWidth;

      flipEl.style.transition = 'transform .32s cubic-bezier(.22,.61,.36,1), opacity .32s';
      flipEl.style.transform = 'translateX(0) rotateY(0)';
      flipEl.style.opacity = '1';

      setTimeout(() => {
        flipEl.style.transition = '';
        flipEl.style.boxShadow = '';
        flipEl.style.transformOrigin = '';
        isFlipAnimating = false;
      }, 340);
    }, 240);
  }

  function goNextPage() {
    const n = state.currentPage < 604 ? state.currentPage + 1 : 1;
    flipToPage(n, 'next');
  }
  function goPrevPage() {
    const n = state.currentPage > 1 ? state.currentPage - 1 : 604;
    flipToPage(n, 'prev');
  }

  function initSwipeNavigation() {
    const flipEl = $('#mushaf-page');
    const wrap = $('#mushaf-wrap');
    if (!flipEl || !wrap) return;

    const SWIPE_RATIO_THRESHOLD = 0.2;   // لازم تسحب ٢٠٪ من عرض الصفحة على الأقل
    const FLICK_VELOCITY_THRESHOLD = 0.55; // px/ms لسحبة سريعة خفيفة

    let dragging = false;
    let axisLocked = null; // 'x' | 'y' | null
    let startX = 0, startY = 0, currentX = 0;
    let pageWidth = 0;
    let lastX = 0, lastT = 0, velocity = 0;
    let hadDrag = false;

    function onPointerDown(e) {
      if (isFlipAnimating) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      axisLocked = null;
      hadDrag = false;
      pageWidth = flipEl.getBoundingClientRect().width || 320;
      startX = e.clientX;
      startY = e.clientY;
      currentX = 0;
      lastX = startX;
      lastT = performance.now();
      velocity = 0;
    }

    function onPointerMove(e) {
      if (!dragging || isFlipAnimating) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (axisLocked === null) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          axisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (axisLocked === 'x') flipEl.classList.add('dragging');
        }
      }

      if (axisLocked === 'y') return; // اترك التمرير الرأسي الطبيعي للصفحة يعمل

      if (axisLocked === 'x') {
        e.preventDefault();
        hadDrag = true;
        currentX = dx;

        const now = performance.now();
        const dt = now - lastT || 1;
        velocity = (e.clientX - lastX) / dt;
        lastX = e.clientX;
        lastT = now;

        const resistance = 0.6; // مقاومة بسيطة تعطي إحساس ورق حقيقي
        const translate = currentX * resistance;
        const rotate = Math.max(-9, Math.min(9, -(translate / pageWidth) * 11));
        flipEl.style.transformOrigin = translate < 0 ? 'right center' : 'left center';
        flipEl.style.transform = `translateX(${translate}px) rotateY(${rotate}deg)`;
        const shadowSide = translate < 0 ? '-' : '';
        flipEl.style.boxShadow = `0 14px 34px var(--shadow), ${shadowSide}${Math.min(Math.abs(translate) / 3, 26)}px 0 32px rgba(0,0,0,.22)`;
      }
    }

    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      flipEl.classList.remove('dragging');

      if (axisLocked !== 'x') { axisLocked = null; return; }
      axisLocked = null;

      const ratio = currentX / pageWidth;
      const isFlick = Math.abs(velocity) > FLICK_VELOCITY_THRESHOLD;

      // المصحف يُقرأ من اليمين لليسار: السحب لليمين (ratio موجب) يكشف
      // الصفحة "التالية" في ترتيب المصحف، والسحب لليسار (ratio سالب)
      // يرجع "للصفحة السابقة".
      if (ratio >= SWIPE_RATIO_THRESHOLD || (isFlick && currentX > 10)) {
        goNextPage();
      } else if (ratio <= -SWIPE_RATIO_THRESHOLD || (isFlick && currentX < -10)) {
        goPrevPage();
      } else {
        snapBack();
      }
    }

    function snapBack() {
      flipEl.style.transition = 'transform .26s cubic-bezier(.22,.61,.36,1), box-shadow .26s';
      flipEl.style.transform = 'translateX(0) rotateY(0)';
      flipEl.style.boxShadow = '';
      setTimeout(() => { flipEl.style.transition = ''; flipEl.style.transformOrigin = ''; }, 280);
    }

    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointermove', onPointerMove, { passive: false });
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', onPointerUp);

    // منع فتح نافذة الآية بالخطأ لو كانت هذه اللمسة سحبة تقليب صفحة
    wrap.addEventListener(
      'click',
      (e) => {
        if (hadDrag) {
          e.stopPropagation();
          e.preventDefault();
          hadDrag = false;
        }
      },
      true
    );
  }

  function initSwipeHintOnce() {
    if (localStorage.getItem('almus-hraf:sawSwipeHint')) return;
    setTimeout(() => {
      showToast('مرّر بإصبعك يمينًا أو يسارًا لتقليب الصفحة 👉👈');
      localStorage.setItem('almus-hraf:sawSwipeHint', '1');
    }, 1400);
  }

  /* ---------------------------------------------------------------- */
  /* نافذة خيارات الآية ومشاركة الصورة                                  */
  /* ---------------------------------------------------------------- */
  function openAyahModal(surah, ayah, text, surahNameAr) {
    state.activeAyah = { surah, ayah, text, surahNameAr };
    const cName = cleanSurahName(surahNameAr);
    $('#ayah-modal-title').textContent = `سورة ${cName} — الآية ${toArabicDigits(ayah)}`;
    $('#ayah-modal-text').textContent = text;
    $('#ayah-panel-content').innerHTML = '';
    $('#ayah-panel-content').classList.remove('open');
    $$('.option-btn').forEach((b) => b.classList.remove('active'));

    const audioBtn = $('#btn-ayah-audio');
    if (audioBtn) audioBtn.querySelector('.opt-icon').innerHTML = '<svg><use href="#icon-play"></use></svg>';
    if (state.audioEl) { state.audioEl.pause(); state.audioEl = null; }

    openOverlay('#ayah-overlay');
  }

  function initAyahModal() {
    $('#btn-close-ayah').addEventListener('click', () => closeOverlay('#ayah-overlay'));

    $$('.option-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleAyahOption(btn.dataset.panel, btn));
    });
  }

  function generateAyahImage(surahName, ayahNum, ayahText) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 1080;
    canvas.height = 1080;

    const grad = ctx.createLinearGradient(0, 0, 0, 1080);
    grad.addColorStop(0, '#0f1715');
    grad.addColorStop(1, '#050b0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = '#c5a059';
    ctx.lineWidth = 6;
    ctx.strokeRect(40, 40, 1000, 1000);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(52, 52, 976, 976);

    ctx.fillStyle = '#c5a059';
    ctx.font = 'bold 42px "Traditional Arabic", serif';
    ctx.textAlign = 'center';
    const cleanSurah = cleanSurahName(surahName);
    ctx.fillText(`سورة ${cleanSurah} — الآية (${toArabicDigits(ayahNum)})`, 540, 140);

    ctx.fillStyle = '#ffffff';
    ctx.font = '38px "Amiri", "Traditional Arabic", serif';

    const words = ayahText.split(' ');
    let line = '';
    let y = 380;
    const maxWidth = 860;
    const lineHeight = 75;

    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, 540, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 540, y);

    ctx.strokeStyle = '#2d3748';
    ctx.beginPath();
    ctx.moveTo(150, 920);
    ctx.lineTo(930, 920);
    ctx.stroke();

    ctx.fillStyle = '#a0aec0';
    ctx.font = '24px sans-serif';
    ctx.fillText('صدقة جارية عن المرحوم بإذن الله: أشرف أحمد جاهين', 540, 970);
    ctx.fillStyle = '#c5a059';
    ctx.font = '20px sans-serif';
    ctx.fillText('تطبيق المصحف الأشرف', 540, 1010);

    canvas.toBlob((blob) => {
      const file = new File([blob], `ayah-${ayahNum}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: `سورة ${cleanSurah}`,
          text: `${ayahText} [سورة ${cleanSurah}: ${ayahNum}]`
        }).catch(() => {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `المصحف-الأشرف-آية-${ayahNum}.png`;
        a.click();
      }
    });
  }

  async function handleAyahOption(panel, btnEl) {
    const { surah, ayah, text, surahNameAr } = state.activeAyah;
    const panelEl = $('#ayah-panel-content');

    if (panel === 'audio') {
      return toggleAyahAudio(btnEl);
    }
    if (panel === 'bookmark') {
      localStorage.setItem(
        'almus-hraf:bookmark',
        JSON.stringify({
          page: state.currentPage,
          surah,
          ayah,
          surahNameAr,
          savedAt: Date.now()
        })
      );
      const cName = cleanSurahName(surahNameAr);
      showToast(`تم حفظ آخر قراءة: سورة ${cName} — آية ${toArabicDigits(ayah)} (صفحة ${toArabicDigits(state.currentPage)})`);
      return;
    }

    if (panel === 'share-img') {
      showToast('جارٍ تجهيز صورة الآية...');
      generateAyahImage(state.activeAyah.surahNameAr, state.activeAyah.ayah, state.activeAyah.text);
      return;
    }

    $$('.option-btn').forEach((b) => b.classList.toggle('active', b === btnEl));
    panelEl.classList.add('open');
    panelEl.innerHTML = `<p class="loading-text">جارٍ التحميل...</p>`;

    try {
      if (panel === 'tafsir') {
        const t = await QuranAPI.getTafsir(surah, ayah);
        panelEl.innerHTML = `<p class="panel-text">${escapeHTML(t.text)}</p><p class="panel-source">${escapeHTML(t.source)}</p>`;
      } else if (panel === 'asbab') {
        const key = `${surah}:${ayah}`;
        const found = typeof ASBAB_DATA !== 'undefined' ? ASBAB_DATA[key] : null;
        panelEl.innerHTML = found
          ? `<p class="panel-text">${escapeHTML(found)}</p>`
          : `<p class="panel-text muted">${escapeHTML(typeof ASBAB_FALLBACK !== 'undefined' ? ASBAB_FALLBACK : 'لا يوجد سبب نزول وارد لهذه الآية في المصدر المعتمد.')}</p>`;
      } else if (panel === 'gharib') {
        const words = await QuranAPI.getWordMeanings(surah, ayah);
        if (!words.length) throw new Error('no-data');
        panelEl.innerHTML = `<div class="gharib-list">${words
          .map(
            (w) => `<div class="gharib-item"><span class="gharib-word">${escapeHTML(w.text)}</span><span class="gharib-meaning">${escapeHTML(w.meaning || '—')}</span></div>`
          )
          .join('')}</div>`;
      }
    } catch (e) {
      panelEl.innerHTML = `<p class="error-text">تعذّر تحميل هذا المحتوى الآن. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.</p>`;
    }
  }

  function escapeHTML(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  async function toggleAyahAudio(btnEl) {
    const iconWrap = btnEl.querySelector('.opt-icon');
    if (state.audioEl && !state.audioEl.paused) {
      state.audioEl.pause();
      iconWrap.innerHTML = '<svg><use href="#icon-play"></use></svg>';
      return;
    }
    try {
      if (!state.audioEl) {
        iconWrap.innerHTML = '⏳';
        const { surah, ayah } = state.activeAyah;
        const url = await QuranAPI.getAyahAudio(surah, ayah);
        state.audioEl = new Audio(url);
        state.audioEl.addEventListener('ended', () => {
          iconWrap.innerHTML = '<svg><use href="#icon-play"></use></svg>';
        });
      }
      await state.audioEl.play();
      iconWrap.innerHTML = '<svg><use href="#icon-pause"></use></svg>';
    } catch (e) {
      iconWrap.innerHTML = '<svg><use href="#icon-play"></use></svg>';
      showToast('تعذّر تشغيل الصوت، تحقّق من الاتصال بالإنترنت');
    }
  }

  /* ---------------------------------------------------------------- */
  /* الأذكار والأدعية                                                 */
  /* ---------------------------------------------------------------- */
  function renderAccordion(containerId, dataset) {
    const wrap = $(containerId);
    if (!wrap || !dataset) return;
    wrap.innerHTML = dataset
      .map(
        (section, i) => `
      <div class="accordion-section" data-idx="${i}">
        <button class="accordion-head">
          <span class="acc-icon">${section.icon}</span>
          <span class="acc-title">${escapeHTML(section.title)}</span>
          <span class="acc-count">${toArabicDigits(section.items.length)}</span>
        </button>
        <div class="accordion-body">
          ${section.items
            .map(
              (it) => `
            <div class="dhikr-card">
              <p class="dhikr-text">${escapeHTML(it.text)}</p>
              <div class="dhikr-foot">
                ${it.note ? `<span class="dhikr-note">${escapeHTML(it.note)}</span>` : ''}
                ${it.count && it.count > 1 ? `<span class="dhikr-count">×${toArabicDigits(it.count)}</span>` : ''}
                ${it.source ? `<span class="dhikr-source">${escapeHTML(it.source)}</span>` : ''}
              </div>
            </div>`
            )
            .join('')}
        </div>
      </div>`
      )
      .join('');

    $$('.accordion-head', wrap).forEach((head) => {
      head.addEventListener('click', () => {
        head.parentElement.classList.toggle('open');
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* الإعدادات                                                         */
  /* ---------------------------------------------------------------- */
  function initSettings() {
    $('#btn-settings').addEventListener('click', () => openOverlay('#settings-overlay'));
    $('#btn-close-settings').addEventListener('click', () => closeOverlay('#settings-overlay'));

    const root = document.documentElement;
    let fontStep = Number(localStorage.getItem('almus-hraf:fontStep') || 0);
    applyFontStep();

    function applyFontStep() {
      root.style.setProperty('--ayah-font-scale', (1 + fontStep * 0.08).toFixed(2));
    }
    $('#font-inc').addEventListener('click', () => {
      fontStep = Math.min(fontStep + 1, 5);
      applyFontStep();
      localStorage.setItem('almus-hraf:fontStep', String(fontStep));
    });
    $('#font-dec').addEventListener('click', () => {
      fontStep = Math.max(fontStep - 1, -3);
      applyFontStep();
      localStorage.setItem('almus-hraf:fontStep', String(fontStep));
    });

    const savedTheme = localStorage.getItem('almus-hraf:theme') || 'paper';
    document.body.classList.toggle('theme-night', savedTheme === 'night');
    $$('.theme-choice').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === savedTheme);
      b.addEventListener('click', () => {
        document.body.classList.toggle('theme-night', b.dataset.theme === 'night');
        localStorage.setItem('almus-hraf:theme', b.dataset.theme);
        $$('.theme-choice').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
    });

    $('#btn-goto-lastread').addEventListener('click', async () => {
      const raw = localStorage.getItem('almus-hraf:bookmark');
      if (!raw) return showToast('لا توجد علامة محفوظة بعد');
      const bm = JSON.parse(raw);
      closeOverlay('#settings-overlay');
      switchToQuranTab();

      await loadPage(bm.page || 1);
      setTimeout(() => {
        const target = $(`.ayah[data-surah="${bm.surah}"][data-ayah="${bm.ayah}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('ayah-highlight');
          setTimeout(() => target.classList.remove('ayah-highlight'), 2500);
        }
      }, 300);
    });
  }

  /* ---------------------------------------------------------------- */
  /* مواقيت الصلاة والقبلة والإشعارات                                 */
  /* ---------------------------------------------------------------- */
  const PRAYER_NAMES = {
    Fajr: 'الفجر',
    Sunrise: 'الشروق',
    Dhuhr: 'الظهر',
    Asr: 'العصر',
    Maghrib: 'المغرب',
    Isha: 'العشاء'
  };

  let prayerTimings = null;
  let timerInterval = null;

  function calculateQiblaAngle(lat, lng) {
    const kaabaLat = 21.422487 * (Math.PI / 180);
    const kaabaLng = 39.826206 * (Math.PI / 180);
    const userLat = lat * (Math.PI / 180);
    const userLng = lng * (Math.PI / 180);

    const dLng = kaabaLng - userLng;
    const y = Math.sin(dLng);
    const x = Math.cos(userLat) * Math.tan(kaabaLat) - Math.sin(userLat) * Math.cos(dLng);
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    return (angle + 360) % 360;
  }

  async function loadPrayerTimes() {
    let lat = 30.0444;
    let lng = 31.2357;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchTimings(pos.coords.latitude, pos.coords.longitude),
        () => fetchTimings(lat, lng)
      );
    } else {
      fetchTimings(lat, lng);
    }

    async function fetchTimings(latitude, longitude) {
      try {
        const qibla = calculateQiblaAngle(latitude, longitude);
        const arrow = $('#compass-arrow');
        if (arrow) arrow.style.transform = `rotate(${qibla}deg)`;
        const qText = $('#qibla-text');
        if (qText) qText.textContent = `زاوية القبلة لموقعك: ${toArabicDigits(Math.round(qibla))}° درجة من الشمال`;

        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=5`);
        const data = await res.json();

        if (data && data.data) {
          prayerTimings = data.data.timings;
          const hijri = data.data.date.hijri;
          const hijriEl = $('#hijri-date');
          if (hijriEl) hijriEl.textContent = `${hijri.day} ${hijri.month.ar} ${hijri.year} هـ`;

          renderPrayerTimes(prayerTimings);
          startNextPrayerCountdown(prayerTimings);
        }
      } catch (e) {
        const nextName = $('#next-prayer-name');
        if (nextName) nextName.textContent = 'تعذر جلب المواقيت';
      }
    }
  }

  function renderPrayerTimes(timings) {
    Object.keys(PRAYER_NAMES).forEach((key) => {
      const card = $(`.p-card[data-p="${key}"]`);
      if (card) {
        const timeStr = timings[key];
        card.querySelector('.p-time').textContent = format12Hour(timeStr);
      }
    });
  }

  function format12Hour(time24) {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'م' : 'ص';
    const h12 = h % 12 || 12;
    return `${toArabicDigits(h12)}:${toArabicDigits(m.toString().padStart(2, '0'))} ${period}`;
  }

  function startNextPrayerCountdown(timings) {
    if (timerInterval) clearInterval(timerInterval);

    function update() {
      const now = new Date();
      const list = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
      let nextP = null;
      let nextTime = null;

      for (let p of list) {
        const [h, m] = timings[p].split(':').map(Number);
        const pDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
        if (pDate > now) {
          nextP = p;
          nextTime = pDate;
          break;
        }
      }

      if (!nextP) {
        nextP = 'Fajr';
        const [h, m] = timings['Fajr'].split(':').map(Number);
        nextTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m, 0);
      }

      $$('.p-card').forEach((c) => c.classList.remove('active'));
      const activeCard = $(`.p-card[data-p="${nextP}"]`);
      if (activeCard) activeCard.classList.add('active');

      const nextName = $('#next-prayer-name');
      if (nextName) nextName.textContent = PRAYER_NAMES[nextP];

      const diff = nextTime - now;
      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      const cd = $('#prayer-countdown');
      if (cd) {
        cd.textContent = `${toArabicDigits(String(hrs).padStart(2, '0'))}:${toArabicDigits(String(mins).padStart(2, '0'))}:${toArabicDigits(String(secs).padStart(2, '0'))}`;
      }
    }

    update();
    timerInterval = setInterval(update, 1000);
  }

  function initNotifications() {
    const btn = $('#btn-enable-notify');
    if (!btn) return;

    if (Notification.permission === 'granted') {
      btn.textContent = 'الإشعارات مفعلة ✅';
      btn.disabled = true;
    }

    btn.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        return showToast('المتصفح لا يدعم الإشعارات');
      }

      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        btn.textContent = 'الإشعارات مفعلة ✅';
        btn.disabled = true;
        showToast('تم تفعيل التنبيهات اليومية بنجاح 🔔');
        sendNotification('المصحف الأشرف 📖', 'تقبل الله طاعتكم، وسنذكركم بأذكاركم وسورة الكهف يوم الجمعة.');
      } else {
        showToast('لم يتم إعطاء الإذن للإشعارات');
      }
    });
  }

  function sendNotification(title, body) {
    if (Notification.permission === 'granted' && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          dir: 'rtl'
        });
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* التسجيل والتشغيل الرئيسي                                         */
  /* ---------------------------------------------------------------- */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  }

  function initOverlayBackdrops() {
    $$('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => {
        if (e.target === ov) ov.classList.remove('open');
      });
    });
  }

  async function init() {
    initTabs();
    initTabbarToggle();
    initDuaBanner();
    initIndexOverlay();
    initSwipeNavigation();
    initSwipeHintOnce();
    initAyahModal();
    initSettings();
    initOverlayBackdrops();
    registerServiceWorker();

    loadPrayerTimes();
    initNotifications();

    if (typeof AZKAR_DATA !== 'undefined') renderAccordion('#azkar-accordion', AZKAR_DATA);
    if (typeof DUAS_DATA !== 'undefined') renderAccordion('#duas-accordion', DUAS_DATA);

    loadSurahIndex();

    const savedPage = Number(localStorage.getItem('almus-hraf:currentPage') || 1);
    await loadPage(savedPage);

    setTimeout(() => {
      const splash = $('#splash');
      if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 600);
      }
    }, 500);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
