/* language switch test: the interface re-translates, the world does not change.
   Two things are asserted and they are independent failures:
     1. every visible string comes from the table for the language in use, and no
        raw dotted key ever reaches the screen;
     2. switching language leaves the saved game byte-identical -- a store or a
        quest that froze a translated string into the save file would break here. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

/* The HTML carries Chinese text inline so the page is readable before the table
   is applied. That text is a second copy, and a second copy drifts: it used to
   promise deer herds and pangolin forms in a valley that no longer has either.
   Checked here, in node, because it needs no browser and no render. */
global.window = global;
require('../data/i18n.js');
const fallbackBad = [];
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const T = global.FRUTARIA.T;
  const flat = s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  const re = /<(\w+)[^>]*\bdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const [, , key, inline] = m;
    n++;
    if (!T.zh[key]) { fallbackBad.push('no zh table entry for ' + key); continue; }
    if (!inline.trim()) continue;                       // no fallback is allowed
    const a = flat(inline), b = flat(T.zh[key]);
    if (a !== b) {
      let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
      fallbackBad.push(key + ' differs at char ' + k + ': inline "' + a.slice(Math.max(0, k - 12), k + 18) +
        '" vs table "' + b.slice(Math.max(0, k - 12), k + 18) + '"');
    }
  }
  // and every key the page asks for must be inside one of the two tables
  const keys = html.match(/data-i18n="[^"]+"/g) || [];
  for (const k of keys) {
    const key = k.slice(11, -1);
    if (!T.zh[key] || !T.en[key]) fallbackBad.push('data-i18n="' + key + '" is in neither table');
  }
  fallbackBad.unshift('inline fallbacks checked: ' + n + ' elements, ' + keys.length + ' keys');
}
const preFail = fallbackBad.slice(1);
console.log(fallbackBad.join('\n'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 620 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html') + '?auto&freeze', { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 120000 });

  const out = [], bad = [];
  const check = (name, cond, detail) => { if (!cond) bad.push('CHECK FAILED: ' + name + ' ' + JSON.stringify(detail)); };

  // put the player somewhere with a store, a creature and fruit in the pack, so
  // the panels have real content to translate
  await page.evaluate(() => {
    const g = window.game;
    g.player.x = 136.5; g.player.z = 130.5;
    for (let k = 46; k > 0; k--) if (g.world.solidAt(136, k, 130)) { g.player.y = k + 1; break; }
    g.player.yaw = 3.14; g.player.pitch = 0;
    g.addItem('fruit', 'frogpear'); g.addItem('fruit', 'frogpear');
    g.stashes[0].items.push({ kind: 'fruit', id: 'frogpear', fresh: 400, maxFresh: 900 });
    window.startGame();
  });
  await new Promise(r => setTimeout(r, 500));

  const LANGS = await page.evaluate(() => window.FRUTARIA.LANGS.map(l => l.id));
  out.push('languages ' + LANGS.join(' / '));

  // a snapshot of everything the interface shows, taken once per language
  const readUI = () => page.evaluate(() => {
    const txt = id => { const n = document.getElementById(id); return n ? n.textContent.trim() : ''; };
    const html = id => { const n = document.getElementById(id); return n ? n.innerHTML : ''; };
    return {
      locale: window.FRUTARIA.locale(),
      title: document.title,
      startTitle: ((document.querySelector('#start .title') || {}).textContent || '').trim(),
      langBtn: txt('btnLang'),
      hint: txt('hintRow'),
      cap: txt('capTxt'),
      clock: txt('clock'),
      who: txt('who'),
      prompt: txt('prompt'),
      stats: txt('stats'),
      inv: html('inv'),
      log: html('log'),
      mm: txt('mmLabel'),
      air: txt('airWrap'),
      itemTip: (document.querySelector('#inv .item') || {}).title || ''
    };
  });

  const seen = {};
  for (const id of LANGS) {
    // step away first, so the switch below is guaranteed to be a real change
    await page.evaluate(l => window.setLocale(l), LANGS.find(x => x !== id));
    await new Promise(r => setTimeout(r, 150));
    await page.evaluate(l => window.setLocale(l), id);
    await new Promise(r => setTimeout(r, 350));
    const u = await readUI();
    seen[id] = u;
    out.push(id + ' title=' + u.title + ' | cap=' + u.cap + ' | mm=' + u.mm + ' | air=' + u.air +
      ' | tip=' + u.itemTip + ' | btn=' + u.langBtn);
    // 1. nothing untranslated: a raw key on screen means a table entry is missing
    const blob = JSON.stringify(u);
    check('no raw i18n key leaks into the UI (' + id + ')', !/[a-z]+\.[a-zA-Z]{3,}/.test(blob.replace(/[\w-]+\.(html|js|png)/g, '')), blob.match(/[a-z]+\.[a-zA-Z]{3,}/g));
    check('the language button names the other language (' + id + ')',
      u.langBtn === (id === 'zh' ? 'English' : '中文'), u.langBtn);
    check('the log was rewritten in the new language (' + id + ')',
      u.log.indexOf(id === 'zh' ? '界面语言' : 'Interface language') >= 0, u.log.slice(0, 160));
    // the brand is the one name that must not move with the language: it sits in
    // the document title in both locales, and the start screen shows it instead
    // of a name only one of the two languages can read
    check('the document title carries the brand (' + id + ')', u.title.indexOf('ONE BITE') >= 0, u.title);
    check('the start screen shows a title, not a key (' + id + ')',
      u.startTitle.length > 0 && u.startTitle.indexOf('.') < 0, u.startTitle);
  }

  // 2. the two languages really differ everywhere the player looks
  for (const k of ['title', 'startTitle', 'cap', 'mm', 'air', 'hint', 'stats', 'itemTip', 'log']) {
    check('the ' + k + ' text changes with the language', seen.zh[k] !== seen.en[k], { zh: seen.zh[k], en: seen.en[k] });
  }

  // 3. translation is presentation only: the world is the same game underneath
  const state = () => page.evaluate(() => {
    const g = window.game;
    return JSON.stringify({ day: g.day, inv: g.inv, stashes: g.stashes, deeds: g.deeds.map(q => [q.id, q.done]), upg: g.upg });
  });
  await page.evaluate(() => window.setLocale('zh'));
  await new Promise(r => setTimeout(r, 250));
  const sZh = await state();
  await page.evaluate(() => window.setLocale('en'));
  await new Promise(r => setTimeout(r, 250));
  const sEn = await state();
  check('switching language does not touch the world', sZh === sEn, { zh: sZh.slice(0, 200), en: sEn.slice(0, 200) });

  // 4. and a save written in one language loads identically in the other
  await page.evaluate(() => window.setLocale('zh'));
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => window.game.save());
  const saveZh = await page.evaluate(() => localStorage.getItem(window.FRUTARIA.SAVE_KEY));
  await page.evaluate(() => window.setLocale('en'));
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => window.game.save());
  const saveEn = await page.evaluate(() => localStorage.getItem(window.FRUTARIA.SAVE_KEY));
  check('a save file carries no interface language', saveZh === saveEn,
    { zh: (saveZh || '').slice(0, 200), en: (saveEn || '').slice(0, 200) });

  // 5. the codex and the storage panel re-render, they are not left in the old tongue
  const panels = await page.evaluate(async () => {
    const g = window.game;
    g.mode = 'journal'; window.ui.showJournal(true);
    const jEn = document.getElementById('journalBody').innerHTML;
    window.setLocale('zh');
    const jZh = document.getElementById('journalBody').innerHTML;
    g.openStash = g.stashes[0]; g.mode = 'cellar'; window.ui.showCellar(true);
    const cZh = document.getElementById('cellarTitle').textContent + '|' + document.getElementById('cellarSub').textContent;
    window.setLocale('en');
    const cEn = document.getElementById('cellarTitle').textContent + '|' + document.getElementById('cellarSub').textContent;
    return { jEn, jZh, cZh, cEn };
  });
  check('the codex re-renders on switch', panels.jEn !== panels.jZh && /codex|图鉴/i.test(panels.jEn) && /codex|图鉴/i.test(panels.jZh),
    { en: panels.jEn.slice(0, 120), zh: panels.jZh.slice(0, 120) });
  check('the storage panel re-renders on switch', panels.cZh !== panels.cEn, { zh: panels.cZh, en: panels.cEn });

  // 6. the L key is the documented binding
  await page.evaluate(() => { window.ui.showJournal(false); window.ui.showCellar(false); window.game.mode = 'play'; window.setLocale('zh'); });
  await new Promise(r => setTimeout(r, 250));
  await page.keyboard.press('l');
  await new Promise(r => setTimeout(r, 300));
  const afterL = await page.evaluate(() => window.FRUTARIA.locale());
  out.push('press L: zh -> ' + afterL);
  check('the L key switches language (docs 04/07 claim it)', afterL !== 'zh', afterL);

  // 7. and so does the button, which is the only way a mouse-only player finds it
  await page.click('#btnLang');
  await new Promise(r => setTimeout(r, 300));
  const afterBtn = await page.evaluate(() => ({ locale: window.FRUTARIA.locale(), label: document.getElementById('btnLang').textContent }));
  out.push('click button: ' + afterL + ' -> ' + afterBtn.locale + ' (button reads "' + afterBtn.label + '")');
  check('the language button switches back', afterBtn.locale === 'zh', afterBtn);
  check('the button names the language it switches to', afterBtn.label === 'English', afterBtn.label);

  console.log(out.join('\n'));
  console.log(errs.length ? 'ERRORS: ' + errs.slice(0, 5).join(' | ') : 'no errors');
  if (preFail.length) console.log('!! inline fallback text is out of step with the zh table:\n' + preFail.join('\n'));
  if (bad.length) console.log(bad.join('\n'));
  process.exitCode = (errs.length || bad.length || preFail.length) ? 1 : 0;
  await browser.close();
})();
