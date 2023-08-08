const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const siteURL = process.env.SITE;

const checkSite = (siteURL) => {
  const mainSite = siteURL;
  const result = https.request(mainSite);
  result.end();

  let promise = new Promise((resolve, reject) => {
    let connected = false;
    result.on('response', (res) => {
      connected = res.statusCode < 500;
      resolve(connected);
      // console.log(connected);
    })
    result.on('error', (err) => {
      resolve(false);
      // console.log(false);
    })
  })
  return promise;
  // console.log(result.statusCode);
}

// console.log(checkSite(siteURL));
checkSite(siteURL).then((isAvailable) => {
  if(isAvailable){
    console.log('good')
  } else {
    console.log('no good')
  }
});
