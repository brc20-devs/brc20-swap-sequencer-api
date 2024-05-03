import _ from "lodash";
import { bnDecimal, bnUint } from "../contract/bn";
import { FuncMsg, OridinalMsg } from "../types/domain";
import {
  AddLiqParams,
  DecreaseApprovalParams,
  DeployPoolParams,
  ExactType,
  FuncArr,
  FuncMap,
  FuncType,
  InscriptionFunc,
  InternalFunc,
  RemoveLiqParams,
  Result,
  SendParams,
  SwapParams,
} from "../types/func";
import {} from "../types/global";
import { CommitOp } from "../types/op";
import { FuncReq } from "../types/route";
import { LP_DECIMAL } from "./constant";
import { getSignMsg } from "./sign";

import {
  getPairStr,
  getPairStruct,
  sortTickParams,
} from "../contract/contract-utils";
import { CodeError, invalid_aggregation } from "./error";
import { checkFuncReq, isLp } from "./utils";

export function convertReq2Map(req: FuncReq): FuncMap {
  checkFuncReq(req);
  const func = req.func;

  if (func == FuncType.addLiq) {
    const { address, slippage, lp, tick0, tick1, amount0, amount1 } = req.req;
    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);

    return {
      func,
      params: {
        address,
        tick0,
        tick1,
        amount0: bnUint(amount0, decimal0),
        amount1: bnUint(amount1, decimal1),
        expect: bnUint(lp, LP_DECIMAL),
        slippage1000: bnUint(slippage, "3"),
      },
    };
  } else if (func == FuncType.swap) {
    const {
      address,
      amountIn,
      amountOut,
      exactType,
      slippage,
      tickIn,
      tickOut,
    } = req.req;
    const decimalIn = decimal.get(tickIn);
    const decimalOut = decimal.get(tickOut);
    let expect: string;
    let amount: string;
    if (exactType == ExactType.exactIn) {
      expect = bnUint(amountOut, decimalOut);
      amount = bnUint(amountIn, decimalIn);
    } else {
      expect = bnUint(amountIn, decimalIn);
      amount = bnUint(amountOut, decimalOut);
    }
    return {
      func,
      params: {
        address,
        tickIn,
        tickOut,
        amount,
        exactType,
        expect,
        slippage1000: bnUint(slippage, "3"),
      },
    };
  } else if (func == FuncType.deployPool) {
    const { address, tick0, tick1 } = req.req;
    return {
      func,
      params: {
        address,
        tick0,
        tick1,
      },
    };
  } else if (func == FuncType.removeLiq) {
    const { address, slippage, tick0, tick1, lp, amount0, amount1 } = req.req;
    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);

    return {
      func,
      params: {
        address,
        tick0,
        tick1,
        lp: bnUint(lp, LP_DECIMAL),
        amount0: bnUint(amount0, decimal0),
        amount1: bnUint(amount1, decimal1),
        slippage1000: bnUint(slippage, "3"),
      },
    };
  } else if (func == FuncType.decreaseApproval) {
    const { address, tick, amount } = req.req;

    return {
      func,
      params: {
        address,
        tick,
        amount: bnUint(amount, decimal.get(tick)),
      },
    };
  } else if (func == FuncType.send) {
    const { address, tick, amount, to } = req.req;

    return {
      func,
      params: {
        address,
        from: address,
        to,
        tick,
        amount: bnUint(amount, decimal.get(tick)),
      },
    };
  }
}

export function convertReq2Arr(req: FuncReq): FuncArr {
  checkFuncReq(req);
  const func = req.func;

  if (func == FuncType.addLiq) {
    const { tick0, tick1, slippage, amount0, amount1, lp } = sortTickParams(
      req.req
    );

    return {
      func,
      // need sort tick0, tick1
      params: [getPairStr(tick0, tick1), amount0, amount1, lp, slippage],
    };
  } else if (func == FuncType.swap) {
    const { amountIn, amountOut, exactType, slippage, tickIn, tickOut } =
      req.req;
    let expect: string;
    let tick: string;
    let amount: string;
    if (exactType == ExactType.exactIn) {
      expect = amountOut;
      tick = tickIn;
      amount = amountIn;
    } else {
      expect = amountIn;
      tick = tickOut;
      amount = amountOut;
    }
    return {
      func,
      params: [
        getPairStr(req.req.tickIn, req.req.tickOut),
        tick,
        amount,
        req.req.exactType,
        expect,
        slippage,
      ],
    };
  } else if (func == FuncType.deployPool) {
    const { tick0, tick1 } = sortTickParams(req.req);
    return {
      func,
      // need sort tick0, tick1
      params: [tick0, tick1],
    };
  } else if (func == FuncType.removeLiq) {
    const { tick0, tick1, slippage, lp, amount0, amount1 } = sortTickParams(
      req.req
    );
    return {
      func,
      // need sort tick0, tick1
      params: [getPairStr(tick0, tick1), lp, amount0, amount1, slippage],
    };
  } else if (func == FuncType.decreaseApproval) {
    const { tick, amount } = req.req;
    return {
      func,
      params: [tick, amount],
    };
  } else if (func == FuncType.send) {
    const { to, tick, amount } = req.req;
    return {
      func,
      params: [to, tick, amount],
    };
  } else {
    throw new CodeError(invalid_aggregation);
  }
}

