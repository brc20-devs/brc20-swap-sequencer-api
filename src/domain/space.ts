import _ from "lodash";
import { Assets } from "../contract/assets";
import { bn, bnDecimal, bnUint, decimalCal } from "../contract/bn";
import { Brc20 } from "../contract/brc20";
import { Contract } from "../contract/contract";
import {
  getPairStrV2,
  getPairStructV2,
  sortTickParams,
} from "../contract/contract-utils";
import { EventType } from "../types/api";
import { AddressBalance, ContractConfig, SnapshotObj } from "../types/domain";
import { ContractResult, FuncType, InternalFunc, Result } from "../types/func";
import {
  ApproveOp,
  CommitOp,
  ConditionalApproveOp,
  OpEvent,
  OpType,
  TransferOp,
  WithdrawOp,
} from "../types/op";
import { PENDING_CURSOR, UNCONFIRM_HEIGHT } from "./constant";
import {
  convertFuncInscription2Internal,
  convertFuncInternal2Inscription,
  convertResultToDecimal,
} from "./convert-struct";
import { AssetProcessing, NotifyDataCollector } from "./nofity-data-collector";
import {
  checkOpEvent,
  checkTick,
  cloneSnapshot,
  getConfirmedNum,
  getFuncInternalLength,
  hasFuncType,
  isLp,
  need,
  sysFatal,
} from "./utils";

const TAG = "space";

export enum SpaceType {
  snapshot = "snapshot",
  confirmed = "confirmed",
  mempool = "mempool", // unconfirmed
  pending = "pending",
}

export class Space {
  private assets: Assets;
  private contract: Contract;
  private pendingEvent: OpEvent[] = [];
  private lastHandledApiEvent: OpEvent;
  private notifyDataCollector: NotifyDataCollector;
  private lastCommitId: string;
  private spaceType: SpaceType;

  get SpaceType() {
    return this.spaceType;
  }

  get NotifyDataCollector() {
    return this.notifyDataCollector;
  }

  get AssetsObj() {
    return this.assets;
  }

  get ContractObj() {
    return this.contract;
  }

  get LastCommitId() {
    return this.lastCommitId;
  }

  get LastHandledApiEvent() {
    return this.lastHandledApiEvent;
  }

  constructor(
    snapshot: SnapshotObj,
    contractConfig: ContractConfig,
    lastCommitId: string,
    lastHandledEvent: OpEvent,
    createNotifyDataCollector: boolean,
    spaceType: SpaceType
  ) {
    need(!!lastCommitId || lastCommitId == "");
    need(!snapshot.used);
    snapshot.used = true;
    this.lastCommitId = lastCommitId;
    this.lastHandledApiEvent = lastHandledEvent;
    this.spaceType = spaceType;

    const Contract = contractLoader.getClass();
    this.assets = new Assets(snapshot.assets);
    this.contract = new Contract(
      this.assets,
      snapshot.contractStatus,
      contractConfig
    );

    if (createNotifyDataCollector) {
      this.notifyDataCollector = new NotifyDataCollector(
        this.lastHandledApiEvent?.cursor || 0
      );

      /****************************************
       * collector processing:
       * 1. collect data
       * 2. data processing (option)
       * 3. cursor++
       ****************************************/

      /*1*/ this.assets.setObserver(this.notifyDataCollector.Observer);
      this.contract.setObserver(this.notifyDataCollector.Observer);
    }
  }

  setLastCommitId(commitId: string) {
    this.lastCommitId = commitId;
  }

  private updatePending() {
    let newPendingEvent = [];
    for (let i = 0; i < this.pendingEvent.length; i++) {
      const event = this.pendingEvent[i];
      checkOpEvent(event);

      if (event.event == EventType.transfer) {
        const op = event.op as TransferOp;
        if (
          config.pendingDepositDirectNum == 0 ||
          getConfirmedNum(event.height) >= config.pendingDepositDirectNum
        ) {
          const amount = op.amt;
          this.assets.convert(
            event.from,
            op.tick,
            bnUint(amount, decimal.get(op.tick)),
            "pendingSwap",
            "swap"
          );
        } else {
          newPendingEvent.push(event);
        }
      } else if (event.event == EventType.withdraw) {
        // const op = event.op as WithdrawOp;
        //
      } else if (
        event.event == EventType.approve ||
        event.event == EventType.conditionalApprove
      ) {
        const op = event.op as ApproveOp | ConditionalApproveOp;
        if (
          config.pendingDepositMatchingNum == 0 ||
          getConfirmedNum(event.height) >= config.pendingDepositMatchingNum
        ) {
          // logger.info({ tag: "approve-event", event });
          const amount = event.data.amount;
          this.assets.convert(
            event.to,
            op.tick,
            bnUint(amount, decimal.get(op.tick)),
            "pendingSwap",
            "swap"
          );
        } else {
          newPendingEvent.push(event);
        }
      } else if (event.event == EventType.commit) {
        const op = event.op as CommitOp;
        if (hasFuncType(op, FuncType.decreaseApproval)) {
          if (
            config.pendingRollupNum == 0 ||
            getConfirmedNum(event.height) >= config.pendingRollupNum
          ) {
            for (let i = 0; i < op.data.length; i++) {
              if (op.data[i].func == FuncType.decreaseApproval) {
                const tick = op.data[i].params[0];
                const amount = op.data[i].params[1];
                const address = op.data[i].addr;
                this.assets.convert(
                  address,
                  tick,
                  bnUint(amount, decimal.get(tick)),
                  "pendingAvailable",
                  "available"
                );
              } else {
                //
              }
            }
          } else {
            newPendingEvent.push(event);
          }
        }
      }
    }
    this.pendingEvent = newPendingEvent;
  }

