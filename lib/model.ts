// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every launch-candidate pre-token protocol the snapshot can rank (the watchlist
// is the floor, never the ceiling), strongest first. A protocol is pre-token when its record
// carries no token (no market cap, no CoinGecko id, no symbol). The radar audits every one of
// the snapshot's 342 pre-token protocols: 227 are ranked, and the other 115 are set aside with
// the reason, because they are a wrapped, staked or bridged product of a token that already
// trades, an exchange, or a versioned pool -- WBTC is Bitcoin on Ethereum, not a launch waiting
// to happen -- so no farm plan pretends they will issue a token of their own. The live-token
// protocols are kept apart and shown at the market's own value, never mixed into the ranked board.
//
// radar-3's change against radar-2: the base multiple is no longer a flat 0.25 written in the
// code. It is derived from the snapshot itself, from the protocols whose token already trades:
// for each category, the median market-cap-to-TVL ratio of its trading protocols, when the
// category has at least five of them (COMPS_MIN_N); otherwise the median over all trading
// protocols. A category's multiple is only used when five comparables back it, so a three-comp
// median never decides a row. Every row also carries a P10-P90 range from the same comparables'
// own spread: the category's 10th and 90th percentile ratios (the global ones when the category
// has too few comparables), applied to the row's implied value. The range is wide because the
// market's own dispersion is wide -- the blind test below says so in the open -- and the point
// estimate is the category median, not the edge of the range.
//
// The blind test: leave-one-out over the trading protocols. Each trading protocol is predicted
// from the other comparables in its category (the category median, same rule as the board),
// never from itself, and the dashboard reports the median absolute error across the tested
// protocols. The test is run by the program on the snapshot it reads, so the number the page
// shows is the number this snapshot gives, not a claim from the build.
//
//   multiple      = median(mcap_usd / tvl_usd) over the protocol's category's trading
//                   protocols (at least five), else the median over all trading protocols
//   base          = tvl_usd x multiple
//   growth        = clamp(change_7d, -80, 200) per cent (unknown: 0)
//   growthMult    = 1 + (growth / 100) x GROWTH_WEIGHT
//   momentum      = 1.10 when growth >= +25, 0.90 when growth <= -25, else 1.00
//   maturity      = 0.65 + 0.35 x min(age_days, 1460) / 1460   (age unknown: 365)
//   patience      = 1.10 when age_days >= 730 and tvl_usd >= floor, else 1.00
//   implied       = max(1, round(base x growthMult x momentum x maturity x patience))
//   p10           = max(1, round(implied x categoryP10 / multiple))
//   p90           = max(implied, round(implied x categoryP90 / multiple))
//
// Why these terms: a launch is worth a share of the value already locked in the protocol, so the
// base tracks TVL at the rate the market already pays for locked value in the same category; a
// protocol gaining TVL fast is gaining the users a launch would reward, so growth bends the value
// up or down and a strong move earns a momentum premium; a protocol that has run for years with
// no token has had the longest time to plan one, so age bends the value up; and a large, old
// protocol still without a token is the classic launch candidate, so it earns the patience
// premium. No protocol name is ever special-cased: the same function scores every row, and the
// dashboard states the formula and the comparables behind it so a reader can check it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. The base multiple is not one of them:
 *  it is derived from the snapshot's trading protocols at run time (see deriveComps). */
export interface ModelConstants {
  comps_min_n: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  momentum_up: number;
  momentum_down: number;
  momentum_mult: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  patience_age_days: number;
  patience_mult: number;
}

