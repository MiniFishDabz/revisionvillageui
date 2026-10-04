(() => {
  'use strict';

  const state = { answered: 0, correct: 0, gradable: 0, totalQuestions: 0 };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function icon(name) {
    const paths = {
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
      moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
    };
    return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function installAppBar() {
    if ($('.rv-appbar')) return;
    const bar = document.createElement('header');
    bar.className = 'rv-appbar';
    bar.innerHTML = `
      <div class="rv-appbar__inner">
        <a class="rv-brand" href="#" aria-label="Village home">
          <span class="rv-brand__mark">V</span>
          <span class="rv-brand__text">Village</span>
          <span class="rv-brand__badge">Study</span>
        </a>
        <div class="rv-appbar__spacer"></div>
        <div class="rv-appbar__route" id="rvRoute"></div>
        <button class="rv-icon-button" id="rvThemeToggle" type="button" aria-label="Toggle color theme"></button>
      </div>`;
    document.body.prepend(bar);
    const toggle = $('#rvThemeToggle');
    const render = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      toggle.innerHTML = dark ? icon('sun') : icon('moon');
      toggle.title = dark ? 'Use light mode' : 'Use dark mode';
    };
    toggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      try { localStorage.setItem('village-theme', next); } catch (_) {}
      render();
    });
    render();
  }

  function routeTitle() {
    const crumb = $('#navBar');
    const route = $('#rvRoute');
    if (!route) return;
    if (!location.hash || location.hash === '#') {
      route.textContent = 'Question bank';
      return;
    }
    const bits = location.hash.replace(/^#app\/?/, '').split('/').filter(Boolean);
    route.textContent = bits.length ? bits.map(s => decodeURIComponent(s).replace(/-/g, ' ')).slice(-2).join('  /  ') : 'Browse subjects';
    if (crumb && crumb.textContent.trim()) route.title = crumb.textContent.replace(/\s+/g, ' ').trim();
  }

  function installHome() {
    if (location.hash && location.hash !== '#') return;
    const main = $('#mainContent');
    if (!main || main.dataset.premiumHome === '1') return;
    main.dataset.premiumHome = '1';
    main.innerHTML = `
      <section class="rv-home">
        <div class="rv-home__inner">
          <div class="rv-kicker">IB question bank · local snapshot</div>
          <h1>Study questions without the <span class="rv-home__accent">clutter.</span></h1>
          <p class="rv-home__lead">Browse the original Village question data in a cleaner interface built for focused practice, fast checking and readable solutions.</p>
          <div class="rv-home__actions">
            <a href="#app" class="rv-primary">Open question bank ${icon('arrow')}</a>
            <a href="https://dl.pirateib.su/RV%20-%20Other%20Materials/Notes/" target="_blank" rel="noreferrer" class="rv-secondary">Revision notes</a>
          </div>
          <div class="rv-home__meta">
            <div class="rv-feature"><strong>Original question data</strong><span>The bundled question files remain untouched; this layer only changes presentation and interaction.</span></div>
            <div class="rv-feature"><strong>Interactive MCQs</strong><span>Select an answer, check it instantly, then reveal the markscheme directly below the question.</span></div>
            <div class="rv-feature"><strong>Dark & light themes</strong><span>Your theme preference is saved on this device and applies across every subject page.</span></div>
          </div>
          <div class="rv-footer-note">Community archive interface · not affiliated with Revision Village.</div>
        </div>
      </section>`;
  }

  function maybeGridChoices() {
    const main = $('#mainContent');
    if (!main || $('.question', main)) return;
    const directLinks = $$('#mainContent > a').filter(a => $('.choice', a));
    if (directLinks.length >= 4) main.classList.add('rv-choice-grid');
    else main.classList.remove('rv-choice-grid');
  }

  function cleanText(s) {
    return (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function optionLetter(li) {
    const text = cleanText(li.textContent);
    const m = text.match(/^([A-D])\s*[.)]\s*/i) || text.match(/^([A-D])\s{1,}/i);
    return m ? m[1].toUpperCase() : null;
  }

  function findMcqList(left) {
    for (const list of $$('ul, ol', left)) {
      if (list.closest('.rv-inline-solution')) continue;
      const items = Array.from(list.children).filter(el => el.tagName === 'LI');
      if (items.length < 2 || items.length > 6) continue;
      const letters = items.map(optionLetter);
      if (letters.every(Boolean) && new Set(letters).size === letters.length && letters.every(x => 'ABCD'.includes(x))) return { list, items, letters };
    }
    return null;
  }

  function inferCorrect(dialog) {
    if (!dialog) return null;
    const selectors = ['strong', 'b', '[class*="answer"]', 'p', 'li'];
    for (const el of $$(selectors.join(','), dialog)) {
      const t = cleanText(el.textContent).replace(/^Question Markscheme\s*/i, '');
      if (/^[A-D]$/i.test(t)) return t.toUpperCase();
      const m = t.match(/^(?:answer\s*)?[:\-]?\s*([A-D])(?:\s|[.)]|$)/i);
      if (m && t.length < 45) return m[1].toUpperCase();
    }
    const text = cleanText(dialog.textContent).replace(/^Close\s*Question Markscheme\s*/i, '');
    const patterns = [
      /(?:correct\s+(?:answer|option|choice)|answer|option|choice)\s*(?:is|:|=|-)?\s*\*{0,2}([A-D])\*{0,2}\b/i,
      /^\s*([A-D])\s*(?:[.)]|$)/i
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return m[1].toUpperCase();
    }
    return null;
  }

  function solutionHtml(dialog) {
    if (!dialog) return '';
    const clone = dialog.cloneNode(true);
    $$('button', clone).forEach(b => b.remove());
    const heading = $('h2', clone);
    if (heading && /markscheme/i.test(heading.textContent)) heading.remove();
    return clone.innerHTML.trim();
  }

  function updateToolbar() {
    let tb = $('.rv-question-toolbar');
    if (!state.totalQuestions) {
      if (tb) tb.remove();
      return;
    }
    if (!tb) {
      tb = document.createElement('div');
      tb.className = 'rv-question-toolbar';
      tb.innerHTML = `
        <span class="rv-question-toolbar__label">Practice set</span>
        <span class="rv-question-toolbar__stat"><i class="rv-question-toolbar__dot"></i><b data-rv-answered>0</b> answered</span>
        <span class="rv-question-toolbar__stat"><i class="rv-question-toolbar__dot rv-question-toolbar__dot--good"></i><b data-rv-correct>0</b> correct</span>
        <span class="rv-question-toolbar__spacer"></span>
        <span data-rv-count></span>
        <span class="rv-question-toolbar__progress"><i></i></span>`;
      const main = $('#mainContent');
      if (main) main.prepend(tb);
    }
    $('[data-rv-answered]', tb).textContent = String(state.answered);
    $('[data-rv-correct]', tb).textContent = String(state.correct);
    $('[data-rv-count]', tb).textContent = `${state.totalQuestions} questions`;
    const pct = state.gradable ? Math.round((state.answered / state.gradable) * 100) : 0;
    $('.rv-question-toolbar__progress > i', tb).style.width = `${Math.min(100, pct)}%`;
  }

  function enhanceQuestion(question) {
    if (!question || question.dataset.rvEnhanced === '1') return;
    question.dataset.rvEnhanced = '1';
    state.totalQuestions += 1;

    const left = $('.questionLeft', question);
    const right = $('.questionRight', question);
    const dialog = $('dialog.markscheme, .markscheme', question);
    if (!left) { updateToolbar(); return; }

    if (right) {
      const btn = $('button', right);
      if (btn && /markscheme/i.test(btn.textContent)) btn.textContent = 'View solution';
    }

    const mcq = findMcqList(left);
    if (!mcq) { updateToolbar(); return; }

    const correct = inferCorrect(dialog);
    state.gradable += correct ? 1 : 0;
    const solution = solutionHtml(dialog);

    mcq.list.classList.add('rv-mcq-list');
    mcq.items.forEach((li, i) => {
      const letter = mcq.letters[i];
      li.classList.add('rv-option');
      li.dataset.option = letter;
      li.setAttribute('role', 'radio');
      li.setAttribute('aria-checked', 'false');
      li.tabIndex = 0;
      if (!$('.rv-option__key', li)) {
        const key = document.createElement('span');
        key.className = 'rv-option__key';
        key.textContent = letter;
        li.prepend(key);
      }
    });
    mcq.list.setAttribute('role', 'radiogroup');
    mcq.list.setAttribute('aria-label', 'Answer choices');

    const controls = document.createElement('div');
    controls.className = 'rv-answer-controls';
    controls.innerHTML = `<button type="button" class="rv-check" disabled>Check answer</button><span class="rv-feedback" aria-live="polite">Select an option</span>`;
    mcq.list.insertAdjacentElement('afterend', controls);

    const inline = document.createElement('div');
    inline.className = 'rv-inline-solution';
    inline.hidden = true;
    inline.innerHTML = `<div class="rv-inline-solution__head">Solution</div><div class="rv-inline-solution__body">${solution || 'Use “View solution” to open the original markscheme.'}</div>`;
    controls.insertAdjacentElement('afterend', inline);

    const check = $('.rv-check', controls);
    const feedback = $('.rv-feedback', controls);
    let selected = null;
    let locked = false;

    function choose(li) {
      if (locked) return;
      selected = li.dataset.option;
      mcq.items.forEach(item => {
        const active = item === li;
        item.classList.toggle('is-selected', active);
        item.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      check.disabled = false;
      feedback.textContent = `Option ${selected} selected`;
      feedback.className = 'rv-feedback';
    }

    mcq.items.forEach(li => {
      li.addEventListener('click', () => choose(li));
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(li); }
      });
    });

    check.addEventListener('click', () => {
      if (!selected || locked) return;
      locked = true;
      check.disabled = true;
      mcq.items.forEach(li => li.classList.add('is-locked'));
      inline.hidden = false;

      if (correct) {
        const picked = mcq.items.find(li => li.dataset.option === selected);
        const answer = mcq.items.find(li => li.dataset.option === correct);
        if (answer) answer.classList.add('is-correct');
        const isRight = selected === correct;
        if (!isRight && picked) picked.classList.add('is-wrong');
        feedback.textContent = isRight ? `Correct — ${correct} is the answer.` : `Not quite — the correct answer is ${correct}.`;
        feedback.className = `rv-feedback ${isRight ? 'is-correct' : 'is-wrong'}`;
        state.answered += 1;
        if (isRight) state.correct += 1;
        updateToolbar();
      } else {
        feedback.textContent = 'Answer selected — compare it with the solution below.';
        feedback.className = 'rv-feedback';
      }
    });

    updateToolbar();
  }

  function scan() {
    routeTitle();
    maybeGridChoices();
    $$('.question').forEach(enhanceQuestion);
  }

  installAppBar();
  installHome();
  scan();

  const observer = new MutationObserver(() => {
    window.clearTimeout(observer._t);
    observer._t = window.setTimeout(scan, 20);
  });
  const main = $('#mainContent');
  if (main) observer.observe(main, { childList: true, subtree: true });
  const nav = $('#navBar');
  if (nav) observer.observe(nav, { childList: true, subtree: true, characterData: true });
})();
