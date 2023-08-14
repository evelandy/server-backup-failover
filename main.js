// imports|require
const express = require('express');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const https = require('https');
require('dotenv').config({ path: __dirname + '/.env' });

// variables
const siteURL = process.env["SITE"];
const app = express();
var server_ip;

// functions

// checks the url passed in to verify if the site at the url is up or down
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
}

// <==========================================================  START NEED TO FINISH =============================================================>

// checks the host machine public IP using the jsonip API
const hostIP = async () => {
  const response = await fetch("http://jsonip.com");
  const serverIP = await response.json();
  server_ip = await serverIP.ip;
  return server_ip;
  // if(server_ip === ip_addr){
  //   console.log('match')
  //   setTimeout(() => {
  //     recordCheck();
  //   }, 3600000)
  // } else {
  //   sendMsg("Site is using backup server IP.");
  // }
}

// checks and returns the cloudflare A record IP address 
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
    // to get record ID for each record, log the dataObj above
    if (dataObj.success) {
      const dns_records = await dataObj.result;
      const a_name_record = await dns_records.find(
        (record) => record.type === "A" && record.name === "gulfcoastcorgis.com"
      );
      let gcc_cloudflare_public_ip = await a_name_record.content;
      return gcc_cloudflare_public_ip;
      // hostIP(gcc_cloudflare_public_ip);
    } else {
      console.error(`Data Object Error: ${dataObj.errors[0].message}`);
    }
  }
  catch (error) {
    console.error(`Error Viewing Records (C.F. API): ${error.message}`);
  }
}

// sends message to set phone number via Twilio on behalf of app 
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

// changes the A record IP address on cloudflare
const recordChange = async (recordId, recordName, host_ip, orig_ip) => {
  const ZONE_ID = process.env["ZONE_ID"];
  const API_KEY = process.env["EDIT_API_TOKEN"];

  let date_time = new Date();
  let date = `${date_time.toDateString()}`;
  // let time = `${date_time.toTimeString()}`;

  const recordType = "A";
  const recordContent = host_ip;
  // const recordComment = `API A Record change from: ${orig_ip} ${date} at ${time}`;
  const recordComment = `API A Record change from: ${orig_ip} on ${date}.`;

  const url = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${recordId}`;

  const data = JSON.stringify({
    type: recordType,
    name: recordName, // website name ex: 'example.com'
    content: recordContent,
    proxied: true,
    comment: recordComment,
  });

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: data,
    });
    const responseData = await response.json();
//    console.info('Response Data');
    console.info(await responseData);
  } catch (error) {
    console.error(`Request Error Editing Records (C.F. API): ${await error}`);
  }
}

// <======================================================== Main Section =========================================================>

const startCheck = async () => {
  const ROOT_ID = process.env["REC_ID_ROOT"];
  const WWW_ID = process.env["REC_ID_WWW"];
  const ROOT_NAME = process.env["ROOT_RECORD_NAME"];
  const WWW_NAME = process.env["WWW_RECORD_NAME"];
  const hostip = await hostIP();
  const origip = await recordCheck();

  let runner_countdown = 5;

  checkSite(siteURL).then(async (isAvailable) => {
    if(await isAvailable){
      console.info('Up and running');
      // check [ main server IP variable ] == Cloudflare A record IP
      let public_ip = await hostIP();
      let cloudflare_ip = await recordCheck();
      console.log(`${public_ip} == ${cloudflare_ip}`);
      if(public_ip === cloudflare_ip) {
        // set timer to run checkSite()
        setTimeout(() => {
          startCheck();
        }, 3600000)
      } else {
        // message admin => "Site is using backup server IP."
        sendMsg("Site is using backup server IP.");
      }
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
            sendMsg("Site cannot be resolved to main server IP, a manual switch will be needed.");
  
    } else {
      console.warn('Down.');
      // check [ main server IP variable ] == Cloudflare A record IP
      let public_ip = await hostIP();
      let cloudflare_ip = await recordCheck();
      if(public_ip === cloudflare_ip) {
        // change A record in Cloudflare = [ backup server IP variable ]
        recordChange(ROOT_ID, ROOT_NAME, hostip, origip); // change using root record id
        recordChange(WWW_ID, WWW_NAME, hostip, origip); // change using www record id
        // message admin => "A record in Cloudflare switched to backup server due to failover."
        sendMsg("The A record in Cloudflare switched to backup serve IP due to main server failover.")
        // set timer to run checkSite()  ** maybe make a function for first else statement in the 'good' section **
        setTimeout(() => {
          startCheck();
        }, 3600000)
      } else {
        // message admin => "both server's are down. Immediate attention is needed."
        sendMsg("both server's are down. Immediate attention is needed.");
      }
    }
  });
}

startCheck();