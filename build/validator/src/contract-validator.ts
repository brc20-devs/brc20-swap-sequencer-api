import _ from "lodash";
import { Assets } from "../../../src/contract/assets";
import { bn, bnDecimal, bnUint, decimalCal } from "../../../src/contract/bn";
import {
  getPairStr,
  need,
  sortTickParams,
} from "../../../src/contract/contract-utils";
import { LP_DECIMAL } from "../../../src/domain/constant";
import { EventType, InscriptionEventsRes } from "../../../src/types/api";
import { FuncMsg, OridinalMsg, Pair } from "../../../src/types/domain";
import {
  AddLiqParams,
  ContractResult,
  DecreaseApprovalParams,
  DeployPoolParams,
  ExactType,
  FuncType,
  InscriptionFunc,
  InternalFunc,
  RemoveLiqParams,
  Result,
  SwapParams,
} from "../../../src/types/func";
import {
  ApproveOp,
  CommitOp,
  ConditionalApproveOp,
  ModuleOp,
  OpEvent,
  OpType,
} from "../../../src/types/op";
// import { Contract } from "../../contract";
import { Contract } from "../../../src/contract/contract";
import { Decimal } from "./decimal";

function checkOpEvent(event: OpEvent) {
  const events = [
    EventType.approve,
    EventType.commit,
    EventType.conditionalApprove,
    EventType.inscribeApprove,
    EventType.inscribeConditionalApprove,
    EventType.inscribeModule,
    EventType.transfer,
  ];
  if (!events.includes(event.event)) {
    throw new Error("unsupported op: " + event.event);
  }
}

export class ContractValidator {
  private contract: Contract;
  private decimal: Decimal;
  private moduleInitParams: ModuleOp["init"];
  private gas_to: string;

  readonly results: any[] = [];

  get Contract() {
    return this.contract;
  }

  private to1000(amount: string) {
    return (parseInt(amount) * 1000).toString();
  }

  private getFuncInternalLength(func: InscriptionFunc) {
    return Buffer.from(JSON.stringify(func)).length;
  }

  private getPairStruct(pair: string): Pair {
    const tick0 = Buffer.from(pair).subarray(0, 4).toString();
    const tick1 = Buffer.from(pair).subarray(5).toString();
    need(sortTickParams({ tick0, tick1 }).tick0 == tick0);
    return { tick0, tick1 };
  }

