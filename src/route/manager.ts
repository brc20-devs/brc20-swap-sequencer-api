import { FastifyInstance } from "fastify";
import Joi from "joi";
import { Req } from "../types/route";
import { SetWithdrawStatusReq } from "../types/route-manager";
import { schema } from "../utils/utils";

export function managerRoute(fastify: FastifyInstance, opts, done) {
  fastify.get(
    `/set_withdraw_status`,
    schema(
      Joi.object<SetWithdrawStatusReq>({
        address: Joi.string().required(),
        tick: Joi.string().required(),
        oldStatus: Joi.string(),
        newStatus: Joi.string(),
      }),
      "get"
    ),
    async (req: Req<SetWithdrawStatusReq, "get">, res) => {
      const { address, tick, oldStatus, newStatus } = req.query;
      const list = await withdrawDao.find({ address, tick, status: oldStatus });
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        item.status = newStatus;
        await withdraw.update(item);
      }
      void res.send({});
    }
  );

  done();
}
