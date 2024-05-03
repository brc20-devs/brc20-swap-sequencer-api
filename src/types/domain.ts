import { LoggerLevel } from "../config";

export type Config = {
  loggerLevel: LoggerLevel;
  cors: boolean;
  db: string;
  isLocalTest: boolean;
  localDebug: boolean;
  routeDebugLog: boolean;
  winstonDebugLog: boolean;
  fakeMarketPrice: boolean;
  fixedGasPrice: string;
  port: number;
  mongoUrl: string;
  openApi: {
    url: string;
    apiKey: string;
  };
  unisatApi: {
    url: string;
    host: string;
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
  pendingDepositDirectNum: number; // deposit(direct)
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
  verifyCommitInvalidException: boolean;
  verifyCommitCriticalException: boolean;
  verifyCommitFatalNum: number;
  canSwap: boolean;
  userWhiteList: string[];
  onlyUserWhiteList: boolean;
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

export type SpaceSnapshot = {
  assets: {
    [key: string]: { [key: string]: { balance: object; tick: string } };
  };
  assetsCheck: {
    [key: string]: { [key: string]: string[] };
  };
  contractStatus: ContractStatus;
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
