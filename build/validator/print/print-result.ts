import fs from "fs";
import path from "path";
import { config } from "../../../src/config";
import { Assets } from "../../../src/contract/assets";
import { bnDecimal } from "../../../src/contract/bn";
import { getPairStruct } from "../../../src/contract/contract-utils";
import { OpConfirmDao } from "../../../src/dao/op-confirm-dao";
import { TickDao } from "../../../src/dao/tick-dao";
import { LP_DECIMAL } from "../../../src/domain/constant";
import { Decimal } from "../../../src/domain/decimal";
import { isLp } from "../../../src/domain/utils";
import { Result } from "../../../src/types/func";
import { MongoUtils } from "../../../src/utils/mongo-utils";

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
      const { tick0, tick1 } = getPairStruct(pair);
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
        lp: bnDecimal(assets.get(pair).supply, LP_DECIMAL),
      });
    }

    for (let key in brc20.balance) {
      if (!isLp(key)) {
        let address = key;

        data.users!.push({
          address,
          tick,
          balance: !isLp(tick)
            ? bnDecimal(assets.get(tick).balanceOf(address), decimal.get(tick))
            : bnDecimal(assets.get(tick).balanceOf(address), LP_DECIMAL),
        });
      }
    }
  }
  return data;
}

if (require.main == module) {
  void (async () => {
    global.config = config;

    global.mongoUtils = new MongoUtils(config.mongoUrl, config.db);
    global.opConfirmDao = new OpConfirmDao("op_confirm");
    global.tickDao = new TickDao("tick");
    global.decimal = new Decimal();

    await mongoUtils.init();
    await decimal.init();

    const res = (
      await opConfirmDao.find(
        { snapshot: { $exists: true } },
        { limit: 1, sort: { _id: -1 } }
      )
    )[0];

    const ret = convertResult(res.snapshot!.assets);
    fs.writeFileSync(
      path.join(__dirname, "./result.ignore.json"),
      JSON.stringify(ret)
    );
    console.log("success");
  })();
}
