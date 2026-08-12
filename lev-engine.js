/**
 * BetLive - Motor propio de mercados L-E-V
 *
 * Genera probabilidades y momios internos a partir de:
 * - datos históricos/estadísticos disponibles
 * - estado actual del partido
 * - distribución de apuestas internas
 *
 * No sustituye la fuente deportiva: API-Football sigue siendo la fuente de eventos,
 * marcador y estadísticas. Este módulo calcula el pricing de BetLive.
 *
 * Uso:
 *   const { generateLEVMarket } = require("./market-engine/lev-engine");
 *
 * IMPORTANTE:
 * Este motor no debe utilizarse para discriminar o personalizar cuotas por jugador.
 * Las cuotas deben ser iguales para todos los usuarios bajo las mismas condiciones.
 */

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalize3(a, b, c) {
  const s = a + b + c;
  if (!(s > 0)) return [1 / 3, 1 / 3, 1 / 3];
  return [a / s, b / s, c / s];
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
}

function outcomeFromExpectedGoals(homeXg, awayXg, maxGoals = 8) {
  let home = 0, draw = 0, away = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, homeXg) * poissonPmf(a, awayXg);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  return normalize3(home, draw, away);
}

/**
 * historical:
 * {
 *   homeStrength: 0..1,
 *   awayStrength: 0..1,
 *   homeForm: 0..1,
 *   awayForm: 0..1,
 *   homeXg: number,
 *   awayXg: number
 * }
 *
 * live:
 * {
 *   minute: number,
 *   homeGoals: number,
 *   awayGoals: number,
 *   homePressure: 0..1,
 *   awayPressure: 0..1
 * }
 *
 * betting:
 * {
 *   homeAmount: number,
 *   drawAmount: number,
 *   awayAmount: number
 * }
 *
 * config:
 * {
 *   margin: 0.06,
 *   historyWeight: 0.35,
 *   formWeight: 0.25,
 *   liveWeight: 0.25,
 *   bettingWeight: 0.15,
 *   minOdds: 1.05,
 *   maxOdds: 25,
 *   maxOddsMove: 0.15
 * }
 */
function generateLEVMarket({ historical = {}, live = {}, betting = {}, config = {} } = {}) {
  const cfg = {
    margin: 0.06,
    historyWeight: 0.35,
    formWeight: 0.25,
    liveWeight: 0.25,
    bettingWeight: 0.15,
    minOdds: 1.05,
    maxOdds: 25,
    maxOddsMove: 0.15,
    ...config
  };

  // Base probabilities from xG when available; otherwise neutral.
  const hxg = safeNum(historical.homeXg, 1.25);
  const axg = safeNum(historical.awayXg, 1.05);
  const base = outcomeFromExpectedGoals(clamp(hxg, 0.05, 5), clamp(axg, 0.05, 5));

  // Historical strength and form are intentionally blended conservatively.
  const hs = safeNum(historical.homeStrength, 0.5);
  const as = safeNum(historical.awayStrength, 0.5);
  const hf = safeNum(historical.homeForm, 0.5);
  const af = safeNum(historical.awayForm, 0.5);

  const strengthEdge = clamp((hs - as) * 0.35, -0.25, 0.25);
  const formEdge = clamp((hf - af) * 0.25, -0.20, 0.20);

  let hist = normalize3(
    0.5 + strengthEdge + formEdge,
    0.30 - Math.abs(strengthEdge + formEdge) * 0.15,
    0.5 - strengthEdge - formEdge
  );

  // Live state: score is the strongest signal; pressure is secondary.
  const minute = clamp(safeNum(live.minute, 0), 0, 120);
  const hg = safeNum(live.homeGoals, 0);
  const ag = safeNum(live.awayGoals, 0);
  const hp = clamp(safeNum(live.homePressure, 0.5), 0, 1);
  const ap = clamp(safeNum(live.awayPressure, 0.5), 0, 1);

  let liveP = base.slice();
  const scoreEdge = clamp((hg - ag) * 0.20, -0.40, 0.40);
  const pressureEdge = clamp((hp - ap) * 0.12, -0.12, 0.12);

  if (minute > 0) {
    liveP = normalize3(
      0.40 + scoreEdge + pressureEdge,
      0.30 - Math.abs(scoreEdge) * 0.20,
      0.30 - scoreEdge - pressureEdge
    );
  }

  // Betting distribution is a small stabilizer, never a direct "who gets paid" switch.
  const ba = Math.max(0, safeNum(betting.homeAmount));
  const bd = Math.max(0, safeNum(betting.drawAmount));
  const bc = Math.max(0, safeNum(betting.awayAmount));
  const totalBet = ba + bd + bc;
  const betP = totalBet > 0
    ? [ba / totalBet, bd / totalBet, bc / totalBet]
    : [1/3, 1/3, 1/3];

  const wSum = cfg.historyWeight + cfg.formWeight + cfg.liveWeight + cfg.bettingWeight;
  const lw = cfg.liveWeight / wSum;
  const bw = cfg.bettingWeight / wSum;
  const hw = (cfg.historyWeight + cfg.formWeight) / wSum;

  let p = normalize3(
    base[0] * hw + liveP[0] * lw + betP[0] * bw,
    base[1] * hw + liveP[1] * lw + betP[1] * bw,
    base[2] * hw + liveP[2] * lw + betP[2] * bw
  );

  // Apply a transparent bookmaker margin equally to the probability mass.
  const withMargin = normalize3(p[0] * (1 + cfg.margin), p[1] * (1 + cfg.margin), p[2] * (1 + cfg.margin));

  const odds = withMargin.map(x => clamp(1 / Math.max(x, 0.0001), cfg.minOdds, cfg.maxOdds));

  return {
    selections: [
      { code: "L", label: "Local", probability: Number(withMargin[0].toFixed(6)), odds: Number(odds[0].toFixed(2)) },
      { code: "E", label: "Empate", probability: Number(withMargin[1].toFixed(6)), odds: Number(odds[1].toFixed(2)) },
      { code: "V", label: "Visitante", probability: Number(withMargin[2].toFixed(6)), odds: Number(odds[2].toFixed(2)) }
    ],
    meta: {
      minute,
      margin: cfg.margin,
      generatedBy: "betlive-internal-engine-v1"
    }
  };
}

module.exports = { generateLEVMarket };
