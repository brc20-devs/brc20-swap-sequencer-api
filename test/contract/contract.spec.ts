export type TestDataList = {
  feeSwapRate: string;
  feeLiqRate: string;
  list: TestData[];
};

export type TestData =
  | {
      type: FuncType.deployPool;
      params: DeployPoolIn;
      result: Result;
    }
  | {
      type: FuncType.addLiq;
      params: AddLiqIn;
      result: Result;
    }
  | {
      type: FuncType.swap;
      params: SwapIn;
      result: Result;
    }
  | {
      type: FuncType.removeLiq;
      params: RemoveLiqIn;
      result: Result;
    }
  | {
      type: OpType.transfer;
      params: {
        address: string;
        tick: string;
        amt: string;
      };
      result: Result;
    };

import { expect } from "chai";
import { describe, it } from "mocha";
import { config } from "../../src/config";
import { bnUint } from "../../src/contract/bn";
import { ContractLoader } from "../../src/contract/contract-loader";
import { convertResultToDecimal } from "../../src/domain/convert-struct";
import { Decimal } from "../../src/domain/decimal";
import { Space } from "../../src/domain/space";
import {
  AddLiqIn,
  DeployPoolIn,
  FuncType,
  InternalFunc,
  RemoveLiqIn,
  Result,
  SwapIn,
} from "../../src/types/func";
import { OpType } from "../../src/types/op";
import { data } from "./contract-data";

describe("Contract", () => {
  it("test contract functions", async () => {
    global.config = config;
    global.decimal = new Decimal();
    global.contractLoader = new ContractLoader();
    config.isContractOnChain = false;

    const env = {
      ModuleInitParams: {
        gas_tick: "sats",
        gas_fee: "",
      },
    };
    global.env = env as any;

    decimal.set("ordi", "18");
    decimal.set("test", "18");
    decimal.set("sats", "18");

    const gasPrice = "0";
    const space = new Space(
      {
        assets: {
          swap: {},
          pendingSwap: {},
          module: {},
          approve: {},
          conditionalApprove: {},
        },
        assetsCheck: {},
        contractStatus: {
          kLast: {},
        },
      },
      {
        feeTo: "",
        swapFeeRate1000: "0",
      }
    );
    const contract = space.Contract;
    contract.assets.tryCreate("sats");

    for (let i = 0; i < data.list.length; i++) {
      const item = data.list[i];
      item.result = convertResultToDecimal(item.result);

      if (item.type == OpType.transfer) {
        contract.assets.mint(
          item.params.address,
          item.params.tick,
          bnUint(item.params.amt, decimal.get(item.params.tick)),
          "swap"
        );
      } else {
        const func: InternalFunc = {
          id: "",
          prevs: [],
          ts: 0,
          sig: "",
          func: item.type as any,
          params: item.params as any,
        };

        const res = space.aggregate(func, gasPrice);

        if (item.result.pools) {
          const res1 = item.result.pools.sort((a, b) => {
            return a.pair > b.pair ? 1 : -1;
          });
          const res2 = res.result.pools.sort((a, b) => {
            return a.pair > b.pair ? 1 : -1;
          });

          for (let i = 0; i < res1.length; i++) {
            const item1 = res1[i];
            for (let j = 0; j < res2.length; j++) {
              const item2 = res2[j];
              if (item1.pair == item2.pair) {
                expect(item1).deep.eq(item2);
              }
            }
          }
        }
        if (item.result.users) {
          const res1 = item.result.users.sort((a, b) => {
            return a.address + a.tick > b.address + b.tick ? 1 : -1;
          });
          const res2 = res.result.users.sort((a, b) => {
            return a.address + a.tick > b.address + b.tick ? 1 : -1;
          });

          for (let i = 0; i < res1.length; i++) {
            const item1 = res1[i];
            for (let j = 0; j < res2.length; j++) {
              const item2 = res2[j];
              if (item1.address == item2.address && item1.tick == item2.tick) {
                expect(item1).deep.eq(item2);
              }
            }
          }
        }
      }
    }
  });
});
