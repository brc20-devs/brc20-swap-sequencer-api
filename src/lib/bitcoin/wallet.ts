import { DUST330, DUST546 } from "../../domain/constant";
import { getAddressType } from "../../domain/utils";
import { ToSignInput, UTXO } from "../../types/api";
import { AddressType } from "../../types/domain";
import { ECPair, ECPairInterface, bitcoin } from "./core";
import { buildInscriptionPayment } from "./inscribe";
import { toXOnly, tweakPrivkeyWithRootHash, tweakSigner } from "./utils";

export class Wallet {
  private _address: string;
  private _addressType: AddressType;
  payment: bitcoin.payments.Payment;
  private _signer: bitcoin.Signer;
  private _publicKey: Buffer;
  inscriptionPayment: bitcoin.payments.Payment;
  private _tweakedSigner: bitcoin.Signer;
  private _ecpair: ECPairInterface;

  constructor(options?: {
    signer?: bitcoin.Signer;
    address?: string;
    addressType?: AddressType;
    publicKey?: string;
    tweakedSigner?: bitcoin.Signer;
  }) {
    if (options.addressType) {
      this._addressType = options.addressType;
    }

    if (options.address) {
      this._address = options.address;
    }

    if (!this._addressType && this._address) {
      this._addressType = getAddressType(this._address);
    }

    if (options.signer) {
      this._signer = options.signer;
      this._publicKey = options.signer.publicKey;
      this._ecpair = this._signer as ECPairInterface;
    }

    if (options.tweakedSigner) {
      this._tweakedSigner = options.tweakedSigner;
    }

    if (options.publicKey) {
      if (typeof options.publicKey === "string") {
        this._publicKey = Buffer.from(options.publicKey, "hex");
      } else {
        this._publicKey = options.publicKey;
      }
    }

    if (this._publicKey) {
      if (this._addressType === AddressType.P2WPKH) {
        this.payment = bitcoin.payments.p2wpkh({
          pubkey: this._publicKey,
          network,
        });
      } else if (this._addressType === AddressType.P2TR) {
        this.payment = bitcoin.payments.p2tr({
          internalPubkey: this._publicKey.slice(1, 33),
          network,
        });
      } else {
        throw new Error("not supported");
      }
    }

    if (this.payment) {
      this._address = this.payment.address;
    }
  }

  get addressType() {
    return this._addressType;
  }

  get address() {
    if (this._address) {
      return this._address;
    } else {
      return this.payment.address;
    }
  }

  static fromMultiPubkey(pubkey1: string | Buffer, pubkey2: string | Buffer) {
    const _pubkey1 =
      typeof pubkey1 === "string" ? Buffer.from(pubkey1, "hex") : pubkey1;
    const _pubkey2 =
      typeof pubkey2 === "string" ? Buffer.from(pubkey2, "hex") : pubkey2;
    const p2ms = bitcoin.payments.p2ms({
      m: 1,
      pubkeys: [_pubkey1, _pubkey2],
      network,
    });
    const p2wsh = bitcoin.payments.p2wsh({
      redeem: p2ms,
      network,
    });
    return new Wallet({
      addressType: AddressType.P2WSH,
      address: p2wsh.address,
    });
  }

  static fromAddress(address: string, publicKey?: string) {
    return new Wallet({
      address,
      publicKey,
    });
  }

  static fromRandomLikeAddress(address: string) {
    const signer = ECPair.makeRandom({ network });
    const addressType = getAddressType(address);
    if (addressType === AddressType.P2TR) {
      const tweakedSigner = tweakSigner(signer);
      return new Wallet({ signer, addressType, tweakedSigner });
    } else {
      return new Wallet({ signer, addressType });
    }
  }

  static fromRandomLikeAddressType(addressType: AddressType) {
    const signer = ECPair.makeRandom({ network });
    if (addressType === AddressType.P2TR) {
      const tweakedSigner = tweakSigner(signer);
      return new Wallet({ signer, addressType, tweakedSigner });
    } else {
      return new Wallet({ signer, addressType });
    }
  }

  static fromWIF(wif: string, addressType: AddressType) {
    const signer = ECPair.fromWIF(wif, network);
    if (addressType === AddressType.P2TR) {
      const tweakedSigner = tweakSigner(signer);
      return new Wallet({ signer, addressType, tweakedSigner });
    } else {
      return new Wallet({ signer, addressType });
    }
  }

  toWIF() {
    if (this._ecpair) {
      return this._ecpair.toWIF();
    }
  }

  get scriptPk() {
    return this.payment.output.toString("hex");
  }

  toPsbtInput(utxo: UTXO) {
    if (this._addressType === AddressType.P2TR) {
      return {
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          value: utxo.satoshi,
          script: Buffer.from(utxo.scriptPk, "hex"),
        },
        tapInternalKey: toXOnly(this._publicKey),
      };
    } else {
      return {
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          value: utxo.satoshi,
          script: Buffer.from(utxo.scriptPk, "hex"),
        },
      };
    }
  }

  setInscriptionPayment(payment: bitcoin.payments.Payment) {
    this.inscriptionPayment = payment;
  }

  toPsbtInputTaprootKeyPath(utxo: UTXO) {
    return {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.satoshi,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      tapInternalKey: toXOnly(this._publicKey),
      tapMerkleRoot: this.inscriptionPayment.hash,
    };
  }

  signPsbtInput(psbt: bitcoin.Psbt, index: number) {
    if (this._tweakedSigner) {
      psbt.signInput(index, this._tweakedSigner);
    } else {
      psbt.signInput(index, this.signer);
    }
  }

  signPsbtInputs(psbt: bitcoin.Psbt, toSignInputs: ToSignInput[]) {
    toSignInputs.forEach((v) => {
      if (v.address === this.address) {
        this.signPsbtInput(psbt, v.index);
      }
    });
  }

  signPsbtInputTaprootKeyPath(psbt: bitcoin.Psbt, index: number) {
    const privKey = tweakPrivkeyWithRootHash(
      this.signer as any,
      this.inscriptionPayment.hash
    );
    psbt.signTaprootInput(index, privKey, undefined);
  }

  get dust() {
    if (this._addressType === AddressType.P2TR || AddressType.P2WPKH) {
      return DUST330;
    } else {
      return DUST546;
    }
  }

  get internalPubkey() {
    return toXOnly(this._publicKey);
  }

  get signer() {
    if (this._tweakedSigner) {
      return this._tweakedSigner;
    }
    return this._signer;
  }

  get publicKey() {
    return this._publicKey;
  }

  isWatchOnly() {
    if (this._signer) {
      return false;
    } else {
      return true;
    }
  }

  updateInscriptionPayment(content: string) {
    const internalPubkey = toXOnly(this._publicKey);
    const leafPubkey = this._publicKey;
    const contentType = "text/plain;charset=utf-8";
    const payment = buildInscriptionPayment(
      internalPubkey,
      leafPubkey,
      contentType,
      content
    );
    this.inscriptionPayment = payment;
  }
}
