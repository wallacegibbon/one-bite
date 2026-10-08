/* ==========================================================================
 *  main.js —— 引导、输入、主循环
 * ========================================================================== */
(function (N) {
  const canvas = document.getElementById('view');
  const game = new N.Game(canvas);
  const ui = new N.UI(game);
  let started = false, last = 0, fpsT = 0, fpsN = 0, fps = 0;

  /* ---------------- 输入 ---------------- */
  const keys = {};
  const inp = game.input;
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
    if (k === 'r' && game.mode === 'play' && game.player.form) game.revert('你自己结束了它');
    if (k === 'v') game.thirdPerson = !game.thirdPerson;
    if (k === 'j') { game.mode = game.mode === 'journal' ? 'play' : 'journal'; ui.showJournal(game.mode === 'journal'); }
    if (k === 'h') { game.mode = game.mode === 'help' ? 'play' : 'help'; ui.showHelp(game.mode === 'help'); }
    if (k === 'escape') { ui.showCellar(false); ui.showJournal(false); ui.showHelp(false); ui.showDead(false); game.mode = 'play'; }
    if (k === 'f5') { game.save(); e.preventDefault(); }
    if (k >= '1' && k <= '9') { game.sel = Math.min(game.inv.length - 1, +k - 1); ui.invSig = ''; }
    if (game.mode === 'cellar') {
      if (k === 'e' || k === 'enter' || k === ' ') { game.moveItem('in'); ui.renderCellar(); e.preventDefault(); }
      if (k === 'tab') { game.moveItem('out'); game.stashSel = Math.max(0, game.stashSel - 1); ui.renderCellar(); e.preventDefault(); }
      if (k === 'arrowleft') { game.invSel = Math.max(0, game.invSel - 1); ui.renderCellar(); }
      if (k === 'arrowright') { game.invSel = Math.min(game.inv.length - 1, game.invSel + 1); ui.renderCellar(); }
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

  /* ---------------- 仓库面板点击 ---------------- */
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

  /* ---------------- 开始 ---------------- */
  document.getElementById('btnStart').onclick = () => {
    document.getElementById('start').classList.add('hidden');
    started = true;
    canvas.requestPointerLock();
    if (localStorage.getItem('frutaria.save.v1')) { /* 自动读档在 init 后 */ }
  };
  document.getElementById('btnFresh').onclick = () => { localStorage.removeItem('frutaria.save.v1'); location.reload(); };

  /* ---------------- 启动 ---------------- */
  const QS = new URLSearchParams(location.search);
  const AUTO = QS.has('auto');
  game.init(20261008);
  const loadBar = document.getElementById('loadBar'), loadTxt = document.getElementById('loadTxt');
  function boot() {
    game.buildSomeChunks(22);
    loadBar.style.width = (game.progress * 100) + '%';
    loadTxt.textContent = '正在长出一片谷地… ' + Math.round(game.progress * 100) + '%';
    if (!game.ready) return requestAnimationFrame(boot);
    ui.buildMinimap();
    loadTxt.textContent = '谷地已就绪';
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
      setTimeout(() => { const s = document.getElementById('startWrap'); if (s) s.classList.remove('hidden'); }, 200);
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
  window.startGame = () => {
    started = true;
    document.getElementById('start').classList.add('hidden');
  };
})(window.FRUTARIA = window.FRUTARIA || {});
