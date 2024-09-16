import { default as Axios, AxiosInstance } from "axios";
import { config } from "../config";
import { bn } from "../contract/bn";
import {
  Brc20AddressBalance,
  Brc20Info,
  FeeEstimate,
  FeeEstimateMempool,
  InscriptionEventsRes,
  ModuleInscriptionInfo,
  NFT,
  ToSignInput,
  UTXO,
} from "../types/api";
import { Result } from "../types/func";
import { loggerError, removeUndefined } from "../utils/utils";
import { need } from "./utils";

const timeout = 30000;
const TAG = "api";

export class API {
  private cache: {
    [key: string]: { timestamp: number; intervalMs: number; data: any };
  } = {};
  private internal: AxiosInstance;
  private internal2: AxiosInstance;
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
        {
          ...(config.openApi.apiKey
            ? { Authorization: `Bearer ${config.openApi.apiKey}` }
            : {}),
          ...(config.openApi.host ? { host: `${config.openApi.host}` } : {}),
        }
      ),
    });
    this.internal2 = Axios.create({
      baseURL: config.openApi.url,
      timeout,
      headers: Object.assign(
        {
          "Content-Type": "application/json",
        },
        {
          ...(config.openApi.apiKey
            ? { Authorization: `Bearer ${config.openApi.apiKey}` }
            : {}),
          ...(config.openApi.host ? { host: `${config.openApi.host}` } : {}),
        }
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
    const url = `${config.openApi.url}/local_pushtx`;
    return await this.unisatPost("local_pushtx", url, { txHex });
  }

  async broadcast2(txHex: string): Promise<string> {
    const url = `${config.openApi2.url}/local_pushtx`;

    const data = await this.post("local_pushtx2", this.internal, url, {
      txHex,
    });
    if (data?.code !== 0) {
      throw new Error(data?.msg);
    }
    return data.data;
  }

  // async broadcastToMempool(txHex: string) {
  //   const url = config.mempoolApi + `/api/tx`;
  //   return (await this.mempool.post(url, txHex)) as any;
  // }

  async tickPrice(tick: string) {
    tick = tick.toLowerCase();
    if (config.fakeMarketPrice) {
      return 1;
    }

    const key = `price: ${tick}`;

    if (!this.cache[key]) {
      const res = await this.unisatPost(
        "auction/brc20_price",
        `${config.openApi.url}/v3/market/brc20/auction/brc20_price`, // TOFIX
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
    const url = `${config.openApi.url}/brc20/${encodeURIComponent(tick)}/info`;
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
    const url = `${config.openApi.url}/address/${address}/brc20/summary`;
    return await this.unisatGet("address/brc20/summary", url, {
      start: 0,
      limit: 500,
    });
  }

  async inscriptionInfo(inscriptionId: string): Promise<NFT> {
    const url = `${config.openApi.url}/inscription/info/${inscriptionId}`;
    return await this.unisatGet("inscription/info/inscriptionId", url);
  }

  async inscriptionContent(inscriptionId: string): Promise<string> {
    const url = `${config.openApi.url}/inscription/content/${inscriptionId}`;
    return await this.get(
      "/inscription/content/inscriptionId",
      this.internal,
      url
    );
  }

  async utxo(txid: string, vout: number): Promise<UTXO> {
    const url = `/utxo/${txid}/${vout}`;
    const ret = await this.unisatGet("/utxo", url, {
      txid,
      vout,
    });
    return ret;
  }

  async addressUTXOs(
    address: string,
    cursor?: number,
    size?: number
  ): Promise<UTXO[]> {
    const url = `${config.openApi.url}/address/${address}/utxo`;
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
    const url = `${config.openApi.url}/tx/${txid}`;
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
        loggerError("network-mempool", err);
        const url = `${config.openApi.url}/fee-estimate`;
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
    const url = `${config.openApi.url}/brc20/bestheight`;
    type Res = {
      height: number;
    };
    const ret = ((await this.unisatGet("brc20/bestheight", url)) as Res).height;
    return ret;
  }

  async btcPrice() {
    const url = `${config.openApi.url}/fee-estimate`;
    const res = (await this.unisatGet("fee-estimate", url)) as FeeEstimate;
    return res.BTCPrice;
  }

  async eventRawList(params: {
    moduleId: string;
    cursor: number;
    size: number;
  }) {
    const query = {
      // start: params.start,
      // end: params.end,
      cursor: params.cursor,
      size: params.size,
    };
    const url = `${config.openApi.url}/brc20-module/${params.moduleId}/history`;
    const ret = (await this.unisatGet(
      "/brc20-module/moduleId/history",
      url,
      query
    )) as InscriptionEventsRes;
    return ret;
  }

  async moduleInscriptionInfo(
    inscriptionId: string
  ): Promise<ModuleInscriptionInfo> {
    const url = `${config.openApi.url}/brc20-module/inscription/info/${inscriptionId}`;
    return this.unisatGet("brc20-module/inscription/info/inscriptionId", url);
  }

  async createOrder(content: string) {
    const url = `/v2/inscribe/order/create`;
    const ret = await this.unisatPost("order/create", url, content as any);
    return ret;
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
    const url = `${config.openApi.url}/brc20-module/verify-commit`;
    // return { valid: true };
    const ret = await this.unisatPost(
      "brc20-module/verify-commit",
      url,
      params
    );
    logger.info({
      tag: TAG,
      msg: "commit-verify-info",
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
    throw new Error("not implemented");
  }
}