export function convertFuncInternal2Inscription(
  func: InternalFunc
): InscriptionFunc {
  if (func.func == FuncType.deployPool) {
    const params = sortTickParams(func.params);
    return {
      id: func.id,
      func: func.func,
      params: [params.tick0, params.tick1] as DeployPoolParams,
      addr: params.address,
      ts: func.ts,
      sig: func.sig,
    };
  } else if (func.func == FuncType.addLiq) {
    const params = sortTickParams(func.params);
    return {
      id: func.id,
      func: func.func,
      params: [
        getPairStr(params.tick0, params.tick1),
        bnDecimal(params.amount0, decimal.get(params.tick0)),
        bnDecimal(params.amount1, decimal.get(params.tick1)),
        bnDecimal(params.expect, LP_DECIMAL),
        bnDecimal(params.slippage1000, "3"),
      ] as AddLiqParams,
      addr: params.address,
      ts: func.ts,
      sig: func.sig,
    };
  } else if (func.func == FuncType.swap) {
    const params = func.params;
    const expectDecimal =
      params.exactType == ExactType.exactIn
        ? decimal.get(params.tickOut)
        : decimal.get(params.tickIn);
    const tick =
      params.exactType == ExactType.exactIn ? params.tickIn : params.tickOut;
    return {
      id: func.id,
      func: func.func,
      params: [
        getPairStr(params.tickIn, params.tickOut),
        tick,
        bnDecimal(params.amount, decimal.get(tick)),
        params.exactType,
        bnDecimal(params.expect, expectDecimal),
        bnDecimal(params.slippage1000, "3"),
      ] as SwapParams,
      addr: params.address,
      ts: func.ts,
      sig: func.sig,
    };
  } else if (func.func == FuncType.removeLiq) {
    const params = sortTickParams(func.params);
    return {
      id: func.id,
      func: func.func,
      params: [
        getPairStr(params.tick0, params.tick1),
        bnDecimal(params.lp, LP_DECIMAL),
        bnDecimal(params.amount0, decimal.get(params.tick0)),
        bnDecimal(params.amount1, decimal.get(params.tick1)),
        bnDecimal(params.slippage1000, "3"),
      ] as RemoveLiqParams,
      addr: params.address,
      ts: func.ts,
      sig: func.sig,
    };
  } else if (func.func == FuncType.decreaseApproval) {
    const params = func.params;
    return {
      id: func.id,
      func: func.func,
      params: [
        params.tick,
        bnDecimal(params.amount, decimal.get(params.tick)),
      ] as DecreaseApprovalParams,
      addr: params.address,
      ts: func.ts,
      sig: func.sig,
    };
  } else if (func.func == FuncType.send) {
    const params = func.params;
    return {
      id: func.id,
      func: func.func,
      params: [
        params.to,
        params.tick,
        bnDecimal(params.amount, decimal.get(params.tick)),
      ] as SendParams,
      addr: params.from,
      ts: func.ts,
      sig: func.sig,
    };
  }
}