  private convertFuncInscription2Internal(
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

    // not care sign
    const id = "x".repeat(64);
    const prevs = [];

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
      const pair = this.getPairStruct(params[0]);
      const decimal0 = this.decimal.get(pair.tick0);
      const decimal1 = this.decimal.get(pair.tick1);
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
      const pair = this.getPairStruct(params[0]);
      const decimal0 = this.decimal.get(pair.tick0);
      const decimal1 = this.decimal.get(pair.tick1);
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
          amount: bnUint(params[2], this.decimal.get(params[1])),
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
      const pair = this.getPairStruct(params[0]);
      const decimal0 = this.decimal.get(pair.tick0);
      const decimal1 = this.decimal.get(pair.tick1);
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
          amount: bnUint(amount, this.decimal.get(tick)),
        },
        prevs,
        ts: lastFunc.ts,
        sig: lastFunc.sig,
      };
    }
  }

  private convertFuncInternal2Inscription(func: InternalFunc): InscriptionFunc {
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
          bnDecimal(params.amount0, this.decimal.get(params.tick0)),
          bnDecimal(params.amount1, this.decimal.get(params.tick1)),
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
          ? this.decimal.get(params.tickOut)
          : this.decimal.get(params.tickIn);
      const tick =
        params.exactType == ExactType.exactIn ? params.tickIn : params.tickOut;
      return {
        id: func.id,
        func: func.func,
        params: [
          getPairStr(params.tickIn, params.tickOut),
          tick,
          bnDecimal(params.amount, this.decimal.get(tick)),
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
          bnDecimal(params.amount0, this.decimal.get(params.tick0)),
          bnDecimal(params.amount1, this.decimal.get(params.tick1)),
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
          bnDecimal(params.amount, this.decimal.get(params.tick)),
        ] as DecreaseApprovalParams,
        addr: params.address,
        ts: func.ts,
        sig: func.sig,
      };
    }
  }

  calculateServerFee(gasPrice: number, funcLength: number) {
    return decimalCal(
      [gasPrice, "mul", funcLength],
      this.decimal.get(this.moduleInitParams.gas_tick)
    );
  }

  constructor() {}

  handleEvents(eventsData: InscriptionEventsRes, decimalData) {
    this.decimal = new Decimal(decimalData);
    for (let i = 0; i < eventsData.detail.length; i++) {
      const item = eventsData.detail[i];
      if (!item.valid) {
        continue;
      }

      const event: OpEvent = {
        event: item.type,
        height: item.height,
        from: item.from,
        to: item.to,
        inscriptionId: item.inscriptionId,
        inscriptionNumber: item.inscriptionNumber,
        op: JSON.parse(item.contentBody),
        blocktime: item.blocktime,
        txid: item.txid,
        data: item.data,
      };

      if ((event.op as any).tick) {
        (event.op as any).tick = this.decimal.getRealTick(
          (event.op as any).tick
        );
      }

      need(
        [
          OpType.approve,
          OpType.commit,
          OpType.conditionalApprove,
          OpType.deploy,
          OpType.transfer,
        ].includes(event.op.op)
      );

      if (event.op.op == OpType.deploy) {
        need(!!event.op.init.sequencer);
        need(!!event.op.init.fee_to);
        need(!!event.op.init.gas_to);
        need(!!event.op.init.gas_tick);

        this.moduleInitParams = event.op.init;
        this.gas_to = event.op.init.gas_to;
        this.contract = new Contract(
          new Assets({
            swap: {},
            pendingSwap: {},
            available: {},
            pendingAvailable: {},
            approve: {},
            conditionalApprove: {},
          }),
          {
            kLast: {},
          },
          {
            feeTo: this.moduleInitParams.fee_to,
            swapFeeRate1000: event.op.init.swap_fee_rate
              ? decimalCal([event.op.init.swap_fee_rate, "mul", 1000])
              : "0",
          }
        );
      } else if (event.op.op == OpType.transfer) {
        this.contract.assets.mint(
          event.from,
          event.op.tick,
          bnUint(event.op.amt, this.decimal.get(event.op.tick)),
          "swap"
        );
      } else if (event.op.op == OpType.commit) {
        for (let j = 0; j < event.op.data.length; j++) {
          try {
            const func = this.convertFuncInscription2Internal(j, event.op);
            this.aggregate(
              func,
              parseFloat(event.op.gas_price),
              event.inscriptionId,
              j
            );
          } catch (err) {
            console.log(event.op.data[j]);
            console.log(
              "func error: ",
              err.message,
              "\nsubsequent signatures with the same address will be invalid.\n"
            );
            throw err;
          }
        }
      } else if (event.event == EventType.approve) {
        const op = event.op as ApproveOp;
        const amountInt = bnUint(event.data.amount, this.decimal.get(op.tick));
        // this.contract.assets.burn(event.from, op.tick, amountInt, "approve");
        this.contract.assets.mint(event.to, op.tick, amountInt, "swap");
      } else if (event.event == EventType.conditionalApprove) {
        const op = event.op as ConditionalApproveOp;
        if (bn(event.data.amount).gt("0")) {
          const amountInt = bnUint(
            event.data.amount,
            this.decimal.get(op.tick)
          );
          // this.contract.assets.burn(event.from, op.tick, amountInt, "conditionalApprove");
          this.contract.assets.mint(event.to, op.tick, amountInt, "swap");
        }
      }
    }
  }

  aggregate(
    func: InternalFunc,
    gasPrice: number,
    commit: string,
    index: number
  ) {
    const funcLength = this.getFuncInternalLength(
      this.convertFuncInternal2Inscription(func)
    );
    const gasTick = this.moduleInitParams.gas_tick;
    const amount = this.calculateServerFee(gasPrice, funcLength);
    const sendParams = {
      address: func.params.address,
      from: func.params.address,
      to: this.gas_to,
      amount: bnUint(amount, this.decimal.get(gasTick)),
      tick: gasTick,
    };

    // fee
    if (gasPrice > 0) {
      this.contract.send(sendParams);
    }

    let out: ContractResult["out"];
    if (func.func == FuncType.deployPool) {
      out = this.contract.deployPool(func.params);
    } else if (func.func == FuncType.addLiq) {
      out = this.contract.addLiq(func.params);
    } else if (func.func == FuncType.swap) {
      out = this.contract.swap(func.params);
    } else if (func.func == FuncType.removeLiq) {
      out = this.contract.removeLiq(func.params);
    } else if (func.func == FuncType.decreaseApproval) {
      const { address, tick, amount } = func.params;
      this.contract.assets.convert(
        address,
        tick,
        amount,
        "swap",
        "pendingAvailable"
      );
      out = { id: func.id };
    }

    this.results.push(this.genResult({ commit, function: index }));
  }

  isLp(tick: string) {
    return Buffer.from(tick).length == 9 && tick[4] == "/";
  }

  genResult(params?: { commit: string; function: number }) {
    const assets = this.contract.assets;
    const map = this.contract.assets.dataRefer();
    const data: Result = {
      users: [],
      pools: [],
    };
    for (let tick in map["swap"]) {
      const brc20 = map["swap"][tick];

      if (this.isLp(tick)) {
        const pair = tick;
        const { tick0, tick1 } = this.getPairStruct(pair);

        let reserve1 = "0";
        let reserve0 = "0";
        try {
          reserve0 = bnDecimal(
            assets.get(tick0).balanceOf(pair),
            this.decimal.get(tick0)
          );
        } catch (err) {}

        try {
          reserve1 = bnDecimal(
            assets.get(tick1).balanceOf(pair),
            this.decimal.get(tick1)
          );
        } catch (err) {}

        data.pools.push({
          pair: tick,
          reserve0,
          reserve1,
          lp: bnDecimal(assets.get(pair).supply, LP_DECIMAL),
        });
      }

      for (let key in brc20.balance) {
        if (!this.isLp(key)) {
          const address = key;
          data.users.push({
            address,
            tick,
            balance: !this.isLp(tick)
              ? bnDecimal(
                  assets.get(tick).balanceOf(address),
                  this.decimal.get(tick)
                )
              : bnDecimal(assets.get(tick).balanceOf(address), "18"),
          });
        }
      }
    }
    if (params) {
      data["commit"] = params.commit;
      data["function"] = params.function;
    }
    return data;
  }

  verify(finalResultData) {
    // const fs = require("fs");
    // const path = require("path");
    // fs.writeFileSync(
    //   path.join(__dirname, "../result-expect.ignore.json"),
    //   JSON.stringify(finalResultData)
    // );
    // fs.writeFileSync(
    //   path.join(__dirname, "../result-real.ignore.json"),
    //   JSON.stringify(this.genResult())
    // );
    // expect(this.genResult()).to.deep.eq(finalResultData);

    /**
     * @node  maybe neet to replace sequencer
     */
    return _.isEqual(this.genResult(), finalResultData);
  }
}
