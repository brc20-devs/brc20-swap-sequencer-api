import { LoggerLevel } from "../config";
import { Brc20 } from "../contract/brc20";

export type Config = {
  loggerLevel: LoggerLevel;
  cors: boolean;
  db: string;
  openSwagger: boolean;
  fakeMarketPrice: boolean;
  fixedGasPrice: string;
  port: number;
  mongoUrl: string;
  openApi: {
    url: string;
    host: string;
    apiKey: string;
  };
  openApi2: {
    url: string;
    host: string;
    apiKey: string;
  };
  mempoolApi: string;
  network: string;
  keyring: {
    sequencerWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    rootWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    btcWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    approveWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
  };
  startHeight: number;
  moduleId: string;
  source: string;
  isContractOnChain: boolean;
  pendingTransferNum: number;
  pendingDepositDirectNum: number; // deposit(direct)api
  pendingDepositMatchingNum: number; // deposit(matching)
  pendingRollupNum: number;
  pendingWithdrawNum: number;
  insertHeightNum: number;
  openCommitPerMinute: boolean;
  commitPerMinute: number;
  commitPerSize: number;
  eventListPerSize: number;
  snapshotPerSize: number;
  enableApiUTXO: boolean;
  verifyCommit: boolean;
  openWhitelistTick: boolean;
  whitelistTick: {
    [key: string]: { depositLimit: string; withdrawLimit: string };
  };
  commitFeeRateRatio: number;
  userFeeRateRatio: number;
  minFeeRate: number;
  verifyCommitInvalidException: boolean;
  verifyCommitCriticalException: boolean;
  verifyCommitFatalNum: number;
  binOpts: string[];
  userWhiteList: string[];
  onlyUserWhiteList: boolean;
  updateHeight1: number;
  initTicks: string[];
  readonly: boolean;
};

export enum AddressType {
  P2PK = 4,
  P2PKH = 5,
  P2SH = 6,
  P2WPKH = 7,
  P2WSH = 8,
  P2TR = 9,
}

export type ContractStatus = {
  kLast: {
    [key: string]: string;
  };
};

export type ContractConfig = {
  feeTo: string;
  swapFeeRate1000: string; // eg. 30(=0.3%)
};

export type Balance = { [key: string]: { [key: string]: string } }; // addr -> tick -> amount

export type Pool = {
  [key: string]: { amount0: string; amount1: string; lp: string };
}; // pair -> { amount0, amount1, lp }

export type AddressBalance = {
  module: string;
  swap: string;
  pendingSwap: string;
  pendingAvailable: string;
};

export type Pair = {
  tick0: string;
  tick1: string;
};

export type SnapshotObj = {
  assets: {
    [assetType: string]: { [tick: string]: Brc20 };
  };
  contractStatus: ContractStatus;
  used: boolean;
};

export type OridinalMsg = {
  module: string;
  parent: string;
  quit: string;
  gas_price: string;
  addr: string;
  func: string;
  params: string[];
  ts: number;
};

export type HashIdMsg = {
  module: string;
  parent: string;
  quit: string;
  prevs: string[];

  gas_price: string;
  addr: string;
  func: string;
  params: string[];
  ts: number;
};

export type FuncMsg = {
  id: string;
  addr: string;
  func: string;
  params: string[];
  ts: number;
  sig: string;
};

export enum BitcoinNetworkType {
  FRACTAL_BITCOIN_MAINNET = "FRACTAL_BITCOIN_MAINNET",
  FRACTAL_BITCOIN_TESTNET = "FRACTAL_BITCOIN_TESTNET",
  BITCOIN_MAINNET = "BITCOIN_MAINNET",
  BITCOIN_TESTNET = "BITCOIN_TESTNET",
}
