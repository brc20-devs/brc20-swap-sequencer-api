import { AddressBalance } from "./domain";

import {
  FastifyReply,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import { MatchingData } from "../dao/matching-dao";
import { RecordLiqData } from "../dao/record-liq-dao";
import { RecordSwapData } from "../dao/record-swap-dao";
import { WithdrawStatus } from "../dao/withdraw-dao";
import { ExactType, FuncType } from "./func";

export type Req<T, T2> = T2 extends "post"
  ? FastifyRequest<{ Body: T; Reply: any }>
  : T2 extends "get"
  ? FastifyRequest<{ Querystring: T; Reply: any }>
  : never;

export type Res<T = any> = FastifyReply<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  { Reply: T }
>;

export type ConfigReq = {};
export type ConfigRes = {
  moduleId: string;
  serviceGasTick: string;
  pendingDepositDirectNum: number;
  pendingDepositMatchingNum: number;
  userWhiteList: string[];
  onlyUserWhiteList: boolean;
};

export type AddressBalanceReq = {
  address: string;
  tick: string;
};
export type AddressBalanceRes = {
  balance: AddressBalance;
  decimal: string;
};

export type DepositInfoReq = {
  address: string;
  tick: string;
};

export type DepositInfoRes = {
  dailyAmount: string;
  dailyLimit: string;
  recommendDeposit: string;
};

export type AllAddressBalanceReq = {
  address: string;
};
export type AllAddressBalanceRes = {
  [key: string]: {
    balance: AddressBalance;
    decimal: string;
    withdrawLimit: string;
  };
};

export type QuoteSwapReq = {
  address: string;
  tickIn: string;
  tickOut: string;
  amount: string;
  exactType: ExactType;
};
export type QuoteSwapRes = {
  amountUSD: string;
  expectUSD: string;
  expect: string;
};

export type PoolInfoReq = {
  tick0: string;
  tick1: string;
};
export type PoolInfoRes = {
  existed: boolean;
  addLiq: boolean;
} & PoolListItem;

export type SelectReq = {
  address: string;
  search: string;
};

export type SelectRes = {
  tick: string;
  decimal: string;
  brc20Balance: string;
  swapBalance: string;
}[];

export type DeployPoolReq = {
  address: string;
  tick0: string;
  tick1: string;
  ts: number;
  sig?: string;
};
export type DeployPoolRes = {
  //
  //
};

export type QuoteAddLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
};

export type QuoteAddLiqRes = {
  amount0: string;
  amount1: string;
  amount0USD: string;
  amount1USD: string;
  lp: string;
  tick0PerTick1: string;
  tick1PerTick0: string;
  shareOfPool: string;
};

export type AddLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  lp: string;
  slippage: string;
  ts: number;
  sig: string;
};
export type AddLiqRes = RecordLiqData;

export type QuoteRemoveLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  lp: string;
};

export type QuoteRemoveLiqRes = {
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  amount0USD: string;
  amount1USD: string;
};

export type RemoveLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  lp: string;
  amount0: string;
  amount1: string;
  slippage: string;
  ts: number;
  sig: string;
};
export type RemoveLiqRes = RecordLiqData;

export type SwapReq = {
  address: string;
  tickIn: string;
  tickOut: string;
  amountIn: string;
  amountOut: string;
  slippage: string;
  exactType: ExactType;
  ts: number;
  sig: string;
};
export type SwapRes = RecordSwapData;

export type FuncReq =
  | {
      func: FuncType.swap;
      req: SwapReq;
    }
  | {
      func: FuncType.addLiq;
      req: AddLiqReq;
    }
  | {
      func: FuncType.deployPool;
      req: DeployPoolReq;
    }
  | {
      func: FuncType.removeLiq;
      req: RemoveLiqReq;
    }
  | {
      func: FuncType.decreaseApproval;
      req: DecreaseApprovalReq;
    }
  | {
      func: FuncType.send;
      req: SendReq;
    };

export type PoolListReq = {
  search?: string;
  start: number;
  limit: number;
};

export type PoolListItem = {
  tick0: string;
  tick1: string;
  lp: string;
  tvl: string;
  volume24h: string;
  volume7d: string;
};

export type PoolListRes = {
  total: number;
  list: PoolListItem[];
};

export type MyPoolListReq = {
  address: string;
  tick?: string;
  start: number;
  limit: number;
};

export type MyPoolListItem = {
  lp: string;
  shareOfPool: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
};

export type MyPoolListRes = {
  total: number;
  list: MyPoolListItem[];
};

export type MyPoolReq = {
  address: string;
  tick0: string;
  tick1: string;
};

export type MyPoolRes = MyPoolListItem;

export type DepositListReq = {
  address: string;
  tick: string;
  start: number;
  limit: number;
};

export type DepositType = "direct" | "matching";

export type DepositListItem = {
  tick: string;
  amount: string;
  cur: number;
  sum: number;
  ts: number;
  txid: string;
  type: DepositType;
};

export type DepositListRes = {
  total: number;
  list: DepositListItem[];
};

export type SendHistoryReq = {
  address: string;
  tick: string;
  start: number;
  limit: number;
};

export type SendHistoryItem = {
  tick: string;
  amount: string;
  to: string;
  ts: number;
};

