import { default as Axios, AxiosInstance } from "axios";
import { config } from "../config";
import { bn, decimalCal } from "../contract/bn";
import {
  Brc20AddressBalance,
  Brc20Info,
  EventType,
  FeeEstimate,
  FeeEstimateMempool,
  InscriptionEventsRes,
  ModuleInscriptionInfo,
  NFT,
  OpEventsRes,
  ToSignInput,
  UTXO,
} from "../types/api";
import { FuncType, Result } from "../types/func";
import { OpEvent, OpType } from "../types/op";
import { printErr, removeUndefined } from "../utils/utils";
import { checkOpEvent, getConfirmedNum, getEventKey, need } from "./utils";

const timeout = 30000;

export class API {
  private cache: {
    [key: string]: { timestamp: number; intervalMs: number; data: any };
  } = {};
  private internal: AxiosInstance;
  // private blockStream: AxiosInstance;
  private mempool: AxiosInstance;
  readonly statistic: { [key: string]: number[] } = {};

  tick() {
    for (let key in this.cache) {
      if (Date.now() - this.cache[key].timestamp > this.cache[key].intervalMs) {
        delete this.cache[key];
      }
    }
  }

  constructor() {
    this.internal = Axios.create({
      baseURL: config.openApi.url,
      timeout,
      headers: Object.assign(
        {
          "Content-Type": "application/json",
        },
        config.openApi.apiKey
          ? { Authorization: `Bearer ${config.openApi.apiKey}` }
          : {}
      ),
    });

    this.mempool = Axios.create({
      baseURL: config.mempoolApi,
      timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async broadcast(txHex: string): Promise<string> {
    const url = `${config.openApi.url}/v1/indexer/local_pushtx`;
    return await this.unisatPost("local_pushtx", url, { txHex });
  }

  async tickPrice(tick: string) {
    tick = tick.toLowerCase();
    if (config.fakeMarketPrice) {
      return 1;
    }

    const key = `price: ${tick}`;

    if (!this.cache[key]) {
      const res = await this.unisatPost(
        "auction/brc20_price",
        `${config.openApi.url}/v3/market/brc20/auction/brc20_price`,
        {
          tick,
        }
      );

      this.cache[key] = {
        data: res.midPrice || 0,
        timestamp: Date.now(),
        intervalMs: 300_000,
      };
    }

    return this.cache[key].data as number;
  }

  async tickInfo(tick: string): Promise<Brc20Info> {
    const url = `${config.openApi.url}/v1/indexer/brc20/${encodeURIComponent(
      tick
    )}/info`;
    const key = url;
    if (!this.cache[key]) {
      const res = (await this.unisatGet("brc20/tick/info", url)) as Brc20Info;
      this.cache[key] = {
        data: res,
        timestamp: Date.now(),
        intervalMs: 300_000,
      };
    }
    return this.cache[key].data;
  }

  async tickBalance(address: string): Promise<Brc20AddressBalance> {
    const url = `${config.openApi.url}/v1/indexer/address/${address}/brc20/summary`;
    return await this.unisatGet("address/brc20/summary", url, {
      start: 0,
      limit: 500,
    });
  }

  async inscriptionInfo(inscriptionId: string): Promise<NFT> {
    const url = `${config.openApi.url}/v1/indexer/inscription/info/${inscriptionId}`;
    return await this.unisatGet("inscription/info/inscriptionId", url);
  }

  async inscriptionContent(inscriptionId: string): Promise<string> {
    const url = `${config.openApi.url}/v1/indexer/inscription/content/${inscriptionId}`;
    return await this.get(
      "/inscription/content/inscriptionId",
      this.internal,
      url
    );
  }

  async addressUTXOs(
    address: string,
    cursor?: number,
    size?: number
  ): Promise<UTXO[]> {
    const url = `${config.openApi.url}/v1/indexer/address/${address}/utxo`;
    const ret = (await this.unisatGet("address/utxo", url, {
      cursor,
      size,
    })) as any[];
    return ret.reverse();
  }

  // async rawTx(txid: string): Promise<string> {
  //   const url = `api/tx/${txid}/hex`;
  //   return await this.get(this.blockStream, url);
  // }

  async txInfo(txid: string): Promise<{ height: number; timestamp: number }> {
    const url = `${config.openApi.url}/v1/indexer/tx/${txid}`;
    const key = url;
    if (!this.cache[key]) {
      const res = await this.unisatGet("tx/txid", url);
      this.cache[key] = {
        data: res,
        timestamp: Date.now(),
        intervalMs: 10_000,
      };
    }
    return this.cache[key].data;
  }

  async feeRate(): Promise<number> {
    const url = `/api/v1/fees/recommended`;
    const key = url;
    if (!this.cache[key]) {
      let ret = 0;
      try {
        const res = (await this.get(
          "/api/v1/fees/recommended",
          this.mempool,
          url
        )) as FeeEstimateMempool;
        ret = res.fastestFee;
        need(bn(ret).gt("0"));
      } catch (err) {
        printErr("network-mempool", err);
        const url = `${config.openApi.url}/v1/indexer/fee-estimate`;
        const res = (await this.unisatGet("fee-estimate", url)) as FeeEstimate;
        ret = res.BlocksFeeRateEstimate[0].feerate;
        need(bn(ret).gt("0"));
      }

      this.cache[key] = {
        data: ret,
        timestamp: Date.now(),
        intervalMs: 60_000,
      };
    }
    return this.cache[key].data as number;
  }

  async blockHeight() {
    const url = `${config.openApi.url}/v1/indexer/brc20/bestheight`;
    type Res = {
      height: number;
    };
    const ret = ((await this.unisatGet("brc20/bestheight", url)) as Res).height;
    return ret;
  }

  async btcPrice() {
    const url = `${config.openApi.url}/v1/indexer/fee-estimate`;
    const res = (await this.unisatGet("fee-estimate", url)) as FeeEstimate;
    return res.BTCPrice;
  }

  async eventRawList(params: {
    moduleId: string;
    startHeight?: number;
    endHeight?: number;
    cursor?: number;
    size?: number;
  }) {
    const query = {
      start: params.startHeight,
      end: params.endHeight,
      cursor: params.cursor,
      size: params.size,
    };
    const url = `${config.openApi.url}/v1/indexer/brc20-module/${params.moduleId}/history`;
    const ret = (await this.unisatGet(
      "/brc20-module/moduleId/history",
      url,
      query
    )) as InscriptionEventsRes;
    return ret;
  }

  private chain: { [key: string]: string } = {};

  async eventList(params: {
    moduleId: string;
    startHeight?: number;
    endHeight?: number;
    cursor?: number;
    size?: number;
  }): Promise<OpEventsRes> {
    const res = await this.eventRawList(params);
    const ret: OpEventsRes = {
      total: res.total,
      list: [],
    };
    let lastInscriptionNumber: number;
    let lastHeight: number;
    for (let i = 0; i < res.detail.length; i++) {
      const item = res.detail[i];
      const event: OpEvent = {
        height: item.height,
        from: item.from,
        to: item.to,
        inscriptionId: item.inscriptionId,
        inscriptionNumber: item.inscriptionNumber,
        op: JSON.parse(item.contentBody),
        blocktime: item.blocktime,
        txid: item.txid,
        data: item.data,
        event: item.type,
      };
      if (!item.valid) {
        // console.log("ingore invalid event: ", item);
        ret.total--;
        continue;
      }

      // fix tick
      if ((event.op as any).tick) {
        (event.op as any).tick = decimal.getRealTick((event.op as any).tick);
      }

      if (getConfirmedNum(event.height) > 0) {
        const key = getEventKey(event);
        let p = 0;
        let nextItem = res.detail[i + p];
        while (!nextItem.valid) {
          p++;
          nextItem = res.detail[i + p];
        }
        let nextEvent: OpEvent;
        let nextKey: string;
        if (nextItem) {
          nextEvent = {
            height: nextItem.height,
            from: nextItem.from,
            to: nextItem.to,
            inscriptionId: nextItem.inscriptionId,
            inscriptionNumber: nextItem.inscriptionNumber,
            op: JSON.parse(nextItem.contentBody),
            blocktime: nextItem.blocktime,
            txid: nextItem.txid,
            data: nextItem.data,
            event: nextItem.type,
          };
          nextKey = getEventKey(nextEvent);
        }

        // check chain
        if (nextEvent && getConfirmedNum(nextEvent.height) > 0) {
          if (!this.chain[key]) {
            this.chain[key] = nextKey;
          } else {
            if (this.chain[key] !== nextKey) {
              logger.error({
                tag: "bug-event-list-chain",
                key,
                event,
                nextEvent,
                confirmNum: getConfirmedNum(event.height),
                newestHeight: env.NewestHeight,
              });
            }
          }
        }

        // check height
        if (!lastHeight) {
          lastHeight = event.height;
        } else {
          if (event.height < lastHeight) {
            logger.error({
              tag: "bug-event-list-height",
              lastHeight,
              curHeight: event.height,
            });
          }
          lastHeight = event.height;
        }

        // check inscription number
        if (!lastInscriptionNumber) {
          lastInscriptionNumber = event.inscriptionNumber;
        } else {
          if (event.inscriptionNumber <= lastInscriptionNumber) {
            // logger.error({
            //   tag: "bug-event-list-inscription-number",
            //   lastInscriptionNumber,
            //   curInscriptionNumber: event.inscriptionNumber,
            // });
          }
          lastInscriptionNumber = event.inscriptionNumber;
        }
      }

      checkOpEvent(event);

      // pre handle event
      if (
        [
          EventType.approve,
          EventType.conditionalApprove,
          EventType.inscribeApprove,
          EventType.inscribeConditionalApprove,
        ].includes(event.event)
      ) {
        need(!!item.data);
      }

      // pre handle op
      if (event.op.op == OpType.approve) {
        await decimal.trySetting(event.op.tick);
      } else if (event.op.op == OpType.commit) {
        //
        for (let i = 0; i < event.op.data.length; i++) {
          const item = event.op.data[i];
          if (item.func == FuncType.deployPool) {
            const [tick0, tick1] = item.params;
            await decimal.trySetting(tick0);
            await decimal.trySetting(tick1);
          }
        }
      } else if (event.op.op == OpType.deploy) {
        need(!!event.op.init.sequencer);
        need(!!event.op.init.fee_to);
        need(!!event.op.init.gas_to);
        need(!!event.op.init.gas_tick);
        env.ContractConfig = {
          swapFeeRate1000: event.op.init.swap_fee_rate
            ? decimalCal([event.op.init.swap_fee_rate, "mul", 1000])
            : "0",
          feeTo: event.op.init.fee_to,
        };
        await decimal.trySetting("sats");
        await decimal.trySetting("ordi");
        await decimal.trySetting(event.op.init.gas_tick);
      } else if (event.op.op == OpType.transfer) {
        await decimal.trySetting(event.op.tick);
      }
      ret.list.push(event);
    }
    return ret;
  }

  async moduleInscriptionInfo(
    inscriptionId: string
  ): Promise<ModuleInscriptionInfo> {
    const url = `${config.openApi.url}/v1/indexer/brc20-module/inscription/info/${inscriptionId}`;
    return this.unisatGet("brc20-module/inscription/info/inscriptionId", url);
  }

  async commitVerify(params: {
    commits: string[];
    results: Result[];
  }): Promise<{
    critical: boolean;
    valid: boolean;
    index?: number;
    id?: string;
    message?: string;
  }> {
    const url = `${config.openApi.url}/v1/indexer/brc20-module/verify-commit`;
    // return { valid: true };
    const ret = await this.unisatPost(
      "brc20-module/verify-commit",
      url,
      params
    );
    logger.info({
      tag: "commit-verify-info",
      length: params.commits.length,
      results: params.results,
      commits: params.commits,
      ret,
    });
    return ret;
  }

  private async get(
    tag: string,
    axios: AxiosInstance,
    url: string,
    query?: object
  ) {
    query = removeUndefined(query);
    let params;
    if (Object.keys(query).length > 0) {
      params = {
        params: query,
      };
    }
    const key = tag;
    if (!this.statistic[key] || this.statistic[key].length > 10000) {
      this.statistic[key] = [];
    }
    const start = Date.now();
    try {
      const ret = await axios.get(url, params);
      const interval = Date.now() - start;
      this.statistic[key].push(interval);
      metric.obverse(key, interval);
      return ret.data;
    } catch (err) {
      this.statistic[key].push(-1);
      metric.obverse(key, -1);
      throw err;
    }
  }

  private async post(
    tag: string,
    axios: AxiosInstance,
    url: string,
    body?: object
  ) {
    body = body ?? {};

    const key = tag;
    if (!this.statistic[key] || this.statistic[key].length > 10000) {
      this.statistic[key] = [];
    }
    const start = Date.now();
    try {
      const ret = await axios.post(url, body, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      const interval = Date.now() - start;
      this.statistic[key].push(interval);
      metric.obverse(key, interval);
      return ret.data;
    } catch (err) {
      this.statistic[key].push(-1);
      metric.obverse(key, -1);
      throw err;
    }
  }

  private async unisatGet(tag: string, url: string, query?: object) {
    const data = await this.get(tag, this.internal, url, query);

    if (data?.code !== 0) {
      throw new Error(data?.msg);
    }
    return data.data;
  }

  private async unisatPost(
    tag: string,
    url: string,
    body?: object
  ): Promise<any> {
    body = body ?? {};

    const data = await this.post(tag, this.internal, url, body);
    if (data?.code !== 0) {
      throw new Error(data?.msg);
    }
    return data.data;
  }

  async signByKeyring(
    key: string,
    psbtHex: string,
    toSignInputs: ToSignInput[]
  ): Promise<string> {
    return this.unisatPost("sign-psbt", "/sign-psbt");
  }
}
