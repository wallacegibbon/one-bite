/* ==========================================================================
 *  World data -- mirrors docs/en/02-map-and-scenes.md
 *  World size 160 x 160 x 48 (prototype); the full setting is 1024 x 1024 x 128
 *  Coordinates: x east, z south, y up. Sea level (Mirrorlake surface) is y = 14
 * ========================================================================== */
(function (N) {

  const WORLD = { w: 160, h: 48, d: 160, sea: 14 };

  /* Zones: kind = rect | circle; drives terrain and the location label */
  const ZONES = [
    {
      id: 'veil', cn: '灰雾墙', en: 'The Grey Veil', kind: 'border',
      danger: 5,
      desc: '谷地的边界。雾不阻止你离开，它只是让你走出去之后不记得为什么要回来。'
    },
    {
      id: 'whisperwood', cn: '低语林', en: 'Whisperwood', kind: 'rect',
      x0: 6, z0: 6, x1: 154, z1: 72,
      danger: 1,
      desc: '外缘是月光草地与蘑菇圈，往里是古木与旧鹿径，最深处是深鹿林。路是鹿踩出来的；鹿不在了，路还在。'
    },
    {
      id: 'glowglade', cn: '蘑菇圈', en: 'Glowglade', kind: 'circle',
      cx: 60, cz: 56, r: 13,
      danger: 1,
      desc: '一圈荧光菇围着中央的空地，夜里整圈会呼吸一样明灭。'
    },
    {
      id: 'batcave', cn: '回声丘', en: 'Echo Hollow', kind: 'circle',
      cx: 28, cz: 30, r: 13,
      danger: 2,
      desc: '山体被掏空成三层隧道，最深处通向旧梁。白天进去只听得见滴水。'
    },
    {
      id: 'deepgrove', cn: '深鹿林', en: 'The Deep Grove', kind: 'circle',
      cx: 104, cz: 32, r: 18,
      danger: 3,
      desc: '银色的树，没有风也会响。旧鹿径在这里收拢成一条；跟着走，会走到水边，也会走到熊。'
    },
    {
      id: 'mountains', cn: '北岭 · 鹰喙峰', en: 'Ashscale Ridge', kind: 'circle',
      cx: 142, cz: 18, r: 26,
      danger: 3,
      // the cold is the ridge's own: it depends on height, not on the hour, and
      // it bites harder the higher you go (rate is reached `ramp` metres above
      // the line). A bear body is its own weatherproofing.
      cold: { above: 26, rate: 0.06, ramp: 10 },
      desc: '棕熊的坡，风把雪粒横着吹。山顶能看到云顶浮岛，也能看见灰雾墙在远处缓慢地“呼吸”。'
    },
    {
      id: 'mirrorlake', cn: '镜湖', en: 'Mirrorlake', kind: 'circle',
      cx: 78, cz: 106, r: 38,
      danger: 3,
      // the sunken tower: worldgen builds it here, and the lamp jellyfish field
      // sits on its outline (data/creatures.js asks for it by name)
      tower: [66, 118],
      // the ring of sunken huts on the lakebed, the frogs' place (POI frogshall
      // sits in the middle of it); worldgen builds them at absolute heights
      huts: [[90, 120], [96, 116], [94, 124], [88, 126]],
      desc: '湖底有一座沉塔。水面平静得像玻璃；一到雨后，整片湖岸一起叫。'
    },
    {
      id: 'starfall', cn: '星坠堡', en: 'Starfall Keep', kind: 'circle',
      cx: 78, cz: 106, r: 12,
      danger: 1,
      desc: '湖心岛上的学院。四塔一钟，城台上扣着一只玻璃温室。学院教的是认果：什么果、占几格、多久失活。'
    },
    {
      id: 'lanternrow', cn: '灯笼镇', en: 'Lanternrow', kind: 'rect',
      x0: 116, z0: 114, x1: 154, z1: 152,
      danger: 0,
      desc: '主果窖所在地。镇子按灯笼排成一条线，夜里数灯笼就知道谁还没回家。'
    },
    {
      id: 'orchard', cn: '果园遗迹', en: 'The Old Orchard', kind: 'circle',
      cx: 24, cz: 104, r: 15,
      danger: 2,
      desc: '所有果实树的祖地，如今只剩一圈断墙、几堆废弃的旧洞，和最老的那棵树。'
    },
    {
      id: 'cloudspire', cn: '云顶浮岛', en: 'Cloudspire', kind: 'sky',
      danger: 4,
      desc: '一串悬浮的岩岛，最高的那座上架着旧梁。没有飞行形态，这里只是天空里的一个影子。'
    }
  ];

  /* Points of interest: minimap markers, and the named places the code anchors
     things to -- the cellar door, the quest greenhouse, the lake the frogs call
     in. A POI is a place with a name; a zone is a place with a shape.
     The two door markers carry the height of the door they name, not a height
     remembered from an older map: the generator marks a door with a cellar crate
     in that marker's own column, so the crate stands one cell above the marker.
     Main Cellar: marker y20, crate y21 -- and game.js asks the world for
     `poi.y + 1` when it sets the cellar's store down, so that relation is not a
     convention, it is what the code reads. The keep's fruit greenhouse door was
     written y18 while the crate the generator puts at (78,110) stands at y22, on
     the deck it raises over the island: four cells under its own door and inside
     the island's plank fill. The docs-drift and docs-sync checks ask it.
     A name is a claim too, and the world answers it. This place used to be
     called a cellar in every language the game speaks -- in the zone's own
     description, in the name the data gives the marker the minimap is drawn
     from, and in the hint the codex prints under quest 6. Asked, the island
     under that door holds no room: over the 441 columns of the keep's disc,
     every one of the 9,702 cells from the floor of the world up to the row the
     marker is printed at stands solid, and 0 of them are air. The fruit stands
     in a glass case shut on all six faces that the generator set on top of the
     deck, at y22..y26. So the cellar word is gone from this place's name, and
     what it is called now says what stands there. The town's Main Cellar keeps
     its word: the same census over the 9x9 of dark brick the store is built in
     answers 0 air up to that marker row too, but the room it opens onto is
     there -- air at y21, y22 and y23, three rows of it, under the floor the town
     builds on at y24. That is a room, and the word says a room. */
  const POIS = [
    { id: 'cellar',      cn: '主果窖',     en: 'Main Cellar',          x: 136, z: 134, y: 20, icon: 'chest' },
    { id: 'belltower',   cn: '星坠堡钟塔', en: 'Starfall Bell Tower',  x: 78,  z: 104, y: 34, icon: 'tower' },
    { id: 'greenhouse',  cn: '果实温室',   en: 'Fruit Greenhouse',     x: 78, z: 110, y: 21, icon: 'door' },
    { id: 'sunktower',   cn: '沉塔',       en: 'The Sunken Tower',     x: 66,  z: 118, y: 8,  icon: 'water' },
    { id: 'frogshall',   cn: '蛙鸣泽',     en: 'the Frogshall',        x: 92,  z: 120, y: 9,  icon: 'water' },
    { id: 'groveheart',  cn: '深鹿林之心', en: 'Heart of the Deep Grove', x: 104, z: 32, y: 24, icon: 'tree' },
    { id: 'cavemouth',   cn: '回声洞口',   en: 'Echo Hollow Mouth',    x: 28,  z: 34,  y: 24, icon: 'cave' },
    { id: 'beams',       cn: '旧梁',       en: 'the Old Beams',        x: 40,  z: 20,  y: 38, icon: 'sky' },
    { id: 'oldtree',     cn: '最老的树',   en: 'the Oldest Tree',      x: 24,  z: 104, y: 22, icon: 'tree' },
    { id: 'mushring',    cn: '荧光菇环',   en: 'Glowcap Ring',         x: 60,  z: 56,  y: 20, icon: 'shroom' }
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
