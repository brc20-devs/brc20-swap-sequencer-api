import { Pair } from "../types/domain";
import { bn, bnIsInteger } from "./bn";

/**
 * Sort tick params
 */
export function sortTickParams<T>(_params: T): T {
  const params = _params as any;
  if (!params.tick0 || !params.tick1) {
    return params;
  }
  if (params.tick0 < params.tick1) {
    return params;
  } else {
    const ret = {
      ...params,
      tick0: params.tick1,
      tick1: params.tick0,
      amount0: params.amount1,
      amount1: params.amount0,
    };
    return ret;
  }
}

/**
 * Generate pair string
 * e.g.
 * getPairStr("ordi","sats");
 * > "ordi/sats"
 */
export function getPairStr(tick0: string, tick1: string) {
  const params = sortTickParams({ tick0, tick1 });
  return `${params.tick0}/${params.tick1}`;
}

/**
 * Decode pair string
 * getPairStruct("ordi/sats");
 * > {
 *  tick0: "ordi",
 *  tick1: "sats"
 * }
 */
export function getPairStruct(pair: string): Pair {
  const tick0 = Buffer.from(pair).subarray(0, 4).toString();
  const tick1 = Buffer.from(pair).subarray(5).toString();
  need(sortTickParams({ tick0, tick1 }).tick0 == tick0);
  return { tick0, tick1 };
}

/**
 * An exception will be thrown if the condition is not met.
 */
export function need(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || "server error");
  }
}

export const invalid_amount = "invalid amount";
export const invalid_slippage = "invalid slippage";

export function checkGtZero(amount: string) {
  need(bn(amount).gt("0") && bnIsInteger(amount), invalid_amount);
}

export function checkGteZero(amount: string) {
  need(bn(amount).gte("0") && bnIsInteger(amount), invalid_amount);
}

export function checkSlippage(slippage: string) {
  need(bn(slippage).gte("0"), invalid_slippage);
  need(bn(slippage).lte("1000"), invalid_slippage);
  need(bnIsInteger(slippage), invalid_slippage);
  need(slippage == bn(slippage).toString(), invalid_amount);
}
