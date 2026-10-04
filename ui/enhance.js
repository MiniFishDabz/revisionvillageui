(() => {
  'use strict';

  const state = {
    questionStates: new WeakMap(),
    answered: 0,
    correct: 0,
    observer: null,
    applyQueued: false,
    toastTimer: null
  };

  const icons = {
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 15.6A8.5 8.5 0 0 1 8.4 3.3 8.5 8.5 0 1 0 20.7 15.6Z"></path></svg>'
  };

  function currentTheme() {
    return document.documentElement.dataset.theme || 'dark';
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('village-theme', theme); } catch {}
    updateThemeButton();
  }

  function updateThemeButton() {
    const button = document.querySelector('[data-village-theme-toggle]');
    if (!button) return;
    const dark = currentTheme() === 'dark';
    button.innerHTML = dark ? icons.sun : icons.moon;
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    button.title = dark ? 'Light mode' : 'Dark mode';
  }

  function makeToolbar() {
    if (document.querySelector('.village-toolbar')) return;

    const header = document.createElement('header');
    header.className = 'village-toolbar';
    header.innerHTML = `
      <div class="village-toolbar__inner">
        <a class="village-brand" href="#app" aria-label="Village home">
          <span class="village-brand__mark">V</span>
          <span>Village</span>
        </a>
        <div class="village-toolbar__right">
          <span class="village-toolbar__status" data-village-status>Question bank</span>
          <button class="village-icon-button" type="button" data-village-theme-toggle></button>
        </div>
      </div>`;

    document.body.prepend(header);
    header.querySelector('[data-village-theme-toggle]').addEventListener('click', () => {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
    updateThemeButton();
  }

  function toast(message) {
    let el = document.querySelector('.village-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'village-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  function updateStatus() {
    const status = document.querySelector('[data-village-status]');
    if (!status) return;
    const questions = document.querySelectorAll('.question').length;
    if (!questions) {
      status.textContent = 'Question bank';
      return;
    }
    const answered = [...document.querySelectorAll('.question')].filter(q => q.dataset.premiumAnswered === 'true').length;
    const correct = [...document.querySelectorAll('.question')].filter(q => q.dataset.premiumResult === 'correct').length;
    status.textContent = answered ? `${correct}/${answered} correct · ${questions} questions` : `${questions} questions`;
  }

  function textStartsWithLetter(text) {
    const match = String(text || '').trim().match(/^\s*([A-H])(?:[.)\]:-]|\s{2,})\s*/i);
    return match ? match[1].toUpperCase() : null;
  }

  function candidateAnswerList(question) {
    const left = question.querySelector('.questionLeft') || question;
    const lists = [...left.querySelectorAll('ol, ul')].filter(list => {
      if (list.closest('.markscheme, .solution, [class*="solution" i], [class*="markscheme" i]')) return false;
      const items = [...list.children].filter(child => child.tagName === 'LI');
      if (items.length < 2 || items.length > 8) return false;
      const lettered = items.filter(item => textStartsWithLetter(item.textContent)).length;
      return lettered >= Math.min(2, items.length);
    });

    if (lists.length) return lists[0];

    // Some upstream pages use an unlettered 2–5 item list for MCQs.
    return [...left.querySelectorAll('ol, ul')].find(list => {
      if (list.closest('.markscheme, .solution, [class*="solution" i], [class*="markscheme" i]')) return false;
      const items = [...list.children].filter(child => child.tagName === 'LI');
      return items.length >= 2 && items.length <= 5 && items.every(item => item.textContent.trim().length < 500);
    }) || null;
  }

  function findMarkschemeControl(question) {
    const right = question.querySelector('.questionRight') || question;
    const controls = [...right.querySelectorAll('button, input[type="button"], input[type="submit"], a')];
    return controls.find(el => /mark\s*scheme|solution|answer/i.test((el.textContent || el.value || el.getAttribute('aria-label') || '').trim())) || null;
  }

  function normalizeLetter(value) {
    if (value == null) return null;
    const s = String(value).trim().toUpperCase();
    const direct = s.match(/^([A-H])$/);
    if (direct) return direct[1];
    const numeric = Number(s);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < 8) return String.fromCharCode(65 + numeric);
    const embedded = s.match(/(?:^|\b)([A-H])(?:\b|[.)\]])/);
    return embedded ? embedded[1] : null;
  }

  function letterFromElement(el) {
    if (!el) return null;
    const attrs = ['data-correct-answer', 'data-answer', 'data-correct', 'data-key', 'data-solution', 'data-option'];
    for (const attr of attrs) {
      if (el.hasAttribute?.(attr)) {
        const value = el.getAttribute(attr);
        if (value === 'true' && el.dataset.premiumLetter) return el.dataset.premiumLetter;
        const letter = normalizeLetter(value);
        if (letter) return letter;
      }
    }
    return null;
  }

  function extractCorrectLetter(question) {
    const fromQuestion = letterFromElement(question);
    if (fromQuestion) return fromQuestion;

    const explicit = question.querySelector('[data-correct-answer], [data-answer], [data-solution], [data-correct="true"], .correct-answer, .answer-correct, .is-correct, [class*="correctAnswer"]');
    const fromExplicit = letterFromElement(explicit) || explicit?.dataset?.premiumLetter || textStartsWithLetter(explicit?.textContent);
    if (fromExplicit) return fromExplicit;

    const right = question.querySelector('.questionRight');
    const scopes = [
      question.querySelector('.markscheme'),
      question.querySelector('.solution'),
      question.querySelector('[class*="markscheme" i]'),
      question.querySelector('[class*="solution" i]'),
      right
    ].filter(Boolean);

    const patterns = [
      /(?:correct\s+answer|answer|option)\s*(?:is|:|-)?\s*[\[(]?([A-H])[\]).:]?/i,
      /(?:answer|solution)\s*[\[(]([A-H])[\])]/i,
      /^\s*[\[(]?([A-H])[\]).:]\s+/i
    ];

    for (const scope of scopes) {
      const text = (scope.innerText || scope.textContent || '').replace(/\s+/g, ' ').trim();
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1].toUpperCase();
      }

      const terse = [...scope.querySelectorAll('strong, b, em, .answer, [class*="answer" i]')]
        .map(el => (el.textContent || '').trim())
        .find(textValue => /^[\[(]?[A-H][\]).:]?$/.test(textValue));
      if (terse) return normalizeLetter(terse);
    }

    return null;
  }

  function markResult(question, selected, correctLetter) {
    const qState = state.questionStates.get(question);
    if (!qState || qState.committed) return;

    const options = qState.options;
    const selectedLetter = selected.dataset.premiumLetter;
    const feedback = qState.feedback;
    const correctOption = options.find(option => option.dataset.premiumLetter === correctLetter);

    qState.committed = true;
    question.dataset.premiumAnswered = 'true';
    options.forEach(option => {
      option.setAttribute('aria-disabled', 'true');
      option.tabIndex = -1;
    });

    if (correctLetter && correctOption) {
      const isCorrect = selectedLetter === correctLetter;
      selected.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
      if (!isCorrect) correctOption.classList.add('is-answer');
      question.dataset.premiumResult = isCorrect ? 'correct' : 'wrong';
      feedback.dataset.result = isCorrect ? 'correct' : 'wrong';
      feedback.innerHTML = isCorrect
        ? '<strong>Correct.</strong> The markscheme is shown with the question.'
        : `<strong>Not quite.</strong> The correct answer is <strong>${correctLetter}</strong>. Check the markscheme for the reasoning.`;
    } else {
      question.dataset.premiumResult = 'revealed';
      feedback.dataset.result = 'revealed';
      feedback.innerHTML = '<strong>Markscheme revealed.</strong> This upstream question does not expose a machine-readable answer key, so the UI will not guess whether your choice was right.';
    }

    feedback.hidden = false;
    qState.check.disabled = true;
    qState.clear.hidden = true;
    updateStatus();
  }

  function revealAndEvaluate(question, selected) {
    const qState = state.questionStates.get(question);
    if (qState && !qState.markschemeControl) qState.markschemeControl = findMarkschemeControl(question);
    const control = qState?.markschemeControl;

    const evaluate = () => {
      const correctLetter = extractCorrectLetter(question);
      if (correctLetter || !control) markResult(question, selected, correctLetter);
      return Boolean(correctLetter);
    };

    // If the answer key is already in the DOM (including hidden markup), use it immediately.
    if (evaluate()) return;

    if (!control) {
      markResult(question, selected, null);
      return;
    }

    // Avoid navigating away on a normal link. In that case keep the original control available.
    if (control.tagName === 'A') {
      const href = control.getAttribute('href') || '';
      const safeInline = !href || href.startsWith('#') || href.startsWith('javascript:');
      if (!safeInline) {
        markResult(question, selected, null);
        return;
      }
    }

    try { control.click(); } catch {}

    // Upstream may render the solution synchronously or on the next task/frame.
    const delays = [0, 80, 250, 700];
    let resolved = false;
    delays.forEach((delay, index) => {
      setTimeout(() => {
        if (resolved) return;
        const letter = extractCorrectLetter(question);
        if (letter) {
          resolved = true;
          markResult(question, selected, letter);
        } else if (index === delays.length - 1) {
          markResult(question, selected, null);
        }
      }, delay);
    });
  }

  function selectOption(question, option) {
    const qState = state.questionStates.get(question);
    if (!qState || qState.committed) return;
    qState.options.forEach(item => {
      item.classList.toggle('is-selected', item === option);
      item.setAttribute('aria-checked', item === option ? 'true' : 'false');
    });
    qState.selected = option;
    qState.check.disabled = false;
    qState.hint.textContent = `Selected ${option.dataset.premiumLetter}`;
  }

  function clearSelection(question) {
    const qState = state.questionStates.get(question);
    if (!qState || qState.committed) return;
    qState.options.forEach(item => {
      item.classList.remove('is-selected');
      item.setAttribute('aria-checked', 'false');
    });
    qState.selected = null;
    qState.check.disabled = true;
    qState.hint.textContent = 'Choose an answer first';
  }

  function stripVisibleLetterPrefix(item, letter) {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (!first) return;
    const pattern = new RegExp(`^\\s*${letter}[.)\\]:-]\\s*`, 'i');
    if (pattern.test(first.nodeValue || '')) first.nodeValue = (first.nodeValue || '').replace(pattern, '');
  }

  function enhanceQuestion(question) {
    if (question.dataset.premiumEnhanced === 'true') return;

    const list = candidateAnswerList(question);
    if (!list) return;
    question.dataset.premiumEnhanced = 'true';

    const items = [...list.children].filter(child => child.tagName === 'LI');
    if (items.length < 2) return;

    list.classList.add('premium-answer-list');
    list.setAttribute('role', 'radiogroup');

    items.forEach((item, index) => {
      const sourceLetter = textStartsWithLetter(item.textContent);
      const visibleLetter = sourceLetter || String.fromCharCode(65 + index);
      item.dataset.premiumLetter = visibleLetter;
      if (sourceLetter) stripVisibleLetterPrefix(item, visibleLetter);
      item.classList.add('premium-answer-option');
      item.setAttribute('role', 'radio');
      item.setAttribute('aria-checked', 'false');
      item.tabIndex = 0;

      item.addEventListener('click', event => {
        if (event.target.closest('a, button, input, select, textarea')) return;
        selectOption(question, item);
      });
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectOption(question, item);
        }
      });
    });

    const actions = document.createElement('div');
    actions.className = 'premium-actions';
    actions.innerHTML = `
      <button class="premium-check" type="button" disabled>Check answer</button>
      <button class="premium-clear" type="button">Clear</button>
      <span class="premium-action-hint">Choose an answer first</span>`;

    const feedback = document.createElement('div');
    feedback.className = 'premium-feedback';
    feedback.hidden = true;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');

    list.insertAdjacentElement('afterend', actions);
    actions.insertAdjacentElement('afterend', feedback);

    const qState = {
      options: items,
      selected: null,
      committed: false,
      check: actions.querySelector('.premium-check'),
      clear: actions.querySelector('.premium-clear'),
      hint: actions.querySelector('.premium-action-hint'),
      feedback,
      markschemeControl: findMarkschemeControl(question)
    };
    state.questionStates.set(question, qState);

    qState.check.addEventListener('click', () => {
      if (!qState.selected) {
        toast('Choose an answer first.');
        return;
      }
      qState.check.disabled = true;
      qState.hint.textContent = 'Checking…';
      revealAndEvaluate(question, qState.selected);
    });

    qState.clear.addEventListener('click', () => clearSelection(question));
  }

  function decorate() {
    state.applyQueued = false;
    document.body.classList.add('village-enhanced');
    makeToolbar();

    const nav = document.getElementById('navBar');
    if (nav) {
      nav.classList.add('village-nav');
      nav.setAttribute('aria-label', 'Breadcrumb');
    }

    const main = document.getElementById('mainContent');
    if (main) main.classList.add('village-main');

    document.querySelectorAll('.question').forEach(enhanceQuestion);
    updateStatus();
  }

  function queueDecorate() {
    if (state.applyQueued) return;
    state.applyQueued = true;
    requestAnimationFrame(decorate);
  }

  function startObserver() {
    if (state.observer) return;
    state.observer = new MutationObserver(queueDecorate);
    state.observer.observe(document.documentElement, { subtree: true, childList: true });
  }

  function boot() {
    decorate();
    startObserver();

    window.addEventListener('hashchange', () => {
      // The upstream app is hash-routed; re-run enhancement after every route change.
      setTimeout(queueDecorate, 0);
      setTimeout(queueDecorate, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
