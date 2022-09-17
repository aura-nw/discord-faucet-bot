import fs from "fs";
import Discord from "discord.js";
import NodeCache from "node-cache";
import async from "async";
import util from 'util';
import { exec } from 'child_process';


// Cosmos config
let rawdata = fs.readFileSync("config.json");
let config = JSON.parse(rawdata);
const chainId = config.chainId;
const denom = config.denom;

const exec_promise = util.promisify(exec);

// Defining the queue
const queue = async.queue(async (objAddress, completed) => {
  console.log("Currently Busy Processing address " + objAddress.addressTo);
  const { stdout, stderr } = await exec_promise(`./bin/evmosd tx bank send faucet ${objAddress.addressTo} ${config.AmountSend}${denom} --fees ${config.feeAmount}${denom} --chain-id ${chainId} --node https://tendermint.bd.evmos.dev:26657 --home . --keyring-backend test -y --output json`);
  const json =  JSON.parse(stdout);
  if (json.code == 0){
    objAddress.mess.reply(`Tokens sent. Tx hash: https://testnet.mintscan.io/evmos-testnet/txs/${json.txhash}`);
    isProcessing = false;
  } else {
    objAddress.mess.reply(
      `Tokens *not* sent. Reason: ${json.raw_log}`
    );
    isProcessing = false;
  }
  console.log(stderr);
  console.log("abc");
  // Simulating a Complex address
  setTimeout(() => {
    // The number of addresses to be processed
    const remaining = queue.length();
    completed(null, { objAddress, remaining });
  }, 6000);
}, 1); // The concurrency value is 1

// Executes the callback when the queue is done processing all the addresses
queue.drain(() => {
  console.log("Successfully processed all items");
});

const cache = new NodeCache({ stdTTL: 24 * 60 * 60 });

// Discord
const discord = new Discord.Client({ intents: ["GUILDS"] });
const discordAuth = config.discordAuth;

let isProcessing = false;

async function giveFaucet() {
  if (queue.length() > 0) {
    if (isProcessing) return;
    isProcessing = true;
  }
}

discord.on("message", async (mess) => {
  const msg = mess.content.toLowerCase();

  if (msg.startsWith("i love aura")) {
    const addressTo = msg.substring(12, 57);

    if (addressTo.length < 44) {
      return;
    }
    let numberGetFaucet = cache.get(addressTo);
    if (numberGetFaucet) {
      if (numberGetFaucet >= 5) {
        console.log("Limit reached");
        return mess.reply(
          "Only allow to get faucet 5 times per day!"
        );
      } else {
        numberGetFaucet += 1;
        cache.set(addressTo, numberGetFaucet);
      }
    } else {
      numberGetFaucet = 1;
      cache.set(addressTo, numberGetFaucet);
    }
    // add to queue and sending the fund
    queue.push({ addressTo, mess }, async (error, { remaining }) => {
        if (error) {
          console.log(
            `An error occurred while processing address ${addressTo}`
          );
        } else {
          console.log(
            `Finished processing address ${addressTo}. ${remaining} addresses remaining`
          );
        }
      });
    mess.reply(
      `You are in queue to get ${
        config.AmountSend / 1e18
      } tevmos. Chill out! ${addressTo}`
    );
    try {
      console.log("before give faucet", isProcessing);
      if (!isProcessing) giveFaucet();
    } catch (error) {
      mess.reply(`Something went wrong!`);
      console.log(error);
    }
  }
});

discord.login(discordAuth);

console.log("App is running...");

