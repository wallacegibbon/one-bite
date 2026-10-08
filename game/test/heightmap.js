/* 地形高度图 ASCII 检查 */
const path = require('path');
global.window = {};
for (const f of ['data/fruits.js', 'data/world.js', 'data/creatures.js', 'src/world.js', 'src/worldgen.js']) {
  require(path.join(__dirname, '..', f));
}
const N = global.window.FRUTARIA;
const W = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
N.generate(W, 20261008);
const step = 4;
console.log('   ' + Array.from({ length: Math.ceil(W.w / step) }, (_, i) => (i % 10)).join(''));
for (let z = 0; z < W.d; z += step) {
  let row = String(z).padStart(3);
  for (let x = 0; x < W.w; x += step) {
    let h = 0;
    for (let y = W.h - 1; y >= 0; y--) if (W.get(x, y, z)) { h = y; break; }
    const b = W.get(x, h, z);
    let ch;
    if (h <= N.WORLD.sea) ch = '~';
    else if (b === 2) ch = '.';
    else if (b === 3) ch = ',';
    else if (b === 4) ch = '^';
    else if (b === 5) ch = '#';
    else if (b === 6) ch = 'c';
    else if (b === 7) ch = 'C';
    else if (b === 8) ch = 'w';
    else if (b === 9) ch = 'W';
    else if (b === 10) ch = 'g';
    else if (b === 11) ch = 'G';
    else if (b === 12) ch = 'l';
    else if (b === 13) ch = 'L';
    else if (b === 14) ch = 'd';
    else if (b === 15) ch = 'D';
    else if (b === 16) ch = 's';
    else if (b === 17) ch = 'S';
    else if (b === 18) ch = 'b';
    else if (b === 19) ch = 'B';
    else if (b === 20) ch = 'p';
    else if (b === 21) ch = 'P';
    else if (b === 22) ch = 'q';
    else if (b === 23) ch = 'Q';
    else if (b === 24) ch = 'f';
    else if (b === 25) ch = 'F';
    else if (b === 26) ch = 'k';
    else if (b === 27) ch = 'K';
    else if (b === 28) ch = 'r';
    else if (b === 29) ch = 'R';
    else if (b === 30) ch = 't';
    else ch = '?';
    row += ch;
  }
  console.log(row);
}