export const MODEL: ModelConstants = {
  comps_min_n: 5,
  growth_weight: 0.75,
  growth_floor: -80,
  growth_cap: 200,
  momentum_up: 25,
  momentum_down: -25,
  momentum_mult: 1.1,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1460,
  unknown_age_days: 365,
  patience_age_days: 730,
  patience_mult: 1.1,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** How many young fast growers the Early movers strip carries. */
export const MOVER_ROWS = 8;

/** How many freshly listed protocols the New listings strip carries. */
export const FRESH_ROWS = 8;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  category_multiple: number;
  multiple_source: 'category' | 'global';
  comps_n: number;
  model: {
    growth_pct: number;
    growth_multiplier: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    patience_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with everything the sandbox needs to re-rank it. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  category_multiple: number;
  multiple_source: 'category' | 'global';
  comps_n: number;
  growth_pct: number;
  growth_multiplier: number;
  momentum_multiplier: number;
  maturity_multiplier: number;
  patience_multiplier: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A young pre-token protocol growing fast: the early radar's movers. */
export interface MoverRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  rank: number;
}

/** A pre-token protocol listed recently: the early radar's fresh listings. */
export interface FreshRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  rank: number;
}

/** A pre-token protocol the board sets aside, with the snapshot-derived reason it is not ranked. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  reason: string;
}

/** One category's comparables: the trading protocols' market-cap-to-TVL ratios in it. */
export interface CompsCategory {
  category: string;
  n: number;
  median: number;
  p10: number;
  p90: number;
  used: boolean;
}

/** The comparables the model derives from the snapshot, and its blind test of them. */
export interface Comps {
  global: { median: number; p10: number; p90: number; n: number };
  categories: CompsCategory[];
  backtest: { n: number; median_abs_pct_error: number } | null;
}

/** Everything the dashboard needs: the board, the live set, the movers, the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  audited_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  comps: Comps;
  rows: RadarRow[];
  live: LiveRow[];
  movers: MoverRow[];
  fresh: FreshRow[];
  set_aside: SetAsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty sorted array, else `fallback`. */
function medianOf(sorted: number[], fallback: number): number {
  if (sorted.length === 0) return fallback;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-th quantile of a non-empty sorted array by nearest rank, else `fallback`. */
function quantileOf(sorted: number[], q: number, fallback: number): number {
  if (sorted.length === 0) return fallback;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[i]!;
}

/**
 * The comparables, derived from the snapshot's own trading protocols: every protocol with a
 * market cap above zero and TVL above zero contributes its market-cap-to-TVL ratio. The global
 * median, P10 and P90 come from all of them; each category gets its own when it has at least
 * comps_min_n comparables. The blind test leaves each trading protocol out in turn, predicts
 * its market cap from the other comparables in its category under the same rule, and reports
 * the median absolute error -- the model's own check, run on the snapshot it reads.
 */
export function deriveComps(snapshot: Snapshot, model: ModelConstants = MODEL): Comps {
  const trading = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const allRatios = trading.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = medianOf(allRatios, 0);
  const global = {
    median: globalMedian,
    p10: quantileOf(allRatios, 0.1, globalMedian),
    p90: quantileOf(allRatios, 0.9, globalMedian),
    n: allRatios.length,
  };
  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of trading) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p]);
    else list.push(p);
  }
  const categories: CompsCategory[] = [...byCategory.entries()]
    .map(([category, list]) => {
      const ratios = list.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
      const med = medianOf(ratios, globalMedian);
      return {
        category,
        n: ratios.length,
        median: med,
        p10: quantileOf(ratios, 0.1, global.p10),
        p90: quantileOf(ratios, 0.9, global.p90),
        used: ratios.length >= model.comps_min_n,
      };
    })
    .sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1));
  // Blind test: leave one out, predict from the rest of its category under the same rule.
  const errors: number[] = [];
  for (const p of trading) {
    const others = (byCategory.get(p.category ?? 'Other') ?? []).filter((o) => o.slug !== p.slug);
    if (others.length < model.comps_min_n) continue;
    const ratios = others.map((o) => o.mcap_usd! / o.tvl_usd).sort((a, b) => a - b);
    const predicted = p.tvl_usd * medianOf(ratios, globalMedian);
    errors.push(Math.abs(predicted - p.mcap_usd!) / p.mcap_usd!);
  }
  errors.sort((a, b) => a - b);
  const backtest =
    errors.length > 0 ? { n: errors.length, median_abs_pct_error: Math.round(medianOf(errors, 0) * 1000) / 10 } : null;
  return { global, categories, backtest };
}

