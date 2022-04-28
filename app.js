import fs from "fs";
import { Cosmos } from "@cosmostation/cosmosjs";
import message from "@cosmostation/cosmosjs/src/messages/proto.js";
import Discord from "discord.js";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 24*60*60});

let rawdata = fs.readFileSync("config.json");
let config = JSON.parse(rawdata);

// Cosmos config
const mnemonic = config.mnemonic;
const chainId = config.chainId;
const lcdUrl = config.lcdUrl;
const denom = config.denom;
const cosmos = new Cosmos(lcdUrl, chainId);
cosmos.setBech32MainPrefix(config.prefix);
cosmos.setPath("m/44'/118'/0'/0/0");
const address = cosmos.getAddress(mnemonic);
const privKey = cosmos.getECPairPriv(mnemonic);
const pubKeyAny = cosmos.getPubKeyAny(privKey);

// Discord
const discord = new Discord.Client({ intents: ["GUILDS"] });
const discordAuth = config.discordAuth;

discord.on("message", async (mess) => {
  const msg = mess.content.toLowerCase();

  if (msg.startsWith("i love aura")) {
    const addressTo = msg.substring(12, 55);

    if (addressTo.length < 43) {
      return;
    }
    let numberGetFaucet = cache.get(addressTo);
    if (numberGetFaucet) {
      if (numberGetFaucet >= 5){
        console.log("Limit reached");
        return mess.reply("You have reached the limit of 5 transactions per day");
      }	
      else{
        numberGetFaucet += 1;
        cache.set(addressTo, numberGetFaucet);
      }
    } else {
      numberGetFaucet = 1;
      cache.set(addressTo, numberGetFaucet);
    }
    // sending the fund
    mess.reply(`Sending ${config.AmountSend / 1e6} aura to: ${addressTo}`);
    try {
      cosmos.getAccounts(address).then((data) => {
        // ---------------------------------- (1)txBody ----------------------------------
        const msgSend = new message.cosmos.bank.v1beta1.MsgSend({
          from_address: address,
          to_address: addressTo,
          amount: [{ denom: denom, amount: String(config.AmountSend) }], // 7 decimal places (1000000 uaura = 1 AURA)
        });

        const msgSendAny = new message.google.protobuf.Any({
          type_url: "/cosmos.bank.v1beta1.MsgSend",
          value: message.cosmos.bank.v1beta1.MsgSend.encode(msgSend).finish(),
        });

        const txBody = new message.cosmos.tx.v1beta1.TxBody({
          messages: [msgSendAny],
          memo: config.memo,
        });

        // --------------------------------- (2)authInfo ---------------------------------
        const signerInfo = new message.cosmos.tx.v1beta1.SignerInfo({
          public_key: pubKeyAny,
          mode_info: {
            single: {
              mode: message.cosmos.tx.signing.v1beta1.SignMode.SIGN_MODE_DIRECT,
            },
          },
          sequence: data.account.sequence,
        });

        const feeValue = new message.cosmos.tx.v1beta1.Fee({
          amount: [{ denom: denom, amount: String(config.feeAmount) }],
          gas_limit: config.gasLimit,
        });

        const authInfo = new message.cosmos.tx.v1beta1.AuthInfo({
          signer_infos: [signerInfo],
          fee: feeValue,
        });

        // -------------------------------- sign --------------------------------
        const signedTxBytes = cosmos.sign(
          txBody,
          authInfo,
          data.account.account_number,
          privKey
        );

        cosmos.broadcast(signedTxBytes).then((response) => {
          if (response.tx_response.code == 0) {
            mess.reply(`Tokens sent. Tx hash: ${response.tx_response.txhash}`);
          } else {
            mess.reply(
              `Tokens *not* sent. Reason: ${response.tx_response.raw_log}`
            );
          }
        });
      });
    } catch (error) {
      mess.reply(`Something went wrong!`);
      console.log(error);
    }
  }
});

discord.login(discordAuth);

console.log("App is running...");
