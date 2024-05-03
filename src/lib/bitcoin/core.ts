import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";
export { ECPairInterface } from "ecpair";
export { ECPair, bitcoin, ecc };

bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
