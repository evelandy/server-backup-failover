const express = require('express');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const https = require('https');
require('dotenv').config({ path: __dirname + '/.env' });

const siteURL = process.env["SITE"];

const app = express();

var server_ip;

const checkSite = (siteURL) => {
  const mainSite = siteURL;
  const result = https.request(mainSite);
  result.end();

  let promise = new Promise((resolve, reject) => {
    let connected = false;
    result.on('response', (res) => {
      connected = res.statusCode < 500;
      resolve(connected);
    });
    result.on('error', (err) => {
      resolve(false);
    });
  });
  return promise;
  // console.log(result.statusCode);
}

// <==========================================================  START NEED TO FINISH =============================================================>


const hostIP = async (ip_addr) => {
  const response = await fetch("http://jsonip.com");
  const serverIP = await response.json();
  server_ip = await serverIP.ip;
  if(server_ip === ip_addr){
    console.log('match')
    setTimeout(() => {
      recordCheck();
    }, 3600000)
  } else {
    sendMsg("Site is using backup server IP.");
  }
}

const recordCheck = async () => {
  const API_KEY = process.env["VIEW_API_TOKEN"];
  const EMAIL = process.env["EMAIL"];
  const ZONE_ID = process.env["ZONE_ID"];

  const headers = {
    "X-Auth-Email": EMAIL,
    "X-Auth-Key": API_KEY,
    "Content-Type": "application/json",
  };

  const url = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;

  try {
    const response = await fetch(url, { headers });
    const dataObj = await response.json();

    if (dataObj.success) {
      const dns_records = await dataObj.result;
      const a_name_record = await dns_records.find(
        (record) => record.type === "A" && record.name === "gulfcoastcorgis.com"
      );
      let gcc_cloudflare_public_ip = await a_name_record.content;
      hostIP(gcc_cloudflare_public_ip);
    } else {
      console.error(`Data Object Error: ${dataObj.errors[0].message}`);
    }
  } catch (error) {
    console.error(`Error Viewing Records (C.F. API): ${error.message}`);
  }
}

const sendMsg = (msg) => {
  const accountSid = process.env["ACCT_SID"];
  const authToken = process.env["AUTH_TOKEN"];
  const client = require('twilio')(accountSid, authToken);
  client.messages.create({
    body: msg,
    from: process.env["PHONE_NO"],
    to: "+18323176060",
  }).then((message) => {
    console.log(message.sid)
  });
}

sendMsg();

checkSite(siteURL).then((isAvailable) => {
  if(isAvailable){
    console.log('good');
    // check [ main server IP variable ] == Cloudflare A record IP
    // if match:
      // set timer to run checkSite()
    // else:
      // message admin => "Site is using backup server IP."
    // check main server IP is UP and Reachable
    // if main server UP and Reachable:
      // change A record in Cloudflare = [ main server IP variable ]
      // message admin => "Site is using main server IP again, No further action is needed."
      // set timer to run checkSite()
    // else:
      // is { runner countdown } == 0:
        // no:
          // message admin => "Site cannot be resolved to main server IP, a manual switch will be needed after ${ runner countdown from 5 } more tries."
          // set timer to run checkSite()
        // yes:
          // message admin => "Site cannot be resolved to main server IP, a manual switch will be needed."

  } else {
    console.log('no good');
    // check [ main server IP variable ] == Cloudflare A record IP
    // if match:
      // change A record in Cloudflare = [ backup server IP variable ]
      // message admin => "A record in Cloudflare switched to backup server due to failover."
      // set timer to run checkSite()  ** maybe make a function for first else statement in the 'good' section **
    // else:
      // message admin => "both server's are down. Immediate attention is needed."
  }
});
