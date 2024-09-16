import * as bitcoin from "bitcoinjs-lib";
import { ECPair } from ".";
import {
  bn,
  bnDecimal,
  bnDecimalPlacesValid,
  bnIsInteger,
  decimalCal,
  uintCal,
} from "../contract/bn";
import { RecordLiqData } from "../dao/record-liq-dao";
import { RecordSwapData } from "../dao/record-swap-dao";
import { ApiEvent, EventType, UTXO } from "../types/api";
import { AddressType, SnapshotObj } from "../types/domain";
import {
  AddLiqOut,
  ContractResult,
  ExactType,
  FuncType,
  InscriptionFunc,
  InternalFunc,
  RemoveLiqOut,
  SwapOut,
} from "../types/func";
import {} from "../types/global";
import { CommitOp, OpEvent, OpType } from "../types/op";
import { PsbtInputExtended } from "../types/psbt";
import { FeeRes, FuncReq } from "../types/route";
import { DUST330, DUST546, LP_DECIMAL, UNCONFIRM_HEIGHT } from "./constant";
import { convertReq2Arr } from "./convert-struct";
import {
  CodeEnum,
  CodeError,
  access_denied,
  deposit_delay_swap,
  internal_server_error,
  invalid_address,
  invalid_aggregation,
  invalid_amount,
  invalid_slippage,
  invalid_ts,
  not_support_address,
  tick_disable,
  utxo_not_enough,
} from "./error";

const TAG = "utils";

/**
 * An exception will be thrown if the condition is not met.
 */
export function need(
  condition: boolean,
  msg?: string,
  code?: CodeEnum,
  fatal = false
) {
  if (!condition) {
    code = code ?? (-1 as CodeEnum);
    if (fatal) {
      global.fatal = true;
      logger.fatal({ tag: "need", msg });
      // process.exit(1);
    }
    throw new CodeError(msg || `${internal_server_error}: ${code}`, code);
  }
}

/**
 * Calculate the total satoshi of UTXOs.
 */
export function getInputAmount(utxos: UTXO[]) {
  let ret = 0;
  for (let i = 0; i < utxos.length; i++) {
    ret += utxos[i].satoshi;
  }
  return ret;
}

/**
 * Calculate the confirmations
 */
export function heightConfirmNum(height: number) {
  if (height == UNCONFIRM_HEIGHT) {
    return 0;
  } else {
    return Math.max(0, env.NewestHeight - height + 1);
  }
}

/**
 * Is valid brc20 ticker
 * e.g. "ordi"
 */
export function isBrc20(tick: string) {
  return Buffer.from(tick).length == 4;
}

export function isLp(tick: string) {
  try {
    const pair = getPairStructV2(tick);
    return getPairStrV2(pair.tick0, pair.tick1) == tick;
  } catch (err) {
    return false;
  }
}

/**
 * To validate PSBT
 */
export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

/**
 * Create an record into database
 */