  tick() {
    this.updatePending();
  }

  get Assets() {
    return this.assets;
  }

  get Contract() {
    return this.contract;
  }

  aggregate(
    func: InternalFunc,
    gasPrice: string,
    height: number
  ): ContractResult {
    let funcLength: number;
    if (height < config.updateHeight1) {
      funcLength = getFuncInternalLength(
        convertFuncInternal2Inscription(func, height)
      );
    } else {
      funcLength = 1;
    }
    const { gas_tick, gas_to } = env.ModuleInitParams;
    const gas = decimalCal([gasPrice, "mul", funcLength]);
    const sendParams = {
      address: func.params.address,
      from: func.params.address,
      to: gas_to,
      amount: bnUint(gas, decimal.get(gas_tick)),
      tick: gas_tick,
    };

    const preResult = this.getCurResult(func);

    // fee
    if (bn(gasPrice).gt("0")) {
      this.contract.send(sendParams);
    }

    let out: ContractResult["out"];
    if (func.func == FuncType.deployPool) {
      this.assets.tryCreate(func.params.tick0);
      this.assets.tryCreate(func.params.tick1);
      out = this.contract.deployPool(func.params);
    } else if (func.func == FuncType.addLiq) {
      out = this.contract.addLiq(func.params);
    } else if (func.func == FuncType.swap) {
      out = this.contract.swap(func.params);
    } else if (func.func == FuncType.removeLiq) {
      out = this.contract.removeLiq(func.params);
    } else if (func.func == FuncType.decreaseApproval) {
      try {
        const { address, tick, amount } = func.params;
        this.assets.convert(address, tick, amount, "swap", "pendingAvailable");
        out = { id: func.id };
      } catch (err) {
        logger.error({ tag: TAG, msg: "decrease-approval", func });
        throw err;
      }
    } else if (func.func == FuncType.send) {
      out = this.contract.send(func.params);
    } else if (func.func == FuncType.sendLp) {
      out = this.contract.send(func.params);
    }
    const result = this.getCurResult(func);
    return { func: func.func, preResult, result, out, gas } as ContractResult;
  }

  getCurResult(func: InternalFunc) {
    func.params = sortTickParams(func.params);
    let result: Result;

    const { feeTo } = this.contract.config;
    const { gas_tick, gas_to } = env.ModuleInitParams;

    const getBalance = (address: string, tick: string) => {
      return this.assets.getAggregateBalance(address, tick, [
        "swap",
        // "pendingSwap",
      ]);
    };

    // user, pool, sequencer balance
    const getPartialResult = (address: string, pair: string): Result => {
      const { tick0, tick1 } = getPairStructV2(pair);
      const ret: Result = {
        users: [
          {
            address: address,
            tick: gas_tick,
            balance: getBalance(address, gas_tick),
          },
          {
            address: address,
            tick: pair,
            balance: getBalance(address, pair),
          },
          {
            address: feeTo,
            tick: pair,
            balance: getBalance(feeTo, pair),
          },
          {
            address: gas_to,
            tick: gas_tick,
            balance: getBalance(gas_to, gas_tick),
          },
        ],
        pools: [
          {
            pair,
            reserve0: getBalance(pair, tick0),
            reserve1: getBalance(pair, tick1),
            lp: this.assets.get(pair)?.Supply || "0",
          },
        ],
      };
      const set = new Set([tick0, tick1, gas_tick]);
      for (let tick of set) {
        ret.users.push({
          address,
          tick,
          balance: getBalance(address, tick),
        });
      }
      return ret;
    };

    if (
      func.func == FuncType.deployPool ||
      func.func == FuncType.addLiq ||
      func.func == FuncType.removeLiq
    ) {
      const { address, tick0, tick1 } = func.params;
      const pair = getPairStrV2(tick0, tick1);
      result = getPartialResult(address, pair);
    } else if (func.func == FuncType.swap) {
      const { address, tickIn, tickOut } = func.params;
      const pair = getPairStrV2(tickIn, tickOut);
      result = getPartialResult(address, pair);
    } else if (func.func == FuncType.decreaseApproval) {
      const { address, tick } = func.params;
      result = {
        users: [
          {
            address: address,
            tick: gas_tick,
            balance: getBalance(address, gas_tick),
          },
          {
            address,
            tick,
            balance: getBalance(address, tick),
          },
          {
            address: gas_to,
            tick: gas_tick,
            balance: getBalance(gas_to, gas_tick),
          },
        ],
      };
    } else if (func.func == FuncType.send) {
      const { address, tick, to } = func.params;
      result = {
        users: [
          {
            address: address,
            tick: gas_tick,
            balance: getBalance(address, gas_tick),
          },
          {
            address,
            tick,
            balance: getBalance(address, tick),
          },
          {
            address: gas_to,
            tick: gas_tick,
            balance: getBalance(gas_to, gas_tick),
          },
          {
            address: to,
            tick: gas_tick,
            balance: getBalance(to, gas_tick),
          },
          {
            address: to,
            tick,
            balance: getBalance(to, tick),
          },
        ],
      };
    }
    return convertResultToDecimal(result);
  }

