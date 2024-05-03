import _ from "lodash";
import hash from "object-hash";
import { Assets } from "../contract/assets";
import { bn, bnDecimal, bnUint, decimalCal } from "../contract/bn";
import { Contract } from "../contract/contract";
import {
  getPairStr,
  getPairStruct,
  sortTickParams,
} from "../contract/contract-utils";
import { EventType } from "../types/api";
import { AddressBalance, ContractConfig, SpaceSnapshot } from "../types/domain";
import { ContractResult, FuncType, InternalFunc, Result } from "../types/func";
import {
  ApproveOp,
  CommitOp,
  ConditionalApproveOp,
  OpEvent,
  TransferOp,
} from "../types/op";
import {
  AllAddressBalanceRes,
  PoolInfoReq,
  SelectReq,
  SelectRes,
} from "../types/route";
import { printErr } from "../utils/utils";
import { AssetsChecker } from "./assets-checker";
import {
  convertFuncInscription2Internal,
  convertFuncInternal2Inscription,
  convertResultToDecimal,
} from "./convert-struct";
import { EventsChecker } from "./events-checker";
import {
  checkOpEvent,
  checkTick,
  getConfirmedNum,
  getFuncInternalLength,
  hasFuncType,
  isLp,
  isMatch,
  need,
} from "./utils";

export class Space {
  readonly eventsChecker: EventsChecker = new EventsChecker();
  private assets: Assets;
  private assetsChecker: AssetsChecker;
  private contract: Contract;
  private pendingEvent: OpEvent[] = [];
  private lastCommitId: string;

  constructor(_snapshot: SpaceSnapshot, _contractConfig: ContractConfig) {
    const snapshot = _.cloneDeep(_snapshot);
    const contractConfig = _.cloneDeep(_contractConfig);

    const Contract = contractLoader.getClass();
    this.assets = new Assets(snapshot.assets);
    this.assetsChecker = new AssetsChecker(snapshot.assetsCheck);
    this.contract = new Contract(
      this.assets,
      snapshot.contractStatus,
      contractConfig
    );
  }

