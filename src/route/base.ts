import { FastifyInstance } from "fastify";
import Joi from "joi";

import { getPairStr, need } from "../contract/contract-utils";
import { MatchingData } from "../dao/matching-dao";
import { QUERY_LIMIT } from "../domain/constant";
import { cant_swap, deploy_tick_not_exist } from "../domain/error";
import { checkAddressType, estimateServerFee } from "../domain/utils";
import { ExactType, FuncType } from "../types/func";
import {
  AddLiqReq,
  AddLiqRes,
  AddressBalanceReq,
  AddressBalanceRes,
  AllAddressBalanceReq,
  AllAddressBalanceRes,
  ConfigReq,
  ConfigRes,
  ConfirmCancelWithdrawReq,
  ConfirmCancelWithdrawRes,
  ConfirmDepositReq,
  ConfirmRetryWithdrawReq,
  ConfirmRetryWithdrawRes,
  ConfirmWithdrawReq,
  ConfirmWithdrawRes,
  CreateCancelWithdrawReq,
  CreateCancelWithdrawRes,
  CreateDepositReq,
  CreateDepositRes,
  CreateRetryWithdrawReq,
  CreateRetryWithdrawRes,
  CreateWithdrawReq,
  CreateWithdrawRes,
  DeployPoolReq,
  DeployPoolRes,
  DepositInfoReq,
  DepositInfoRes,
  DepositListItem,
  DepositListReq,
  DepositListRes,
  FuncReq,
  GasHistoryItem,
  GasHistoryReq,
  GasHistoryRes,
  LiqHistoryItem,
  LiqHistoryReq,
  LiqHistoryRes,
  MyPoolListItem,
  MyPoolListReq,
  MyPoolListRes,
  MyPoolReq,
  MyPoolRes,
  OverViewReq,
  OverViewRes,
  PoolInfoReq,
  PoolInfoRes,
  PoolListItem,
  PoolListReq,
  PoolListRes,
  PreRes,
  QuoteAddLiqReq,
  QuoteAddLiqRes,
  QuoteRemoveLiqReq,
  QuoteRemoveLiqRes,
  QuoteSwapReq,
  QuoteSwapRes,
  RemoveLiqReq,
  RemoveLiqRes,
  Req,
  Res,
  RollUpHistoryItem,
  RollUpHistoryReq,
  RollUpHistoryRes,
  SelectReq,
  SelectRes,
  SendHistoryItem,
  SendHistoryReq,
  SendHistoryRes,
  SendReq,
  SendRes,
  SwapHistoryItem,
  SwapHistoryReq,
  SwapHistoryRes,
  SwapReq,
  SwapRes,
  SystemStatusReq,
  SystemStatusRes,
  WithdrawHistoryItem,
  WithdrawHistoryReq,
  WithdrawHistoryRes,
  WithdrawProcessReq,
  WithdrawProcessRes,
} from "../types/route";
import { schema } from "../utils/utils";

