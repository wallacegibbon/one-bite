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

    /* ---------------- minimap base ---------------- */
    buildMinimap() {
      const W = this.g.world, S = W.w, D = W.d;
      this.mmBase.width = S; this.mmBase.height = D;
      const ctx = this.mmBase.getContext('2d');
      const img = ctx.createImageData(S, D);
      for (let z = 0; z < D; z++) for (let x = 0; x < S; x++) {
        let y = W.h - 1, b = 0;
        for (; y > 0; y--) { b = W.get(x, y, z); if (b && N.BLOCKS[b] && N.BLOCKS[b].solid && !N.BLOCKS[b].liquid) break; }
        const bd = N.BLOCKS[b] || { c: [0, 0, 0] };
        let c = bd.ct || bd.c;
        let water = 0, depth = 0;
        if (b === N.WATER) { water = 1; for (let yy = y; yy < W.h && W.liquidAt(x, yy, z); yy++) depth++; }
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
      const scale = (S / 2) / R2;
      ctx.translate(S / 2, D / 2);
      ctx.rotate(-p.yaw);
      ctx.drawImage(this.mmBase, -p.x, -p.z, W.w, W.d);
      ctx.scale(1, 1);
      // POI
      for (const q of N.POIS) {
        const dx = (q.x - p.x), dz = (q.z - p.z);
        const rx = dx * Math.cos(-p.yaw) - dz * Math.sin(-p.yaw);
        const rz = dx * Math.sin(-p.yaw) + dz * Math.cos(-p.yaw);
        if (Math.hypot(rx, rz) > R2) continue;
        ctx.fillStyle = 'rgba(255,236,170,0.95)';
        ctx.beginPath(); ctx.arc(rx * scale, rz * scale, 2.2, 0, 6.283); ctx.fill();
      }
      // creatures
      for (const c of this.g.creatures) {
        const dx = (c.x - p.x), dz = (c.z - p.z);
        if (Math.hypot(dx, dz) > R2) continue;
        const rx = dx * Math.cos(-p.yaw) - dz * Math.sin(-p.yaw);
        const rz = dx * Math.sin(-p.yaw) + dz * Math.cos(-p.yaw);
        const hostile = (c.sp.attitude || {}).default === 'hostile' || c.state === 'chase';
        ctx.fillStyle = hostile ? 'rgba(255,110,90,0.9)' : 'rgba(150,230,255,0.75)';
        ctx.fillRect(rx * scale - 1, rz * scale - 1, 2, 2);
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
      el('clock').innerHTML = '<b>' + pad(h) + ':' + pad(m) + '</b> · 第 ' + g.day + ' 天 ' + icon +
        ' <span class="dim">' + (g.night > 0.55 ? '夜' : g.night > 0.25 ? '黄昏' : '昼') + '</span>';

      // identity: the valley's epithet comes first; the player's own name only if they chose one
      const ep = g.epithet();
      el('who').innerHTML = '「' + ep.cn + '」' +
        (g.name ? ' <span class="dim">' + g.name + '</span>' : ' <span class="dim">按 N 起个名字</span>');

      // vitality / air / fright
      let v = '';
      for (let i = 0; i < 5; i++) v += '<span class="hp' + (p.vital > i + 0.5 ? ' on' : '') + '">✦</span>';
      el('vitals').innerHTML = v;
      el('air').style.width = Math.max(0, Math.min(100, p.air / 18 * 100)) + '%';
      el('airWrap').style.opacity = p.air < 17.5 ? 1 : 0;
      el('fright').style.width = (p.fright * 100) + '%';
      el('frightWrap').style.opacity = p.fright > 0.02 ? 1 : 0;

      // form bar
      const fb = el('formbar');
      if (p.form) {
        const f = FRU[p.form];
        fb.classList.remove('hidden');
        el('formfill').style.width = (p.formT / p.formMax * 100) + '%';
        el('formfill').style.background = RAR[f.rarity].ring;
        el('formname').innerHTML = f.form.cn + ' · ' + Math.ceil(p.formT) + 's' +
          (p.formT / p.formMax < 0.25 ? ' <span class="warn">归心</span>' : '');
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
      el('stats').innerHTML = '采 ' + g.stats.harvested + ' · 食 ' + g.stats.eaten + ' · 复原 ' + g.stats.reverted +
        ' · 倒下 ' + g.stats.deaths + ' <span class="dim">| ' + g.creatures.length + ' 只生物</span>';
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
      return '<div class="' + cls + '" data-i="' + i + '" title="' + d.cn + ' · ' + rar.cn + ' · ' + slots + ' 果格" ' +
        'style="--ring:' + rar.ring + ';--deg:' + (fresh * 360) + 'deg">' +
        '<div class="ico" style="background:radial-gradient(circle at 35% 30%,' + rar.ring + ',rgba(0,0,0,.55))"></div>' +
        '<div class="slots">' + slots + '</div>' +
        (it.kind === 'fruit' ? '<div class="fresh" style="width:' + pct + '%"></div>' : '<div class="pitTag">核</div>') +
        '</div>';
    }

    renderInv() {
      const g = this.g;
      const sig = g.inv.map(i => i.kind + i.id + Math.round(i.fresh / 5)).join(',') + '|' + g.sel + '|' + g.cap();
      if (sig === this.invSig) return;
      this.invSig = sig;
      el('inv').innerHTML = g.inv.map((it, i) => this.itemHTML(it, i, i === g.sel)).join('') ||
        '<div class="empty">背包是空的。去采一颗果实吧。</div>';
      const used = g.used(), cap = g.cap();
      el('capFill').style.width = (used / cap * 100) + '%';
      el('capFill').style.background = used / cap > 0.8 ? '#e07a4a' : '#8fbf6a';
      el('capTxt').textContent = used + ' / ' + cap + ' 果格';
      const owned = STO.backpack.upgrades.filter(u => g.upg[u.id]);
      el('upgTxt').textContent = owned.length ? owned.map(u => u.slots ? '+' + u.slots : '稀−1').join(' · ') : '';
    }

    /* ---------------- storage panel ---------------- */
    showCellar(on) {
      this.show.cellar = on;
      el('cellar').classList.toggle('hidden', !on);
      el('modalRoot').classList.toggle('on', on || this.show.journal || this.show.help);
      if (on) { this.renderCellar(); document.exitPointerLock && document.exitPointerLock(); }
      else this.g.mode = 'play';
    }
    renderCellar() {
      const g = this.g, s = g.openStash;
      if (!s) return;
      el('cellarTitle').textContent = s.cn;
      el('cellarSub').textContent = '容量 ' + s.slots + ' 果格 · 腐坏速度 ×' + s.decay + ' · 已用 ' + g.used(s.items);
      el('stashItems').innerHTML = s.items.map((it, i) => this.itemHTML(it, i, i === g.stashSel)).join('') || '<div class="empty">空架子。</div>';
      el('packItems').innerHTML = g.inv.map((it, i) => this.itemHTML(it, i, i === g.invSel)).join('') || '<div class="empty">背包空。</div>';
      // owl post
      const pr = el('postRow');
      const transit = g.posts.map(p => (FRU[p.it.id] ? FRU[p.it.id].cn : p.it.id) + '（' + Math.max(1, Math.ceil(p.t / 420)) + ' 天后到）').join('、');
      let txt = '';
      if (g.posts.length) txt += '🕊 在途：' + transit;
      if (s.kind === 'tree') {
        if (g.owlUnlocked()) txt += (txt ? ' · ' : '') + '<b>P</b> — 让钟摆叼走选中的 1 颗（3 个游戏日送达主果窖，10% 会丢）';
        else txt += (txt ? ' · ' : '') + '钟摆还没来：先在主果窖存一颗猫头鹰果。';
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
      let me = '<h3>你</h3><div class="dim">谷地称呼：<b>「' + ep.cn + '」</b>' +
        (g.name ? ' · 你自己的名字：<b>' + g.name + '</b>（按 N 可改）' : ' · 还没有名字（按 N 起一个）') +
        ' · 谷地记住的编号：<code>' + g.id + '</code>' +
        (g.hasTrait('mixStomach') ? ' · 天赋：<b>' + N.IDENTITY.traits.mixStomach.cn + '</b>' : '') + '</div>';
      let q = '<h3>任务</h3>';
      for (const qq of g.quests) q += '<div class="q' + (qq.done ? ' done' : '') + '"><b>' + (qq.done ? '✔ ' : '○ ') + qq.cn + '</b><div class="dim">' + qq.hint + '</div></div>';
      let b = '<h3>果实图鉴</h3><div class="dex">';
      for (const f of N.FRUITS) {
        const known = g.dexFruit[f.id];
        const rar = RAR[f.rarity];
        b += '<div class="card' + (known ? '' : ' unk') + '" style="--ring:' + rar.ring + '">' +
          '<div class="cn">' + (known ? f.cn : '？？？') + '</div>' +
          '<div class="meta"><span>' + rar.cn + '</span><span>' + rar.slots + ' 果格</span>' +
          (f.duration ? '<span>' + f.duration + 's</span>' : '<span>不可食</span>') + '</div>' +
          (known ? '<div class="lore">' + f.lore + '</div><div class="side">代价：' + f.cost.join('；') + '</div>' +
            '<div class="dim">栖息：' + f.habitatCn + '</div>' : '<div class="dim">未获得</div>') +
          '</div>';
      }
      b += '</div>';
      let c = '<h3>生物图鉴</h3><div class="dex">';
      for (const sp of N.CREATURES) {
        const known = g.seen[sp.id];
        c += '<div class="card' + (known ? '' : ' unk') + '"><div class="cn">' + (known ? sp.cn : '？？？') + '</div>' +
          (known ? '<div class="lore">' + sp.dex + '</div>' : '<div class="dim">尚未观察</div>') + '</div>';
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
    }
    onLog() { this.logLen = -1; }
  }

  N.UI = UI;
})(window.FRUTARIA = window.FRUTARIA || {});
