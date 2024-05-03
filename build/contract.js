(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('bignumber.js')) :
  typeof define === 'function' && define.amd ? define(['exports', 'bignumber.js'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Contract = {}, global.BigNumber));
})(this, (function (exports, BigNumber) { 'use strict';

  var ExactType;
  (function (ExactType) {
      ExactType["exactIn"] = "exactIn";
      ExactType["exactOut"] = "exactOut";
  })(ExactType || (ExactType = {}));
  var FuncType;
  (function (FuncType) {
      FuncType["deployPool"] = "deployPool";
      FuncType["addLiq"] = "addLiq";
      FuncType["swap"] = "swap";
      FuncType["removeLiq"] = "removeLiq";
      FuncType["decreaseApproval"] = "decreaseApproval";
  })(FuncType || (FuncType = {}));

  function sortTickParams(_params) {
      const params = _params;
      if (!params.tick0 || !params.tick1) {
          return params;
      }
      if (params.tick0 < params.tick1) {
          return params;
      }
      else {
          const ret = Object.assign(Object.assign({}, params), { tick0: params.tick1, tick1: params.tick0, amount0: params.amount1, amount1: params.amount0 });
          return ret;
      }
  }
  function getPairStr(tick0, tick1) {
      const params = sortTickParams({ tick0, tick1 });
      return `${params.tick0}/${params.tick1}`;
  }
  function need(condition, message) {
      if (!condition) {
          throw new Error(message || "server error");
      }
  }
  const invalid_amount = "invalid amount";
  const invalid_slippage = "invalid slippage";
  function checkGtZero(amount) {
      need(bn(amount).gt("0") && bnIsInteger(amount), invalid_amount);
  }
  function checkGteZero(amount) {
      need(bn(amount).gte("0") && bnIsInteger(amount), invalid_amount);
  }
  function checkSlippage(slippage) {
      need(bn(slippage).gte("0"), invalid_slippage);
      need(bn(slippage).lte("1000"), invalid_slippage);
      need(bnIsInteger(slippage), invalid_slippage);
      need(slippage == bn(slippage).toString(), invalid_amount);
  }

  const bn = BigNumber;
  bn.config({
      EXPONENTIAL_AT: 1e9,
      DECIMAL_PLACES: 0,
      ROUNDING_MODE: bn.ROUND_DOWN,
  });
  function bnIsInteger(value) {
      return bn(value).isInteger() && value.toString().indexOf(".") == -1;
  }
  function _bnCal(items, decimalPlaces) {
      const _bn = bn.clone();
      _bn.config({
          EXPONENTIAL_AT: 1e9,
          DECIMAL_PLACES: parseInt(decimalPlaces),
          ROUNDING_MODE: bn.ROUND_DOWN,
      });
      let ret = _bn(items[0]);
      need(!_bn(items[0]).isNaN());
      need(_bn(items[1]).isNaN());
      for (let i = 1; i < items.length; i++) {
          const cur = items[i];
          const next = items[i + 1];
          if (cur == "add") {
              need(_bn(next).gte("0"), invalid_amount);
              ret = ret.plus(next);
              i++;
          }
          else if (cur == "sub") {
              need(_bn(ret).gte(next), invalid_amount);
              ret = ret.minus(next);
              i++;
          }
          else if (cur == "mul") {
              need(_bn(next).gte("0"), invalid_amount);
              ret = ret.times(next);
              i++;
          }
          else if (cur == "div") {
              need(_bn(next).gt("0"), invalid_amount);
              ret = ret.div(next);
              i++;
          }
          else if (cur == "pow") {
              need(_bn(next).gte("0"), invalid_amount);
              ret = ret.pow(next);
              i++;
          }
          else if (cur == "sqrt") {
              ret = ret.sqrt();
          }
          else if (!_bn(cur).isNaN()) {
              need(_bn(next).isNaN());
          }
      }
      if (decimalPlaces) {
          return ret.decimalPlaces(parseInt(decimalPlaces)).toString();
      }
      else {
          return ret.toString();
      }
  }
  function uintCal(items) {
      return _bnCal(items, "0");
  }

  class Brc20 {
      constructor(balance, tick) {
          this.balance = {};
          this.balance = balance;
          this.tick = tick;
          this._supply = "0";
          for (const address in this.balance) {
              this._supply = uintCal([this._supply, "add", this.balance[address]]);
          }
      }
      get supply() {
          return this._supply;
      }
      balanceOf(address) {
          return this.balance[address] || "0";
      }
      transfer(from, to, amount) {
          this.checkAmount(amount);
          this.checkAddress(from, amount);
          this.balance[from] = uintCal([this.balance[from], "sub", amount]);
          this.balance[to] = uintCal([this.balance[to] || "0", "add", amount]);
          this.checkAddress(from);
          this.checkAddress(to);
      }
      mint(address, amount) {
          this.checkAmount(amount);
          this.balance[address] = uintCal([
              this.balance[address] || "0",
              "add",
              amount,
          ]);
          this._supply = uintCal([this._supply, "add", amount]);
          this.checkAddress(address);
      }
      burn(address, amount) {
          this.checkAmount(amount);
          this.checkAddress(address, amount);
          this.balance[address] = uintCal([
              this.balance[address] || "0",
              "sub",
              amount,
          ]);
          this._supply = uintCal([this._supply, "sub", amount]);
          this.checkAddress(address);
      }
      checkAmount(amount) {
          need(bn(amount).gt("0"), "invalid amount: " + this.tick);
      }
      checkAddress(address, value = "0") {
          need(bn(this.balance[address]).gte(value), "insufficient amount: " + this.tick);
      }
  }

  class Assets {
      constructor(map) {
          this.map = {};
          for (const assetType in map) {
              for (const tick in map[assetType]) {
                  const brc20 = new Brc20(map[assetType][tick].balance, map[assetType][tick].tick);
                  map[assetType][tick] = brc20;
              }
          }
          this.map = map;
      }
      getAvaiableAssets(address) {
          let set = new Set();
          for (const assetType in this.map) {
              for (const tick in this.map[assetType]) {
                  if (bn(this.getBalance(address, tick, assetType)).gt("0")) {
                      set.add(tick);
                  }
              }
          }
          return Array.from(set);
      }
      tryCreate(tick) {
          for (let assetType in this.map) {
              if (!this.map[assetType][tick]) {
                  this.map[assetType][tick] = new Brc20({}, tick);
              }
          }
      }
      isExist(tick) {
          return !!this.map["swap"][tick];
      }
      get(tick, assetType = "swap") {
          return this.map[assetType][tick];
      }
      getBalance(address, tick, assetType = "swap") {
          try {
              need(!!this.map[assetType][tick]);
              return this.map[assetType][tick].balanceOf(address);
          }
          catch (err) {
              return "0";
          }
      }
      getAggregateBalance(address, tick, assetTypes) {
          let ret = "0";
          assetTypes.forEach((assetType) => {
              ret = uintCal([ret, "add", this.getBalance(address, tick, assetType)]);
          });
          return ret;
      }
      mint(address, tick, amount, assetType = "swap") {
          this.tryCreate(tick);
          this.map[assetType][tick].mint(address, amount);
      }
      burn(address, tick, amount, assetType = "swap") {
          this.map[assetType][tick].burn(address, amount);
      }
      convert(address, tick, amount, fromAssetType, toAssetType) {
          this.map[fromAssetType][tick].burn(address, amount);
          this.map[toAssetType][tick].mint(address, amount);
      }
      transfer(tick, from, to, amount, fromAssetType, toAssetType) {
          this.map[fromAssetType][tick].burn(from, amount);
          this.map[toAssetType][tick].mint(to, amount);
      }
      swap(address, tickIn, tickOut, amountIn, amountOut, assetType = "swap") {
          const pair = getPairStr(tickIn, tickOut);
          this.map[assetType][tickIn].transfer(address, pair, amountIn);
          this.map[assetType][tickOut].transfer(pair, address, amountOut);
      }
      dataRefer() {
          return this.map;
      }
  }

  const exceeding_slippage = "exceeding slippage";
  const duplicate_tick = "duplicate tick";
  const insufficient_liquidity = "insufficient liquidity for this trade";
  const pool_existed = "pool existed";
  const pool_not_found = "pool not found";
  const feeRate = "6";
  const AssetsClass = Assets;
  class Contract {
      constructor(assets, status, config) {
          this.assets = assets;
          this.status = status;
          this.config = config;
      }
      deployPool(params) {
          need(params.tick0 !== params.tick1, duplicate_tick);
          const pair = getPairStr(params.tick0, params.tick1);
          need(!this.assets.isExist(pair), pool_existed);
          this.assets.tryCreate(pair);
          return {};
      }
      addLiq(params) {
          const { tick0, tick1, amount0, amount1, expect, slippage1000 } = sortTickParams(params);
          checkGtZero(amount0);
          checkGtZero(amount1);
          checkGteZero(expect);
          checkSlippage(slippage1000);
          const pair = getPairStr(tick0, tick1);
          const { address } = params;
          need(!!this.assets.isExist(pair), pool_not_found);
          this.mintFee({
              tick0,
              tick1,
          });
          if (this.assets.get(pair).supply == "0") {
              const lp = uintCal([amount0, "mul", amount1, "sqrt"]);
              const firstLP = uintCal([lp, "sub", "1000"]);
              this.assets.get(pair).mint(address, firstLP);
              this.assets.get(pair).mint("0", "1000");
              this.assets.get(tick0).transfer(address, pair, amount0);
              this.assets.get(tick1).transfer(address, pair, amount1);
              checkGtZero(firstLP);
              need(bn(firstLP).gte(uintCal([
                  expect,
                  "mul",
                  uintCal(["1000", "sub", slippage1000]),
                  "div",
                  "1000",
              ])), exceeding_slippage);
              {
                  this.status.kLast[pair] = uintCal([
                      this.assets.get(tick0).balanceOf(pair),
                      "mul",
                      this.assets.get(tick1).balanceOf(pair),
                  ]);
              }
              return { lp: firstLP, amount0, amount1 };
          }
          else {
              let amount0Adjust;
              let amount1Adjust;
              const poolLp = this.assets.get(pair).supply;
              const poolAmount0 = this.assets.get(tick0).balanceOf(pair);
              const poolAmount1 = this.assets.get(tick1).balanceOf(pair);
              amount1Adjust = uintCal([
                  amount0,
                  "mul",
                  poolAmount1,
                  "div",
                  poolAmount0,
              ]);
              if (bn(amount1Adjust).lte(amount1)) {
                  amount0Adjust = amount0;
              }
              else {
                  amount0Adjust = uintCal([
                      amount1,
                      "mul",
                      poolAmount0,
                      "div",
                      poolAmount1,
                  ]);
                  amount1Adjust = amount1;
              }
              const lp0 = uintCal([amount0Adjust, "mul", poolLp, "div", poolAmount0]);
              const lp1 = uintCal([amount1Adjust, "mul", poolLp, "div", poolAmount1]);
              const lp = bn(lp0).lt(lp1) ? lp0 : lp1;
              this.assets.get(pair).mint(address, lp);
              this.assets.get(tick0).transfer(address, pair, amount0Adjust);
              this.assets.get(tick1).transfer(address, pair, amount1Adjust);
              checkGtZero(lp);
              need(bn(lp).gte(uintCal([
                  expect,
                  "mul",
                  uintCal(["1000", "sub", slippage1000]),
                  "div",
                  "1000",
              ])), exceeding_slippage);
              need(amount1Adjust == amount1 || amount0Adjust == amount0);
              {
                  this.status.kLast[pair] = uintCal([
                      this.assets.get(tick0).balanceOf(pair),
                      "mul",
                      this.assets.get(tick1).balanceOf(pair),
                  ]);
              }
              return { lp, amount0: amount0Adjust, amount1: amount1Adjust };
          }
      }
      removeLiq(params) {
          const { address, lp, tick0, tick1, amount0, amount1, slippage1000 } = sortTickParams(params);
          checkGtZero(lp);
          checkGteZero(amount0);
          checkGteZero(amount1);
          checkSlippage(slippage1000);
          this.mintFee({
              tick0,
              tick1,
          });
          const pair = getPairStr(tick0, tick1);
          need(!!this.assets.isExist(pair), pool_not_found);
          const poolLp = this.assets.get(pair).supply;
          const reserve0 = this.assets.get(tick0).balanceOf(pair);
          const reserve1 = this.assets.get(tick1).balanceOf(pair);
          const acquire0 = uintCal([lp, "mul", reserve0, "div", poolLp]);
          const acquire1 = uintCal([lp, "mul", reserve1, "div", poolLp]);
          this.assets.get(pair).burn(address, lp);
          this.assets.get(tick0).transfer(pair, address, acquire0);
          this.assets.get(tick1).transfer(pair, address, acquire1);
          need(bn(acquire0).gte(uintCal([
              amount0,
              "mul",
              uintCal(["1000", "sub", slippage1000]),
              "div",
              "1000",
          ])), exceeding_slippage);
          need(bn(acquire1).gte(uintCal([
              amount1,
              "mul",
              uintCal(["1000", "sub", slippage1000]),
              "div",
              "1000",
          ])), exceeding_slippage);
          {
              this.status.kLast[pair] = uintCal([
                  this.assets.get(tick0).balanceOf(pair),
                  "mul",
                  this.assets.get(tick1).balanceOf(pair),
              ]);
          }
          return { tick0, tick1, amount0: acquire0, amount1: acquire1 };
      }
      swap(params) {
          const { tickIn, tickOut, address, exactType, expect, slippage1000, amount, } = params;
          checkGtZero(amount);
          checkGteZero(expect);
          checkSlippage(slippage1000);
          const pair = getPairStr(tickIn, tickOut);
          const reserveIn = this.assets.get(tickIn).balanceOf(pair);
          const reserveOut = this.assets.get(tickOut).balanceOf(pair);
          let amountIn;
          let amountOut;
          let ret;
          if (exactType == ExactType.exactIn) {
              amountIn = amount;
              amountOut = this.getAmountOut({
                  amountIn,
                  reserveIn,
                  reserveOut,
              });
              const amountOutMin = uintCal([
                  expect,
                  "mul",
                  "1000",
                  "div",
                  uintCal(["1000", "add", slippage1000]),
              ]);
              need(bn(amountOut).gte(amountOutMin), exceeding_slippage);
              ret = amountOut;
          }
          else {
              amountOut = amount;
              amountIn = this.getAmountIn({
                  amountOut,
                  reserveIn,
                  reserveOut,
              });
              const amountInMax = uintCal([
                  expect,
                  "mul",
                  uintCal(["1000", "add", slippage1000]),
                  "div",
                  "1000",
              ]);
              need(bn(amountIn).lte(amountInMax), exceeding_slippage);
              ret = amountIn;
          }
          this.assets.swap(address, tickIn, tickOut, amountIn, amountOut);
          return { amount: ret };
      }
      getAmountOut(params) {
          const { amountIn, reserveIn, reserveOut } = params;
          checkGtZero(amountIn);
          need(bn(reserveIn).gt("0") && bn(reserveOut).gt("0"), insufficient_liquidity);
          const amountInWithFee = uintCal([
              amountIn,
              "mul",
              uintCal(["1000", "sub", this.config.swapFeeRate1000]),
          ]);
          const numerator = uintCal([amountInWithFee, "mul", reserveOut]);
          const denominator = uintCal([
              reserveIn,
              "mul",
              "1000",
              "add",
              amountInWithFee,
          ]);
          return uintCal([numerator, "div", denominator]);
      }
      getAmountIn(params) {
          const { amountOut, reserveIn, reserveOut } = params;
          checkGtZero(amountOut);
          need(bn(reserveIn).gt("0") && bn(reserveOut).gt("0"), insufficient_liquidity);
          const numerator = uintCal([reserveIn, "mul", amountOut, "mul", "1000"]);
          const denominator = uintCal([
              reserveOut,
              "sub",
              amountOut,
              "mul",
              uintCal(["1000", "sub", this.config.swapFeeRate1000]),
          ]);
          return uintCal([numerator, "div", denominator, "add", "1"]);
      }
      send(params) {
          const { from, to, tick, amount } = params;
          checkGtZero(amount);
          this.assets.get(tick).transfer(from, to, amount);
          return {};
      }
      getFeeLp(params) {
          const { tick0, tick1 } = params;
          const pair = getPairStr(tick0, tick1);
          const reserve0 = this.assets.get(tick0).balanceOf(pair);
          const reserve1 = this.assets.get(tick1).balanceOf(pair);
          {
              if (bn(this.status.kLast[pair]).gt("0")) {
                  const rootK = uintCal([reserve0, "mul", reserve1, "sqrt"]);
                  const rootKLast = uintCal([this.status.kLast[pair], "sqrt"]);
                  if (bn(rootK).gt(rootKLast)) {
                      const numerator = uintCal([
                          this.assets.get(pair).supply,
                          "mul",
                          uintCal([rootK, "sub", rootKLast]),
                      ]);
                      const scale = uintCal([feeRate, "sub", "1"]);
                      const denominator = uintCal([rootK, "mul", scale, "add", rootKLast]);
                      const liquidity = uintCal([numerator, "div", denominator]);
                      return liquidity;
                  }
              }
          }
          return "0";
      }
      mintFee(params) {
          const { tick0, tick1 } = params;
          const pair = getPairStr(tick0, tick1);
          {
              const liquidity = this.getFeeLp(params);
              if (bn(liquidity).gt("0")) {
                  this.assets.get(pair).mint(this.config.feeTo, liquidity);
              }
          }
      }
  }

  exports.AssetsClass = AssetsClass;
  exports.Contract = Contract;
  exports.duplicate_tick = duplicate_tick;
  exports.exceeding_slippage = exceeding_slippage;
  exports.insufficient_liquidity = insufficient_liquidity;
  exports.pool_existed = pool_existed;
  exports.pool_not_found = pool_not_found;

}));
