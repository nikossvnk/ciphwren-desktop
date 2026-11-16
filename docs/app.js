(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- nav condensation + reading progress ---- */
  const nav = $('.nav');
  const progress = $('.progress span');
  let ticking = false;

  const paint = () => {
    const y = window.scrollY || 0;
    if (nav) nav.classList.toggle('is-stuck', y > 12);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    }
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(paint);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  paint();

  /* ---- reveal on scroll, only for content that starts below the fold ---- */
  if (!reduced && 'IntersectionObserver' in window) {
    const items = $$('.r');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
    );

    for (const el of items) {
      if (el.getBoundingClientRect().top > window.innerHeight * 0.88) {
        el.classList.add('pre');
        io.observe(el);
      }
    }
  }

  /* ---- workspace tabs ---- */
  const ws = $('[data-workspace]');
  if (ws) {
    const tabs = $$('[role="tab"]', ws);
    const panels = $$('[role="tabpanel"]', ws);
    const tablist = $('.tabs', ws);
    const shell = tablist && tablist.closest('.tabs-shell');

    const syncTabs = () => {
      if (!tablist || !shell) return;
      const max = tablist.scrollWidth - tablist.clientWidth;
      const scrollable = max > 2;
      shell.classList.toggle('can-scroll', scrollable);
      shell.classList.toggle('at-end', scrollable && tablist.scrollLeft >= max - 2);
    };

    const select = (index, moveFocus = false) => {
      tabs.forEach((tab, i) => {
        const active = i === index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel, i) => {
        panel.classList.toggle('is-active', i === index);
        panel.tabIndex = i === index ? 0 : -1;
      });
      if (moveFocus) tabs[index].focus();
      if (tablist) {
        const tab = tabs[index];
        const left = tab.offsetLeft;
        const right = left + tab.offsetWidth;
        if (left < tablist.scrollLeft || right > tablist.scrollLeft + tablist.clientWidth) {
          tablist.scrollTo({
            left: Math.max(0, left - 12),
            behavior: reduced ? 'auto' : 'smooth',
          });
        }
        syncTabs();
      }
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (event) => {
        let next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
    });

    const initial = Math.max(
      0,
      tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    );
    select(initial);
    ws.classList.add('is-live');

    if (tablist) {
      tablist.addEventListener('scroll', syncTabs, { passive: true });
      window.addEventListener('resize', syncTabs);
      syncTabs();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncTabs);
    }
  }

  /* ---- light / dark screenshot in the Notes panel ---- */
  $$('[data-shot]').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.closest('.theme-switch');
      const panel = button.closest('[role="tabpanel"]');
      const img = panel && panel.querySelector('img');
      if (!group || !img) return;

      const isDark = button.dataset.shot === 'dark';
      const name = isDark ? 'dark-mode' : 'notes';

      img.src = `assets/screenshots/${name}-1600.webp`;
      img.srcset = `assets/screenshots/${name}-800.webp 800w, assets/screenshots/${name}-1600.webp 1600w`;
      img.alt = isDark
        ? "The same notes screen in dark mode, with a Markdown note and the list of notes."
        : 'A Markdown note open in light mode, with the list of notes beside it.';

      $$('button', group).forEach((other) => {
        other.setAttribute('aria-pressed', String(other === button));
      });
    });
  });

  /* ---- copy buttons ---- */
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      area.remove();
      return ok;
    }
  };

  $$('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const source = $(button.dataset.copy);
      if (!source) return;
      const label = $('.copy-label', button);
      const original = label ? label.textContent : '';
      const ok = await copyText(source.textContent.trim());

      button.dataset.done = '';
      if (label) label.textContent = ok ? 'Copied' : 'Copy failed';

      window.clearTimeout(button._reset);
      button._reset = window.setTimeout(() => {
        if (label) label.textContent = original;
        delete button.dataset.done;
      }, 2200);
    });
  });
})();
