// import { randomUUID } from "crypto";
// import { FuncType } from "./types/func";
// import { OpType } from "./types/op";

export async function fakeData() {
  await decimal.trySetting("ordi");
  await decimal.trySetting("test");
  await decimal.trySetting("sats");

  // operator.NewestSpace.handleOpEvent({
  //   op: {
  //     p: "brc20",
  //     op: OpType.transfer,
  //     tick: "ordi",
  //     amt: "50000",
  //   },
  //   height: 10086,
  //   address: "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
  //   inscriptionId: "",
  //   blocktime: 1694068633277,
  //   txid: "",
  //   amount: "",
  // });
  // operator.NewestSpace.handleOpEvent({
  //   op: {
  //     p: "brc20",
  //     op: OpType.transfer,
  //     tick: "test",
  //     amt: "50000",
  //   },
  //   height: 10086,
  //   address: "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
  //   inscriptionId: "",
  //   blocktime: 1694068633277,
  //   txid: "",
  //   amount: "",
  // });
  // operator.NewestSpace.handleOpEvent({
  //   op: {
  //     p: "brc20",
  //     op: OpType.transfer,
  //     tick: "sats",
  //     amt: "50000",
  //   },
  //   height: 10086,
  //   address: "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
  //   inscriptionId: "",
  //   blocktime: 1694068633277,
  //   txid: "",
  //   amount: "",
  // });
  // operator.NewestSpace.handleOpEvent({
  //   op: {
  //     p: "brc20",
  //     op: OpType.transfer,
  //     tick: "ordi",
  //     amt: "50000",
  //   },
  //   height: 10086,
  //   address: "tb1p7qsamzcjffpvg8ej9dqkf7gp2ygs0xdth3tn4f2a3xvl0jg43f7qauqftj",
  //   inscriptionId: "",
  //   blocktime: 1694068633277,
  //   txid: "",
  //   amount: "",
  // });
  // operator.NewestSpace.handleOpEvent({
  //   op: {
  //     p: "brc20",
  //     op: OpType.transfer,
  //     tick: "test",
  //     amt: "50000",
  //   },
  //   height: 10086,
  //   address: "tb1p7qsamzcjffpvg8ej9dqkf7gp2ygs0xdth3tn4f2a3xvl0jg43f7qauqftj",
  //   inscriptionId: "",
  //   blocktime: 1694068633277,
  //   txid: "",
  //   amount: "",
  // });
  // operator.NewestSpace.aggregate(
  //   {
  //     id: randomUUID(),
  //     func: FuncType.deployPool,
  //     params: {
  //       address:
  //         "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
  //       tick0: "test",
  //       tick1: "ordi",
  //     },
  //     prevs: [],
  //     ts: Date.now(),
  //     sig: "",
  //   },
  //   2
  // );
  // operator.NewestSpace.aggregate(
  //   {
  //     id: randomUUID(),
  //     func: FuncType.addLiq,
  //     params: {
  //       address:
  //         "tb1pe0ejf236zwxf4avwwjggs42v579nwt0xsspgcmq9kkgwygq5297snpqxt5",
  //       tick0: "test",
  //       tick1: "ordi",
  //       amount0: "10000000",
  //       amount1: "10000000",
  //       expect: "0",
  //       slippage1000: "1000",
  //     },
  //     prevs: [],
  //     ts: Date.now(),
  //     sig: "",
  //   },
  //   2
  // );
}