export async function record(
  rollupInscriptionId: string,
  item: InternalFunc,
  res: ContractResult
) {
  let ret: RecordSwapData | RecordLiqData | RecordApproveData | RecordSendData =
    {} as any;
  item.params = sortTickParams(item.params);

  if (item.func == FuncType.deployPool) {
    const gasRecord: RecordGasData = {
      id: item.id,
      address: item.params.address,
      funcType: FuncType.deployPool,
      tickA: item.params.tick0,
      tickB: item.params.tick1,
      gas: res.gas,
      ts: item.ts,
    };
    await recordGasDao.upsertData(gasRecord);
  } else if (item.func == FuncType.addLiq) {
    const gasRecord: RecordGasData = {
      id: item.id,
      address: item.params.address,
      funcType: FuncType.addLiq,
      tickA: item.params.tick0,
      tickB: item.params.tick1,
      gas: res.gas,
      ts: item.ts,
    };
    await recordGasDao.upsertData(gasRecord);

    const out = res.out as AddLiqOut;
    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      type: "add",
      tick0: item.params.tick0,
      tick1: item.params.tick1,
      amount0: bnDecimal(out.amount0, decimal.get(item.params.tick0)),
      amount1: bnDecimal(out.amount1, decimal.get(item.params.tick1)),
      lp: bnDecimal(out.lp, LP_DECIMAL),
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
    };
    await recordLiqDao.upsertData(ret);
  } else if (item.func == FuncType.swap) {
    const gasRecord: RecordGasData = {
      id: item.id,
      address: item.params.address,
      funcType: FuncType.swap,
      tickA: item.params.tickIn,
      tickB: item.params.tickOut,
      gas: res.gas,
      ts: item.ts,
    };
    await recordGasDao.upsertData(gasRecord);

    const out = res.out as SwapOut;
    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      tickIn: item.params.tickIn,
      tickOut: item.params.tickOut,
      amountIn:
        item.params.exactType == ExactType.exactIn
          ? item.params.amount
          : out.amount,
      amountOut:
        item.params.exactType == ExactType.exactOut
          ? item.params.amount
          : out.amount,
      exactType: item.params.exactType,
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
    };
    ret.amountIn = bnDecimal(ret.amountIn, decimal.get(ret.tickIn));
    ret.amountOut = bnDecimal(ret.amountOut, decimal.get(ret.tickOut));
    await recordSwapDao.upsertData(ret);
  } else if (item.func == FuncType.removeLiq) {
    const gasRecord: RecordGasData = {
      id: item.id,
      address: item.params.address,
      funcType: FuncType.removeLiq,
      tickA: item.params.tick0,
      tickB: item.params.tick1,
      gas: res.gas,
      ts: item.ts,
    };
    await recordGasDao.upsertData(gasRecord);

    const out = res.out as RemoveLiqOut;
    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      type: "remove",
      tick0: item.params.tick0,
      tick1: item.params.tick1,
      amount0: bnDecimal(out.amount0, decimal.get(item.params.tick0)),
      amount1: bnDecimal(out.amount1, decimal.get(item.params.tick1)),
      lp: bnDecimal(item.params.lp, LP_DECIMAL),
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
    };
    await recordLiqDao.upsertData(ret);
  } else if (item.func == FuncType.decreaseApproval) {
    const gasRecord: RecordGasData = {
      id: item.id,
      address: item.params.address,
      funcType: FuncType.decreaseApproval,
      tickA: item.params.tick,
      tickB: null,
      gas: res.gas,
      ts: item.ts,
    };
    await recordGasDao.upsertData(gasRecord);

    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      tick: item.params.tick,
      amount: bnDecimal(item.params.amount, decimal.get(item.params.tick)),
      type: "decreaseApprove",
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
    };
    await recordApproveDao.upsertData(ret);
  } else if (item.func == FuncType.send) {
    const gasRecord: RecordGasData = {
      id: item.id,
      address: item.params.address,
      funcType: FuncType.send,
      tickA: item.params.tick,
      tickB: null,
      gas: res.gas,
      ts: item.ts,
    };
    await recordGasDao.upsertData(gasRecord);

    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      tick: item.params.tick,
      amount: bnDecimal(item.params.amount, decimal.get(item.params.tick)),
      to: item.params.to,
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
    };
    await recordSendDao.upsertData(ret);
  }
  delete ret.preResult;
  delete ret.result;
  return ret;
}

export const getModuleIdHex = (moduleId?: string) => {
  const str = (moduleId || config.moduleId).split("i")[0];
  const hash = reverseHash(str);
  return Buffer.from(hash, "hex");
};

export const reverseHash = (hash: string) => {
  const arr: string[] = [];
  for (let i = 0; i < hash.length; i += 2) {
    arr.push(hash.slice(i, i + 2));
  }
  return arr.reverse().join("");
};

export function getFuncInternalLength(func: InscriptionFunc) {
  return Buffer.from(JSON.stringify(func)).length;
}

/**
 * Estimate the sequencer service fee, there may be some deviation
 */
