// Token Radar's dashboard (radar-3). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the early movers, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan, the comparables the model is priced from,
// the protocols set aside with their reasons, and a model sandbox that re-ranks the board
// live. No network: every byte it shows is in data.js.
//
// The page mirrors lib/model.ts exactly: impliedOf is the radar-3 formula (category multiple
// from the snapshot's trading protocols, then growth, momentum, maturity, patience), rangeOf is
// its P10-P90 from the same comparables' spread, and farmSteps is the same nine-step
// derivation, so the numbers the page shows and the numbers board.json carries are the same
// arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', chain: 'all', category: 'all', tab: 'pre-token', view: 'all',
    sort: 'implied', dir: -1, selected: null,
    compScale: 1, growthW: DATA.model.growth_weight
  };
  var SHOW = 60;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined || !isFinite(n) ? 'n/a' : n.toFixed(3) + 'x'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // The comparables, as lib/model.ts derives them: the category's median market-cap-to-TVL
  // ratio when at least five trading protocols back it, else the global median.
  function compsFor(category) {
    var list = DATA.comps.categories || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].category === (category || 'Other') && list[i].used) {
        return { multiple: list[i].median, p10: list[i].p10, p90: list[i].p90, source: 'category', n: list[i].n };
      }
    }
    var g = DATA.comps.global;
    return { multiple: g.median, p10: g.p10, p90: g.p90, source: 'global', n: g.n };
  }

  // radar-3, as lib/model.ts scores it: TVL x category multiple x growth x momentum x maturity x patience.
  function impliedOf(row, model, scale) {
    var m = model || DATA.model;
    var s = scale === undefined ? 1 : scale;
    var c = compsFor(row.category);
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var raw = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var momentum = raw >= m.momentum_up ? m.momentum_mult : raw <= m.momentum_down ? 2 - m.momentum_mult : 1;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var patience = age >= m.patience_age_days && row.tvl_usd >= DATA.floor_usd ? m.patience_mult : 1;
    return Math.max(1, Math.round(row.tvl_usd * c.multiple * s * growthMult * momentum * maturity * patience));
  }
  // The P10-P90 range from the same comparables' own spread, as lib/model.ts writes it.
  function rangeOf(row, implied) {
    var c = compsFor(row.category);
    var p10 = Math.max(1, Math.min(implied, Math.round((implied * c.p10) / c.multiple)));
    var p90 = Math.max(implied, Math.round((implied * c.p90) / c.multiple));
    return { p10: p10, p90: p90 };
  }

  // The sandbox model: the two sliders a reader may move, everything else as scored.
  function sandboxModel() {
    var m = {};
    for (var k in DATA.model) m[k] = DATA.model[k];
    m.growth_weight = state.growthW;
    return m;
  }
  function sandboxChanged() {
    return state.compScale !== 1 || state.growthW !== DATA.model.growth_weight;
  }
  // Rows with the sandbox's implied values and ranks, strongest first.
  function rankedRows() {
    var m = sandboxModel();
    var list = DATA.rows.map(function (r) {
      var implied = impliedOf(r, m, state.compScale);
      var range = rangeOf(r, implied);
      return { row: r, implied: implied, p10: range.p10, p90: range.p90 };
    });
    list.sort(function (a, b) { return b.implied - a.implied || (a.row.slug < b.row.slug ? -1 : 1); });
    list.forEach(function (x, i) { x.rank = i + 1; });
    return list;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('options') >= 0) return 'Buy one $' + capital + ' options position on ' + name + ' on ' + chain + ' and hold it to expiry.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s main farm on " + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var half = Math.max(25, Math.floor(capital / 2));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + half + ' of USDC against the supply on ' + name + ' and repay it within a week, so the wallet shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + half + " through " + name + "'s main pool on " + chain + ' and add the receipt to the farm log.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + half + ' back the other way through ' + name + ' so the wallet shows a round trip.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Vote or delegate with the staked receipt on ' + name + ' if it opens a vote.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one a week later.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + name + ' and place a second, smaller position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Move $' + half + ' between two ' + name + ' vaults on ' + chain + ' to show active allocation.';
    if (c.indexOf('stable') >= 0) return 'Swap $' + half + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Redeem $' + half + ' of the yield asset and re-mint it to show a full cycle.';
    if (c.indexOf('insurance') >= 0) return 'Open the claim page on ' + name + ' and check what a claim needs, without filing a false claim.';
    return 'Do one swap through ' + name + ' on ' + chain + ' for $' + half + ' so the wallet shows a second action type.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var spread = secondChain !== null
      ? 'Repeat a smaller position of $' + Math.max(25, Math.floor(capital / 2)) + ' on ' + secondChain + ' so the wallet shows activity on two chains.'
      : 'Add one second action type, such as a swap or a borrow, so the wallet shows more than one kind of activity.';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: spread, cost: 'about $' + (secondChain !== null ? Math.max(25, Math.floor(capital / 2)) : 10) + ' of capital and $2 of gas', time: '10 minutes' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.max(25, Math.floor(capital / 2)) + ' of capital and $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Check " + p.name + "'s points or rewards page each week and write the points balance in the farm log; if the protocol publishes eligibility rules, match each one before the snapshot.", cost: 'no fee to check', time: '10 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('view')) state.view = params.get('view');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.view !== 'all') params.set('view', state.view);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var ranked = rankedRows();
    var q = state.q.trim().toLowerCase();
    return ranked.filter(function (x) {
      var r = x.row;
      if (state.view === 'watchlist' && !r.watchlist) return false;
      if (state.view === 'early' && r.watchlist) return false;
      if (state.view === 'movers' && !(r.age_days !== null && r.age_days <= 365 && (r.change_7d || 0) > 0)) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var ra = a.row, rb = b.row, av, bv;
      if (key === 'name') { av = ra.name.toLowerCase(); bv = rb.name.toLowerCase(); }
      else if (key === 'tvl') { av = ra.tvl_usd; bv = rb.tvl_usd; }
      else if (key === 'growth') { av = ra.change_7d === null ? -Infinity : ra.change_7d; bv = rb.change_7d === null ? -Infinity : rb.change_7d; }
      else if (key === 'age') { av = ra.age_days === null ? Infinity : ra.age_days; bv = rb.age_days === null ? Infinity : rb.age_days; }
      else { av = a.implied; bv = b.implied; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return ra.slug < rb.slug ? -1 : ra.slug > rb.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The radar audits all ' + DATA.audited_size + ' pre-token protocols in the snapshot: ' + DATA.board_size + ' are ranked here, and ' + DATA.set_aside_size + ' are set aside below with the reason -- a wrapped, staked or bridged product of a token that already trades, an exchange, or a versioned pool. WBTC is Bitcoin on Ethereum, not a launch waiting to happen. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token protocols audited' }), el('b', { text: String(DATA.audited_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function strip(title, items, valueFn) {
    if (!items || items.length === 0) return null;
    return el('section', { class: 'strip' },
      el('h2', { text: title }),
      el('div', { class: 'cards' }, items.slice(0, 4).map(function (r) {
        return el('button', { type: 'button', class: 'card', onclick: function () { openDetail(r.slug); } },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + fmtAge(r.age_days) + ' old' }),
          el('span', { class: 'val', text: valueFn(r) })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var sortSel = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      ['implied', 'tvl', 'growth', 'age', 'name'].map(function (k) {
        return el('option', { value: k, text: { implied: 'Implied value', tvl: 'TVL', growth: '7d growth', age: 'Age', name: 'Name' }[k], selected: k === state.sort ? 'selected' : null });
      })
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    function viewBtn(view, label) {
      return el('button', { type: 'button', 'aria-pressed': state.view === view ? 'true' : 'false', text: label, onclick: function () { state.view = view; writeHash(); render(); } });
    }
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var shown = state.tab === 'pre-token' ? filteredRows().length + ' rows match' : DATA.live.length + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort by' }), sortSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, viewBtn('all', 'All'), viewBtn('watchlist', 'Watchlist'), viewBtn('early', 'Early'), viewBtn('movers', 'Movers'))),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: shown })
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.view = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied || 1;
    var shown = list.slice(0, SHOW);
    var tbody = el('tbody');
    shown.forEach(function (x) {
      var r = x.row;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(x.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, document.createTextNode(r.name), r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((x.implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(x.implied) }),
          el('span', { class: 'range', text: 'P10-P90 ' + fmtUsd(x.p10) + ' - ' + fmtUsd(x.p90) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    var note = 'Pre-token protocols, strongest implied value first. Each row shows its P10-P90 range from the comparables. Select a row for its model and farm plan.' +
      (list.length > SHOW ? ' Showing the first ' + SHOW + ' of ' + list.length + ' matching rows.' : '') +
      (sandboxChanged() ? ' Re-ranked by your sandbox model.' : '');
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: note }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Rank' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Age' }),
            el('th', { scope: 'col', text: 'Implied value' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and they are the comparables the model is priced from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var g = DATA.comps.global;
    var bt = DATA.comps.backtest;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x momentum x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x patience )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the median market-cap-to-TVL ratio of the protocols in that category whose token already trades, when at least ' + m.comps_min_n + ' of them back it; otherwise the global median of ' + g.median.toFixed(3) + 'x over ' + g.n + ' trading protocols. Momentum is ' + m.momentum_mult + ' when seven-day growth is at least +' + m.momentum_up + '%, ' + (2 - m.momentum_mult).toFixed(2) + ' when it is at most ' + m.momentum_down + '%, else 1. Patience is ' + m.patience_mult + ' for a protocol at least ' + m.patience_age_days + ' days old with TVL at or above the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor, else 1. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('p', { class: 'sub', text: 'P10-P90: the same comparables give the range. A row priced from its category uses that category\u2019s 10th and 90th percentile ratios; a row on the global median uses the global P10 of ' + g.p10.toFixed(3) + 'x and P90 of ' + g.p90.toFixed(3) + 'x. The range is wide because the market\u2019s own dispersion is wide' + (bt === null ? '.' : ': the blind test below predicts a trading protocol\u2019s market cap with a median error of ' + bt.median_abs_pct_error + '% across ' + bt.n + ' protocols.') + ' The board says a protocol records no token, never that it has none.' })
    );
  }

  function compsPanel() {
    var g = DATA.comps.global;
    var bt = DATA.comps.backtest;
    var tbody = el('tbody');
    DATA.comps.categories.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: fmtMult(c.median) }),
        el('td', { class: 'num', text: fmtMult(c.p10) }),
        el('td', { class: 'num', text: fmtMult(c.p90) }),
        el('td', { class: c.used ? 'used' : 'unused', text: c.used ? 'category multiple' : 'global median' })
      ));
    });
    return el('section', { class: 'panel comps' },
      el('h2', { text: 'Comparables: what the market already pays' }),
      el('p', { class: 'sub', text: 'Every multiple above is the median market-cap-to-TVL ratio of the trading protocols in that category, read from this snapshot. A category with fewer than ' + DATA.model.comps_min_n + ' trading protocols falls back to the global median of ' + fmtMult(g.median) + ' over ' + g.n + ' protocols (P10 ' + fmtMult(g.p10) + ', P90 ' + fmtMult(g.p90) + ').' }),
      el('p', { class: 'sub', text: bt === null ? 'Blind test: no category had enough trading protocols to test against.' : 'Blind test: leaving each trading protocol out in turn and predicting its market cap from the rest of its category, the median absolute error is ' + bt.median_abs_pct_error + '% across ' + bt.n + ' protocols. The model is rough, and the P10-P90 ranges say so on every row.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Market cap divided by TVL, per category. The multiple a row uses is the one in its own category when the category is backed by five or more trading protocols.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Comps' }),
            el('th', { scope: 'col', text: 'Median' }),
            el('th', { scope: 'col', text: 'P10' }),
            el('th', { scope: 'col', text: 'P90' }),
            el('th', { scope: 'col', text: 'Multiple used' })
          )),
          tbody
        )
      )
    );
  }

  function setAsidePanel() {
    var tbody = el('tbody');
    DATA.set_aside.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { text: r.reason })
      ));
    });
    return el('section', { class: 'panel setaside' },
      el('h2', { text: 'Set aside: audited, not ranked' }),
      el('p', { class: 'sub', text: DATA.set_aside_size + ' pre-token protocols were audited and set aside instead of ranked. They record no token, but they are not launch candidates: a bridge moves a token that already trades, an exchange is a company, and a wrapped product is a token that already exists under another name. Ranking them would put WBTC at the top of a launch board, which would be wrong.' }),
      el('div', { class: 'table-wrap scroll' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Every pre-token protocol the board does not rank, with the reason from the snapshot\u2019s own fields.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: 'Age' }),
            el('th', { scope: 'col', text: 'Why it is set aside' })
          )),
          tbody
        )
      )
    );
  }

  function sandboxPanel() {
    var m = DATA.model;
    function slider(id, label, min, max, step, value, oninput) {
      var out = el('output', { for: id, text: String(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value) });
      // 'change' fires when the slider is released: re-rendering on every 'input' would rebuild
      // the slider under the reader's pointer.
      input.addEventListener('change', function () { out.textContent = input.value; oninput(parseFloat(input.value)); });
      return el('div', null, el('label', { for: id }, label + ' ', out), input);
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset model', onclick: function () { state.compScale = 1; state.growthW = m.growth_weight; render(); } });
    return el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Move a slider and the board re-ranks with your numbers, using the same formula. The submitted board keeps the house model.' }),
      el('div', { class: 'sliders' },
        slider('sb-comp', 'Comparables scale (category multiple x)', 0.25, 2, 0.05, state.compScale, function (v) { state.compScale = v; render(); }),
        slider('sb-growth', 'Growth weight', 0, 1.5, 0.05, state.growthW, function (v) { state.growthW = v; render(); }),
        reset
      ),
      el('p', { class: 'sandbox-note', text: sandboxChanged() ? 'Showing your sandbox ranking. Reset to return to the submitted board.' : 'Sliders at the submitted model.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var found = rankedRows().filter(function (x) { return x.row.slug === slug; })[0];
    if (!found) return;
    var row = found.row;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var check = impliedOf(row, DATA.model, 1);
    var c = compsFor(row.category);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + found.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : ' · Early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) + ' (' + row.multiple_source + ', ' + row.comps_n + ' comps)' })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Momentum multiplier' }), el('b', { class: 'num', text: String(row.momentum_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Patience multiplier' }), el('b', { class: 'num', text: String(row.patience_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(found.implied) })),
        el('div', null, el('span', { text: 'P10-P90 range' }), el('b', { class: 'num', text: fmtUsd(found.p10) + ' - ' + fmtUsd(found.p90) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The range comes from the ' + c.source + ' comparables\u2019 own spread (P10 ' + fmtMult(c.p10) + ', P90 ' + fmtMult(c.p90) + '). This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') {
      shell.appendChild(strip('Early movers — young and growing fast', DATA.movers, function (r) { return fmtPct(r.change_7d) + ' in 7d · ' + fmtUsd(r.implied_value_usd) + ' implied'; }));
      shell.appendChild(strip('New listings — listed in the last 90 days', DATA.fresh, function (r) { return fmtAge(r.age_days) + ' old · ' + fmtUsd(r.tvl_usd) + ' TVL'; }));
    }
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(compsPanel());
      shell.appendChild(setAsidePanel());
      shell.appendChild(sandboxPanel());
    }
    shell.appendChild(el('p', { class: 'foot', text: 'Source: ' + DATA.source + '. The snapshot is frozen: it does not move and is not updated. A protocol on this board records no token; that is DefiLlama\u2019s record, not proof it has none. Implied values are this radar\u2019s own estimates.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
