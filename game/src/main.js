/* ==========================================================================
 *  main.js -- bootstrap, input, main loop
 * ========================================================================== */
(function (N) {
  const canvas = document.getElementById('view');
  const game = new N.Game(canvas);
  const ui = new N.UI(game);
  let started = false, last = 0, fpsT = 0, fpsN = 0, fps = 0;

  /* ---------------- input ---------------- */
  const keys = {};
  const inp = game.input;

  /* Switching the interface language is a live operation: the static markup is
     re-translated, any open panel is re-rendered, and the log feed is dropped
     rather than left showing half one language and half the other. Nothing in
     the save file is touched -- stores and quests carry no translated text. */
  function setLocale(id) {
    if (!N.i18n.set(id)) return false;
    const cur = N.LANGS.find(l => l.id === N.i18n.locale);
    game.log = [];
    game.logMsg(N.t('log.langTo', { n: cur.label }), 'good');
    ui.applyLang();
    ui.update();
    // the start screen quotes a save in the current language too
    if (!document.getElementById('startWrap').classList.contains('hidden')) showStart();
    return true;
  }
  function setKeys() {
    inp.fwd = !!(keys['w'] || keys['arrowup']);
    inp.back = !!(keys['s'] || keys['arrowdown']);
    inp.left = !!(keys['a'] || keys['arrowleft']);
    inp.right = !!(keys['d'] || keys['arrowright']);
    inp.jump = !!keys[' '];
    inp.sprint = !!(keys['shift']);
    inp.sneak = !!(keys['control'] || keys['c']);
  }
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'control') keys['control'] = true;
    setKeys();
    if (!started) return;
    if (k === 'e' && game.mode === 'play') game.interact();
    if (k === 'f' && game.mode === 'play') game.useSelected();
    if (k === 'r' && game.mode === 'play' && game.player.form) game.revert(N.t('log.revertManual'));
    if (k === 'v') game.thirdPerson = !game.thirdPerson;
    if (k === 'j') { game.mode = game.mode === 'journal' ? 'play' : 'journal'; ui.showJournal(game.mode === 'journal'); }
    if (k === 'h') { game.mode = game.mode === 'help' ? 'play' : 'help'; ui.showHelp(game.mode === 'help'); }
    if (k === 'l') setLocale(N.i18n.next().id);   // LOCALE_KEY; docs-sync asserts this binding exists
    if (k === 'n' && game.mode === 'play') {   // IDENTITY.nameKey; docs-sync asserts this binding exists
      const v = window.prompt(N.t('log.nameAsk'), game.name);
      if (v !== null) { game.setName(v); ui.update(); }
    }
    if (k === 'escape') { ui.showCellar(false); ui.showJournal(false); ui.showHelp(false); ui.showDead(false); game.mode = 'play'; }
    if (k === 'f5') { game.save(); e.preventDefault(); }
    if (k >= '1' && k <= '9') { game.sel = Math.min(game.inv.length - 1, +k - 1); ui.invSig = ''; }
    if (game.mode === 'cellar') {
      if (k === 'e' || k === 'enter' || k === ' ') { game.moveItem('in'); ui.renderCellar(); e.preventDefault(); }
      if (k === 'tab') { game.moveItem('out'); game.stashSel = Math.max(0, game.stashSel - 1); ui.renderCellar(); e.preventDefault(); }
      if (k === 'arrowleft') { game.invSel = Math.max(0, game.invSel - 1); ui.renderCellar(); }
      if (k === 'arrowright') { game.invSel = Math.min(game.inv.length - 1, game.invSel + 1); ui.renderCellar(); }
      if (k === 'arrowup') { game.stashSel = Math.max(0, game.stashSel - 1); ui.renderCellar(); }
      if (k === 'arrowdown') { game.stashSel = Math.min((game.openStash.items || []).length - 1, game.stashSel + 1); ui.renderCellar(); }
      if (k === 'p') { game.postItem(); ui.renderCellar(); }
    }
  });
  document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys['control'] = e.key === 'Control' ? false : keys['control']; setKeys(); });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('mousedown', () => { if (started && game.mode === 'play') canvas.requestPointerLock(); });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    game.player.yaw += e.movementX * 0.0026;
    game.player.pitch -= e.movementY * 0.0026;
    game.player.pitch = Math.max(-1.55, Math.min(1.55, game.player.pitch));
  });
  canvas.addEventListener('wheel', e => {
    if (!game.inv.length) return;
    game.sel = ((game.sel + (e.deltaY > 0 ? 1 : -1)) % game.inv.length + game.inv.length) % game.inv.length;
    ui.invSig = '';
    e.preventDefault();
  }, { passive: false });

  /* ---------------- storage panel clicks ---------------- */
  document.getElementById('packItems').addEventListener('click', e => {
    const t = e.target.closest('.item'); if (!t) return;
    game.invSel = +t.dataset.i; game.moveItem('in'); ui.renderCellar();
  });
  document.getElementById('stashItems').addEventListener('click', e => {
    const t = e.target.closest('.item'); if (!t) return;
    game.stashSel = +t.dataset.i; game.moveItem('out'); ui.renderCellar();
  });
  document.getElementById('btnCloseCellar').onclick = () => ui.showCellar(false);
  document.getElementById('btnCloseJournal').onclick = () => { ui.showJournal(false); game.mode = 'play'; };
  document.getElementById('btnCloseHelp').onclick = () => { ui.showHelp(false); game.mode = 'play'; };
  document.getElementById('btnDead').onclick = () => { ui.showDead(false); game.mode = 'play'; canvas.requestPointerLock(); };
  document.getElementById('btnJournal').onclick = () => { game.mode = 'journal'; ui.showJournal(true); };
  document.getElementById('btnHelp').onclick = () => { game.mode = 'help'; ui.showHelp(true); };
  document.getElementById('btnSave').onclick = () => game.save();
  document.getElementById('btnLang').onclick = () => setLocale(N.i18n.next().id);

  /* ---------------- start ---------------- */
  /* A save is offered back rather than silently loaded: the valley is the same
     seed, so continuing means walking up to the very cellar you walked away
     from, with the fruit you left on the shelf still going off. */
  function showStart() {
    const wrap = document.getElementById('startWrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    const info = game.saveInfo();
    const btn = document.getElementById('btnStart');
    btn.dataset.i18n = info ? 'start.continue' : 'start.btn';
    btn.textContent = N.t(btn.dataset.i18n);
    document.getElementById('btnFresh').classList.toggle('hidden', !info);
    const note = document.getElementById('startSave');
    note.classList.toggle('hidden', !info);
    note.textContent = info ? N.t('start.saveNote', { d: info.day, h: info.hour, n: info.items, t: info.trees }) : '';
  }

  document.getElementById('btnStart').onclick = () => {
    document.getElementById('start').classList.add('hidden');
    started = true;
    if (game.hasSave()) game.load();
    canvas.requestPointerLock();
  };
  document.getElementById('btnFresh').onclick = () => { game.clearSave(); location.reload(); };

  /* ---------------- boot ---------------- */
  const QS = new URLSearchParams(location.search);
  const AUTO = QS.has('auto');
  game.init(20261008);
  const loadBar = document.getElementById('loadBar'), loadTxt = document.getElementById('loadTxt');
  ui.applyLang();          // translate the static markup before the first frame
  function boot() {
    game.buildSomeChunks(22);
    loadBar.style.width = (game.progress * 100) + '%';
    loadTxt.textContent = N.t('start.gen', { p: Math.round(game.progress * 100) });
    if (!game.ready) return requestAnimationFrame(boot);
    ui.buildMinimap();
    loadTxt.textContent = N.t('start.ready');
    if (AUTO) {
      started = true;
      document.getElementById('start').classList.add('hidden');
      if (QS.get('pos')) {
        const a = QS.get('pos').split(',').map(Number);
        Object.assign(game.player, { x: a[0], y: a[1], z: a[2], yaw: a[3] || 0, pitch: a[4] || 0 });
      }
      if (QS.get('form')) { game.player.form = QS.get('form'); game.player.formT = 999; game.player.formMax = 999; }
      if (QS.get('time')) game.time = +QS.get('time');
      game.updateEnv();
    } else {
      setTimeout(showStart, 200);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(boot);

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (!started) { game.updateEnv(); game.render(); ui.update(); return; }
    if (QS.has('freeze')) { game.updateEnv(); game.render(); ui.update(); return; }
    if (game.mode === 'play') setKeys(); else { inp.fwd = inp.back = inp.left = inp.right = inp.jump = inp.sprint = inp.sneak = false; }
    game.update(dt);
    game.render();
    ui.update();
    fpsN++; fpsT += dt;
    if (fpsT > 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; document.getElementById('fps').textContent = Math.round(fps) + ' fps'; }
    if (!document.getElementById('dead').classList.contains('hidden')) game.mode = 'dead';
  }

  window.game = game;
  window.ui = ui;
  window.setLocale = setLocale;
  window.startGame = () => {
    started = true;
    document.getElementById('start').classList.add('hidden');
  };
})(window.FRUTARIA = window.FRUTARIA || {});