  private /** @note must sync */ __handleOpEvent(
    event: OpEvent
  ): ContractResult[] {
    let ret: ContractResult[] = null;
    if (event.event == EventType.transfer) {
      const op = event.op as TransferOp;
      const amountInt = bnUint(op.amt, decimal.get(op.tick));
      this.assets.mint(event.from, op.tick, amountInt, "pendingSwap");
      this.pendingEvent.push(event);
    } else if (event.event == EventType.withdraw) {
      const op = event.op as WithdrawOp;
      const amountInt = bnUint(op.amt, decimal.get(op.tick));
      this.assets.burn(event.from, op.tick, amountInt, "available");
    } else if (event.event == EventType.approve) {
      const op = event.op as ApproveOp;
      const amountInt = bnUint(event.data.amount, decimal.get(op.tick));
      this.assets.burn(event.from, op.tick, amountInt, "approve");
      this.assets.mint(event.to, op.tick, amountInt, "pendingSwap");
      this.pendingEvent.push(event);
    } else if (event.event == EventType.conditionalApprove) {
      const op = event.op as ConditionalApproveOp;
      need(bn(event.data.amount).gt("0"), null, null, true);
      const amountInt = bnUint(event.data.amount, decimal.get(op.tick));
      this.assets.burn(event.from, op.tick, amountInt, "conditionalApprove");
      this.assets.mint(event.to, op.tick, amountInt, "pendingSwap");
      this.pendingEvent.push(event);
    } else if (event.event == EventType.inscribeApprove) {
      const op = event.op as ApproveOp;
      const amountInt = bnUint(op.amt, decimal.get(op.tick));
      this.assets.convert(event.to, op.tick, amountInt, "available", "approve");
    } else if (event.event == EventType.inscribeConditionalApprove) {
      const op = event.op as ConditionalApproveOp;
      const amountInt = bnUint(op.amt, decimal.get(op.tick));
      this.assets.convert(
        event.to,
        op.tick,
        amountInt,
        "available",
        "conditionalApprove"
      );
    } else if (event.event == EventType.commit) {
      const op = event.op as CommitOp;
      const { inscriptionId, height } = event;

      const gasPrice = op.gas_price;
      ret = [];
      for (let i = 0; i < op.data.length; i++) {
        const func = convertFuncInscription2Internal(i, op, height);
        try {
          ret.push(this.aggregate(func, gasPrice, height));
        } catch (err) {
          sysFatal({
            tag: TAG,
            msg: "handle-commit",
            error: err.message,
            inscriptionId,
            parent: op.parent,
          });
        }
      }

      if (hasFuncType(op, FuncType.decreaseApproval)) {
        this.pendingEvent.push(event);
      }
    }
    return ret;
  }

  checkAndUpdateEventCoherence(event: OpEvent) {
    if (event.cursor == PENDING_CURSOR) {
      need(event.op.op == OpType.commit, null, null, true);

      const op = event.op as CommitOp;
      if (this.lastCommitId) {
        need(
          this.lastCommitId == op.parent,
          `inscriptoionId: ${this.lastCommitId} should be parent, but get parent: ${op.parent}`,
          null
          // true
        );
      }
      if (event.inscriptionId) {
        this.lastCommitId = event.inscriptionId;
      }
    } else {
      if (this.lastHandledApiEvent) {
        if (this.lastHandledApiEvent.cursor + 1 !== event.cursor) {
          logger.error({
            tag: TAG,
            msg: "cursor error 2",
            lastCursor: this.lastHandledApiEvent.cursor,
            cursor: event.cursor,
          });
        }
        need(this.lastHandledApiEvent.cursor + 1 == event.cursor);
      }
      this.lastHandledApiEvent = event;
      if (event.op.op == OpType.commit) {
        if (event.inscriptionId) {
          this.lastCommitId = event.inscriptionId;
        }
      }

      /****************************************
       * collector processing:
       * 1. collect data
       * 2. data processing (option)
       * 3. cursor++
       ****************************************/

      /*3*/ if (this.notifyDataCollector) {
        this.notifyDataCollector.checkAndUpdateCurCursor(event.cursor);
      }
    }
  }