export function estimateServerFee(req: FuncReq): FeeRes {
  let sig: string;
  const address = req.req.address;
  checkAddressType(address);
  if (getAddressType(address) == AddressType.P2TR) {
    sig = "x".repeat(88);
  } else if (getAddressType(address) == AddressType.P2WPKH) {
    sig = "x".repeat(144); // deviation
  }
  const gasPrice = operator.NewestCommitData.op.gas_price;
  const feeRate = env.FeeRate.toString();
  const bytesL2 = Math.ceil(
    getFuncInternalLength({
      id: "x".repeat(64),
      addr: req.req.address,
      func: req.func,
      params: convertReq2Arr(req).params,
      ts: req.req.ts,
      sig,
    })
  );
  const bytesL1 = bytesL2 / 4 + 310;

  const serviceTickBalance = operator.PendingSpace.getBalance(
    req.req.address,
    env.ModuleInitParams.gas_tick
  ).swap;

  if (env.NewestHeight < config.updateHeight1) {
    return {
      bytesL1,
      bytesL2,
      feeRate,
      gasPrice,
      serviceFeeL1: decimalCal([feeRate, "mul", bytesL1]),
      serviceFeeL2: decimalCal([gasPrice, "mul", bytesL2]),
      unitUsdPriceL1: env.SatsPrice,
      unitUsdPriceL2: decimalCal([env.GasTickPrice, "mul", env.SatsPrice]),
      serviceTickBalance,
    };
  } else {
    return {
      bytesL1,
      bytesL2,
      feeRate,
      gasPrice,
      serviceFeeL1: decimalCal([feeRate, "mul", bytesL1]),
      serviceFeeL2: gasPrice,
      unitUsdPriceL1: env.SatsPrice,
      unitUsdPriceL2: decimalCal([env.GasTickPrice, "mul", env.SatsPrice]),
      serviceTickBalance,
    };
  }
}

import _ from "lodash";
import { Brc20 } from "../contract/brc20";
import {
  getPairStrV2,
  getPairStructV2,
  sortTickParams,
} from "../contract/contract-utils";
import { RecordApproveData } from "../dao/record-approve-dao";
import { RecordGasData } from "../dao/record-gas-dao";
import { RecordSendData } from "../dao/record-send-dao";
import { toXOnly } from "../lib/bitcoin";

export const maxAmount = uintCal(["2", "pow", "64"]);

/**
 * Check a function is valid
 */
export function checkFuncReq(req: FuncReq) {
  const func = req.func;

  checkAddressType(req.req.address);
  checkTs(req.req.ts);
  // need(!!req.req.sig, "invalid sig");

  if (func == FuncType.addLiq) {
    const { slippage, amount0, amount1, lp, tick0, tick1 } = req.req;
    checkTick(tick0);
    checkTick(tick1);
    checkSlippage(slippage);
    checkAmount(amount0, decimal.get(tick0));
    checkAmount(amount1, decimal.get(tick1));
    checkAmount(lp, LP_DECIMAL);
  } else if (func == FuncType.swap) {
    const { slippage, amountIn, amountOut, tickIn, tickOut } = req.req;
    checkTick(tickIn);
    checkTick(tickOut);
    checkSlippage(slippage);
    checkAmount(amountIn, decimal.get(tickIn));
    checkAmount(amountOut, decimal.get(tickOut));
  } else if (func == FuncType.deployPool) {
    const { tick0, tick1 } = req.req;
    checkTick(tick0);
    checkTick(tick1);
    need(!!decimal.get(tick0));
    need(!!decimal.get(tick1));
  } else if (func == FuncType.removeLiq) {
    const { slippage, amount0, amount1, lp, tick0, tick1 } = req.req;
    checkSlippage(slippage);
    checkTick(tick0);
    checkTick(tick1);
    checkAmount(amount0, decimal.get(tick0));
    checkAmount(amount1, decimal.get(tick1));
    checkAmount(lp, LP_DECIMAL);
  } else if (func == FuncType.decreaseApproval) {
    const { tick, amount } = req.req;
    checkTick(tick);
    checkAmount(amount, decimal.get(tick));
  } else if (func == FuncType.send) {
    const { tick, amount, to } = req.req;
    checkTick(tick);
    checkAmount(amount, decimal.get(tick));
    checkAddress(to);
  } else {
    throw new CodeError(invalid_aggregation);
  }
}

/**
 * Check if an opEvent is valid (commit,deploy,transfer)
 */