  private updatePending() {
    let newPendingEvent = [];
    for (let i = 0; i < this.pendingEvent.length; i++) {
      const event = this.pendingEvent[i];

      checkOpEvent(event);

      // TODO: check inscription exist

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

  async tick() {
    this.updatePending();
  }

  get Assets() {
    return this.assets;
  }

  get Contract() {
    return this.contract;
  }

  aggregate(func: InternalFunc, gasPrice: string): ContractResult {
    const funcLength = getFuncInternalLength(
      convertFuncInternal2Inscription(func)
    );
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
        logger.error({ tag: "decrease-approval", func });
        throw err;
      }
    } else if (func.func == FuncType.send) {
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
        "pendingSwap",
      ]);
    };

    // user, pool, sequencer balance
    const getPartialResult = (address: string, pair: string): Result => {
      const { tick0, tick1 } = getPairStruct(pair);
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
            lp: this.assets.get(pair)?.supply || "0",
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
      const pair = getPairStr(tick0, tick1);
      result = getPartialResult(address, pair);
    } else if (func.func == FuncType.swap) {
      const { address, tickIn, tickOut } = func.params;
      const pair = getPairStr(tickIn, tickOut);
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

  handleOpEvent(event: OpEvent): ContractResult[] {
    let ret: ContractResult[] = null;

    /**
     * @note The order of events may change, so the cursor may not be accurate
     */
    const result = this.eventsChecker.getEventResult(event);
    if (result !== undefined) {
      return result;
    }

    // when inscribe approve, the balance may has not been converted yet
    this.updatePending();

    if (event.event == EventType.transfer) {
      const op = event.op as TransferOp;
      try {
        this.assetsChecker.checkTransfer(event.inscriptionId, op.amt);
      } catch (err) {
        if (inited) {
          // There may be duplicate processing during the startup process due to the disorder of op_list relative to op_confirm. [1]
          throw err;
        } else {
          return;
        }
      }

      const amountInt = bnUint(op.amt, decimal.get(op.tick));
      this.assets.mint(event.from, op.tick, amountInt, "pendingSwap");
      this.pendingEvent.push(event);
    } else if (event.event == EventType.approve) {
      const op = event.op as ApproveOp;
      try {
        this.assetsChecker.checkApprove(event.inscriptionId, op.amt);
      } catch (err) {
        if (inited) {
          // same as [1]
          throw err;
        } else {
          return;
        }
      }

      const amountInt = bnUint(event.data.amount, decimal.get(op.tick));
      this.assets.burn(event.from, op.tick, amountInt, "approve");
      this.assets.mint(event.to, op.tick, amountInt, "pendingSwap");
      this.pendingEvent.push(event);
    } else if (event.event == EventType.conditionalApprove) {
      const op = event.op as ConditionalApproveOp;
      if (bn(event.data.amount).gt("0")) {
        try {
          this.assetsChecker.checkConditionalApprove(
            event.inscriptionId,
            event.data.amount,
            event.data.transfer,
            event.data.transferMax
          );
        } catch (err) {
          if (inited) {
            // same as [1]
            throw err;
          } else {
            return;
          }
        }

        const amountInt = bnUint(event.data.amount, decimal.get(op.tick));
        this.assets.burn(event.from, op.tick, amountInt, "conditionalApprove");
        this.assets.mint(event.to, op.tick, amountInt, "pendingSwap");
        this.pendingEvent.push(event);
      } else {
        logger.error({ tag: "bug-event", event });
      }
    } else if (event.event == EventType.inscribeApprove) {
      const op = event.op as ApproveOp;

      try {
        this.assetsChecker.checkInscribeApprove(event.inscriptionId, op.amt);
      } catch (err) {
        if (inited) {
          // same as [1]
          throw err;
        } else {
          return;
        }
      }

      const amountInt = bnUint(op.amt, decimal.get(op.tick));
      this.assets.convert(event.to, op.tick, amountInt, "available", "approve");
    } else if (event.event == EventType.inscribeConditionalApprove) {
      const op = event.op as ConditionalApproveOp;

      try {
        this.assetsChecker.checkInscribeConditionalApprove(
          event.inscriptionId,
          op.amt
        );
      } catch (err) {
        if (inited) {
          // same as [1]
          throw err;
        } else {
          return;
        }
      }

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
      ret = this.handleCommitOp(op, event.inscriptionId);
      if (hasFuncType(op, FuncType.decreaseApproval)) {
        this.pendingEvent.push(event);
      }
    }

    // maybe need to convert the balance immediately
    this.updatePending();

    this.eventsChecker.addEventResult(event, ret);
    return ret;
  }

  handleCommitOp(op: CommitOp, inscriptionId: string) {
    const result = this.eventsChecker.getCommmitResult(op.parent);
    if (result !== undefined) {
      return result;
    }

    if (inscriptionId) {
      if (this.lastCommitId) {
        need(
          this.lastCommitId == op.parent,
          `last parent should be: ${this.lastCommitId}, but get parent: ${op.parent}`
        );
      }
      this.lastCommitId = inscriptionId;
    }

    const gasPrice = op.gas_price;
    const ret: ContractResult[] = [];
    for (let i = 0; i < op.data.length; i++) {
      const func = convertFuncInscription2Internal(i, op);
      try {
        ret.push(this.aggregate(func, gasPrice));
      } catch (err) {
        logger.error({ tag: "bug-handle-commit", id: func.id });
        throw err;
      }
    }
    this.eventsChecker.addCommitResult(op.parent, ret);
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

  getAllBalance(address: string): AllAddressBalanceRes {
    const ret = {};
    const assets = this.assets.getAvaiableAssets(address);
    assets.forEach((tick) => {
      if (!isLp(tick)) {
        ret[tick] = {
          balance: this.getBalance(address, tick),
          decimal: decimal.get(tick),
          withdrawLimit:
            config.whitelistTick[tick.toLowerCase()]?.withdrawLimit || "0",
        };
      }
    });
    return ret;
  }

  getPoolInfo(params: PoolInfoReq) {
    const pair = getPairStr(params.tick0, params.tick1);
    const existed = this.assets.isExist(pair);
    if (!existed) {
      return { existed, addLiq: false };
    } else {
      const addLiq = bn(this.assets.get(pair).supply).gt("0");
      return { existed, addLiq };
    }
  }

  async getSelect(params: SelectReq): Promise<SelectRes> {
    const { address, search } = params;
    const list = decimal.getAllTick();
    const balances = await api.tickBalance(address);
    const ret0 = list.map((tick) => {
      let brc20Balance = "0";
      for (let i = 0; i < balances.detail.length; i++) {
        if (balances.detail[i].ticker == tick) {
          brc20Balance = balances.detail[i].overallBalance;
          break;
        }
      }
      let swapBalance = bnDecimal(
        this.assets.getBalance(address, tick),
        decimal.get(tick)
      );
      return { tick, brc20Balance, swapBalance, decimal: decimal.get(tick) };
    });
    const ret1 = ret0.sort((a, b) => {
      return bn(b.swapBalance).gt(a.swapBalance) ? 1 : -1;
    });
    const ret2 = ret0.sort((a, b) => {
      return bn(b.brc20Balance).gt(a.brc20Balance) ? 1 : -1;
    });
    let ret: SelectRes = [];

    const set = new Set();
    for (let i = 0; i < ret1.length; i++) {
      if (ret1[i].swapBalance !== "0") {
        ret.push(ret1[i]);
        set.add(ret1[i].tick);
      } else {
        break;
      }
    }
    for (let i = 0; i < ret2.length; i++) {
      if (!set.has(ret2[i].tick)) {
        ret.push(ret2[i]);
      }
    }
    if (search) {
      ret = ret.filter((a) => {
        return isMatch(a.tick, search);
      });
    }
    ret = ret.filter((a) => {
      try {
        checkTick(a.tick);
        return true;
      } catch (err) {
        return false;
      }
    });
    return ret.slice(0, 20);
  }

  partialClone(address: string, tick: string) {
    need(!!tick);
    let tick0: string;
    let tick1: string;
    let tickIsLp = isLp(tick);
    if (tickIsLp) {
      const res = getPairStruct(tick);
      tick0 = res.tick0;
      tick1 = res.tick1;
    }

    const map = this.assets.dataRefer();
    const assets: SpaceSnapshot["assets"] = {};

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
          assets[assetType][item] = { balance: {}, tick: item };
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
      { assets, assetsCheck: {}, contractStatus },
      this.contract.config
    );
  }

  snapshot(): SpaceSnapshot {
    return _.cloneDeep({
      assets: this.assets.dataRefer(),
      assetsCheck: this.assetsChecker.dataRefer(),
      contractStatus: this.contract.status,
    });
  }

  isEqual(space: Space) {
    try {
      this.updatePending();
      space.updatePending();
      return hash(this.snapshot()) == hash(space.snapshot());
    } catch (err) {
      printErr("isEqual", err);
      return false;
    }
  }
}
