import { uintCal } from "../../src/contract/bn";
import { ExactType, FuncType } from "../../src/types/func";
import { OpType } from "../../src/types/op";
import { TestDataList } from "./contract.spec";

export const data = {
  feeSwapRate: "0",
  feeLiqRate: "0",
  list: [
    {
      type: FuncType.deployPool,
      params: {
        address: "1",
        tick0: "ordi",
        tick1: "sats",
      },
      result: {
        users: [
          { address: "1", tick: "test", balance: "0" },
          {
            address:
              "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
            tick: "test",
            balance: "0",
          },
        ],
      },
    },
    {
      type: OpType.transfer,
      params: { address: "1", tick: "ordi", amt: "10000" },
      result: {},
    },
    {
      type: OpType.transfer,
      params: { address: "1", tick: "sats", amt: "50000" },
      result: {},
    },
    {
      type: FuncType.addLiq,
      params: {
        address: "1",
        tick0: "ordi",
        amount0: uintCal(["10000", "mul", "1e18"]),
        amount1: uintCal(["50000", "mul", "1e18"]),
        tick1: "sats",
        expect: "0",
        slippage1000: "0",
      },
      result: {
        pools: [
          {
            pair: "ordi/sats",
            reserve0: uintCal(["10000", "mul", "1e18"]),
            reserve1: uintCal(["50000", "mul", "1e18"]),
            lp: "22360679774997896964091",
          },
        ],
        users: [
          {
            address: "1",
            tick: "ordi/sats",
            balance: "22360679774997896963091",
          },
          {
            address:
              "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
            tick: "test",
            balance: "0",
          },
          { address: "1", tick: "ordi", balance: "0" },
          { address: "1", tick: "sats", balance: "0" },
          { address: "1", tick: "test", balance: "0" },
        ],
      },
    },
    {
      type: OpType.transfer,
      params: { address: "2", tick: "ordi", amt: "10000" },
      result: {},
    },
    {
      type: OpType.transfer,
      params: { address: "2", tick: "sats", amt: "50000" },
      result: {},
    },
    {
      type: FuncType.addLiq,
      params: {
        address: "2",
        tick0: "ordi",
        amount0: uintCal(["10000", "mul", "1e18"]),
        amount1: uintCal(["50000", "mul", "1e18"]),
        tick1: "sats",
        expect: "0",
        slippage1000: "0",
      },
      result: {
        pools: [
          {
            pair: "ordi/sats",
            reserve0: uintCal(["20000", "mul", "1e18"]),
            reserve1: uintCal(["100000", "mul", "1e18"]),
            lp: "44721359549995793928182",
          },
        ],
        users: [
          {
            address: "2",
            tick: "ordi/sats",
            balance: "22360679774997896964091",
          },
          {
            address:
              "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
            tick: "test",
            balance: "0",
          },
          { address: "2", tick: "ordi", balance: "0" },
          { address: "2", tick: "sats", balance: "0" },
          { address: "2", tick: "test", balance: "0" },
        ],
      },
    },
    {
      type: OpType.transfer,
      params: { address: "1", tick: "ordi", amt: "10" },
      result: {},
    },
    {
      type: FuncType.swap,
      params: {
        address: "1",
        tickIn: "ordi",
        tickOut: "sats",
        amount: uintCal(["10", "mul", "1e18"]),
        exactType: ExactType.exactIn,
        expect: "0",
        slippage1000: "0",
      },
      result: {
        pools: [
          {
            pair: "ordi/sats",
            reserve0: uintCal(["20010", "mul", "1e18"]),
            reserve1: "99950024987506246876562",
            lp: "44721359549995793928182",
          },
        ],
        users: [
          {
            address:
              "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
            tick: "test",
            balance: "0",
          },
          { address: "1", tick: "ordi", balance: "0" },
          { address: "1", tick: "sats", balance: "49975012493753123438" },
          { address: "1", tick: "test", balance: "0" },
        ],
      },
    },
    {
      type: OpType.transfer,
      params: { address: "1", tick: "sats", amt: "100" },
      result: {},
    },
    {
      type: FuncType.swap,
      params: {
        address: "1",
        tickIn: "sats",
        tickOut: "ordi",
        amount: uintCal(["100", "mul", "1e18"]),
        exactType: ExactType.exactIn,
        expect: "0",
        slippage1000: "0",
      },
      result: {
        pools: [
          {
            pair: "ordi/sats",
            reserve0: "19990000004995002499999",
            reserve1: "100050024987506246876562",
            lp: "44721359549995793928182",
          },
        ],
        users: [
          {
            address:
              "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
            tick: "test",
            balance: "0",
          },
          { address: "1", tick: "ordi", balance: "19999995004997500001" },
          { address: "1", tick: "sats", balance: "49975012493753123438" },
          { address: "1", tick: "test", balance: "0" },
        ],
      },
    },
    {
      type: FuncType.removeLiq,
      params: {
        address: "2",
        lp: "22360679774997896964091",
        tick0: "ordi",
        tick1: "sats",
        amount0: "0",
        amount1: "0",
        slippage1000: "0",
      },
      result: {
        pools: [
          {
            pair: "ordi/sats",
            reserve0: "9995000002497501250000",
            reserve1: "50025012493753123438281",
            lp: "22360679774997896964091",
          },
        ],
        users: [
          { address: "2", tick: "ordi/sats", balance: "0" },
          {
            address:
              "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
            tick: "test",
            balance: "0",
          },
          { address: "2", tick: "ordi", balance: "9995000002497501249999" },
          { address: "2", tick: "sats", balance: "50025012493753123438281" },
          { address: "2", tick: "test", balance: "0" },
        ],
      },
    },
    {
      type: OpType.transfer,
      params: { address: "3", tick: "sats", amt: "100" },
      result: {},
    },
    {
      type: FuncType.swap,
      params: {
        address: "3",
        tickIn: "sats",
        tickOut: "ordi",
        amount: uintCal(["100", "mul", "1e18"]),
        exactType: ExactType.exactIn,
        expect: "0",
        slippage1000: "0",
      },
      result: {
        pools: [
          {
            pair: "ordi/sats",
            reserve0: "9975059857836703135540",
            reserve1: "50125012493753123438281",
            lp: "22360679774997896964091",
          },
        ],
        users: [
          {
            address:
              "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
            tick: "test",
            balance: "0",
          },
          { address: "3", tick: "ordi", balance: "19940144660798114460" },
          { address: "3", tick: "sats", balance: "0" },
          { address: "3", tick: "test", balance: "0" },
        ],
      },
    },
    {
      type: FuncType.swap,
      params: {
        address: "3",
        tickIn: "ordi",
        tickOut: "sats",
        amount: uintCal(["18", "mul", "1e18"]),
        exactType: ExactType.exactOut,
        expect: uintCal(["1000", "mul", "1e18"]),
        slippage1000: "0",
      },
      result: {
        pools: [
          // {
          //   pair: "ordi/sats",
          //   amount0: "9975.05985783670313554",
          //   amount1: "50125.012493753123438281",
          //   lp: "22360.679774997896964091",
          // },
        ],
        users: [
          {
            address: "3",
            tick: "ordi",
            balance: uintCal([
              "19940144660798114460",
              "sub",
              uintCal([
                "9975059857836703135540",
                "mul",
                "18000000000000000000",
                "div",
                uintCal([
                  "50125012493753123438281",
                  "sub",
                  "18000000000000000000",
                ]),
                "add",
                "1",
              ]),
            ]),
          },
          { address: "3", tick: "sats", balance: "18000000000000000000" },
        ],
      },
    },
  ],
} as TestDataList;
