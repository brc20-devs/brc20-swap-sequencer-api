import fs from "fs";
import path from "path";
import { config } from "../../../src/config";
import { TickDao } from "../../../src/dao/tick-dao";
import { Decimal } from "../../../src/domain/decimal";
import { MongoUtils } from "../../../src/utils/mongo-utils";

if (require.main == module) {
  void (async () => {
    global.config = config;
    global.mongoUtils = new MongoUtils(config.mongoUrl, config.db);
    global.tickDao = new TickDao("tick");
    global.decimal = new Decimal();

    await mongoUtils.init();
    await decimal.init();

    let map = {};
    let all = decimal.getAllTick();
    all.forEach((tick) => {
      map[tick] = decimal.get(tick);
    });
    fs.writeFileSync(
      path.join(__dirname, "./decimal.ignore.json"),
      JSON.stringify(map)
    );

    console.log("success");
  })();
}