  handleEvent(
    event: OpEvent,
    processing: AssetProcessing = null
  ): ContractResult[] {
    this.checkAndUpdateEventCoherence(event);
    if (this.spaceType !== SpaceType.pending) {
      need(event.cursor !== PENDING_CURSOR, "space error 1", null, true);
    }
    if (
      this.spaceType !== SpaceType.pending &&
      this.spaceType !== SpaceType.mempool
    ) {
      need(event.height !== UNCONFIRM_HEIGHT, "space error 2", null, true);
    }

    let ret: ContractResult[] = null;
    if (event.valid) {
      // process data
      this.notifyDataCollector?.setAssetProcessing(processing);
      this.updatePending(); // when inscribe approve, the balance may has not been converted yet
      ret = this.__handleOpEvent(event);
      this.updatePending(); // maybe need to convert the balance immediately
      this.notifyDataCollector?.setAssetProcessing(null);
    }

    return ret;
  }

  getBalance(address: string, tick: string): AddressBalance {
    try {
      checkTick(tick);
      return {
        module: bnDecimal(
          this.assets.getAggregateBalance(address, tick, [
            "available",
            "approve",
            "conditionalApprove",
          ]),
          decimal.get(tick)
        ),
        swap: bnDecimal(
          this.assets.getBalance(address, tick, "swap"),
          decimal.get(tick)
        ),
        pendingSwap: bnDecimal(
          this.assets.getBalance(address, tick, "pendingSwap"),
          decimal.get(tick)
        ),
        pendingAvailable: bnDecimal(
          this.assets.getBalance(address, tick, "pendingAvailable"),
          decimal.get(tick)
        ),
      };
    } catch (err) {
      return {
        module: "0",
        swap: "0",
        pendingSwap: "0",
        pendingAvailable: "0",
      };
    }
  }

  partialClone(address: string, tick: string) {
    need(!!tick);
    let tick0: string;
    let tick1: string;
    let tickIsLp = isLp(tick);
    if (tickIsLp) {
      const res = getPairStructV2(tick);
      tick0 = res.tick0;
      tick1 = res.tick1;
    }

    const map = this.assets.dataRefer();
    const assets: SnapshotObj["assets"] = {};

    const list = [tick];
    if (tick0) {
      list.push(tick0);
      list.push(tick1);
    }
    if (!list.includes(env.ModuleInitParams.gas_tick)) {
      list.push(env.ModuleInitParams.gas_tick);
    }

    const { fee_to, gas_to } = env.ModuleInitParams;

    for (const assetType in map) {
      assets[assetType] = {};
      list.forEach((item) => {
        if (map[assetType][item]) {
          assets[assetType][item] = new Brc20(
            {},
            item,
            map[assetType][item].Supply,
            assetType
          );
          assets[assetType][item].balance[address] =
            map[assetType][item].balanceOf(address);

          assets[assetType][item].balance[fee_to] =
            map[assetType][item].balanceOf(fee_to);
          assets[assetType][item].balance[gas_to] =
            map[assetType][item].balanceOf(gas_to);

          // pool reserve
          if (tickIsLp) {
            if (item !== tick) {
              assets[assetType][item].balance[tick] =
                map[assetType][item].balanceOf(tick);
            } else {
              assets[assetType][item].balance = _.cloneDeep(
                map[assetType][item].balance
              );
            }
          }
        }
      });
    }

    const contractStatus = _.cloneDeep(this.contract.status);

    return new Space(
      {
        assets,
        contractStatus,
        used: false,
      },
      this.contract.config,
      this.LastCommitId,
      this.lastHandledApiEvent,
      false,
      this.spaceType
    );
  }

  snapshot(): SnapshotObj {
    const startTime = Date.now();
    const ret = cloneSnapshot({
      assets: this.assets.dataRefer(),
      contractStatus: this.contract.status,
      used: false,
    });
    const ht = Date.now() - startTime;
    logger.debug({
      tag: TAG,
      msg: "snapshot",
      ht,
      cursor: builder.MempoolSpaceCursor,
    });
    return ret;
  }
}