export function baseRoute(fastify: FastifyInstance, opts, done) {
  fastify.get(
    `/config`,
    schema(
      Joi.object<ConfigReq>({}),
      "get",
      Joi.object<ConfigRes>({
        moduleId: Joi.string(),
        serviceGasTick: Joi.string().description(
          "The tick used for the second layer gas."
        ),
        pendingDepositDirectNum: Joi.number().description(
          "Number of confirmations required for direct deposit."
        ),
        pendingDepositMatchingNum: Joi.number().description(
          "Number of confirmations required for matching deposit."
        ),
      }),
      { summary: "Swap's global configuration information.", apiDoc: true }
    ),
    async (req: Req<ConfigReq, "get">, res: Res<ConfigRes>) => {
      const ret: ConfigRes = {
        moduleId: config.moduleId,
        serviceGasTick: env.ModuleInitParams.gas_tick,
        pendingDepositDirectNum: config.pendingDepositDirectNum,
        pendingDepositMatchingNum: config.pendingDepositMatchingNum,
        userWhiteList: config.userWhiteList,
        onlyUserWhiteList: config.onlyUserWhiteList,
      };
      void res.send(ret);
    }
  );

  fastify.get(
    `/balance`,
    schema(
      Joi.object<AddressBalanceReq>({
        address: Joi.string().required(),
        tick: Joi.string().required(),
      }),
      "get",
      Joi.object<AddressBalanceRes>({
        balance: Joi.object({
          module: Joi.string().description("Confirmed module balance."),
          swap: Joi.string().description("Confirmed swap balance."),
          pendingSwap: Joi.string().description(
            "The balance converted from pending to swap."
          ),
          pendingAvailable: Joi.string().description(
            "The balance converted from pending to module."
          ),
        }),
        decimal: Joi.string(),
      }),
      {
        summary: "Gets the balance for the specified address and tick.",
        apiDoc: true,
      }
    ),
    async (req: Req<AddressBalanceReq, "get">, res: Res<AddressBalanceRes>) => {
      const { address, tick } = req.query;
      await decimal.trySetting(tick);
      const balance = operator.NewestSpace.getBalance(address, tick);
      void res.send({
        balance,
        decimal: decimal.get(tick),
      });
    }
  );

  fastify.get(
    `/deposit_info`,
    schema(
      Joi.object<DepositInfoReq>({
        address: Joi.string().required(),
        tick: Joi.string().required(),
      }),
      "get",
      Joi.object<DepositInfoRes>({
        dailyAmount: Joi.string().description("Amount deposit on the day."),
        dailyLimit: Joi.string().description("Limit for the day."),
        recommendDeposit: Joi.string().description(
          "Recommended deposit amount."
        ),
      }),
      {
        summary:
          "Get deposit information for the specified address and tick, including daily limit, dosage, recommended deposit amount, etc.",
        apiDoc: true,
      }
    ),
    async (req: Req<DepositInfoReq, "get">, res: Res<DepositInfoRes>) => {
      const { address, tick } = req.query;
      await decimal.trySetting(tick);
      const ret = await query.getDailyDepositLimit(address, tick);
      void res.send({
        ...ret,
        recommendDeposit: matching.getRecommendDeposit(tick),
      });
    }
  );

  fastify.get(
    `/all_balance`,
    schema(
      Joi.object<AllAddressBalanceReq>({
        address: Joi.string().required(),
      }),
      "get",
      Joi.object<AllAddressBalanceRes>().pattern(
        Joi.string(),
        Joi.object().keys({
          balance: Joi.object({
            module: Joi.string(),
            swap: Joi.string(),
            pendingSwap: Joi.string(),
            pendingAvailable: Joi.string(),
          }),
          decimal: Joi.string(),
          withdrawLimit: Joi.string(),
        })
      ),
      { summary: "", apiDoc: false } // TOFIX
    ),
    async (
      req: Req<AllAddressBalanceReq, "get">,
      res: Res<AllAddressBalanceRes>
    ) => {
      const { address } = req.query;
      const ret = operator.NewestSpace.getAllBalance(address);
      void res.send(ret);
    }
  );

  fastify.get(
    `/quote_swap`,
    schema(
      Joi.object<QuoteSwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amount: Joi.string()
          .required()
          .description(
            "If it is exactIn, it is the amount of input tick, else is the amount of output tick"
          ),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required()
          .description("Exact input or exact output")
          .example(ExactType.exactIn),
      }),
      "get",
      Joi.object<QuoteSwapRes>({
        amountUSD: Joi.string().description("Input amount of usd value"),
        expectUSD: Joi.string().description("Estimated amount of usd value"),
        expect: Joi.string().description("Estimated amount"),
      }),
      {
        summary:
          "Returns the estimated number of swaps based on the input and exact type.",
        apiDoc: false,
      }
    ),
    async (req: Req<QuoteSwapReq, "get">, res: Res<QuoteSwapRes>) => {
      const params = req.query;
      const ret = await operator.quoteSwap(params);
      void res.send(ret);
    }
  );

  fastify.get(
    `/quote_add_liq`,
    schema(
      Joi.object<QuoteAddLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().description("The expect amount of tick0"),
        amount1: Joi.string().description("The expect amount of tick1"),
      }),
      "get",
      Joi.object<QuoteAddLiqRes>({
        amount0: Joi.string().description("The real amount of tick0"),
        amount1: Joi.string().description("The real amount of tick1"),
        amount0USD: Joi.string().description("The usd value of amount0"),
        amount1USD: Joi.string().description("The usd value of amount0"),
        lp: Joi.string().description("Estimated lp"),
        tick0PerTick1: Joi.string().description("tick0/tick1"),
        tick1PerTick0: Joi.string().description("tick1/tick0"),
        shareOfPool: Joi.string().description(
          "The proportion of the injected quantity in the pool"
        ),
      }),
      {
        summary:
          "Based on the pair to get the actual addition ratio, LP number and other information.",
        apiDoc: false,
      }
    ),
    async (req: Req<QuoteAddLiqReq, "get">, res: Res<QuoteAddLiqRes>) => {
      const params = req.query;
      const ret = await operator.quoteAddLiq(params);
      void res.send(ret);
    }
  );

  fastify.get(
    `/quote_remove_liq`,
    schema(
      Joi.object<QuoteRemoveLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        lp: Joi.string().required(),
      }),
      "get",
      Joi.object<QuoteRemoveLiqRes>({
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Amount of tick0"),
        amount1: Joi.string().required().description("Amount of tick1"),
        amount0USD: Joi.string(),
        amount1USD: Joi.string(),
      }),
      {
        summary: "Estimate the number of ticks you can get by typing LP.",
        apiDoc: false,
      }
    ),
    async (req: Req<QuoteRemoveLiqReq, "get">, res: Res<QuoteRemoveLiqRes>) => {
      const params = req.query;
      const ret = await operator.quoteRemoveLiq(params);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pool_info`,
    schema(
      Joi.object<PoolInfoReq>({
        tick0: Joi.string(),
        tick1: Joi.string(),
      }),
      "get",
      Joi.object<PoolInfoRes>({
        existed: Joi.boolean().description("Is the pool existed"),
        addLiq: Joi.boolean().description("Has LP been added to the pool"),
        tick0: Joi.string(),
        tick1: Joi.string(),
        lp: Joi.string().description("Quantity of pool lp"),
        tvl: Joi.string(),
        volume24h: Joi.string(),
        volume7d: Joi.string(),
      }),
      { summary: "Get Pool information based on trade pair.", apiDoc: false }
    ),
    async (req: Req<PoolInfoReq, "get">, res: Res<PoolInfoRes>) => {
      const { tick0, tick1 } = req.query;
      const res1 = operator.NewestSpace.getPoolInfo(req.query);
      const res2 = await query.globalPoolInfo(getPairStr(tick0, tick1));
      void res.send({ ...res1, ...res2 });
    }
  );

  fastify.get(
    `/select`,
    schema(
      Joi.object<SelectReq>({
        address: Joi.string().required(),
        search: Joi.string().description("Fuzzy matching"),
      }),
      "get",
      Joi.array<SelectRes>().items(
        Joi.object({
          tick: Joi.string(),
          decimal: Joi.string(),
          brc20Balance: Joi.string().description(
            "Module balance (not participate in swap calculations)"
          ),
          swapBalance: Joi.string().description("Swap balance"),
        })
      ),
      {
        summary:
          "Select the tick information that you can use based on the address.",
        apiDoc: true,
      }
    ),
    async (req: Req<SelectReq, "get">, res: Res<SelectRes>) => {
      const ret = await operator.NewestSpace.getSelect(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_deploy_pool`,
    schema(
      Joi.object<DeployPoolReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
      }),
      "get",
      Joi.object<PreRes>({
        signMsg: Joi.string().description("User signature information"),
        bytesL1: Joi.number().description("Number of bytes on L1 chain"),
        bytesL2: Joi.number().description("Number of bytes on L1 chain"),
        feeRate: Joi.string().description("Bitcoin network fee rate"),
        gasPrice: Joi.string().description("L2 cost per byte"),
        serviceFeeL1: Joi.string(),
        serviceFeeL2: Joi.string(),
        unitUsdPriceL1: Joi.string().description("L1 USD price per sats"),
        unitUsdPriceL2: Joi.string().description("L2 USD price per sats"),
        serviceTickBalance: Joi.string().description(
          "The user's remainin L2 sats balance"
        ),
      }),
      {
        summary:
          "/deploy_pool interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<DeployPoolReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.deployPool,
        req: req.query,
      } as FuncReq;
      const { signMsg } = operator.getSignMsg(params);
      const ret = estimateServerFee(params);
      void res.send({ signMsg, ...ret });
    }
  );

  fastify.post(
    `/deploy_pool`,
    schema(
      Joi.object<DeployPoolReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        sig: Joi.string().required().description("User signature"),
      }),
      "post",
      Joi.object<DeployPoolRes>({}),
      { summary: "Deploy the pool operation.", apiDoc: true }
    ),
    async (req: Req<DeployPoolReq, "post">, res: Res<DeployPoolRes>) => {
      const { tick0, tick1 } = req.body;
      need(!!decimal.get(tick0, false), deploy_tick_not_exist + tick0);
      need(!!decimal.get(tick1, false), deploy_tick_not_exist + tick1);
      await operator.aggregate({
        func: FuncType.deployPool,
        req: req.body,
      });
      void res.send({});
    }
  );

  fastify.get(
    `/pre_add_liq`,
    schema(
      Joi.object<AddLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string().required().description("Expect amount of lp"),
        slippage: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
      }),
      "get",
      Joi.object<PreRes>({
        signMsg: Joi.string().description("User signature information"),
        bytesL1: Joi.number().description("Number of bytes on L1 chain"),
        bytesL2: Joi.number().description("Number of bytes on L1 chain"),
        feeRate: Joi.string().description("Bitcoin network fee rate"),
        gasPrice: Joi.string().description("L2 cost per byte"),
        serviceFeeL1: Joi.string(),
        serviceFeeL2: Joi.string(),
        unitUsdPriceL1: Joi.string().description("L1 USD price per sats"),
        unitUsdPriceL2: Joi.string().description("L2 USD price per sats"),
        serviceTickBalance: Joi.string().description(
          "The user's remainin L2 sats balance"
        ),
      }),
      {
        summary:
          "/add_liq interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<AddLiqReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.addLiq,
        req: req.query,
      } as FuncReq;
      const { signMsg } = operator.getSignMsg(params);
      const ret = estimateServerFee(params);
      void res.send({ signMsg, ...ret });
    }
  );

  fastify.post(
    `/add_liq`,
    schema(
      Joi.object<AddLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string().required(),
        slippage: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        sig: Joi.string().required().description("User signature"),
      }),
      "post",
      Joi.object<AddLiqRes>({
        id: Joi.string().description("Function id"),
        rollupInscriptionId: Joi.string().description(
          "The rollup inscription id where the function is located"
        ),
        address: Joi.string(),
        type: Joi.string(),
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string(),
        ts: Joi.number(),
      }),
      { summary: "Add the liquidity operation.", apiDoc: true }
    ),
    async (req: Req<AddLiqReq, "post">, res: Res<AddLiqRes>) => {
      const ret = (await operator.aggregate({
        func: FuncType.addLiq,
        req: req.body,
      })) as AddLiqRes;
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_remove_liq`,
    schema(
      Joi.object<RemoveLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string().required(),
        slippage: Joi.string().required(),
        ts: Joi.number().required(),
      }),
      "get",
      Joi.object<PreRes>({
        signMsg: Joi.string().description("User signature information"),
        bytesL1: Joi.number().description("Number of bytes on L1 chain"),
        bytesL2: Joi.number().description("Number of bytes on L1 chain"),
        feeRate: Joi.string().description("Bitcoin network fee rate"),
        gasPrice: Joi.string().description("L2 cost per byte"),
        serviceFeeL1: Joi.string(),
        serviceFeeL2: Joi.string(),
        unitUsdPriceL1: Joi.string().description("L1 USD price per sats"),
        unitUsdPriceL2: Joi.string().description("L2 USD price per sats"),
        serviceTickBalance: Joi.string().description(
          "The user's remainin L2 sats balance"
        ),
      }),
      {
        summary:
          "/remove_liq interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<RemoveLiqReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.removeLiq,
        req: req.query,
      } as FuncReq;
      const { signMsg } = operator.getSignMsg(params);
      const ret = estimateServerFee(params);
      void res.send({ signMsg, ...ret });
    }
  );

  fastify.post(
    `/remove_liq`,
    schema(
      Joi.object<RemoveLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        lp: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        slippage: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        sig: Joi.string().required().description("User signature"),
      }),
      "post",
      Joi.object<RemoveLiqRes>({
        id: Joi.string().description("Function id"),
        rollupInscriptionId: Joi.string().description(
          "The rollup inscription id where the function is located"
        ),
        address: Joi.string(),
        type: Joi.string(),
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string(),
        ts: Joi.number(),
      }),
      { summary: "Remove the liquidity operation", apiDoc: true }
    ),
    async (req: Req<RemoveLiqReq, "post">, res: Res<RemoveLiqRes>) => {
      const ret = (await operator.aggregate({
        func: FuncType.removeLiq,
        req: req.body,
      })) as RemoveLiqRes;
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_send`,
    schema(
      Joi.object<SendReq>({
        address: Joi.string().required(),
        tick: Joi.string().required().description("Send tick"),
        amount: Joi.string().required().description("The amount of send tick"),
        to: Joi.string().required().description("The receiver of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
      }),
      "get",
      Joi.object<PreRes>({
        signMsg: Joi.string().description("User signature information"),
        bytesL1: Joi.number().description("Number of bytes on L1 chain"),
        bytesL2: Joi.number().description("Number of bytes on L1 chain"),
        feeRate: Joi.string().description("Bitcoin network fee rate"),
        gasPrice: Joi.string().description("L2 cost per byte"),
        serviceFeeL1: Joi.string(),
        serviceFeeL2: Joi.string(),
        unitUsdPriceL1: Joi.string().description("L1 USD price per sats"),
        unitUsdPriceL2: Joi.string().description("L2 USD price per sats"),
        serviceTickBalance: Joi.string().description(
          "The user's remainin L2 sats balance"
        ),
      }),
      {
        summary:
          "/send interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<SendReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.send,
        req: req.query,
      } as FuncReq;
      const { signMsg } = operator.getSignMsg(params);
      const ret = estimateServerFee(params);
      void res.send({ signMsg, ...ret });
    }
  );

  fastify.get(
    `/pre_swap`,
    schema(
      Joi.object<SwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amountIn: Joi.string()
          .required()
          .description("The amount of input tick"),
        amountOut: Joi.string()
          .required()
          .description("The amount of output tick"),
        slippage: Joi.string().required(),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required()
          .example(ExactType.exactIn),
        ts: Joi.number().required(),
      }),
      "get",
      Joi.object<PreRes>({
        signMsg: Joi.string().description("User signature information"),
        bytesL1: Joi.number().description("Number of bytes on L1 chain"),
        bytesL2: Joi.number().description("Number of bytes on L1 chain"),
        feeRate: Joi.string().description("Bitcoin network fee rate"),
        gasPrice: Joi.string().description("L2 cost per byte"),
        serviceFeeL1: Joi.string(),
        serviceFeeL2: Joi.string(),
        unitUsdPriceL1: Joi.string().description("L1 USD price per sats"),
        unitUsdPriceL2: Joi.string().description("L2 USD price per sats"),
        serviceTickBalance: Joi.string().description(
          "The user's remainin L2 sats balance"
        ),
      }),
      {
        summary:
          "/swap interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<SwapReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.swap,
        req: req.query,
      } as FuncReq;
      const { signMsg } = operator.getSignMsg(params);
      const ret = estimateServerFee(params);
      void res.send({ signMsg, ...ret });
    }
  );

  fastify.post(
    `/send`,
    schema(
      Joi.object<SendReq>({
        address: Joi.string().required(),
        tick: Joi.string().required().description("Send tick"),
        amount: Joi.string().required().description("The amount of send tick"),
        to: Joi.string().required().description("The receiver of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        sig: Joi.string().required().description("User signature"),
      }),
      "post",
      Joi.object<SendRes>({}),
      { summary: "The send operation.", apiDoc: true }
    ),
    async (req: Req<SendReq, "post">, res: Res<SendRes>) => {
      checkAddressType(req.body.address);
      const ret = await operator.aggregate({
        func: FuncType.send,
        req: req.body,
      });
      void res.send(ret); // TOFIX
    }
  );

  fastify.post(
    `/swap`,
    schema(
      Joi.object<SwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amountIn: Joi.string()
          .required()
          .description("The amount of input tick"),
        amountOut: Joi.string()
          .required()
          .description("The amount of output tick"),
        slippage: Joi.string().required(),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        sig: Joi.string().required().description("User signature"),
      }),
      "post",
      Joi.object<SwapRes>({
        id: Joi.string().description("Function id"),
        rollupInscriptionId: Joi.string().description(
          "The rollup inscription id where the function is located"
        ),
        address: Joi.string(),
        tickIn: Joi.string(),
        tickOut: Joi.string(),
        amountIn: Joi.string(),
        amountOut: Joi.string(),
        exactType: Joi.string(),
        ts: Joi.number(),
      }),
      { summary: "The swap operation.", apiDoc: true }
    ),
    async (req: Req<SwapReq, "post">, res: Res<SwapRes>) => {
      checkAddressType(req.body.address);
      need(config.canSwap, cant_swap);
      const ret = (await operator.aggregate({
        func: FuncType.swap,
        req: req.body,
      })) as SwapRes;
      void res.send(ret);
    }
  );

  fastify.get(
    `/pool_list`,
    schema(
      Joi.object<PoolListReq>({
        search: Joi.string().description("Fuzzy matching"),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<PoolListRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<PoolListItem>({
            tick0: Joi.string(),
            tick1: Joi.string(),
            lp: Joi.string(),
            tvl: Joi.string().description("Total pool value"),
            volume24h: Joi.string(),
            volume7d: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the pool list information.", apiDoc: true }
    ),
    async (req: Req<PoolListReq, "get">, res: Res<PoolListRes>) => {
      const ret = await query.globalPoolList(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/my_pool_list`,
    schema(
      Joi.object<MyPoolListReq>({
        address: Joi.string().required(),
        tick: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<MyPoolListRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<MyPoolListItem>({
            lp: Joi.string(),
            shareOfPool: Joi.string(),
            tick0: Joi.string(),
            tick1: Joi.string(),
            amount0: Joi.string().required().description("Amount of tick0"),
            amount1: Joi.string().required().description("Amount of tick1"),
          })
        ),
      }),
      { summary: "Gets the pool list information by address.", apiDoc: true }
    ),
    async (req: Req<MyPoolListReq, "get">, res: Res<MyPoolListRes>) => {
      const ret = query.myPoolList(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/my_pool`,
    schema(
      Joi.object<MyPoolReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
      }),
      "get",
      Joi.object<MyPoolRes>({
        lp: Joi.string(),
        shareOfPool: Joi.string(),
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Amount of tick0"),
        amount1: Joi.string().required().description("Amount of tick1"),
      }),
      {
        summary: "Gets the user pool information for the specified pair.",
        apiDoc: true,
      }
    ),
    async (req: Req<MyPoolReq, "get">, res: Res<MyPoolRes>) => {
      const ret = query.myPool(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/overview`,
    schema(
      Joi.object<OverViewReq>({}),
      "get",
      Joi.object({
        liquidity: Joi.string().description("Total value of all pools"),
        volume7d: Joi.string().description("7 days volume"),
        volume24h: Joi.string().description("24 hours volume"),
        transactions: Joi.number().description(
          "Number of transactions in 24 hours"
        ),
        pairs: Joi.number(),
      }),
      { summary: "An overview of swap information", apiDoc: true }
    ),
    async (req: Req<OverViewReq, "get">, res: Res<OverViewRes>) => {
      const ret = await query.overview(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/gas_history`,
    schema(
      Joi.object<GasHistoryReq>({
        address: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<GasHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<GasHistoryItem>({
            funcType: Joi.string()
              .description("Function type")
              .example(FuncType.swap),
            tickA: Joi.string(),
            tickB: Joi.string(),
            gas: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      {
        summary:
          "Gets the gas consumption records for a user aggregation operation.",
        apiDoc: true,
      }
    ),
    async (req: Req<GasHistoryReq, "get">, res: Res<GasHistoryRes>) => {
      const ret = await query.gasHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/send_history`,
    schema(
      Joi.object<SendHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<SendHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<SendHistoryItem>({
            tick: Joi.string(),
            amount: Joi.string(),
            to: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of send transaction.", apiDoc: true }
    ),
    async (req: Req<SendHistoryReq, "get">, res: Res<SendHistoryRes>) => {
      const ret = await query.sendHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/liq_history`,
    schema(
      Joi.object<LiqHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        type: Joi.string().description("Optional: add, remove"),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<LiqHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<LiqHistoryItem>({
            type: Joi.string(),
            tick0: Joi.string(),
            tick1: Joi.string(),
            amount0: Joi.string(),
            amount1: Joi.string(),
            lp: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of a pair addition pool.", apiDoc: true }
    ),
    async (req: Req<LiqHistoryReq, "get">, res: Res<LiqHistoryRes>) => {
      const ret = await query.liqHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/swap_history`,
    schema(
      Joi.object<SwapHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<SwapHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<SwapHistoryItem>({
            tickIn: Joi.string().required().description("Input tick"),
            tickOut: Joi.string().required().description("Output tick"),
            amountIn: Joi.string()
              .required()
              .description("The amount of input tick"),
            amountOut: Joi.string()
              .required()
              .description("The amount of output tick"),
            exactType: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of swap.", apiDoc: true }
    ),
    async (req: Req<SwapHistoryReq, "get">, res: Res<SwapHistoryRes>) => {
      const ret = await query.swapHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/rollup_history`,
    schema(
      Joi.object<RollUpHistoryReq>({
        start: Joi.number().required(),
        limit: Joi.number().less(100).required(),
      }),
      "get",
      Joi.object<RollUpHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<RollUpHistoryItem>({
            txid: Joi.string(),
            height: Joi.number(),
            transactionNum: Joi.number().description(
              "Number of transactions in the inscription"
            ),
            inscriptionId: Joi.string().description("Rollup inscription id"),
            inscriptionNumber: Joi.number().description(
              "Rollup inscription number"
            ),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Get chain history of rollup inscription.", apiDoc: true }
    ),
    async (req: Req<RollUpHistoryReq, "get">, res: Res<RollUpHistoryRes>) => {
      const ret = await query.rollUpHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/deposit_list`,
    schema(
      Joi.object<DepositListReq>({
        address: Joi.string().required(),
        tick: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<DepositListRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<DepositListItem>({
            tick: Joi.string(),
            amount: Joi.string(),
            cur: Joi.number().description("Current number of confirmations"),
            sum: Joi.number().description("Total number of confirmations"),
            ts: Joi.number(),
            txid: Joi.string(),
            type: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the deposit list for a user.", apiDoc: true }
    ),
    async (req: Req<DepositListReq, "get">, res: Res<DepositListRes>) => {
      const ret = await query.depositHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/create_deposit`,
    schema(
      Joi.object<CreateDepositReq>({
        inscriptionId: Joi.string().required(),
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
      }),
      "get",
      Joi.object({
        psbt: Joi.string(),
        type: Joi.string().description("Direct or matching"),
        expiredTimestamp: Joi.number(),
        recommendDeposit: Joi.string(),
      }),
      {
        summary: "Create a deposit psbt to be signed by the user.",
        apiDoc: true,
      }
    ),
    async (req: Req<CreateDepositReq, "get">, res: Res<CreateDepositRes>) => {
      checkAddressType(req.query.address);
      const ret = await matching.create(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/confirm_deposit`,
    schema(
      Joi.object<ConfirmDepositReq>({
        psbt: Joi.string().required(),
        inscriptionId: Joi.string().required(),
      }),
      "post",
      Joi.object({}),
      {
        summary: "User signature deposit psbt, submit confirmation.",
        apiDoc: true,
      }
    ),
    async (req: Req<ConfirmDepositReq, "post">, res) => {
      const ret = await matching.confirm(req.body);
      void res.send(ret);
    }
  );

  fastify.get(
    `/system_status`,
    schema(
      Joi.object<SystemStatusReq>({}),
      "get",
      Joi.object<SystemStatusRes>({
        committing: Joi.boolean().description(
          "Is rollup inscription committing"
        ),
      }),
      { summary: "Gets the current system state.", apiDoc: true }
    ),
    async (req: Req<SystemStatusReq, "get">, res: Res<SystemStatusRes>) => {
      void res.send({
        committing: opSender.Committing,
      });
    }
  );

  fastify.get(
    `/withdraw_history`,
    schema(
      Joi.object<WithdrawHistoryReq>({
        address: Joi.string().required(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
        tick: Joi.string(),
      }),
      "get",
      Joi.object<WithdrawHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<WithdrawHistoryItem>({
            id: Joi.string(),
            tick: Joi.string(),
            totalAmount: Joi.string().description("Total amount withdrawal"),
            completedAmount: Joi.string().description(
              "The number of withdrawal completed"
            ),
            ts: Joi.number(),
            totalConfirmedNum: Joi.number().description(
              "The current number of confirmations"
            ),
            totalNum: Joi.number().description(
              "The total number of confirmations"
            ),
            status: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the user withdrawal history.", apiDoc: true }
    ),
    async (
      req: Req<WithdrawHistoryReq, "get">,
      res: Res<WithdrawHistoryRes>
    ) => {
      const ret = await query.withdrawHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/create_retry_withdraw`,
    schema(
      Joi.object<CreateRetryWithdrawReq>({
        id: Joi.string().required(),
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
      }),
      "get",
      Joi.object<CreateRetryWithdrawRes>({
        paymentPsbt: Joi.string().description("The user psbt with payment"),
        approvePsbt: Joi.string().description(
          "The user psbt with approve insctiption"
        ),
        networkFee: Joi.number(),
      }),
      {
        summary: "Retry create a withdraw psbt to be signed by the user.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<CreateRetryWithdrawReq, "get">,
      res: Res<CreateRetryWithdrawRes>
    ) => {
      const ret = await withdraw.createRetry(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/confirm_retry_withdraw`,
    schema(
      Joi.object<ConfirmRetryWithdrawReq>({
        id: Joi.string().required().description("The withdraw order id"),
        paymentPsbt: Joi.string().required(),
        approvePsbt: Joi.string().required(),
      }),
      "post",
      Joi.object<ConfirmRetryWithdrawRes>({}),
      {
        summary: "User signature withdraw psbt, submit confirmation.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<ConfirmRetryWithdrawReq, "post">,
      res: Res<ConfirmRetryWithdrawRes>
    ) => {
      const ret = await withdraw.confirmRetry(req.body);
      void res.send(ret);
    }
  );

  fastify.get(
    `/create_withdraw`,
    schema(
      Joi.object<CreateWithdrawReq>({
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
        tick: Joi.string().required(),
        amount: Joi.string().required(),
        ts: Joi.number().required(),
      }),
      "get",
      Joi.object<CreateWithdrawRes>({
        id: Joi.string().description("The withdraw order id"),
        paymentPsbt: Joi.string().description("The user psbt with payment"),
        approvePsbt: Joi.string().description(
          "The user psbt with approve insctiption"
        ),
        networkFee: Joi.number(),
        signMsg: Joi.string().description("User signature information"),
        bytesL1: Joi.number().description("Number of bytes on L1 chain"),
        bytesL2: Joi.number().description("Number of bytes on L1 chain"),
        feeRate: Joi.string().description("Bitcoin network fee rate"),
        gasPrice: Joi.string().description("L2 cost per byte"),
        serviceFeeL1: Joi.string(),
        serviceFeeL2: Joi.string(),
        unitUsdPriceL1: Joi.string().description("L1 USD price per sats"),
        unitUsdPriceL2: Joi.string().description("L2 USD price per sats"),
        serviceTickBalance: Joi.string().description(
          "The user's remainin L2 sats balance"
        ),
      }),
      {
        summary: "Create a withdraw psbt to be signed by the user.",
        apiDoc: true,
      }
    ),
    async (req: Req<CreateWithdrawReq, "get">, res: Res<CreateWithdrawRes>) => {
      const ret = await withdraw.create(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/confirm_withdraw`,
    schema(
      Joi.object<ConfirmWithdrawReq>({
        id: Joi.string().required().description("The withdraw order id"),
        sig: Joi.string().required(),
        paymentPsbt: Joi.string().required(),
        approvePsbt: Joi.string().required(),
      }),
      "post",
      Joi.object<ConfirmWithdrawRes>({}),
      {
        summary: "User signature withdraw psbt, submit confirmation.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<ConfirmWithdrawReq, "post">,
      res: Res<ConfirmWithdrawRes>
    ) => {
      const ret = await withdraw.confirm(req.body);
      void res.send(ret);
    }
  );

  fastify.get(
    `/create_cancel_withdraw`,
    schema(
      Joi.object<CreateCancelWithdrawReq>({
        id: Joi.string().required(),
      }),
      "get",
      Joi.object<CreateCancelWithdrawRes>({
        id: Joi.string(),
        psbt: Joi.string(),
        networkFee: Joi.number(),
      }),
      {
        summary: "Create a cancel-withdraw psbt to be signed by the user.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<CreateCancelWithdrawReq, "get">,
      res: Res<CreateCancelWithdrawRes>
    ) => {
      const ret = await withdraw.createCancel(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/confirm_cancel_withdraw`,
    schema(
      Joi.object<ConfirmCancelWithdrawReq>({
        id: Joi.string().required(),
        psbt: Joi.string().required(),
      }),
      "post",
      Joi.object<ConfirmCancelWithdrawRes>({}),
      {
        summary: "User signature cancel-withdraw psbt, submit confirmation.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<ConfirmCancelWithdrawReq, "post">,
      res: Res<ConfirmCancelWithdrawRes>
    ) => {
      const ret = await withdraw.confirmCancel(req.body);
      void res.send(ret);
    }
  );

  fastify.get(
    `/withdraw_process`,
    schema(
      Joi.object<WithdrawProcessReq>({
        id: Joi.string().required(),
      }),
      "get",
      Joi.object<WithdrawProcessRes>({
        id: Joi.string(),
        tick: Joi.string(),
        amount: Joi.string(),
        ts: Joi.number(),
        status: Joi.string(),

        totalConfirmedNum: Joi.number(),
        totalNum: Joi.number().description(
          "Total number of confirmations (rollUp + approve)"
        ),
        rollUpConfirmNum: Joi.number(),
        rollUpTotalNum: Joi.number().description(
          "Total number of rollUp confirmations"
        ),
        approveConfirmNum: Joi.number(),
        approveTotalNum: Joi.number().description(
          "Total number of approve confirmations"
        ),
        cancelConfirmedNum: Joi.number(),
        cancelTotalNum: Joi.number(),

        rollUpTxid: Joi.string().description(
          "Decrease operation is required to withdraw, which in rollup inscription"
        ),
        paymentTxid: Joi.string(),
        inscribeTxid: Joi.string(),
        approveTxid: Joi.string(),

        completedAmount: Joi.string(),
        matchHistory: Joi.array().items(
          Joi.object<MatchingData>({
            approveInscriptionId: Joi.string().description(
              "Withdraw inscription"
            ),
            transferInscriptionId: Joi.string().description(
              "Deposit inscription"
            ),
            tick: Joi.string(),
            consumeAmount: Joi.string(),
            remainAmount: Joi.string().description("Residual cash withdrawal"),
            approveAddress: Joi.string().description("Withdraw user address"),
            transferAddress: Joi.string().description("Deposit user address"),
            txid: Joi.string().description("Matching txid"),
            ts: Joi.number(),
          })
        ),
      }),
      {
        summary: "Gets the withdrawal progress for the specified ID.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<WithdrawProcessReq, "get">,
      res: Res<WithdrawProcessRes>
    ) => {
      const ret = await query.withdrawProcess(req.query);
      void res.send(ret);
    }
  );

  done();
}
