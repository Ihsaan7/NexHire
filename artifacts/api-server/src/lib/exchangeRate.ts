let cachedRate: number | null = null;
let cacheExpiry = 0;

export async function getUsdToPkr(): Promise<number> {
  const envRate = parseFloat(process.env.USD_TO_PKR || "278");
  if (cachedRate !== null && Date.now() < cacheExpiry) {
    return cachedRate;
  }
  try {
    const resp = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = (await resp.json()) as { rates?: { PKR?: number } };
      if (data.rates?.PKR) {
        cachedRate = data.rates.PKR;
        cacheExpiry = Date.now() + 24 * 60 * 60 * 1000;
        return cachedRate;
      }
    }
  } catch {}
  return envRate;
}

export interface ValueCalc {
  estMonthlyPKR: number | null;
  valueScore: number | null;
  isRecurring: boolean;
}

export function calcValueScore(
  estPayUSD: number | null | undefined,
  payModel: string | undefined,
  difficulty: string | undefined,
  usdToPkr: number,
): ValueCalc {
  const ASSUMED_HOURS = parseInt(process.env.ASSUMED_HOURS_PER_MONTH || "80");
  const effortFactor = difficulty === "medium" ? 1.6 : 1.0;

  if (!estPayUSD) return { estMonthlyPKR: null, valueScore: null, isRecurring: false };

  let estMonthlyPKR: number;
  let isRecurring = true;

  if (payModel === "hourly") {
    estMonthlyPKR = estPayUSD * ASSUMED_HOURS * usdToPkr;
  } else if (payModel === "monthly") {
    estMonthlyPKR = estPayUSD * usdToPkr;
  } else {
    estMonthlyPKR = estPayUSD * usdToPkr;
    isRecurring = false;
  }

  const valueScore = estMonthlyPKR / effortFactor;
  return { estMonthlyPKR, valueScore, isRecurring };
}
