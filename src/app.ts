require("source-map-support/register");

import cors from "@fastify/cors";
import Fastify from "fastify";
import path from "path";
import process, { exit } from "process";
import { init } from "./init";
import { swagger } from "./middleware/swagger";
import { wrap } from "./middleware/wrap";
import { baseRoute } from "./route/base";
import { managerRoute } from "./route/manager";
import { statusRoute } from "./route/status";
import { getDate } from "./utils/utils";

process.on("uncaughtException", (err) => {
  logger.uncaughtException({ error: err.message, stack: err.stack });
});

void (async () => {
  try {
    console.log(require(__dirname + "/../version.json"));

    await init();

    const fastify = Fastify({
      logger: config.routeDebugLog,
    });
    void wrap(fastify);
    if (config.isLocalTest) {
      await swagger(fastify);
    }
    void fastify.register(baseRoute);
    void fastify.register(statusRoute, { prefix: "/status" });
    void fastify.register(managerRoute, { prefix: "/manager" });
    if (config.cors) {
      void fastify.register(cors, { origin: "*" });
    }
    void fastify.register(require("@fastify/view"), {
      engine: {
        ejs: require("ejs"),
      },
      root: path.join(__dirname, "../views"),
      viewExt: "html", // Sets the default extension to `.handlebars`,
      includeViewExtension: true,
    });

    const port = config.port;
    await fastify.listen({ host: "0.0.0.0", port });

    console.log(
      "http server init success, listen port: ",
      port,
      "date: ",
      getDate(Date.now())
    );
  } catch (err) {
    console.error(err);
    exit(1);
  }
})();
