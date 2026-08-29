// Забирает данные репозиториев для схемы и СРАЗУ обезличивает их.
//
// Репозиторий профиля публичный, поэтому имена приватных репозиториев
// в него попасть не должны. Схеме имена и не нужны: ей важно только,
// какие репозитории относятся к одному проекту. Семейство заменяется
// непрозрачным номером, имя не сохраняется вообще.
//
// Запуск: GITHUB_TOKEN=... node tools/fetch-repos.js
// Нужен токен с доступом к приватным репозиториям (обычный gh-токен подходит).

const fs = require('fs');
const path = require('path');

const USER = process.env.GH_USER || 'DUFA14';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const OUT = path.join(__dirname, 'repos.json');

const QUERY = `{ user(login:"${USER}") { repositories(first:100, ownerAffiliations:OWNER, isFork:false) { nodes {
  name pushedAt
  primaryLanguage { name color }
  languages(first:8, orderBy:{field:SIZE, direction:DESC}) { edges { size } }
} } } }`;

(async () => {
  if (!TOKEN) throw new Error('нет GITHUB_TOKEN / GH_TOKEN в окружении');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': USER },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL: ' + JSON.stringify(json.errors));

  const raw = json.data.user.repositories.nodes;

  // семейство по префиксу имени -> непрозрачный номер. Само имя не сохраняем.
  const famId = new Map();
  const out = raw.map(r => {
    const prefix = r.name.toLowerCase().split(/[-_]/)[0];
    if (!famId.has(prefix)) famId.set(prefix, 'f' + famId.size);
    return {
      fam: famId.get(prefix),
      lang: r.primaryLanguage ? r.primaryLanguage.name : '—',
      color: (r.primaryLanguage && r.primaryLanguage.color) || '#484f58',
      bytes: r.languages.edges.reduce((s, e) => s + e.size, 0),
      pushed: r.pushedAt,
    };
  });

  fs.writeFileSync(OUT, JSON.stringify(out));

  // проверяем по фактическим значениям полей, а не подстрокой:
  // короткое имя вроде "2" иначе совпадёт с любым числом
  const names = new Set(raw.map(r => r.name));
  const values = new Set(out.flatMap(o => Object.values(o).map(String)));
  const leaked = [...names].filter(n => values.has(n));
  console.log(`repos.json: ${out.length} записей, ${famId.size} семейств`);
  console.log(leaked.length ? 'ВНИМАНИЕ: в файл попали имена: ' + leaked.join(', ') : 'имён репозиториев в файле нет');
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
