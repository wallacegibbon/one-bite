/* ==========================================================================
 *  World data -- mirrors docs/en/02-map-and-scenes.md
 *  World size 160 x 160 x 48 (prototype); the full setting is 1024 x 1024 x 128
 *  Coordinates: x east, z south, y up. Sea level (Mirrorlake surface) is y = 14
 * ========================================================================== */
(function (N) {

  const WORLD = { w: 160, h: 48, d: 160, sea: 14 };

  /* Zones: kind = rect | circle; drives terrain, minimap tint and the location label */
  const ZONES = [
    {
      id: 'veil', cn: '灰雾墙', en: 'The Grey Veil', kind: 'border',
      color: [0.42, 0.44, 0.50], danger: 5,
      desc: '谷地的边界。雾不阻止你离开，它只是让你走出去之后不记得为什么要回来。'
    },
    {
      id: 'whisperwood', cn: '低语林', en: 'Whisperwood', kind: 'rect',
      x0: 6, z0: 6, x1: 154, z1: 72,
      color: [0.20, 0.36, 0.22], danger: 1,
      desc: '外缘是月光草地与蘑菇圈，往里是古木与鹿径，最深处是深鹿林——鹿比人多，所以那里的路都是踩出来的。'
    },
    {
      id: 'glowglade', cn: '蘑菇圈', en: 'Glowglade', kind: 'circle',
      cx: 60, cz: 56, r: 13,
      color: [0.30, 0.42, 0.26], danger: 1,
      desc: '一圈荧光菇围着中央的空地，夜里整圈会呼吸一样明灭。传说这是某种巨大生物曾经的脚印。'
    },
    {
      id: 'batcave', cn: '回声丘 · 蛛洞', en: 'Echo Hollow', kind: 'circle',
      cx: 28, cz: 30, r: 13,
      color: [0.30, 0.28, 0.30], danger: 2,
      desc: '山体被掏空成三层隧道，最深处通向旧梁。白天进去只听得见滴水，夜里到处是腿。'
    },
    {
      id: 'deepgrove', cn: '深鹿林', en: 'The Deep Grove', kind: 'circle',
      cx: 104, cz: 32, r: 18,
      color: [0.34, 0.46, 0.44], danger: 3,
      desc: '银色的树，没有风也会响。鹿径在这里收拢成一条；跟着走，会走到鹿群，也会走到熊。'
    },
    {
      id: 'mountains', cn: '北岭 · 鹰喙峰', en: 'Ashscale Ridge', kind: 'circle',
      cx: 142, cz: 18, r: 26,
      color: [0.42, 0.42, 0.46], danger: 3,
      desc: '灰熊的坡，风把雪粒横着吹。山顶能看到云顶浮岛，也能看见灰雾墙在远处缓慢地“呼吸”。'
    },
    {
      id: 'mirrorlake', cn: '镜湖', en: 'Mirrorlake', kind: 'circle',
      cx: 78, cz: 106, r: 34,
      color: [0.16, 0.32, 0.48], danger: 3,
      desc: '湖底有一座沉塔和几间沉没的旧屋。水面平静得像玻璃；一到雨后，整片湖岸一起叫。'
    },
    {
      id: 'starfall', cn: '星坠堡', en: 'Starfall Keep', kind: 'circle',
      cx: 78, cz: 106, r: 12,
      color: [0.46, 0.44, 0.50], danger: 1,
      desc: '湖心岛上的学院。四塔一钟，地窖里是果实温室。学院教的是认果：什么果、占几格、多久失活。'
    },
    {
      id: 'lanternrow', cn: '灯笼镇', en: 'Lanternrow', kind: 'rect',
      x0: 116, z0: 114, x1: 154, z1: 152,
      color: [0.46, 0.38, 0.26], danger: 0,
      desc: '主果窖所在地。镇子按灯笼排成一条线，夜里数灯笼就知道谁还没回家。'
    },
    {
      id: 'orchard', cn: '果园遗迹', en: 'The Old Orchard', kind: 'circle',
      cx: 24, cz: 104, r: 15,
      color: [0.36, 0.40, 0.28], danger: 2,
      desc: '所有果实树的祖地，如今只剩一圈断墙、几堆穿山甲的旧洞，和最老的那棵树。'
    },
    {
      id: 'cloudspire', cn: '云顶浮岛', en: 'Cloudspire', kind: 'sky',
      color: [0.62, 0.68, 0.80], danger: 4,
      desc: '一串悬浮的岩岛，最高的那座上还留着三百年前的旧梁。没有飞行形态，这里只是天空里的一个影子。'
    }
  ];

  /* Points of interest: minimap marker + location hint + quest anchors */
  const POIS = [
    { id: 'cellar',      cn: '主果窖',     x: 136, z: 134, y: 20, icon: 'chest',  zone: 'lanternrow' },
    { id: 'belltower',   cn: '星坠堡钟塔', x: 78,  z: 104, y: 34, icon: 'tower',  zone: 'starfall' },
    { id: 'greenhouse',  cn: '果实温室（地窖）', x: 78, z: 110, y: 18, icon: 'door', zone: 'starfall' },
    { id: 'sunktower',   cn: '沉塔',       x: 66,  z: 118, y: 8,  icon: 'water',  zone: 'mirrorlake' },
    { id: 'frogshall',   cn: '蛙鸣泽',   x: 92,  z: 120, y: 9,  icon: 'water',  zone: 'mirrorlake' },
    { id: 'groveheart',  cn: '深鹿林之心', x: 104, z: 32,  y: 24, icon: 'tree',   zone: 'deepgrove' },
    { id: 'cavemouth',   cn: '回声洞口',   x: 28,  z: 34,  y: 24, icon: 'cave',   zone: 'batcave' },
    { id: 'beams',       cn: '旧梁',       x: 40,  z: 20,  y: 38, icon: 'sky',    zone: 'cloudspire' },
    { id: 'oldtree',     cn: '最老的树',   x: 24,  z: 104, y: 22, icon: 'tree',   zone: 'orchard' },
    { id: 'mushring',    cn: '荧光菇环',   x: 60,  z: 56,  y: 20, icon: 'shroom', zone: 'glowglade' }
  ];

  /* Cloudspire isles: x, z, radius, top surface height */
  const SKY_ISLES = [
    { id: 'beamisle',  x: 40,  z: 20, r: 11, top: 37, beams: true },
    { id: 'highroost', x: 96,  z: 12, r: 7,  top: 40 },
    { id: 'windbell',  x: 128, z: 58, r: 8,  top: 34 },
    { id: 'stepping1', x: 66,  z: 40, r: 4,  top: 31 },
    { id: 'stepping2', x: 84,  z: 56, r: 3,  top: 29 },
    { id: 'stepping3', x: 20,  z: 62, r: 4,  top: 30 }
  ];

  N.WORLD = WORLD;
  N.ZONES = ZONES;
  N.ZONE_BY_ID = ZONES.reduce((m, z) => (m[z.id] = z, m), {});
  N.POIS = POIS;
  N.SKY_ISLES = SKY_ISLES;

})(window.FRUTARIA = window.FRUTARIA || {});