export type SendHistoryRes = {
  total: number;
  list: SendHistoryItem[];
};

export type LiqHistoryReq = {
  address: string;
  tick: string;
  type: "add" | "remove";
  start: number;
  limit: number;
};

export type LiqHistoryItem = {
  type: "add" | "remove";
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  lp: string;
  ts: number;
};

export type LiqHistoryRes = {
  total: number;
  list: LiqHistoryItem[];
};

export type GasHistoryReq = {
  address: string;
  start: number;
  limit: number;
};

export type GasHistoryRes = {
  total: number;
  list: GasHistoryItem[];
};

export type OverViewReq = {};

export type OverViewRes = {
  liquidity: string;
  volume7d: string;
  volume24h: string;
  transactions: number;
  pairs: number;
};

export type SwapHistoryReq = {
  address: string;
  tick: string;
  start: number;
  limit: number;
};

export type SwapHistoryItem = {
  tickIn: string;
  tickOut: string;
  amountIn: string;
  amountOut: string;
  exactType: ExactType;
  ts: number;
};

export type SwapHistoryRes = {
  total: number;
  list: SwapHistoryItem[];
};

export type RollUpHistoryReq = {
  start: number;
  limit: number;
};

export type RollUpHistoryItem = {
  txid: string;
  height: number;
  transactionNum: number;
  inscriptionId: string;
  inscriptionNumber: number;
  ts: number;
};

export type RollUpHistoryRes = {
  total: number;
  list: RollUpHistoryItem[];
};

export type PreRes = {
  signMsg: string;
} & FeeRes;

export type FeeRes = {
  bytesL1: number;
  bytesL2: number;
  feeRate: string; // l1
  gasPrice: string; // l2
  serviceFeeL1: string;
  serviceFeeL2: string;
  unitUsdPriceL1: string;
  unitUsdPriceL2: string;

  serviceTickBalance: string;
};

export type CreateDepositReq = {
  inscriptionId: string;
  pubkey: string;
  address: string;
};

export type CreateDepositRes = {
  psbt: string;
  type: DepositType;
  expiredTimestamp: number;
  recommendDeposit: string;
};

export type ConfirmDepositReq = {
  inscriptionId: string;
  psbt: string;
};

export type ConfirmDepositRes = {
  txid: string;
  pendingNum: number;
};

export type SystemStatusReq = {};

export type SystemStatusRes = {
  committing: boolean;
};

export type WithdrawHistoryReq = {
  address: string;
  tick?: string;
  start: number;
  limit: number;
};

export type WithdrawHistoryItem = {
  id: string;
  tick: string;
  totalAmount: string;
  completedAmount: string;
  ts: number;
  totalConfirmedNum: number;
  totalNum: number;
  status: WithdrawStatus;
};

export type WithdrawHistoryRes = {
  total: number;
  list: WithdrawHistoryItem[];
};

export type CreateWithdrawReq = {
  pubkey: string;
  address: string;
  tick: string;
  amount: string;
  ts: number;
};

export type CreateWithdrawRes = {
  id: string;
  paymentPsbt: string;
  approvePsbt: string;
  networkFee: number;
} & PreRes;

export type ConfirmWithdrawReq = {
  id: string;
  sig: string;
  paymentPsbt: string;
  approvePsbt: string;
};

export type ConfirmWithdrawRes = {};

export type CreateRetryWithdrawReq = {
  id: string;
  pubkey: string;
  address: string;
};

export type CreateRetryWithdrawRes = {
  paymentPsbt: string;
  approvePsbt: string;
  networkFee: number;
};

export type ConfirmRetryWithdrawReq = {
  id: string;
  paymentPsbt: string;
  approvePsbt: string;
};

export type ConfirmRetryWithdrawRes = {};

export type CreateCancelWithdrawReq = {
  id: string;
};

export type CreateCancelWithdrawRes = {
  id: string;
  psbt: string;
  networkFee: number;
};

export type ConfirmCancelWithdrawReq = {
  id: string;
  psbt: string;
};

export type ConfirmCancelWithdrawRes = {};

export type WithdrawProcessReq = {
  id: string;
};

export type WithdrawProcessRes = {
  id: string;
  tick: string;
  amount: string;
  ts: number;
  status: WithdrawStatus;

  totalConfirmedNum: number;
  totalNum: number;
  rollUpConfirmNum: number;
  rollUpTotalNum: number;
  approveConfirmNum: number;
  approveTotalNum: number;
  cancelConfirmedNum: number;
  cancelTotalNum: number;

  rollUpTxid: string;
  paymentTxid: string;
  inscribeTxid: string;
  approveTxid: string;

  completedAmount: string;
  matchHistory: MatchingData[];

  rank: number;
};

export type DecreaseApprovalReq = {
  address: string;
  tick: string;
  amount: string;
  ts: number;
  sig?: string;
};

export type SendReq = {
  address: string;
  tick: string;
  amount: string;
  to: string;
  ts: number;
  sig?: string;
};

export type SendRes = {};

export type DecreaseApprovalRes = {};

export type GasHistoryItem = {
  funcType: FuncType;
  tickA: string;
  tickB: string;
  gas: string;
  ts: number;
};
