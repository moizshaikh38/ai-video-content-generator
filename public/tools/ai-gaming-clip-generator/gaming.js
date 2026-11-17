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
