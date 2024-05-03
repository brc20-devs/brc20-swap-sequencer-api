import fs from "fs";
import path from "path";
import { config } from "../../../src/config";
import { API } from "../../../src/domain/api";

if (require.main == module) {
  void (async () => {
    global.config = config;
    global.api = new API();
    const ret = await api.eventRawList({
      moduleId: config.moduleId,
      size: 10000,
    });
    const newRet: typeof ret = {
      total: ret.total,
      cursor: ret.cursor,
      detail: [],
    };

    const endTxid = ""; // TOFIX

    for (let i = 0; i < ret.detail.length; i++) {
      const item = ret.detail[i];
      newRet.detail.push(item);
      if (item.txid == endTxid) {
        break;
      }
    }

    fs.writeFileSync(
      path.join(__dirname, "./events.ignore.json"),
      JSON.stringify(newRet)
    );

    console.log("success");
  })();
}
