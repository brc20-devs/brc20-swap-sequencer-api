import fs from "fs";
import path from "path";
import { Assets } from "../src/contract/assets";
import { bnDecimal } from "../src/contract/bn";
import { getPairStructV2 } from "../src/contract/contract-utils";
import { LP_DECIMAL } from "../src/domain/constant";
import { getSnapshotObjFromDao, isLp } from "../src/domain/utils";
import { init } from "../src/init";
import { Result } from "../src/types/func";

const printDecimal = async () => {
  let map = {};
  let all = decimal.getAllTick();
  all.forEach((tick) => {
    map[tick] = decimal.get(tick);
  });
  fs.writeFileSync(
    path.join(__dirname, "./validator/data/decimal.json"),
    JSON.stringify(map)
  );
  console.log("print decimal success");
};

const printEvents = async () => {
  const status = await statusDao.findStatus();

  const ret = await api.eventRawList({
    moduleId: config.moduleId,
    cursor: 0,
    size: status.snapshotLastOpEvent.cursor + 1,
  });
  const newRet: typeof ret = {
    total: ret.total,
    cursor: ret.cursor,
    detail: [],
  };

  const endTxid = status.snapshotLastOpEvent.txid;

  for (let i = 0; i < ret.detail.length; i++) {
    const item = ret.detail[i];
    newRet.detail.push(item);
    if (item.txid == endTxid) {
      break;
    }
  }

  fs.writeFileSync(
    path.join(__dirname, "./validator/data/events.json"),
    JSON.stringify(newRet)
  );
  console.log("print events success");
};

const printExpectResult = async () => {
  function convertResult(map) {
    const assets = new Assets(map);
    const data: Result = {
      users: [],
      pools: [],
    };
    for (let tick in map["swap"]) {
      const brc20 = map["swap"][tick];

      if (isLp(tick)) {
        const pair = tick;
        const { tick0, tick1 } = getPairStructV2(pair);
        data.pools!.push({
          pair: tick,
          reserve0: bnDecimal(
            assets.get(tick0).balanceOf(pair),
            decimal.get(tick0)
          ),
          reserve1: bnDecimal(
            assets.get(tick1).balanceOf(pair),
            decimal.get(tick1)
          ),
          lp: bnDecimal(assets.get(pair).Supply, LP_DECIMAL),
        });
      }

      for (let key in brc20.balance) {
        if (!isLp(key)) {
          let address = key;

          data.users!.push({
            address,
            tick,
            balance: !isLp(tick)
              ? bnDecimal(
                  assets.get(tick).balanceOf(address),
                  decimal.get(tick)
                )
              : bnDecimal(assets.get(tick).balanceOf(address), LP_DECIMAL),
          });
        }
      }
    }
    return data;
  }

  const snapshot = await getSnapshotObjFromDao();
  const expectResult = convertResult(snapshot.assets);
  expectResult.users?.sort((a, b) => {
    if (a.tick < b.tick) {
      return -1;
    }
    if (a.tick > b.tick) {
      return 1;
    }
    if (a.address < b.address) {
      return -1;
    }
    if (a.address > b.address) {
      return 1;
    }
    return 0;
  });
  expectResult.pools?.sort((a, b) => {
    if (a.pair < b.pair) {
      return 1;
    } else if (a.pair > b.pair) {
      return -1;
    } else {
      return 0;
    }
  });

  fs.writeFileSync(
    path.join(__dirname, "./validator/data/expect-result.json"),
    JSON.stringify(expectResult)
  );
  console.log("print expectt result success");
};

if (require.main == module) {
  void (async () => {
    await init(false);

    await printDecimal();
    await printEvents();
    await printExpectResult();
  })();
}
