/* ==========================================================================
 *  ui.js -- HUD / backpack bar / storage panel / codex / minimap / help / death
 * ========================================================================== */
(function (N) {
  const FRU = N.FRUIT_BY_ID, PLANT = N.PLANT_BY_ID, RAR = N.RARITY, STO = N.STORAGE;
  const el = id => document.getElementById(id);
  const pad = n => (n < 10 ? '0' : '') + n;
  /* the map window: cells per tile, and the frame's share for painting them.
     Measured in this browser: one tile of 32 x 32 columns costs **1.2-1.3 ms**, and
     the whole dial -- **36** tiles, the ground inside 86 cells of the body --
     costs **66.9-70.8 ms** the first time it is asked for, after a load or a
     walk across the sea. Six milliseconds is what the frame already hands the
     chunk mesher (docs/07 s3.6, the budget `meshWater` and `chunkRebuildBudget`
     hold); the map takes two thirds of that share and never more, which at this
     cost is **three** tiles a frame -- a walk of 320 cells asks for **50** tiles
     and the worst step asks for **6**, so a new ring of ground is on the dial
     within two or three frames of setting foot in it, and nothing at all is
     painted between those crossings. */
  const MM_TILE = 32;
  const MM_BUDGET_MS = 4;

  class UI {
    constructor(game) {
      this.g = game;
      game.ui = this;
      this.invSig = '';
      this.logLen = 0;
      this.mmTiles = new Map();   // window of the map: tile key -> {tx, tz, canvas}
      this.mm = el('minimap');
      this.mmCtx = this.mm.getContext('2d');
      /* The dial is one pixel per cell of ground, so a pixel must take the colour
         of the cell it looks at -- at the whole-number scale the tiles are drawn
         at, and under the dial's rotation, the nearest-neighbour filter is the one
         that answer. With the filter a canvas leaves by default the dial shows
         colours no ground has: measured over ground past the authored square, the
         same tiles blitted at the same place with that filter left on show
         **686** of the **5,282** cells they are read at as a colour of no ground
         there, and with it off, **0**. */
      this.mmCtx.imageSmoothingEnabled = false;
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

    /* ---------------- the map's window ----------------
       The dial shows the ground this body is standing on and the ground within
       reach of the lens, one pixel per cell, wherever that ground is. It used to
       hold a single canvas of the authored square -- `world.w` by `world.d` --
       painted once at boot and slid under the player. That square is not the
       world: `World.get` answers any address on the plane, and since the sea was
       given ground and ids it answers sea, islands and islands' shores out there.
       A base of the square has nothing to put under those cells, and the dial
       reads its own backing colour: standing on the far shore, the map was black
       over the whole of the window in front of the player, and the one place they
       had walked to was the one place it could not show.
       So the map is a window, held in tiles of 32 x 32 cells exactly the way the
       3D world holds its chunks: a tile is painted the once, when the window
       first asks for it, and let go once the player has walked far enough that
       it is off the dial. Painting is bounded by the frame's time -- the tiles the
       window needs are painted nearest-first, the one the body stands on first,
       until the frame's share is spent; the first tile of a call is painted
       whatever the share says, because a dial with nothing under the player is not
       a map. A tile is painted again when the ground under it has been written:
       `World.markChunk` counts the edits per chunk address, and a tile carries the
       count it was painted under, so picking a fruit repaints the tile it was
       picked from and nothing else on the dial. The reading of one column is one
       function, `mmSample`, asked of the same world the lens is drawn from,
       inside the authored square or out: a column of ground is the same kind of
       thing wherever it has an address. The POI and creature dots are drawn over
       the window every frame, so nothing is painted into a tile that would go
       stale for a reason that has nothing to do with the ground. */
    clearMinimap() { this.mmTiles.clear(); }

    /* What this column shows to a lens straight above it. Water is what a column
       with water in it shows, so the scan has to stop at it -- and it used to stop
       only at a **solid** block, which water is not: the scan walked straight down
       through the whole lake and stopped at the lakebed, so every one of the
       valley's wet columns was painted with the colour of its own floor (the sand
       and mud of Mirrorlake, 112/104/74 and 148/137/98) and the water palette
       below it was never reached at all. Fruit, reeds and the glowcap ring are
       still walked through: they hang in a column, they are not what it shows. */
    mmSample(x, z) {
      const W = this.g.world;
      let y = W.h - 1, b = 0;
      for (; y >= 0; y--) {
        b = W.get(x, y, z);
        const bb = N.BLOCKS[b];
        if (bb && (bb.solid || bb.liquid)) break;
      }
      const bd = N.BLOCKS[b] || { c: [0, 0, 0] };
      const c = bd.ct || bd.c;
      let water = 0, depth = 0;
      /* The run of water is counted **down** from the cell the scan stopped at,
         which is the top of it: counting up from there asks the sky how much
         water is above the lake and always answers one. */
      if (b === N.WATER) { water = 1; for (let yy = y; yy >= 0 && W.liquidAt(x, yy, z); yy--) depth++; }
      const sh = 0.55 + Math.min(0.45, (y - 5) / 40);
      if (water) { const t = Math.min(1, depth / 12); return [30 + (1 - t) * 60, 80 + (1 - t) * 70, 120 + (1 - t) * 60]; }
      return [c[0] * 255 * sh, c[1] * 255 * sh, c[2] * 255 * sh];
    }

    /* the ground under this tile, as the world counts it: see World.markChunk.
       A tile covers a whole number of chunks, so this asks every chunk address it
       overlaps -- 0 for ground nothing has ever written. */
    mmStamp(tx, tz) {
      const W = this.g.world, T = MM_TILE, cs = W.cs;
      let stamp = 0;
      for (let cz = Math.floor((tz * T) / cs); cz <= Math.floor((tz * T + T - 1) / cs); cz++)
        for (let cx = Math.floor((tx * T) / cs); cx <= Math.floor((tx * T + T - 1) / cs); cx++)
          stamp += W.edits.get(W.ckey(cx, cz)) || 0;
      return stamp;
    }

    /* one tile of the window, painted from the world as it is */
    mmPaintTile(tx, tz) {
      const T = MM_TILE;
      const c = document.createElement('canvas');
      c.width = T; c.height = T;
      const ctx = c.getContext('2d'), img = ctx.createImageData(T, T);
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const p = this.mmSample(tx * T + i, tz * T + j);
        const k = (j * T + i) * 4;
        img.data[k] = p[0]; img.data[k + 1] = p[1]; img.data[k + 2] = p[2]; img.data[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return { tx, tz, c, stamp: this.mmStamp(tx, tz) };
    }

    /* the tiles this window needs, painted within the frame's budget; tiles the
       dial can no longer reach are let go, and a tile whose ground has been
       changed underneath it is painted again. `budgetMs` is a frame's share of
       painting -- the tiles nearest the body are painted first, so what the
       player is standing on is always the first thing the dial can show. */
    mmWindow(px, pz, r, budgetMs) {
      const T = MM_TILE;
      const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const k0 = Math.floor((px - r) / T), k1 = Math.floor((px + r) / T);
      const m0 = Math.floor((pz - r) / T), m1 = Math.floor((pz + r) / T);
      const pcx = Math.floor(px / T), pcz = Math.floor(pz / T);
      /* nearest first: the dial's centre is the ground the body is on */
      const need = [];
      for (let tz = m0; tz <= m1; tz++) for (let tx = k0; tx <= k1; tx++)
        need.push([tx, tz, Math.abs(tx - pcx) + Math.abs(tz - pcz)]);
      need.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
      let painted = 0, worst = 0, stale = 0;
      const t0 = clock();
      for (const [tx, tz] of need) {
        const k = (tx + 0x8000) * 0x10000 + (tz + 0x8000);
        const has = this.mmTiles.get(k);
        if (has && has.stamp === this.mmStamp(tx, tz)) continue;
        if (has) stale++;
        if (painted && clock() - t0 >= budgetMs) continue;
        const a = clock();
        this.mmTiles.set(k, this.mmPaintTile(tx, tz));
        const ms = clock() - a;
        if (ms > worst) worst = ms;
        painted++;
      }
      for (const [k, t] of this.mmTiles) {
        if (t.tx < k0 - 1 || t.tx > k1 + 1 || t.tz < m0 - 1 || t.tz > m1 + 1) this.mmTiles.delete(k);
      }
      return { painted, stale, worst, want: need.length, held: this.mmTiles.size };
    }

    drawMinimap() {
      const S = this.mm.width, D = this.mm.height, W = this.g.world;
      const ctx = this.mmCtx;
      const p = this.g.player;
      const R2 = 62;                       // radius (world cells) a DOT is drawn for
      const RR = Math.max(S, D) / 2;       // radius of ground the dial can show, at 1 px/cell
      ctx.clearRect(0, 0, S, D);
      ctx.save();
      ctx.beginPath(); ctx.arc(S / 2, D / 2, S / 2 - 1, 0, 6.283); ctx.clip();
      ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, S, D);
      /* The map image sits one pixel per cell in this already-rotated frame,
         so the dots take the same raw offsets. Hand-rotating them a second
         time and stretching them by (S/2)/R2 spun the dots twice as fast as
         the map and parked them off their own markers.
         The window is a frame's worth of painting wide and no wider: the tiles
         the dial needs are painted as it asks for them, nearest the body first and
         up to the frame's share, and the ones it has walked away from are let go. */
      ctx.translate(S / 2, D / 2);
      ctx.rotate(-p.yaw);
      this.mmWindow(p.x, p.z, RR, MM_BUDGET_MS);
      const T = MM_TILE;
      /* one pixel per cell: nearest neighbour, so a pixel of the dial takes the
         colour of a cell of ground and not a mix of two. This is set here and not
         once at boot because the canvas state is saved and restored around every
         dial, and a flag that was quietly reset is a filter nobody chose. */
      ctx.imageSmoothingEnabled = false;
      for (const t of this.mmTiles.values()) {
        ctx.drawImage(t.c, t.tx * T - p.x, t.tz * T - p.z, T, T);
      }
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
      // Freshness is bucketed to 5 units, which is exactly what the bar shows.
      const sig = s.id + '|' + s.items.map(i => i.kind + i.id + Math.round(i.fresh / 5)).join(',') +
        '|' + g.stashSel + '|' + g.inv.map(i => i.kind + i.id + Math.round(i.fresh / 5)).join(',') +
        '|' + g.invSel + '|' + N.locale();
      if (sig === this._cellarSig) return;
      this._cellarSig = sig;
      el('cellarTitle').textContent = N.t('store.' + (s.kind === 'tree' ? 'tree' : 'cellar'));
      el('cellarSub').textContent = N.t('cellar.sub', { s: s.slots, d: s.decay, u: g.used(s.items) });
      el('stashItems').innerHTML = s.items.map((it, i) => this.itemHTML(it, i, i === g.stashSel)).join('') ||
        '<div class="empty">' + N.t('cellar.emptyShelf') + '</div>';
      el('packItems').innerHTML = g.inv.map((it, i) => this.itemHTML(it, i, i === g.invSel)).join('') ||
        '<div class="empty">' + N.t('cellar.emptyPack') + '</div>';
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
      el('journalBody').innerHTML = me + b + c;
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