export function checkOpEvent(event: OpEvent) {
  const events = [
    EventType.approve,
    EventType.commit,
    EventType.conditionalApprove,
    EventType.inscribeApprove,
    EventType.inscribeConditionalApprove,
    EventType.inscribeModule,
    EventType.transfer,
    EventType.inscribeWithdraw,
    EventType.withdraw,
  ];
  if (!events.includes(event.event)) {
    throw new CodeError("unsupported op: " + event.event);
  }
}

export function isValidAddress(address: string) {
  let error;
  try {
    bitcoin.address.toOutputScript(address, network);
  } catch (e) {
    error = e;
  }
  if (error) {
    return false;
  } else {
    return true;
  }
}

/**
 * Throw system fatal
 * This will result in no longer processing the data.
 * @param message
 */
export function sysFatal(
  obj: object & { tag: string; msg: string; [key: string]: any }
) {
  const err = new Error("System fatal error: " + obj.msg);
  global.fatal = true;
  logger.fatal({
    ...obj,
    stack: err.stack,
  });
  throw err;
}

/**
 * Check if an address is valid. (P2TR/P2WPKH)
 */
export function checkAddressType(address: string) {
  need(
    [AddressType.P2TR, AddressType.P2WPKH].includes(getAddressType(address)),
    not_support_address
  );
}

export function checkTs(ts: number) {
  const now = Date.now() / 1000;
  const gap = 600;
  // check 10.0
  need(now - ts > -gap && now - ts < gap && bnIsInteger(ts), invalid_ts);
}

export function checkAddress(address: string) {
  need(isValidAddress(address), invalid_address);
}

export function checkAmount(amount: string, decimal: string) {
  need(bn(amount).lt(maxAmount), invalid_amount);
  need(bn(amount).gt("0"), invalid_amount);
  need(bnDecimalPlacesValid(amount, decimal), invalid_amount);
  need(amount == bn(amount).toString(), invalid_amount);
}

export function checkSlippage(slippage: string) {
  need(
    bn(slippage).gte("0") &&
      bn(slippage).lte("1") &&
      bnDecimalPlacesValid(slippage, "3"),
    invalid_slippage
  );
  need(slippage == bn(slippage).toString(), invalid_amount);
}

/**
 * Decode the type of an address (P2PK/P2PKH/P2SH/P2WPKH/P2WSH/P2TR)
 * throw error when the address is invalid
 */
export function getAddressType(address: string): AddressType {
  let type: AddressType;

  try {
    const decoded = bitcoin.address.fromBase58Check(address);

    if (decoded.version === network.pubKeyHash) {
      type = AddressType.P2PKH;
    } else if (decoded.version === network.scriptHash) {
      type = AddressType.P2SH;
    } else {
      throw new CodeError(`unknown version number: ${decoded.version}`);
    }
  } catch (error) {
    try {
      // not a Base58 address, try Bech32
      const decodedBech32 = bitcoin.address.fromBech32(address);

      if (decodedBech32.version === 0 && decodedBech32.data.length === 20) {
        type = AddressType.P2WPKH;
      } else if (
        decodedBech32.version === 0 &&
        decodedBech32.data.length === 32
      ) {
        type = AddressType.P2WSH;
      } else if (
        decodedBech32.version === 1 &&
        decodedBech32.data.length === 32
      ) {
        type = AddressType.P2TR;
      } else {
        throw new CodeError(`unknown Bech32 address format`);
      }
    } catch (err) {
      throw new CodeError("unsupport address type: " + address);
    }
  }
  return type;
}

export function getDust(address: string) {
  const addressType = getAddressType(address);
  if ([AddressType.P2WPKH, AddressType.P2TR].includes(addressType)) {
    return DUST330;
  } else {
    return DUST546;
  }
}

export function getMixedPayment(pubKey1: Buffer, pubKey2: Buffer) {
  const p2ms = bitcoin.payments.p2ms({
    m: 1,
    pubkeys: [pubKey1, pubKey2],
    network,
  });
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: p2ms,
    network,
  });
  return p2wsh;
}

export function hasFuncType(op: CommitOp, funcType: FuncType) {
  for (let i = 0; i < op.data.length; i++) {
    if (op.data[i].func == funcType) {
      return true;
    }
  }
  return false;
}

