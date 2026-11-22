(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero = document.querySelector('#hero-video');
  const play = document.querySelector('#hero-play');
  const card = document.querySelector('.clip-card');
  let observer;
  if (!reduced.matches && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('motion');
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(e => observer.observe(e));
  }
  const heroVideos = [...document.querySelectorAll('.showcase video')];
  let userPaused = reduced.matches;
  const refreshHero = () => {
    const playing = heroVideos.some(v => !v.paused);
    play.innerHTML = playing ? 'Ⅱ <span>PAUSE DEMOS</span>' : '▶ <span>PLAY DEMOS</span>';
    play.setAttribute('aria-label', playing ? 'Pause all three muted demo previews' : 'Play all three muted demo previews');
  };
  const pauseHero = () => { heroVideos.forEach(v => v.pause()); refreshHero(); };
  const playHero = async () => { await Promise.allSettled(heroVideos.map(v => v.play())); refreshHero(); };
  play.addEventListener('click', () => {
    if (heroVideos.some(v => !v.paused)) { userPaused = true; pauseHero(); }
    else { userPaused = false; playHero(); }
  });
  heroVideos.forEach(v => {v.addEventListener('play', refreshHero);v.addEventListener('pause', refreshHero);});
  if ('IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) pauseHero();
      else if (!userPaused && !reduced.matches && !navigator.connection?.saveData) playHero();
    }), { threshold: 0.3 });
    heroObserver.observe(document.querySelector('.showcase'));
  }
  reduced.addEventListener('change', event => { if (event.matches) { userPaused = true; pauseHero(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll('video').forEach(v => v.pause());
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => {
      b.classList.toggle('selected', b === button);b.setAttribute('aria-pressed', String(b === button));
    });
    document.querySelectorAll('[data-category]').forEach(card => {
      card.hidden = filter !== 'all' && card.dataset.category !== filter;
      if (card.hidden) card.querySelector('video').pause();
    });
    document.querySelector('.gallery-track').scrollLeft = 0;
  }));
  // Always-visible poster layer: mobile/in-app WebViews often never paint the
  // native video poster, leaving black frames until playback starts.
  document.querySelectorAll('video[poster]').forEach(video => {
    const img = document.createElement('img');
    img.className = 'video-poster';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    // Only force position:relative on parents that are static; positioned
    // parents (e.g. absolutely placed device frames) must keep their position.
    if (getComputedStyle(video.parentElement).position === 'static') {
      video.parentElement.classList.add('has-video-poster');
    }
    video.insertAdjacentElement('afterend', img);
    const sync = () => {
      img.src = video.poster;
      const cs = getComputedStyle(video);
      img.style.objectFit = cs.objectFit;
      img.style.borderRadius = cs.borderRadius;
      img.style.left = video.offsetLeft + 'px';
      img.style.top = video.offsetTop + 'px';
      img.style.width = video.offsetWidth + 'px';
      img.style.height = video.offsetHeight + 'px';
    };
    sync();
    new ResizeObserver(sync).observe(video);
    const hidePoster = () => img.classList.add('video-poster-off');
    const showPoster = () => { img.classList.remove('video-poster-off'); sync(); };
    video.addEventListener('playing', hidePoster);
    // Recover the poster not just on reload but on any post-start stall,
    // decode error, abort or pause, so a failed mid-play never leaves black.
    video.addEventListener('loadstart', showPoster);
    video.addEventListener('stalled', showPoster);
    video.addEventListener('error', showPoster);
    video.addEventListener('emptied', showPoster);
    video.addEventListener('abort', showPoster);
    video.addEventListener('pause', showPoster);
  });
  // Large click-to-play affordances keep idle posters clear and defer media loads.
  document.querySelectorAll('.gallery-video video, #layout-video').forEach(video => {
    video.controls = false;
    const button = document.createElement('button');
    button.className = 'demo-start';
    button.type = 'button';
    button.setAttribute('aria-label', 'Play ' + video.getAttribute('aria-label'));
    button.innerHTML = '<span aria-hidden="true">▶</span>';
    video.parentElement.classList.add('has-demo-start');
    video.parentElement.append(button);
    button.addEventListener('click', async () => {
      video.controls = true;
      try { await video.play(); button.remove(); }
      catch { video.controls = false; button.hidden = false; }
    });
    video.addEventListener('play', () => button.remove(), {once:true});
  });
  const demo = document.querySelector('#layout-video');
  const buttons = document.querySelectorAll('[data-layout]');
  buttons.forEach(button => button.addEventListener('click', () => {
    const layout = button.dataset.layout;
    if (button.getAttribute('aria-pressed') === 'true') return;
    demo.pause();
    buttons.forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    demo.poster = `media/${layout}.jpg`;
    demo.querySelector('source').src = `media/${layout}.mp4`;
    demo.load();
    document.querySelector('#layout-name').textContent = layout === 'split' ? 'REACTION + GAMEPLAY' : 'GAMEPLAY FOCUS';
  }));
  window.addEventListener('hashchange', () => {
    if (location.hash === '#credits') document.querySelector('#credits').open = true;
  });
  if (location.hash === '#credits') document.querySelector('#credits').open = true;
})();

// Paste-link start: validates the URL, hands off to the workspace with the gaming genre preselected.
document.querySelectorAll('.tool-link-form').forEach(form=>{
const input=form.querySelector('input[type=url]');
form.addEventListener('submit',event=>{event.preventDefault();location.href='/#waitlist';});
input.addEventListener('input',()=>input.setCustomValidity(''));
form.querySelector('.tool-link-paste')?.addEventListener('click',async()=>{try{const text=await navigator.clipboard.readText();if(text)input.value=text.trim();}catch{}});
});

// Unified menu toggle (same behavior as the static site pages).
(() => {
  const menuToggle = document.querySelector('.site-menu-toggle');
  const siteNav = document.querySelector('#site-nav');
  menuToggle?.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    siteNav?.classList.toggle('is-open', open);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { menuToggle?.setAttribute('aria-expanded', 'false'); siteNav?.classList.remove('is-open'); }
  });
})();
