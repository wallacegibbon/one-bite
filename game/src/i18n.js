/* ==========================================================================
 *  i18n.js -- locale state and lookup
 *
 *  Two kinds of text exist in this game and they are translated differently:
 *
 *   interface text  -- buttons, panels, prompts, log lines. Lives in
 *                      data/i18n.js as one flat table per language, looked
 *                      up with t(key, vars).
 *   setting text    -- a fruit's lore, a creature's dex entry, a zone or POI
 *                      name, an epithet. Lives next to the thing it describes
 *                      (fruits.js, creatures.js, world.js, player.js) as a
 *                      cn/en pair on that record, looked up with disp(obj).
 *
 *  The second rule is deliberate: the data files are the single source of
 *  truth for the setting, and docs-sync.js compares the documents against
 *  them. If translated setting text lived here, the docs could drift away
 *  from it unnoticed.
 *
 *  Only text a player can actually read gets a translation. The block table in
 *  src/world.js keeps a `cn` label per block for debugging and test output, and
 *  nothing renders it, so it has no `en` twin -- adding one would be a second
 *  place to keep in step for no player benefit.
 * ========================================================================== */
(function (N) {
  const LS_KEY = 'frutaria.locale.v1';

  const LANG_BY_ID = {};
  for (const l of N.LANGS) LANG_BY_ID[l.id] = l;

  function loadLocale() {
    let v = null;
    try { v = localStorage.getItem(LS_KEY); } catch (e) { v = null; }
    if (v && LANG_BY_ID[v]) return v;
    // a browser already set to English gets English; everything else gets zh
    const nav = (typeof navigator !== 'undefined' && navigator.language || '').slice(0, 2).toLowerCase();
    if (LANG_BY_ID[nav]) return nav;
    return N.LOCALE_DEFAULT;
  }

  const I18N = {
    locale: loadLocale(),
    listeners: [],

    langs() { return N.LANGS; },
    has(key) { return !!(N.T[this.locale] && key in N.T[this.locale]); },

    /* interface text; falls back to zh, then to the key itself, so a missing
       translation is visible in the UI instead of crashing the frame */
    t(key, vars) {
      let s = N.T[this.locale] && N.T[this.locale][key];
      if (s === undefined) s = N.T.zh[key];
      if (s === undefined) return key;
      if (!vars) return s;
      return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
    },

    /* setting text stored as a cn/en pair on the record itself */
    disp(obj) {
      if (!obj) return '';
      const v = obj[this.locale] !== undefined ? obj[this.locale]
        : (obj.cn !== undefined ? obj.cn : obj.en);
      return v === undefined ? '' : v;
    },

    /* a list of setting strings (a fruit's costs, a raid's loot) */
    list(arr, sep) {
      const s = sep !== undefined ? sep : this.t('j.listSep');
      return (arr || []).map(x => (typeof x === 'string' ? x : this.disp(x))).join(s);
    },

    /* a translated field that is too long to sit inline as a cn/en pair, so the
       record carries two parallel fields instead: lore/loreEn, dex/dexEn,
       desc/descEn, cost/costEn. The zh spelling is the bare name. */
    field(obj, base) {
      if (!obj) return '';
      if (this.locale === 'en' && obj[base + 'En'] !== undefined) return obj[base + 'En'];
      return obj[base];
    },
    /* habitat is the one exception: `habitat` already holds the zone ids, so the
       two prose spellings are habitatCn / habitatEn */
    habitatText(f) {
      return (this.locale === 'en' && f.habitatEn) ? f.habitatEn : f.habitatCn;
    },

    /* the label the language button should show: the language it switches to */
    nextLabel() {
      const nx = this.next();
      return nx ? (this.locale === 'zh' ? nx.label : nx.labelEn || nx.label) : '';
    },
    next() {
      const i = N.LANGS.findIndex(l => l.id === this.locale);
      return N.LANGS[(i + 1 + N.LANGS.length) % N.LANGS.length];
    },

    set(id) {
      if (!LANG_BY_ID[id] || id === this.locale) return false;
      this.locale = id;
      try { localStorage.setItem(LS_KEY, id); } catch (e) { /* private mode: keep it in memory */ }
      if (typeof document !== 'undefined') document.documentElement.lang = id === 'zh' ? 'zh-CN' : 'en';
      for (const f of this.listeners) f(id);
      return true;
    },
    cycle() { return this.set(this.next().id); },
    onChange(f) { this.listeners.push(f); }
  };

  N.i18n = I18N;
  N.locale = () => I18N.locale;
  N.t = (k, v) => I18N.t(k, v);
  N.disp = o => I18N.disp(o);
  N.tlist = (a, s) => I18N.list(a, s);
  N.loreOf = o => I18N.field(o, 'lore');
  N.dexOf = o => I18N.field(o, 'dex');
  N.descOf = o => I18N.field(o, 'desc');
  N.costList = f => I18N.list(I18N.field(f, 'cost'));
  N.habitatText = f => I18N.habitatText(f);

})(window.FRUTARIA = window.FRUTARIA || {});