export function getMinUTXOs(
  utxos: UTXO[],
  fixedInputNum: number,
  fixedOutputNum: number,
  feeRate: number
): UTXO[] {
  utxos.sort((a, b) => {
    return b.satoshi - a.satoshi;
  });
  const fixed = (fixedInputNum * 68 + fixedOutputNum * 48) * feeRate;

  for (let i = 0; i < utxos.length; i++) {
    if (
      getInputAmount(utxos.slice(0, i + 1)) -
        fixed -
        ((i + 1) * 68 + 48) * feeRate >
      0
    ) {
      return utxos.slice(0, i + 1);
    }
  }
  throw new CodeError(utxo_not_enough);
}

export function getConfirmedNum(height: number) {
  if (height == UNCONFIRM_HEIGHT) {
    return 0;
  } else {
    return env.NewestHeight - height + 1;
  }
}

/**
 * Transform an UTXO to PSBT Input format
 */
export function utxoToInput(
  utxo: UTXO,
  extraData: {
    pubkey: string;
  }
): PsbtInputExtended {
  if (utxo.codeType == AddressType.P2TR) {
    return {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.satoshi,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      tapInternalKey: toXOnly(Buffer.from(extraData.pubkey, "hex")),
    };
  } else if (utxo.codeType == AddressType.P2WPKH) {
    return {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.satoshi,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    };
  } else {
    logger.error({ tag: TAG, msg: "utxoToInput", utxo });
    throw new CodeError(
      "not supported address type, please switch to the taproot address or native segwit address "
    );
  }
}

export function isMatch(text: string, search: string) {
  if (text.toLowerCase().includes("eyee")) {
    return false;
  }
  if (!search) {
    return true;
  }
  return text.toLowerCase().includes(search.toLowerCase());
}

export function checkTick(tick: string) {
  if (config.openWhitelistTick) {
    need(!!config.whitelistTick[tick.toLowerCase()], tick_disable);
  }
}

export async function apiEventToOpEvent(item: ApiEvent, cursor: number) {
  // need(item.valid);
  const event: OpEvent = {
    cursor,
    valid: item.valid,
    height: item.height,
    from: item.from,
    to: item.to,
    inscriptionId: item.inscriptionId,
    inscriptionNumber: item.inscriptionNumber,
    op: JSON.parse(item.contentBody),
    blocktime: item.blocktime,
    txid: item.txid,
    data: item.data,
    event: item.type,
  };

  // fix tick
  if ((event.op as any).tick) {
    (event.op as any).tick = decimal.getRealTick((event.op as any).tick);
  }

  checkOpEvent(event);

  // pre handle event
  if (
    [
      EventType.approve,
      EventType.conditionalApprove,
      EventType.inscribeApprove,
      EventType.inscribeConditionalApprove,
    ].includes(event.event)
  ) {
    need(!!item.data);
  }

  // pre handle op
  if (event.op.op == OpType.approve) {
    await decimal.trySetting(event.op.tick);
  } else if (event.op.op == OpType.commit) {
    //
    for (let i = 0; i < event.op.data.length; i++) {
      const item = event.op.data[i];
      if (item.func == FuncType.deployPool) {
        const [tick0, tick1] = item.params;
        await decimal.trySetting(tick0);
        await decimal.trySetting(tick1);
      }
    }
  } else if (event.op.op == OpType.deploy) {
    need(!!event.op.init.sequencer);
    need(!!event.op.init.fee_to);
    need(!!event.op.init.gas_to);
    need(!!event.op.init.gas_tick);
    env.ContractConfig = {
      swapFeeRate1000: event.op.init.swap_fee_rate
        ? decimalCal([event.op.init.swap_fee_rate, "mul", 1000])
        : "0",
      feeTo: event.op.init.fee_to,
    };
    for (let i = 0; i < config.initTicks.length; i++) {
      await decimal.trySetting(config.initTicks[i]);
    }
    // await decimal.trySetting("sats");
    // await decimal.trySetting("ordi");
    await decimal.trySetting(event.op.init.gas_tick);
  } else if (event.op.op == OpType.transfer) {
    await decimal.trySetting(event.op.tick);
  } else if (event.op.op == OpType.withdraw) {
    await decimal.trySetting(event.op.tick);
  }
  return event;
}

