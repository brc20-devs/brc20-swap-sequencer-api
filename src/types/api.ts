import { AddressType } from "./domain";
import { OpEvent } from "./op";

export type FeeEstimate = {
  BlocksAvgFeeRate: { feerate: number; height: number; ts: number }[];
  BlocksFeeRateEstimate: { blocks: number; feerate: number }[];
  BTCPrice: number;
};

export type FeeEstimateMempool = {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
};

export type OrderReq = {
  files: { dataURL: string; filename: string }[];
  feeRate: number;
  receiveAddress: string;
  balance: number;
  brand: string;
  referrer?: string;
  id: string;
  disableRBF?: boolean;
};

export type OrderRes = {
  orderId: string;
  payAddress: string;
  amount: number;
  feeRate: number;
  minerFee: number;
  serviceFee: number;
  count: number;
};

export type OrderData = {
  orderId: string;
  status: string;
  payAddress: string;
  receiveAddress: string;
  amount: number;
  balance: number;
  createts: number;
  isPaidOffchain: boolean;
  feeRate: number;
  minerFee: number;
  serviceFee: number;
  files: {
    filename: string;
    size: number;
    inscriptionId: string;
  }[];
  count: number;
  minted: number;
};

export type OpEventsRes = {
  total: number;
  list: OpEvent[];
};

export type UTXO = {
  txid: string;
  vout: number;
  satoshi: number;
  scriptPk?: string;
  height?: number;
  codeType: AddressType;
};

export type ToSignInput = {
  index: number;
  address: string;
};

export type CommitUTXO = UTXO & {
  used?: "locked" | "used" | "unused";
  status?: "unconfirmed" | "confirmed";
  purpose: "inscribe" | "activate" | "sequence";
};

export type NFT = {
  address: string;
  inSatoshi: number;
  contentBody: string;
  inscriptionId: string;
  inscriptionIndex: number;
  inscriptionNumber: number;
  offset: number;
  ts: number;
  brc20: {
    amt: string;
    decimal: string;
    lim: string;
    op: string;
    tick: string;
  };
  utxo: UTXO;
};

export type Brc20Info = {
  decimal: number;
  height: number;
  limit: number;
  max: string;
  ticker: string;
};

export type Brc20AddressBalance = {
  total: number;
  detail: {
    ticker: string;
    overallBalance: string;
    transferableBalance: string;
    availableBalance: string;
  }[];
};

export enum EventType {
  inscribeModule = "inscribe-module",
  transfer = "transfer",
  inscribeApprove = "inscribe-approve",
  inscribeConditionalApprove = "inscribe-conditional-approve",
  approve = "approve",
  conditionalApprove = "conditional-approve",
  commit = "commit",
}

export type ModuleInscriptionInfo = {
  utxo: UTXO;
  //...
  inscriptionId: string;
  data?: {
    amt: string;
    balance: string;
    module: string;
    op: string;
    tick: string;
  };
};

export type InscriptionEventItem = {
  valid: boolean;
  type: EventType;
  txid: string;
  inscriptionId: string;
  inscriptionNumber: number;
  from: string;
  to: string;
  contentBody: string;
  height: number;
  blocktime: number;
  data: {
    amount?: string;
    balance?: string;
    transfer?: string;
    transferMax?: string;
  };
};

export type InscriptionEventsRes = {
  total: number;
  cursor: number;
  detail: InscriptionEventItem[];
};

export type CommitTx = {
  inscriptionId: string;
  txid: string;
  rawtx?: string;
  status: "pending" | "unconfirmed" | "confirmed";
  height: number;
  fee: number;
  feeRate: number;
};
