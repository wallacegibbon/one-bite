/* ==========================================================================
 *  ui.js -- HUD / backpack bar / storage panel / codex / minimap / help / death
 * ========================================================================== */
(function (N) {
  const FRU = N.FRUIT_BY_ID, PLANT = N.PLANT_BY_ID, RAR = N.RARITY, STO = N.STORAGE;
  const el = id => document.getElementById(id);
  const pad = n => (n < 10 ? '0' : '') + n;

  class UI {
    constructor(game) {
      this.g = game;
      game.ui = this;
      this.invSig = '';
      this.logLen = 0;
      this.mmBase = document.createElement('canvas');
      this.mm = el('minimap');
      this.mmCtx = this.mm.getContext('2d');
      this.show = { cellar: false, journal: false, help: false, dead: false };
    }

    /* ---------------- language ----------------
       Every translatable node in index.html carries data-i18n="key". The markup
       itself holds the Chinese text, so the page still reads correctly in a
       browser that has not run a line of script yet. */
    applyLang() {
      document.querySelectorAll('[data-i18n]').forEach(n => {
        if (N.i18n.has(n.dataset.i18n)) n.innerHTML = N.t(n.dataset.i18n);
      });
      document.title = N.t('app.title');
      document.documentElement.lang = N.i18n.locale === 'zh' ? 'zh-CN' : 'en';
      // the button names the language it switches to, not the one in use
      const b = el('btnLang');
      if (b) b.textContent = N.i18n.nextLabel();
      this.invSig = '';
      this._cellarSig = '';
      if (this.show.cellar) this.renderCellar();
      if (this.show.journal) this.renderJournal();
    }

    /* ---------------- minimap base ---------------- */
    buildMinimap() {
      const W = this.g.world, S = W.w, D = W.d;
      this.mmBase.width = S; this.mmBase.height = D;
      const ctx = this.mmBase.getContext('2d');
      const img = ctx.createImageData(S, D);
      for (let z = 0; z < D; z++) for (let x = 0; x < S; x++) {
        /* The face this column shows to a lens straight above it. Water is what
           a column with water in it shows, so the scan has to stop at it -- and
           it used to stop only at a **solid** block, which water is not: the
           scan walked straight down through the whole lake and stopped at the
           lakebed, so every one of the valley's **2,970** wet columns was
           painted with the colour of its own floor (the sand and mud of
           Mirrorlake, 112/104/74 and 148/137/98) and the water palette below it
           was never reached at all. Cloud, fruit, reeds and the glowcap ring
           are still walked through: they hang in a column, they are not what it
           shows. */
        let y = W.h - 1, b = 0;
        for (; y >= 0; y--) {
          b = W.get(x, y, z);
          const bb = N.BLOCKS[b];
          if (bb && (bb.solid || bb.liquid)) break;
        }
        const bd = N.BLOCKS[b] || { c: [0, 0, 0] };
        let c = bd.ct || bd.c;
        let water = 0, depth = 0;
        /* The run of water is counted **down** from the cell the scan stopped
           at, which is the top of it: counting up from there asks the sky how
           much water is above the lake and always answers one. */
        if (b === N.WATER) { water = 1; for (let yy = y; yy >= 0 && W.liquidAt(x, yy, z); yy--) depth++; }
        const sh = 0.55 + Math.min(0.45, (y - 5) / 40);
        let r, g, bl;
        if (water) { const t = Math.min(1, depth / 12); r = 30 + (1 - t) * 60; g = 80 + (1 - t) * 70; bl = 120 + (1 - t) * 60; }
        else { r = c[0] * 255 * sh; g = c[1] * 255 * sh; bl = c[2] * 255 * sh; }
        const i = (z * S + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bl; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      // POI markers
      ctx.font = '7px sans-serif';
      for (const p of N.POIS) {
        ctx.fillStyle = 'rgba(255,240,190,0.95)';
        ctx.beginPath(); ctx.arc(p.x, p.z, 1.8, 0, 6.283); ctx.fill();
      }
    }

    drawMinimap() {
      const S = this.mm.width, D = this.mm.height, W = this.g.world;
      const ctx = this.mmCtx;
      const p = this.g.player;
      const R2 = 62;                       // radius (world cells)
      ctx.clearRect(0, 0, S, D);
      ctx.save();
      ctx.beginPath(); ctx.arc(S / 2, D / 2, S / 2 - 1, 0, 6.283); ctx.clip();
      ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, S, D);
      /* The map image sits one pixel per cell in this already-rotated frame,
         so the dots take the same raw offsets. Hand-rotating them a second
         time and stretching them by (S/2)/R2 spun the dots twice as fast as
         the map and parked them off their own markers. */
      ctx.translate(S / 2, D / 2);
      ctx.rotate(-p.yaw);
      ctx.drawImage(this.mmBase, -p.x, -p.z, W.w, W.d);
      // POI
      for (const q of N.POIS) {
        const dx = (q.x - p.x), dz = (q.z - p.z);
        if (Math.hypot(dx, dz) > R2) continue;
        ctx.fillStyle = 'rgba(255,236,170,0.95)';
        ctx.beginPath(); ctx.arc(dx, dz, 2.2, 0, 6.283); ctx.fill();
      }
      // creatures
      for (const c of this.g.creatures) {
        const dx = (c.x - p.x), dz = (c.z - p.z);
        if (Math.hypot(dx, dz) > R2) continue;
        const hostile = (c.sp.attitude || {}).default === 'hostile' || c.state === 'chase';
        ctx.fillStyle = hostile ? 'rgba(255,110,90,0.9)' : 'rgba(150,230,255,0.75)';
        ctx.fillRect(dx - 1, dz - 1, 2, 2);
      }
      ctx.restore();
      // player heading
      ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(S / 2, D / 2 - 6); ctx.lineTo(S / 2 - 4, D / 2 + 4); ctx.lineTo(S / 2 + 4, D / 2 + 4); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,168,0.35)';
      ctx.beginPath(); ctx.arc(S / 2, D / 2, S / 2 - 1, 0, 6.283); ctx.stroke();
    }

    /* ---------------- HUD ---------------- */
    update() {
      const g = this.g, p = g.player;
      el('zone').textContent = g.zoneName();
      const h = Math.floor(g.hour), m = Math.floor((g.hour % 1) * 60);
      const icon = g.night > 0.55 ? '☾' : (g.hour < 7.5 || g.hour > 18 ? '☼' : '☀');
      /* The phase word has to follow which way the sun is moving, not only how
         high it is: `night` is symmetric about noon, so 07:00 and 19:00 carry the
         same value, and the game opens at 07:00 -- which the old label called
         "dusk", in the morning. */
      const phase = g.night > 0.55 ? N.t('hud.night')
        : g.night > 0.25 ? N.t(g.hour < 12 ? 'hud.dawn' : 'hud.dusk')
        : N.t('hud.day');
      el('clock').innerHTML = '<b>' + pad(h) + ':' + pad(m) + '</b> · ' + N.t('hud.dayN', { d: g.day }) + ' ' + icon +
        ' <span class="dim">' + phase + '</span>';

      // identity: the valley's epithet comes first; the player's own name only if they chose one
      const ep = g.epithet();
      el('who').innerHTML = N.t('q.l') + N.disp(ep) + N.t('q.r') +
        (g.name ? ' <span class="dim">' + g.name + '</span>' : ' <span class="dim">' + N.t('hud.namePrompt') + '</span>');

      // vitality / air / fright
      let v = '';
      for (let i = 0; i < 5; i++) v += '<span class="hp' + (p.vital > i + 0.5 ? ' on' : '') + '">✦</span>';
      el('vitals').innerHTML = v;
      el('air').style.width = Math.max(0, Math.min(100, p.air / p.maxAir() * 100)) + '%';
      el('airWrap').style.opacity = p.air < p.maxAir() - 0.5 ? 1 : 0;
      el('fright').style.width = (p.fright * 100) + '%';
      el('frightWrap').style.opacity = p.fright > 0.02 ? 1 : 0;

      // form bar
      const fb = el('formbar');
      if (p.form) {
        const f = FRU[p.form];
        fb.classList.remove('hidden');
        el('formfill').style.width = (p.formT / p.formMax * 100) + '%';
        el('formfill').style.background = RAR[f.rarity].ring;
        el('formname').innerHTML = N.disp(f.form) + ' · ' + Math.ceil(p.formT) + 's' +
          (p.formT / p.formMax < 0.25 ? ' <span class="warn">' + N.t('hud.returning') + '</span>' : '');
      } else fb.classList.add('hidden');

      // backpack
      this.renderInv();
      // prompt
      const pr = el('prompt');
      pr.textContent = g.prompt || '';
      // log
      if (this.g.log.length !== this.logLen) {
        this.logLen = g.log.length;
        const box = el('log');
        box.innerHTML = g.log.slice(-7).map(l => '<div class="l ' + l.kind + '">' + l.text + '</div>').join('');
        box.scrollTop = box.scrollHeight;
      }
      // stats
      el('stats').innerHTML = N.t('hud.stats', { h: g.stats.harvested, e: g.stats.eaten, r: g.stats.reverted, d: g.stats.deaths }) +
        ' <span class="dim">| ' + N.t('hud.creatures', { n: g.creatures.length }) + '</span>';
      if (this.show.cellar) this.renderCellar();
      this.drawMinimap();
    }

    itemHTML(it, i, sel) {
      const d = it.kind === 'plant' ? PLANT[it.id] : FRU[it.id];
      if (!d) return '';
      const rar = RAR[d.rarity];
      const slots = this.g.slotOf(it);
      const fresh = it.kind === 'fruit' ? Math.max(0, it.fresh / it.maxFresh) : 1;
      const cls = 'item' + (sel ? ' sel' : '') + (it.kind === 'pit' ? ' pit' : '');
      const pct = Math.round(fresh * 100);
      return '<div class="' + cls + '" data-i="' + i + '" title="' + N.disp(d) + ' · ' + N.disp(rar) + ' · ' +
        N.t('cellar.itemSlots', { n: slots }) + '" ' +
        'style="--ring:' + rar.ring + ';--deg:' + (fresh * 360) + 'deg">' +
        '<div class="ico" style="background:radial-gradient(circle at 35% 30%,' + rar.ring + ',rgba(0,0,0,.55))"></div>' +
        '<div class="slots">' + slots + '</div>' +
        (it.kind === 'fruit' ? '<div class="fresh" style="width:' + pct + '%"></div>' : '<div class="pitTag">' + N.t('hud.pit') + '</div>') +
        '</div>';
    }

    renderInv() {
      const g = this.g;
      const sig = g.inv.map(i => i.kind + i.id + Math.round(i.fresh / 5)).join(',') + '|' + g.sel + '|' + g.cap() + '|' + N.locale();
      if (sig === this.invSig) return;
      this.invSig = sig;
      el('inv').innerHTML = g.inv.map((it, i) => this.itemHTML(it, i, i === g.sel)).join('') ||
        '<div class="empty">' + N.t('hud.emptyPack') + '</div>';
      const used = g.used(), cap = g.cap();
      el('capFill').style.width = (used / cap * 100) + '%';
      el('capFill').style.background = used / cap > 0.8 ? '#e07a4a' : '#8fbf6a';
      el('capTxt').textContent = N.t('hud.cap', { u: used, c: cap });
      const owned = STO.backpack.upgrades.filter(u => g.upg[u.id]);
      el('upgTxt').textContent = owned.length ? owned.map(u => u.slots ? N.t('hud.upgSlots', { n: u.slots }) : N.t('hud.upgRare')).join(' · ') : '';
    }

    /* ---------------- storage panel ---------------- */
    showCellar(on) {
      this.show.cellar = on;
      el('cellar').classList.toggle('hidden', !on);
      el('modalRoot').classList.toggle('on', on || this.show.journal || this.show.help);
      if (on) { this.renderCellar(); document.exitPointerLock && document.exitPointerLock(); }
      else this.g.closeStashUI();
    }
    renderCellar() {
      const g = this.g, s = g.openStash;
      if (!s) return;
      // Same trick as renderInv: the panel is rebuilt every frame while it is
      // open, and it only ever changes when something on a shelf changes.
      // Freshness is bucketed to 5 units and transit to whole days, which is
      // exactly what the bar and the "x days left" text show.
      const sig = s.id + '|' + s.items.map(i => i.kind + i.id + Math.round(i.fresh / 5)).join(',') +
        '|' + g.stashSel + '|' + g.inv.map(i => i.kind + i.id + Math.round(i.fresh / 5)).join(',') +
        '|' + g.invSel + '|' + g.posts.map(p => p.it.id + Math.max(1, Math.ceil(p.t / 420))).join(',') +
        '|' + (g.owlUnlocked() ? 1 : 0) + '|' + N.locale();
      if (sig === this._cellarSig) return;
      this._cellarSig = sig;
      el('cellarTitle').textContent = N.t('store.' + (s.kind === 'tree' ? 'tree' : 'cellar'));
      el('cellarSub').textContent = N.t('cellar.sub', { s: s.slots, d: s.decay, u: g.used(s.items) });
      el('stashItems').innerHTML = s.items.map((it, i) => this.itemHTML(it, i, i === g.stashSel)).join('') ||
        '<div class="empty">' + N.t('cellar.emptyShelf') + '</div>';
      el('packItems').innerHTML = g.inv.map((it, i) => this.itemHTML(it, i, i === g.invSel)).join('') ||
        '<div class="empty">' + N.t('cellar.emptyPack') + '</div>';
      // owl post
      const pr = el('postRow');
      const transit = N.tlist(g.posts.map(p => N.t('cellar.transitItem', { n: N.disp(FRU[p.it.id] || { cn: p.it.id, en: p.it.id }), d: Math.max(1, Math.ceil(p.t / 420)) })));
      let txt = '';
      if (g.posts.length) txt += N.t('cellar.transit', { x: transit });
      if (s.kind === 'tree') {
        if (g.owlUnlocked()) txt += (txt ? ' · ' : '') + N.t('cellar.postCan');
        else txt += (txt ? ' · ' : '') + N.t('cellar.postNot');
      }
      pr.innerHTML = txt;
      pr.classList.toggle('hidden', !txt);
    }

    /* ---------------- codex ---------------- */
    showJournal(on) {
      this.show.journal = on;
      el('journal').classList.toggle('hidden', !on);
      el('modalRoot').classList.toggle('on', on || this.show.cellar || this.show.help);
      if (on) { this.renderJournal(); document.exitPointerLock && document.exitPointerLock(); }
      else this.g.mode = 'play';
    }
    renderJournal() {
      const g = this.g;
      // identity block: the epithet is what the valley uses; the id is what the world stores
      const ep = g.epithet();
      let me = '<h3>' + N.t('j.you') + '</h3><div class="dim">' + N.t('j.youEpithet', { e: N.disp(ep) }) +
        (g.name ? N.t('j.youNameSet', { n: g.name }) : N.t('j.youNameNone')) +
        N.t('j.youId', { id: g.id }) + '</div>';
      let q = '<h3>' + N.t('j.quests') + '</h3>';
      for (const qq of g.quests) q += '<div class="q' + (qq.done ? ' done' : '') + '"><b>' + (qq.done ? '✔ ' : '○ ') + N.disp(qq) +
        '</b><div class="dim">' + N.disp(qq.hint) + '</div></div>';
      let b = '<h3>' + N.t('j.fruits') + '</h3><div class="dex">';
      for (const f of N.FRUITS) {
        const known = g.dexFruit[f.id];
        const rar = RAR[f.rarity];
        b += '<div class="card' + (known ? '' : ' unk') + '" style="--ring:' + rar.ring + '">' +
          '<div class="cn">' + (known ? N.disp(f) : N.t('hud.unknown')) + '</div>' +
          '<div class="meta"><span>' + N.disp(rar) + '</span><span>' + N.t('j.slots', { n: rar.slots }) + '</span>' +
          (f.duration ? '<span>' + f.duration + 's</span>' : '<span>' + N.t('j.inedible') + '</span>') + '</div>' +
          (known ? '<div class="lore">' + N.loreOf(f) + '</div><div class="side">' + N.t('j.cost', { c: N.costList(f) }) + '</div>' +
            '<div class="dim">' + N.t('j.habitat', { h: N.habitatText(f) }) + '</div>' : '<div class="dim">' + N.t('j.notFound') + '</div>') +
          '</div>';
      }
      b += '</div>';
      let c = '<h3>' + N.t('j.creatures') + '</h3><div class="dex">';
      for (const sp of N.CREATURES) {
        const known = g.seen[sp.id];
        c += '<div class="card' + (known ? '' : ' unk') + '"><div class="cn">' + (known ? N.disp(sp) : N.t('hud.unknown')) + '</div>' +
          (known ? '<div class="lore">' + N.dexOf(sp) + '</div>' : '<div class="dim">' + N.t('j.notSeen') + '</div>') + '</div>';
      }
      c += '</div>';
      el('journalBody').innerHTML = me + q + b + c;
    }

    showHelp(on) {
      this.show.help = on;
      el('help').classList.toggle('hidden', !on);
      el('modalRoot').classList.toggle('on', on || this.show.cellar || this.show.journal);
      if (!on) this.g.mode = 'play';
    }
    showDead(on) {
      this.show.dead = on;
      el('dead').classList.toggle('hidden', !on);
      el('modalRoot').classList.toggle('on', on);
      // the mode lives in the game, not in a css class: die() set it to 'dead',
      // closing the panel is what ends it
      if (!on) this.g.mode = 'play';
    }
    onLog() { this.logLen = -1; }
  }

  N.UI = UI;
})(window.FRUTARIA = window.FRUTARIA || {});