export async function checkDepositLimitTime(address: string, tick: string) {
  const res = await depositDao.find(
    {
      address,
      tick,
    },
    { sort: { ts: -1 } }
  );
  if (res[0]) {
    const item = res[0];
    need(Date.now() / 1000 - item.ts >= 300, deposit_delay_swap);
  }
}

export async function checkAccess(address: string) {
  if (config.onlyUserWhiteList) {
    need(config.userWhiteList.includes(address), access_denied);
  }
}

export async function getTickUsdPrice(tick: string, amount: string) {
  const tickPrice = await api.tickPrice(tick);
  return decimalCal([tickPrice, "mul", env.SatsPrice, "mul", amount]);
}

export function filterDustUTXO(utxos: UTXO[]) {
  const ret: UTXO[] = [];
  for (let i = 0; i < utxos.length; i++) {
    const item = utxos[i];
    if (item.height == UNCONFIRM_HEIGHT && item.satoshi < 1000) {
    } else {
      ret.push(item);
    }
  }
  return ret;
}

export function filterUnconfirmedUTXO(utxos: UTXO[]) {
  const ret: UTXO[] = [];
  for (let i = 0; i < utxos.length; i++) {
    const item = utxos[i];
    if (item.height == UNCONFIRM_HEIGHT) {
    } else {
      ret.push(item);
    }
  }
  return ret;
}

export function fixTickCaseSensitive(param: {
  tick?: string;
  tick0?: string;
  tick1?: string;
  tickIn?: string;
  tickOut?: string;
}) {
  if (param.tick) {
    param.tick = decimal.getRealTick(param.tick);
  }
  if (param.tick0) {
    param.tick0 = decimal.getRealTick(param.tick0);
  }
  if (param.tick1) {
    param.tick1 = decimal.getRealTick(param.tick1);
  }
  if (param.tickIn) {
    param.tickIn = decimal.getRealTick(param.tickIn);
  }
  if (param.tickOut) {
    param.tickOut = decimal.getRealTick(param.tickOut);
  }
}

export function cloneSnapshot(snapshot: SnapshotObj) {
  const ret: SnapshotObj = {
    assets: {
      swap: {},
      pendingSwap: {},
      available: {},
      pendingAvailable: {},
      approve: {},
      conditionalApprove: {},
    },
    contractStatus: {
      kLast: {},
    },
    used: false,
  };
  for (const assetType in snapshot.assets) {
    for (const tick in snapshot.assets[assetType]) {
      const item = snapshot.assets[assetType][tick];
      ret.assets[assetType][tick] = new Brc20(
        _.cloneDeep(item.balance),
        tick,
        item.Supply,
        assetType
      );
    }
  }
  for (const tick in snapshot.contractStatus.kLast) {
    ret.contractStatus.kLast[tick] = snapshot.contractStatus.kLast[tick];
  }
  return ret;
}

export async function getSnapshotObjFromDao() {
  const assetRes = await snapshotAssetDao.find({});
  const klastRes = await snapshotKLastDao.find({});
  const suppltRes = await snapshotSupplyDao.find({});
  const supplyMap = {
    swap: {},
    pendingSwap: {},
    available: {},
    pendingAvailable: {},
    approve: {},
    conditionalApprove: {},
  };
  for (let i = 0; i < suppltRes.length; i++) {
    const item = suppltRes[i];
    supplyMap[item.assetType][item.tick] = item.supply;
  }

  const snapshot: SnapshotObj = {
    assets: {
      swap: {},
      pendingSwap: {},
      available: {},
      pendingAvailable: {},
      approve: {},
      conditionalApprove: {},
    },
    contractStatus: {
      kLast: {},
    },
    used: false,
  };
  for (let i = 0; i < assetRes.length; i++) {
    const item = assetRes[i];
    if (!snapshot.assets[item.assetType][item.tick]) {
      snapshot.assets[item.assetType][item.tick] = new Brc20(
        {},
        item.tick,
        supplyMap[item.assetType][item.tick],
        item.assetType
      );
    }
    snapshot.assets[item.assetType][item.tick].balance[item.address] =
      item.balance;
  }
  for (let i = 0; i < klastRes.length; i++) {
    const item = klastRes[i];
    snapshot.contractStatus.kLast[item.tick] = item.value;
  }
  return snapshot;
}
