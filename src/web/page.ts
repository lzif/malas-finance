// web/page.ts — the dashboard shell as a single self-contained string.
//
// No build step and no CDN for CSS or charts: this is a Deno project with no
// bundler, and a chart library would be the only reason to grow one. The
// sparkline and bars are hand-written SVG, which is a few dozen lines here and
// zero dependencies forever.
//
// The one external script is Telegram's own web-app.js — it is what supplies
// `initData`, so there is no way to authenticate without it.
//
// Colours come from the Telegram theme variables, so the page matches whatever
// theme the user runs rather than fighting it.

export const PAGE_HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MalasFinance</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root {
    --bg: var(--tg-theme-bg-color, #17212b);
    --card: var(--tg-theme-secondary-bg-color, #232e3c);
    --text: var(--tg-theme-text-color, #f5f5f5);
    --muted: var(--tg-theme-hint-color, #8b9bb0);
    --accent: var(--tg-theme-link-color, #62bcf9);
    --good: #4cc38a;
    --warn: #f5a623;
    --bad: #f2545b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px 14px 40px;
    background: var(--bg); color: var(--text);
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
  h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: var(--muted);
       text-transform: uppercase; letter-spacing: .04em; }
  .sub { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
  .card { background: var(--card); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  .anchor { text-align: center; padding: 20px 14px; }
  .anchor .big { font-size: 34px; font-weight: 700; letter-spacing: -.02em; margin: 4px 0; }
  .anchor .of { color: var(--muted); font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .grid .card { margin: 0; padding: 12px 10px; text-align: center; }
  .grid .label { color: var(--muted); font-size: 11px; margin-bottom: 4px; }
  .grid .value { font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
  .row { display: flex; justify-content: space-between; align-items: baseline;
         gap: 10px; padding: 7px 0; }
  .row + .row { border-top: 1px solid rgba(255,255,255,.06); }
  .row .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); margin-top: 5px; }
  .bar > i { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
  .muted { color: var(--muted); }
  .good { color: var(--good); } .warn { color: var(--warn); } .bad { color: var(--bad); }
  .pill { font-size: 11px; padding: 2px 7px; border-radius: 999px;
          background: rgba(255,255,255,.08); color: var(--muted); }
  svg { display: block; width: 100%; height: auto; }
  .empty { color: var(--muted); font-size: 13px; padding: 6px 0; }
  #error { display: none; background: rgba(242,84,91,.12); color: var(--bad);
           padding: 14px; border-radius: 14px; font-size: 13px; }
</style>
</head>
<body>
<div id="error"></div>
<div id="app" hidden></div>

<script>
const tg = window.Telegram && window.Telegram.WebApp
if (tg) { tg.ready(); tg.expand() }

const rp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0))
const pct = (x) => x === null || x === undefined ? '—' : Math.round(x * 100) + '%'
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function fail(msg) {
  const el = document.getElementById('error')
  el.style.display = 'block'
  el.textContent = msg
}

/** A filled sparkline over the daily spend, with the average as a dashed rule. */
function sparkline(daily, average) {
  if (!daily.length) return ''
  const w = 320, h = 64, pad = 2
  const max = Math.max(...daily.map((d) => d.out), 1)
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(daily.length - 1, 1)
  const y = (v) => h - pad - (v / max) * (h - pad * 2)
  const line = daily.map((d, i) => \`\${i ? 'L' : 'M'}\${x(i).toFixed(1)},\${y(d.out).toFixed(1)}\`)
    .join(' ')
  const area = \`\${line} L\${x(daily.length - 1).toFixed(1)},\${h - pad} L\${x(0).toFixed(1)},\${h - pad} Z\`
  const avgY = y(average).toFixed(1)
  return \`<svg viewBox="0 0 \${w} \${h}" preserveAspectRatio="none" role="img"
    aria-label="Pengeluaran 28 hari terakhir">
    <path d="\${area}" fill="var(--accent)" opacity=".15"/>
    <path d="\${line}" fill="none" stroke="var(--accent)" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="\${pad}" x2="\${w - pad}" y1="\${avgY}" y2="\${avgY}"
      stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>
  </svg>\`
}

function barRows(rows, total) {
  if (!rows.length) return '<div class="empty">Belum ada data.</div>'
  return rows.map((r) => \`
    <div style="padding:7px 0">
      <div class="row" style="padding:0;border:0">
        <span class="name">\${esc(r.name)}</span>
        <span class="amt">\${rp(r.amount)}</span>
      </div>
      <div class="bar"><i style="width:\${total > 0 ? (r.amount / total) * 100 : 0}%"></i></div>
    </div>\`).join('')
}

const INTENT_LABELS = {
  routine: 'Rutin', planned: 'Terencana', impulse: 'Impulsif', emergency: 'Darurat',
}

function render(d) {
  const a = d.allowance, s = d.cycleStats
  const anchorClass = a.remainingAllowance < 0 ? 'bad' : a.remainingAllowance === 0 ? 'warn' : ''
  const intents = Object.entries(d.cycleStats.intentTotals)
    .map(([k, v]) => ({ name: INTENT_LABELS[k] || k, amount: v }))
    .filter((r) => r.amount > 0)
    .sort((x, y) => y.amount - x.amount)

  const commitments = d.commitments.length
    ? d.commitments.map((c) => \`
      <div class="row">
        <span class="name">\${esc(c.name)}
          <span class="pill">tgl \${c.dueDay}</span></span>
        <span class="amt \${c.paid ? 'good' : 'muted'}">\${rp(c.amount)}
          \${c.paid ? '✓' : ''}</span>
      </div>\`).join('')
    : '<div class="empty">Belum ada tagihan rutin. Catat lewat chat: <b>wifi 85k tiap tanggal 5</b>.</div>'

  const reserves = d.balance.reserve.length
    ? d.balance.reserve.map((r) => \`
      <div class="row"><span class="name">\${esc(r.name)}</span>
      <span class="amt">\${rp(r.balance)}</span></div>\`).join('')
    : '<div class="empty">Belum ada tabungan. Coba kirim <b>nabung 150k</b> di chat.</div>'

  document.getElementById('app').innerHTML = \`
    <h1>Halo\${d.user.firstName ? ', ' + esc(d.user.firstName) : ''}</h1>
    <p class="sub">Siklus \${d.cycle.start} → \${d.cycle.end} · sisa \${d.cycle.daysRemaining} hari</p>

    <div class="card anchor">
      <div class="of">Sisa jatah hari ini</div>
      <div class="big \${anchorClass}">\${rp(a.remainingAllowance)}</div>
      <div class="of">dari \${rp(a.allowanceToday)} · kepakai \${rp(a.spentToday)}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Masuk</div>
        <div class="value good">\${rp(s.totalIn)}</div></div>
      <div class="card"><div class="label">Keluar</div>
        <div class="value bad">\${rp(s.totalOut)}</div></div>
      <div class="card"><div class="label">Saving rate</div>
        <div class="value">\${pct(s.savingRate)}</div></div>
    </div>

    <div class="card">
      <h2>28 hari terakhir</h2>
      \${sparkline(d.last28.daily, d.last28.averageDailyOut)}
      <div class="row" style="border:0">
        <span class="muted">Rata-rata / hari</span>
        <span class="amt">\${rp(d.last28.averageDailyOut)}</span>
      </div>
      <div class="row"><span class="muted">Total keluar</span>
        <span class="amt">\${rp(d.last28.totalOut)}</span></div>
    </div>

    <div class="card">
      <h2>Ke mana perginya</h2>
      \${barRows(s.byCategory, s.totalOut)}
    </div>

    <div class="card">
      <h2>Kenapa dibeli · impulsif \${pct(s.impulseRatio)}</h2>
      \${barRows(intents, s.totalOut)}
    </div>

    <div class="card">
      <h2>Tagihan rutin</h2>
      \${commitments}
    </div>

    <div class="card">
      <h2>Tabungan · \${rp(d.balance.reserveTotal)}</h2>
      \${reserves}
      <div class="row"><span class="muted">Saldo jajan</span>
        <span class="amt">\${rp(d.balance.spendable)}</span></div>
    </div>\`
  document.getElementById('app').hidden = false
}

async function load() {
  if (!tg || !tg.initData) {
    fail('Buka lewat tombol di bot Telegram — halaman ini butuh tanda tangan dari Telegram.')
    return
  }
  try {
    // Absolute, not relative. The page is served at /app with no trailing
    // slash, so a relative 'api/summary' resolves to /api/summary and 404s.
    const res = await fetch('/app/api/summary', {
      headers: { 'x-telegram-init-data': tg.initData },
    })
    if (res.status === 401 || res.status === 403) {
      fail('Nggak punya akses. Dashboard ini cuma buat pemilik bot.')
      return
    }
    if (!res.ok) { fail('Gagal ambil data (' + res.status + ').'); return }
    render(await res.json())
  } catch (err) {
    fail('Gagal ambil data: ' + err.message)
  }
}
load()
</script>
</body>
</html>`
