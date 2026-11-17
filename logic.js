// Логіка входу за кодом з пошти + видача даних моделі лише після входу.
// Стан (коди, сесії, ліміти) зберігається в static data робочого процесу — лише в production-запусках.
const MODEL = {companies: {
  agro:{n:"Горизонт Агро",rev:[52000,118000,296000,248000],cogs:.46,fuelL:[210,640,980,820],usd:[180,420,610,520],opex:[21000,26000,31000,29000]},
  log:{n:"Горизонт Логістик",rev:[231000,238000,244000,262000],idx:"idxL",cogs:.38,fuelL:[1150,1180,1210,1260],opex:[27500,28000,28500,29500]},
  ret:{n:"Горизонт Рітейл",rev:[1480000,1530000,1560000,1890000],idx:"idxR",cogs:.62,usd:[2100,2050,2200,2900],opex:[262000,266000,270000,318000]},
  dev:{n:"Горизонт Девелопмент",rev:[310000,345000,360000,420000],cogs:.68,opex:[21500,22000,22500,24000]}
}, debt:[820000,790000,760000,730000],
  base:{fx:41.8,diesel:58.5,rate:.18,idxL:0,idxR:.05},
  scenarios:{pess:{fx:46,diesel:67.3,rate:.20,idxL:0,idxR:.03},opt:{fx:40,diesel:54,rate:.16,idxL:.05,idxR:.07}}};
const st = $getWorkflowStaticData('global');
st.otp = st.otp || {}; st.sess = st.sess || {}; st.req = st.req || {};
const now = Date.now();
const body = $('Webhook').first().json.body || {};
const action = String(body.action || '');
const email = String(body.email || '').trim().toLowerCase();
const rnd = String($('Випадкове значення').first().json.rnd || '');
const allowed = String($('Налаштування').first().json.allowed || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
for (const k in st.otp) if (st.otp[k].exp < now) delete st.otp[k];
for (const k in st.sess) if (st.sess[k].exp < now) delete st.sess[k];
const out = (status, b, extra = {}) => [{ json: { status, body: b, send: false, ...extra } }];

if (action === 'request') {
  const generic = { ok: true, message: 'Якщо цей email має доступ, на нього надіслано код. Він дійсний 10 хвилин.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return out(400, { ok: false, message: 'Перевірте email.' });
  if (!allowed.includes(email)) return out(200, generic);
  const r = st.req[email] || { count: 0, since: now, last: 0 };
  if (now - r.since > 3600e3) { r.count = 0; r.since = now; }
  if (now - r.last < 60e3) return out(429, { ok: false, message: 'Код уже надіслано. Новий можна запросити через хвилину.' });
  if (r.count >= 5) return out(429, { ok: false, message: 'Забагато запитів. Спробуйте через годину.' });
  r.count++; r.last = now; st.req[email] = r;
  const code = String(parseInt(rnd.slice(0, 12), 16) % 1000000).padStart(6, '0');
  st.otp[email] = { code, exp: now + 10 * 60e3, tries: 0 };
  return out(200, generic, { send: true, email, code });
}
if (action === 'verify') {
  const code = String(body.code || '').replace(/\D/g, '');
  const o = st.otp[email];
  if (!o) return out(401, { ok: false, message: 'Код недійсний або прострочений. Запросіть новий.' });
  if (o.tries >= 5) { delete st.otp[email]; return out(401, { ok: false, message: 'Забагато спроб. Запросіть новий код.' }); }
  if (o.code !== code) { o.tries++; return out(401, { ok: false, message: `Невірний код. Залишилось спроб: ${5 - o.tries}.` }); }
  delete st.otp[email];
  const exp = now + 8 * 3600e3;
  st.sess[rnd] = { email, exp };
  return out(200, { ok: true, token: rnd, email, expires: new Date(exp).toISOString() });
}
if (action === 'data') {
  const s = st.sess[String(body.token || '')];
  if (!s) return out(401, { ok: false, message: 'Сесія завершилась. Увійдіть знову.' });
  return out(200, { ok: true, email: s.email, model: MODEL });
}
if (action === 'logout') { delete st.sess[String(body.token || '')]; return out(200, { ok: true }); }
return out(400, { ok: false, message: 'Невідома дія.' });