export function convertFuncInscription2Internal(
  index: number,
  op: CommitOp
): InternalFunc {
  const target = op.data[index];
  const address = target.addr;

  const datas: OridinalMsg[] = [];
  let lastData: OridinalMsg;
  let lastFunc: FuncMsg;
  for (let i = 0; i <= index; i++) {
    lastFunc = op.data[i];
    if (lastFunc.addr == address) {
      lastData = {
        module: op.module,
        parent: op.parent,
        quit: op.quit,
        gas_price: op.gas_price,
        addr: lastFunc.addr,
        func: lastFunc.func,
        params: lastFunc.params,
        ts: lastFunc.ts,
      };
      datas.push(lastData);
    }
  }
  const { id, prevs } = getSignMsg(datas);

  if (lastFunc.func == FuncType.deployPool) {
    const params = lastFunc.params as DeployPoolParams;

    return {
      id,
      func: lastFunc.func,
      params: {
        address: lastFunc.addr,
        tick0: params[0],
        tick1: params[1],
      },
      prevs,
      ts: lastFunc.ts,
      sig: lastFunc.sig,
    };
  } else if (lastFunc.func == FuncType.addLiq) {
    const params = lastFunc.params as AddLiqParams;
    const pair = getPairStruct(params[0]);
    const decimal0 = decimal.get(pair.tick0);
    const decimal1 = decimal.get(pair.tick1);
    return {
      id,
      func: lastFunc.func,
      params: {
        address: lastFunc.addr,
        tick0: pair.tick0,
        tick1: pair.tick1,
        amount0: bnUint(params[1], decimal0),
        amount1: bnUint(params[2], decimal1),
        expect: bnUint(params[3], LP_DECIMAL),
        slippage1000: bnUint(params[4], "3"),
      },
      prevs,
      ts: lastFunc.ts,
      sig: lastFunc.sig,
    };
  } else if (lastFunc.func == FuncType.swap) {
    const params = lastFunc.params as SwapParams;
    const pair = getPairStruct(params[0]);
    const decimal0 = decimal.get(pair.tick0);
    const decimal1 = decimal.get(pair.tick1);
    const expectDecimal = params[1] == pair.tick0 ? decimal1 : decimal0;
    const exactType = params[3] as ExactType;
    const tick = params[1];
    const tickOther = params[1] == pair.tick0 ? pair.tick1 : pair.tick0;
    return {
      id,
      func: lastFunc.func,
      params: {
        address: lastFunc.addr,
        tickIn: exactType == ExactType.exactIn ? tick : tickOther,
        tickOut: exactType == ExactType.exactOut ? tick : tickOther,
        amount: bnUint(params[2], decimal.get(params[1])),
        exactType,
        expect: bnUint(params[4], expectDecimal),
        slippage1000: bnUint(params[5], "3"),
      },
      prevs,
      ts: lastFunc.ts,
      sig: lastFunc.sig,
    };
  } else if (lastFunc.func == FuncType.removeLiq) {
    const params = lastFunc.params as RemoveLiqParams;
    const pair = getPairStruct(params[0]);
    const decimal0 = decimal.get(pair.tick0);
    const decimal1 = decimal.get(pair.tick1);
    return {
      id,
      func: lastFunc.func,
      params: {
        address: lastFunc.addr,
        tick0: pair.tick0,
        tick1: pair.tick1,
        lp: bnUint(params[1], LP_DECIMAL),
        amount0: bnUint(params[2], decimal0),
        amount1: bnUint(params[3], decimal1),
        slippage1000: bnUint(params[4], "3"),
      },
      prevs,
      ts: lastFunc.ts,
      sig: lastFunc.sig,
    };
  } else if (lastFunc.func == FuncType.decreaseApproval) {
    const params = lastFunc.params as DecreaseApprovalParams;
    const tick = params[0];
    const amount = params[1];
    return {
      id,
      func: lastFunc.func,
      params: {
        address: lastFunc.addr,
        tick,
        amount: bnUint(amount, decimal.get(tick)),
      },
      prevs,
      ts: lastFunc.ts,
      sig: lastFunc.sig,
    };
  } else if (lastFunc.func == FuncType.send) {
    const params = lastFunc.params as SendParams;
    const tick = params[1];
    const amount = params[2];
    return {
      id,
      func: lastFunc.func,
      params: {
        address: lastFunc.addr,
        from: lastFunc.addr,
        to: params[0],
        tick,
        amount: bnUint(amount, decimal.get(tick)),
      },
      prevs,
      ts: lastFunc.ts,
      sig: lastFunc.sig,
    };
  }
}

export function convertResultToDecimal(result: Result) {
  const ret = _.cloneDeep(result);
  if (ret.users) {
    for (let i = 0; i < ret.users.length; i++) {
      if (isLp(ret.users[i].tick)) {
        ret.users[i].balance = bnDecimal(ret.users[i].balance, LP_DECIMAL);
      } else {
        ret.users[i].balance = bnDecimal(
          ret.users[i].balance,
          decimal.get(ret.users[i].tick)
        );
      }
    }
  }
  if (ret.pools) {
    for (let i = 0; i < ret.pools.length; i++) {
      const { tick0, tick1 } = getPairStruct(ret.pools[i].pair);
      ret.pools[i].reserve0 = bnDecimal(
        ret.pools[i].reserve0,
        decimal.get(tick0)
      );
      ret.pools[i].reserve1 = bnDecimal(
        ret.pools[i].reserve1,
        decimal.get(tick1)
      );
      ret.pools[i].lp = bnDecimal(ret.pools[i].lp, LP_DECIMAL);
    }
  }
  return ret;
}
