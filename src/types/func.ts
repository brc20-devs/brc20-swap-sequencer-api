import { FuncMsg } from "./domain";

export enum ExactType {
  exactIn = "exactIn",
  exactOut = "exactOut",
}

export enum FuncType {
  deployPool = "deployPool",
  addLiq = "addLiq",
  swap = "swap",
  removeLiq = "removeLiq",
  decreaseApproval = "decreaseApproval",
  send = "send",
  sendLp = "sendLp",
}

export type DeployPoolParams = [string /** ordi */, string /** sats */];

export type DeployPoolIn = {
  address: string;
  tick0: string;
  tick1: string;
};

export type DeployPoolOut = {};

export type AddLiqParams =
  | [
      string /** orid/sats */,
      string /** 100 */,
      string /** 200 */,
      string /** 10 */,
      string /** 0.005 */
    ]
  | [
      string /** orid */,
      string /** sats */,
      string /** 100 */,
      string /** 200 */,
      string /** 10 */,
      string /** 0.005 */
    ];

export type AddLiqIn = {
  address: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  expect: string;
  slippage1000: string;
};

export type AddLiqOut = {
  lp: string;
  amount0: string;
  amount1: string;
};

export type RemoveLiqParams =
  | [
      string /** orid/sats */,
      string /** 100 */,
      string /** 1.34 */,
      string /** 12.34 */,
      string /** 0.005 */
    ]
  | [
      string /** orid */,
      string /** sats */,
      string /** 100 */,
      string /** 1.34 */,
      string /** 12.34 */,
      string /** 0.005 */
    ];

export type DecreaseApprovalParams = [string /** orid */, string /** 100 */];

export type RemoveLiqIn = {
  address: string;
  lp: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  slippage1000: string;
};

export type RemoveLiqOut = {
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
};

export type SwapParams =
  | [
      string /** ordi/sats */,
      string /** ordi */,
      string /** 100 */,
      string /** exactIn */,
      string /** 12.34 */,
      string /** 0.005 */
    ]
  | [
      string /** ordi */,
      string /** sats */,
      string /** ordi */,
      string /** 100 */,
      string /** exactIn */,
      string /** 12.34 */,
      string /** 0.005 */
    ];

export type SendParams = [
  string /** address */,
  string /** ordi */,
  string /** 100 */
];

export type SwapIn = {
  address: string;
  tickIn: string;
  tickOut: string;
  amount: string;
  exactType: ExactType;
  expect: string;
  slippage1000: string;
};

export type SwapOut = {
  amount: string;
};

export type MintFeeIn = {
  tick0: string;
  tick1: string;
};

export type AmountInputIn = {
  amountIn: string;
  reserveIn: string;
  reserveOut: string;
};

export type AmountOutputIn = {
  amountOut: string;
  reserveIn: string;
  reserveOut: string;
};

export type SendIn = {
  address: string; // unified field
  from: string;
  to: string;
  tick: string;
  amount: string;
};

export type SendOut = {};

export type DecreaseApprovalIn = {
  address: string;
  tick: string;
  amount: string;
};

export type DecreaseApprovalOut = {};

export type FuncArr =
  | {
      func: FuncType.deployPool;
      params: DeployPoolParams;
    }
  | {
      func: FuncType.addLiq;
      params: AddLiqParams;
    }
  | {
      func: FuncType.swap;
      params: SwapParams;
    }
  | {
      func: FuncType.removeLiq;
      params: RemoveLiqParams;
    }
  | {
      func: FuncType.decreaseApproval;
      params: DecreaseApprovalParams;
    }
  | {
      func: FuncType.send;
      params: SendParams;
    }
  | {
      func: FuncType.sendLp;
      params: SendParams;
    };

export type FuncMap =
  | {
      func: FuncType.deployPool;
      params: DeployPoolIn;
    }
  | {
      func: FuncType.addLiq;
      params: AddLiqIn;
    }
  | {
      func: FuncType.swap;
      params: SwapIn;
    }
  | {
      func: FuncType.removeLiq;
      params: RemoveLiqIn;
    }
  | {
      func: FuncType.decreaseApproval;
      params: DecreaseApprovalIn;
    }
  | {
      func: FuncType.send;
      params: SendIn;
    }
  | {
      func: FuncType.sendLp;
      params: SendIn;
    };

export type ContractResult =
  | {
      func: FuncType.deployPool;
      out: DeployPoolOut;
      preResult: Result;
      result: Result;
      gas: string;
    }
  | {
      func: FuncType.addLiq;
      out: AddLiqOut;
      preResult: Result;
      result: Result;
      gas: string;
    }
  | {
      func: FuncType.swap;
      out: SwapOut;
      preResult: Result;
      result: Result;
      gas: string;
    }
  | {
      func: FuncType.removeLiq;
      out: RemoveLiqOut;
      preResult: Result;
      result: Result;
      gas: string;
    }
  | {
      func: FuncType.decreaseApproval;
      out: DecreaseApprovalOut;
      preResult: Result;
      result: Result;
      gas: string;
    }
  | {
      func: FuncType.send;
      out: SendOut;
      preResult: Result;
      result: Result;
      gas: string;
    }
  | {
      func: FuncType.sendLp;
      out: SendOut;
      preResult: Result;
      result: Result;
      gas: string;
    };

export type Result = {
  users?: {
    address: string;
    tick: string;
    balance: string;
  }[];
  pools?: {
    pair: string;
    reserve0: string;
    reserve1: string;
    lp: string;
  }[];
};

export type InscriptionFunc = FuncMsg;

export type InternalFunc =
  | {
      id: string;
      func: FuncType.deployPool;
      params: DeployPoolIn;
      prevs: string[];
      ts: number;
      sig: string;
    }
  | {
      id: string;
      func: FuncType.addLiq;
      params: AddLiqIn;
      prevs: string[];
      ts: number;
      sig: string;
    }
  | {
      id: string;
      func: FuncType.swap;
      params: SwapIn;
      prevs: string[];
      ts: number;
      sig: string;
    }
  | {
      id: string;
      func: FuncType.removeLiq;
      params: RemoveLiqIn;
      prevs: string[];
      ts: number;
      sig: string;
    }
  | {
      id: string;
      func: FuncType.decreaseApproval;
      params: DecreaseApprovalIn;
      prevs: string[];
      ts: number;
      sig: string;
    }
  | {
      id: string;
      func: FuncType.send;
      params: SendIn;
      prevs: string[];
      ts: number;
      sig: string;
    }
  | {
      id: string;
      func: FuncType.sendLp;
      params: SendIn;
      prevs: string[];
      ts: number;
      sig: string;
    };