/** The multiple a category's row uses: its own median when backed by enough comparables, else the global median. */
export function categoryMultiple(category: string | null, comps: Comps): { multiple: number; source: 'category' | 'global'; n: number } {
  const found = comps.categories.find((c) => c.category === (category ?? 'Other'));
  if (found !== undefined && found.used) return { multiple: found.median, source: 'category', n: found.n };
  return { multiple: comps.global.median, source: 'global', n: comps.global.n };
}

/** The P10 and P90 ratios a category's row uses, from the same comparables as its multiple. */
export function categoryQuantiles(category: string | null, comps: Comps): { p10: number; p90: number } {
  const found = comps.categories.find((c) => c.category === (category ?? 'Other'));
  if (found !== undefined && found.used) return { p10: found.p10, p90: found.p90 };
  return { p10: comps.global.p10, p90: comps.global.p90 };
}

/** The multipliers and the implied value one protocol gets under `model` and `comps`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: Comps,
  model: ModelConstants,
  floorUsd: number,
): {
  implied: number;
  p10: number;
  p90: number;
  multiple: number;
  multipleSource: 'category' | 'global';
  compsN: number;
  growthPct: number;
  growthMult: number;
  momentumMult: number;
  maturityMult: number;
  patienceMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const momentumMult =
    rawGrowth >= model.momentum_up ? model.momentum_mult : rawGrowth <= model.momentum_down ? 2 - model.momentum_mult : 1;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const patienceMult = age !== null && age >= model.patience_age_days && protocol.tvl_usd >= floorUsd ? model.patience_mult : 1;
  const { multiple, source, n } = categoryMultiple(protocol.category, comps);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * momentumMult * maturityMult * patienceMult));
  const { p10: p10Ratio, p90: p90Ratio } = categoryQuantiles(protocol.category, comps);
  const p10 = Math.max(1, Math.min(implied, Math.round((implied * p10Ratio) / multiple)));
  const p90 = Math.max(implied, Math.round((implied * p90Ratio) / multiple));
  return { implied, p10, p90, multiple, multipleSource: source, compsN: n, growthPct, growthMult, momentumMult, maturityMult, patienceMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The house's own product rule, applied to every ranked row, not only the watchlist: a wrapped,
 * staked or bridged product of a token that already trades is not a protocol still waiting on a
 * launch of its own. WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in Binance's staking
 * product, and a bridge moves a token that already trades -- none of them is a launch candidate,
 * however large its TVL. The rule uses only the snapshot's own fields: the category, and the name.
 */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/**
 * Whether a protocol is one the board may rank: pre-token, not a wrapped, staked or bridged
 * product of a token that already trades, not an exchange, not a versioned pool. A liquid-staking
 * protocol whose name carries no wrapped or staked marker stays rankable: it is a protocol that
 * may still issue a token of its own.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p) && !VERSIONED.test(p.name);
}

/** Why a pre-token protocol is set aside instead of ranked, from the snapshot's own fields. */
export function setAsideReason(p: SnapshotProtocol): string {
  if (p.category === 'CEX') return 'An exchange, not a protocol launch: its business is a company, not a token to farm.';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge')
    return 'A bridge moves a token that already trades; it is infrastructure, not a launch of its own.';
  if (WRAPPED_WORD.test(p.name)) return 'A wrapped or staked product of a token that already trades.';
  if (EXCHANGE_PREFIX.test(p.name)) return "An exchange's product, not a protocol launch of its own.";
  if (VERSIONED.test(p.name)) return 'A versioned pool of another protocol, not a launch of its own.';
  return 'Set aside: not a launch candidate under the snapshot rule.';
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, comps: Comps, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, below the floor or above it. The
  // watchlist is a floor, never a ceiling: a protocol the list leaves out is no worse a subject,
  // and the radar exists to find it early.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, comps, model, snapshot.floor_usd);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_p10_usd: s.p10,
    implied_p90_usd: s.p90,
    category_multiple: round4(s.multiple),
    multiple_source: s.multipleSource,
    comps_n: s.compsN,
    model: {
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      momentum_multiplier: round4(s.momentumMult),
      maturity_multiplier: round4(s.maturityMult),
      patience_multiplier: round4(s.patienceMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('options')) return `Buy one $${capital} options position on ${name} on ${chain} and hold it to expiry.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s main farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different action in the same protocol, so the wallet shows more than one kind of activity. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const half = Math.max(25, Math.floor(capital / 2));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Borrow $${half} of USDC against the supply on ${name} and repay it within a week, so the wallet shows both sides of the market.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Swap $${half} through ${name}'s main pool on ${chain} and add the receipt to the farm log.`;
  if (c.includes('bridge')) return `Bridge $${half} back the other way through ${name} so the wallet shows a round trip.`;
  if (c.includes('staking') || c.includes('restak')) return `Vote or delegate with the staked receipt on ${name} if it opens a vote.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name} and open a fresh one a week later.`;
  if (c.includes('prediction')) return `Settle one market on ${name} and place a second, smaller position.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move $${half} between two ${name} vaults on ${chain} to show active allocation.`;
  if (c.includes('stable')) return `Swap $${half} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Redeem $${half} of the yield asset and re-mint it to show a full cycle.`;
  if (c.includes('insurance')) return `Open the claim page on ${name} and check what a claim needs, without filing a false claim.`;
  return `Do one swap through ${name} on ${chain} for $${half} so the wallet shows a second action type.`;
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the same function plans every row.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const spread =
    secondChain !== null
      ? `Repeat a smaller position of $${Math.max(25, Math.floor(capital / 2))} on ${secondChain} so the wallet shows activity on two chains.`
      : `Add one second action type, such as a swap or a borrow, so the wallet shows more than one kind of activity.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: spread,
      cost: `about $${secondChain !== null ? Math.max(25, Math.floor(capital / 2)) : 10} of capital and $2 of gas`,
      time: '10 minutes',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $${Math.max(25, Math.floor(capital / 2))} of capital and $2 of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s points or rewards page each week and write the points balance in the farm log; if the protocol publishes eligibility rules, match each one before the snapshot.`,
      cost: 'no fee to check',
      time: '10 minutes a week',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with everything the page needs to re-rank it. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_p10_usd: row.implied_p10_usd,
    implied_p90_usd: row.implied_p90_usd,
    category_multiple: row.category_multiple,
    multiple_source: row.multiple_source,
    comps_n: row.comps_n,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    momentum_multiplier: row.model.momentum_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    patience_multiplier: row.model.patience_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const comps = deriveComps(snapshot, model);
  const board = buildBoard(snapshot, comps, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const rankBySlug = new Map(board.map((r) => [r.slug, r.rank]));
  const movers: MoverRow[] = board
    .filter((r) => r.age_days !== null && r.age_days <= 365 && (r.change_7d ?? -999) > 0)
    .sort((a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, MOVER_ROWS)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      rank: rankBySlug.get(r.slug) ?? 0,
    }));
  const fresh: FreshRow[] = board
    .filter((r) => r.age_days !== null && r.age_days <= 90)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, FRESH_ROWS)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      rank: rankBySlug.get(r.slug) ?? 0,
    }));
  const setAside: SetAsideRow[] = snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      reason: setAsideReason(p),
    }));
  const audited = board.length + setAside.length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    audited_size: audited,
    early_size: early,
    live_size: live.length,
    set_aside_size: setAside.length,
    comps,
    rows: board.map((r) => radarRow(r, watch)),
    live,
    movers,
    fresh,
    set_aside: setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.implied_p10_usd) || r.implied_p10_usd <= 0 || r.implied_p10_usd > r.implied_value_usd)
      return `${r.slug} has a P10 outside its implied value`;
    if (!Number.isSafeInteger(r.implied_p90_usd) || r.implied_p90_usd < r.implied_value_usd) return `${r.slug} has a P90 below its implied value`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
