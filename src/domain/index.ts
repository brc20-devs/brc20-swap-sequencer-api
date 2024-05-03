import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";

bitcoin.initEccLib(ecc);

export const ECPair = ECPairFactory(ecc);
