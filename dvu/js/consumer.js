// running in node: export NODE_PATH=$NODE_PATH:~/projects/ndn/ndn-clones/

// data name example
// /org/openmhealth/BwInbugZnm7dS0zjZKa3Q0PlFooURUv8A6MOnOMz4wyXqTxiIrYNn7BWjAeF/data/fitness/physical_activity/time_location/%FC%00%00%01R%5C%08N%9B
// catalog name example
// /org/openmhealth/BwInbugZnm7dS0zjZKa3Q0PlFooURUv8A6MOnOMz4wyXqTxiIrYNn7BWjAeF/data/fitness/physical_activity/time_location/catalog/%FC%00%00%01R%5C%0Br%00/%FD%01

var Face = require('ndn-js').Face;
var Name = require('ndn-js').Name;
var UnixTransport = require('ndn-js').UnixTransport;
var Exclude = require('ndn-js').Exclude;

// Data recorded this morning: z8miG6uIvHZBqdXyExbd0BIyB1CGRzQQ81T6b2xHuc8qTKnopYFri3WEzeUt

var Config = {
	hostName: "localhost",
  wsPort: 9696,
  defaultUsername: "haitao",
  defaultPrefix: "/org/openmhealth/",
  catalogPrefix: "/SAMPLE/fitness/physical_activity/time_location/catalog",
  dataPrefix: "/fitness/physical_activity/time_location/",
  defaultInterestLifetime: 1000,

  // not a reliable way for determining if catalog probe has finished
  catalogTimeoutThreshold: 1,
  lngOffset: 0,
  lngTimes: 1,
  map: null,
  minLng: -180,
  minLat: -90,
  maxLng: 180,
  maxLat: 90,
  path: []
}

var face = new Face({host: Config.hostName, port: Config.wsPort});
var catalogTimeoutCnt = 0;

var userCatalogs = [];
var catalogProbeFinished = false;

var catalogProbeFinishedCallback = null;

// decreption key info, TODO: this should be gotten from the server later
/*
var identityStorageForDkey = new BasicIdentityStorage();
var privateKeyStorageForDkey = new FilePrivateKeyStorage();
var policyManagerForDkey = new NoVerifyPolicyManager();

var keyChainForDkey = new KeyChain(new IdentityManager(identityStorageForDkey, privateKeyStorageForDkey),
                                   policyManagerForDkey);
keyChainForDkey.setFace(face);
var dvuIdentityName = new Name("/ndn/edu/ucla/dvu");
var dkeyName = undefined;
var dkeyContent = undefined;
var dkeyCertName = undefined;*/

// dkey info
var dkeyName = new Name("/ndn/edu/ucla/remap/dvu/ksk-1498805339");
var dkeyContentBase64 = "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDgLipeeexmu4YR/HjJZjxlX4Heabu/9HAoc1oCUzDoMQQyNKLMUjz+cAKXG9iUA44e6idUVtHvFcMSjo3vG/tQ61MTB75dpN+lLmbXx5hVujVefXnaabnU+XjvyluMc0Qw/ApTmyizDm0X8HsDnwJGZdnZ1E5+5EtjJPOkKCwc0UDeLOSbdELY/wPmbD3NWp93slM2VxlGoNKwNZUzHyIkpJ3eIsSbzEwegeV9njdoCvpxQxkaNORAt7Rnp+wMcaQyoQ8KzdT0/prVUmXtGAeZ8nfquJvmJQNte31jo3uLHQewCXIbpWO+4xxcewvU0UNncqUfP96ZtqJjlNWhlUtrAgMBAAECggEAHsd33bzTrk802ydU1iIJTMnOJOFTe8lt1L/xrbwKTPbd4p7Dc1YfNbffQyv5kmjijHANslCxRigwvk2AQ0IOQU/t+gDoLCdE5YL3b8zhp3OHfE+x+UDm2Mzfw9x+sUvqIueX6160OdFTPSQxX4/nWg8F2BiEJnvltdkO8ozpcZMvfG8HczuL1O3bM7iduAK3u99JCTY34e9y76EKXi7z/M8+7EqiZFMH6QfgEvOTuOuokr0y2jedxKvsfZpepoJCwDdhoGmA+zXZQ9c1x7F21cvN/gNFFrYAJ5swzcLZjF9RFjZ3Rg8dW6Av+gul41AYmMzBGeD7iQBFFXPCuODyIQKBgQD8F/IEhdbUT2M1BVmujhW2n8Eoozr7f8b/jjA9o4E0YDPzhP6Mo0bbzefQ6ilt5qC6iwn8urA1wnKG/3Y2D6Gbdki/SYKDaby0uCy7NGnV/T7gT/5VQAyenNyu9V5wy8N6JOVyEPkJLjtyYu0oiIhHOJM3Uac5TySyBYjiKUgO4wKBgQDjp30OHD59YBRSZAIS9NRdlrQy7M7QGg9YI1SMjvQSpXNY725XhhvSo5IGnJID7eMQ4ygqccU1V3jeKBk8a76ksHLjl1Nb4TZHBqhS1vk7XQKw/NjM/m6wVZ4rNca9f0+cS13iNdm4i5qH8Op39FDXDsx7yGp1UuIcXDOp0jcv2QKBgQD5HMiCA6gpIVINwP3AapO2ZePAvpy4jqodO2scXgh9s1tjF1dbrrWE29JqNhs+iRrnfCIgZnNejIoUMTmlbojqUVbOAFxCdCiQBTfevoqfdaO+kg3oPGS8EJJbKglrOVAv0WoS8AbINbF09aEZ3uGcT6HalovDLBw89w8vPlAAtQKBgHu1PyqUxIxi0og3Gj1s154Hz+JAdt3021O81ywOXqlnSPgSG/bpxGLBSg/Xsyz5b0N0/RWbf1vOLbsjNRt1PULHM5djWwP5rQIJpxxk/0h38Yd1zuYOeN3PmMTIUzgUX5GCDwFm2+oByraGfxMyK1/CBfJZ5SfeI0rf+58TwbN5AoGBAIKR3Wb9Dl6qCb4GuButgNXTZuTE2WRT5u/uzBu4/RIB7bepmWrO05wUFO0tRijWV6YJJlLIgskhsgH9Z3e59ySrAr5satTUCy1Pze/fMzOSH1Bn78slZkvR4nXPCGxZaL7w0RNnHERieisp1itQsfASKmTtie238+DyLqmrCmY0";

// Setting up keyChain
var identityStorage = new IndexedDbIdentityStorage();
var privateKeyStorage = new IndexedDbPrivateKeyStorage();
var policyManager = new NoVerifyPolicyManager();

var certBase64String = "";

var keyChain = new KeyChain
  (new IdentityManager(identityStorage, privateKeyStorage),
   policyManager);
keyChain.setFace(face);

var consumerIdentityName = new Name("/org/openmhealth/dvu-browser");
var memoryContentCache = new MemoryContentCache(face);
var certificateName = undefined;

// For now, hard-coded group name
var groupName = new Name("/org/openmhealth/haitao");
indexedDB.deleteDatabase("consumer-db");
var consumerDb = new IndexedDbConsumerDb("consumer-db");
//var DPUPrefix = "/ndn/edu/basel/dpu/bounding_box";
var DPUPrefix = "/ndn/edu/ucla/remap/dpu/bounding_box";
var DSULink = "/ndn/edu/ucla/remap";
var nacConsumer = new Consumer(face, keyChain, groupName, new Name("/ndn/edu/ucla/remap/dvu"), consumerDb);

function init() {
  document.getElementById("identity").value = consumerIdentityName.toUri();
  document.getElementById("group-manager").value = groupName.toUri();
  document.getElementById("dsu-link").value = DSULink;
  document.getElementById("dpu-prefix").value = DPUPrefix;

  var expandAll = document.getElementById('expandAll');
  var collapseAll = document.getElementById('collapseAll');
  treeView = new TreeView(tree, 'tree');
  expandAll.onclick = function () { treeView.expandAll(); };
  collapseAll.onclick = function () { treeView.collapseAll(); };
}

// This part is temporary. Later, the logic will be revised to :
// the running instance gets dkey name and its content from web server, and simply inters it into
// consumer DB
/*
this.keyChainForDkey.createIdentityAndCertificate(dvuIdentityName, function(dvuCertName) {
  console.log("dvuCertName: " + dvuCertName.toUri());
  dkeyCertName = dvuCertName;
  memoryContentCache.registerPrefix(dvuIdentityName, onRegisterFailed, onDataNotFound);
  keyChainForDkey.getIdentityManager().identityStorage.getCertificatePromise(dvuCertName, false)
    then(function(certificate) {
      certBase64String = certificate.wireEncode().buf().toString('base64');
      memoryContentCache.add(certificate);
      console.log("added my certificate to memoryContentCache: " + certificate.getName().toUri())
    });
  dkeyName = IdentityCertificate.certificateNameToPublicKeyName(dvuCertName);
  getPrivateKeyAndInsertPromise(privateKeyStorageForDkey, dkeyName, consumerDb);
});*/

this.keyChain.createIdentityAndCertificate(consumerIdentityName, function(myCertificateName) {
  console.log("myCertificateName: " + myCertificateName.toUri());
  certificateName = myCertificateName;
                                           

  face.setCommandSigningInfo(keyChain, myCertificateName);
  memoryContentCache.registerPrefix(consumerIdentityName, onRegisterFailed, onDataNotFound);
  
  keyChain.getIdentityManager().identityStorage.getCertificatePromise(myCertificateName, false).then(function(certificate) {
    certBase64String = certificate.wireEncode().buf().toString('base64');
    memoryContentCache.add(certificate);
    console.log("added my certificate to memoryContentCache: " + certificate.getName().toUri())
  });
  
  // Make sure we can decrypt the encrypted D-key
  // This key is used locally
  // getPrivateKeyAndInsertPromise(privateKeyStorage, IdentityCertificate.certificateNameToPublicKeyName(myCertificateName), consumerDb);
  Promise.resolve(consumerDb.addKeyPromise(dkeyName, new Blob(new Buffer(dkeyContentBase64, 'base64'), false)));
}, function (error) {
  console.log("Error in createIdentityAndCertificate: " + error);
});

function base64ToUint8Array(base64) {
  var raw = atob(base64);
  var rawLength = raw.length;
  console.log(rawLength);
  var array = new Uint8Array(new ArrayBuffer(rawLength));
  
  for(var i = 0; i < rawLength; i++) {
    array[i] = raw.charCodeAt(i);
  }
  return array;
}

function Uint8ArrayToBase64(uint8Array) {
  return btoa(String.fromCharCode.apply(null, uint8Array));
}

// Hack for get private key promise...
/*
function getPrivateKeyAndInsertPromise(privateKeyDb, keyName, consumerDb) {
  return privateKeyDb.database.privateKey.get
    (IndexedDbPrivateKeyStorage.transformName(keyName))
  .then(function(privateKeyEntry) {
    console.log(privateKeyEntry);
    console.log(keyName.toUri());
    function onComplete() {
      console.log("add key complete");
    }
    function onError(msg) {
      console.log("add key error: " + msg);
    }
    //consumer.addDecryptionKey(keyName, new Blob(privateKeyEntry.encoding), onComplete, onError);
    //return consumerDb.addKeyPromise(keyName, new Blob(privateKeyEntry.encoding));
    console.log("privateKeyEntry.encoding is");
    console.log(Uint8ArrayToBase64(privateKeyEntry.encoding).length);
    return Promise.resolve(consumerDb.addKeyPromise(keyName, new Blob(privateKeyEntry.encoding)));
  })
}*/

function onRegisterFailed(prefix) {
  console.log("Register failed for prefix: " + prefix);
}

function onDataNotFound(prefix, interest, face, interestFilterId, filter) {
  console.log("Data not found for interest: " + interest.getName().toUri());
}

var onCatalogData = function(interest, data) {
  insertToTree(data);
  logString("<b>Data</b>:<br>" + data.getName().toUri() + "<br>" + data.getContent().toString() + "<br><br>");
  var catalogTimestamp = data.getName().get(-1);
  var exclude = new Exclude();
  exclude.appendAny();
  // this looks for the next catalog of this user
  exclude.appendComponent(catalogTimestamp);

  var nextCatalogInterest = new Interest(interest);
  nextCatalogInterest.setExclude(exclude);
  
  logString("<b>Interest</b>:<br>" + interest.getName().toUri() + " (with exlude: " + exclude.toUri() + ")<br>");
  face.expressInterest(nextCatalogInterest, onCatalogData, onCatalogTimeout);
//
//  // this looks for the latest version of this catalog; note: this is not a reliable way to get the latest version
//  var catalogVersion = data.getName().get(-1);
//  var nextVersionInterest = new Interest(interest);
//  nextVersionInterest.setName(data.getName().getPrefix(-1));
//  // to exclude the cached received version;
//  var versionExclude = new Exclude();
//  versionExclude.appendAny();
//  versionExclude.appendComponent(catalogVersion);
//  nextVersionInterest.setExclude(versionExclude);
//  
//  face.expressInterest(nextVersionInterest, onCatalogVersionData, onCatalogVersionTimeout);
//  catalogTimeoutCnt = 0;
//
//  onCatalogVersionData(interest, data);
  recordCatalogData(interest, data);
};

var recordCatalogData = function(interest, data) {
  console.log("Got catalog: " + data.getName().toUri());
  insertToTree(data);

  var catalogTimestamp = data.getName().get(-1);

  var dataContent = JSON.parse(data.getContent().buf().toString('binary'));
  var username = interest.getName().get(2).toEscapedString();
  if (username in userCatalogs) {
    userCatalogs[username][catalogTimestamp.toEscapedString()] = {"content": dataContent};
    
  } else {
    userCatalogs[username] = [];
    userCatalogs[username][catalogTimestamp.toEscapedString()] = {"content": dataContent};
  }
}

var onCatalogVersionTimeout = function(interest) {
  console.log("Catalog version times out.");
}

var onCatalogTimeout = function(interest) {
  console.log("Time out for catalog interest " + interest.getName().toUri());
  catalogTimeoutCnt += 1;
  if (catalogTimeoutCnt < Config.catalogTimeoutThreshold) {
    face.expressInterest(interest, onCatalogData, onCatalogTimeout);
  } else {
    console.log("No longer looking for more catalogs.");
    logString("<b>Data</b>:<br> data doesn't exist<br><br>");
    catalogProbeFinished = true;
    if (catalogProbeFinishedCallback != null) {
      console.log("Continue to fetch data now");
      catalogProbeFinishedCallback(userCatalogs);
    } else {
      console.log("Catalog probe finished, callback unspecified");
    }
  }
};

// given a userPrefix, populates userCatalogs[username] with all of its catalogs
function getCatalogs(username) {
  if (username == undefined) {
    username = Config.defaultUsername;
  }
  var name = new Name(Config.defaultPrefix).append(new Name(username)).append(new Name(Config.catalogPrefix));
  var interest = new Interest(name);
  interest.setInterestLifetimeMilliseconds(Config.defaultInterestLifetime);
  // start from leftmost child
  interest.setChildSelector(0);
  interest.setMustBeFresh(true);

  console.log("Express name " + name.toUri());
  face.expressInterest(interest, onCatalogData, onCatalogTimeout);
  logString("<b>Interest</b>:<br>" + interest.getName().toUri() + "<br>");
};

// For unencrypted data
function getUnencryptedData(catalogs) {
  if (!catalogProbeFinished) {
    console.log("Catalog probe still in progress; may fetch older versioned data.");
  }
  for (username in catalogs) {
    console.log(username);
    var name = new Name(Config.defaultPrefix + username).append(new Name("SAMPLE")).append(new Name(Config.dataPrefix));
    for (catalog in catalogs[username]) {
      for (dataItem in catalogs[username][catalog].content) {
        var isoTimeString = catalogs[username][catalog].content[dataItem];
        console.log(isoTimeString);
        var interest = new Interest(new Name(name).append(isoTimeString));
        interest.setInterestLifetimeMilliseconds(Config.defaultInterestLifetime);
        face.expressInterest(interest, onAppData, onAppDataTimeout);
      }
    }
  }
}

// For encrypted data
function getEncryptedData(catalogs) {
  if (!catalogProbeFinished) {
    console.log("Catalog probe still in progress; may fetch older versioned data.");
  }
  for (username in catalogs) {
    var name = new Name(Config.defaultPrefix + username).append(new Name("SAMPLE")).append(new Name(Config.dataPrefix));
    for (catalog in catalogs[username]) {
      for (dataItem in catalogs[username][catalog].content) {
        var isoTimeString = catalogs[username][catalog].content[dataItem];
        console.log(isoTimeString);
        nacConsumer.consume(new Name(name).append(isoTimeString), onConsumeComplete, onConsumeFailed);
        logString("<b>Interest</b>: " + (new Name(name).append(isoTimeString)).toUri() + " <br>");
      }
    }
  }
}

function onConsumeComplete(data, result) {  
  insertToTree(data);
  console.log("Consumed fitness data: " + data.getName().toUri());
  var content = JSON.parse(result.buf().toString('binary'));
//  console.log("Fitness payload: " + JSON.stringify(content));

//  var canvas = document.getElementById("plotCanvas");
//  var ctx = canvas.getContext("2d");
//  ctx.fillRect(content.lat * Config.lngTimes, (content.lng + Config.lngOffset) * Config.lngTimes, 1, 1);
  Config.path = []
  for(var i = 0; i < content.length; i++) {
    var obj = content[i];
    Config.path.push(new google.maps.LatLng(obj.lat, obj.lng));
    console.log(obj.lat)
    console.log(obj.lng)
  }
  
  // set google map
//  Config.map.setZoom(17);
  var flightPath = new google.maps.Polyline({
                                            path: Config.path,
                                            strokeColor: "#000000",
                                            strokeOpacity: 0.8,
                                            strokeWeight: 2
                                            });
  flightPath.setMap(Config.map);

  logString("<b>Data</b>: " + data.getName().toUri() + " <br>");
  logString("Content:<br>" + result + " <br>");
  logString("<b style=\"color:green\">Consume successful</b><br>");
}

function onConsumeFailed(code, message) {
  console.log("Consume failed: " + code + " : " + message);
  logString("<b style=\"color:red\">Consume failed:</b>" + code + " : " + message + "<br>");
}

/*
function requestDataAccess(username) {
  if (certBase64String == "") {
    console.log("Cert not yet generated!");
    return;
  }
  if (username == undefined) {
    username = Config.defaultUsername;
  }
  var d = new Date();
  var t = d.getTime();

  var name = new Name(Config.defaultPrefix).append(new Name(username)).append(new Name("read_access_request")).append(new Name(certificateName)).appendVersion(t);
  var interest = new Interest(name);
  //interest.setInterestLifetimeMilliseconds(Config.defaultInterestLifetime);
  interest.setMustBeFresh(true);

  console.log("Express name " + name.toUri());
  face.expressInterest(interest, onAccessRequestData, onAccessRequestTimeout);
  logString("<b>Interest</b>: " + interest.getName().toUri() + " <br>");
}

function onAccessRequestData(interest, data) {
  insertToTree(data);
  console.log("access request data received: " + data.getName().toUri());
  logString("<b>Data</b>: " + data.getName().toUri() + " <br>");
  logString("<b>Content</b>: " + data.getContent() + " <br>");
  logString("<b style=\"color:green\">Access granted</b><br>");
}

function onAccessRequestTimeout(interest) {
  console.log("access request " + interest.getName().toUri() + " times out!");
  logString("<b style=\"color:red\">Request timed out</b><br>");
}*/

function formatTime(unixTimestamp) {
  var a = new Date(unixTimestamp);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var year = a.getFullYear();
  var month = months[a.getMonth()];
  var date = a.getDate();
  var hour = a.getHours();
  var min = a.getMinutes();
  var sec = a.getSeconds();
  var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
  return time;
}

// enumerate the current list of users in repo
function onUserData(interest, data) {
  insertToTree(data);

  console.log("Got user: " + data.getName().get(2).toEscapedString());
  var newInterest = new Interest(interest);
  newInterest.getExclude().appendComponent(data.getName().get(2));
  face.expressInterest(newInterest, onUserData, onUserTimeout);
  console.log("Express name " + newInterest.getName().toUri());
}

function onUserTimeout(interest) {
  console.log("User interest timeout; scan for user finishes");
}

function logString(str) {
  document.getElementById("log").innerHTML += str;
}

function logClear() {
  document.getElementById("log").innerHTML = "";
}

function getUsers(prefix) {
  if (prefix == undefined) {
    prefix = Config.defaultPrefix;
  }
  var name = new Name(prefix);
  var interest = new Interest(name);
  interest.setInterestLifetimeMilliseconds(Config.defaultInterestLifetime);
  // start from leftmost child
  interest.setChildSelector(0);
  interest.setMustBeFresh(true);

  console.log("Express name " + name.toUri());
  face.expressInterest(interest, onUserData, onUserTimeout);
}

var onAppData = function (interest, data) {
  console.log("Got fitness data: " + data.getName().toUri());  
  insertToTree(data);

  try {
    var content = JSON.parse(data.getContent().buf().toString('binary'));
    console.log("Fitness payload: " + JSON.stringify(content));
//    console.log("Data keyLocator keyName: " + data.getSignature().getKeyLocator().getKeyName().toUri());

    var canvas = document.getElementById("plotCanvas");
    var ctx = canvas.getContext("2d");
    for (dataItem in content) {
      ctx.fillRect(content[dataItem].lng, content[dataItem].lat, 1, 1);
      if(content[dataItem].lat < Config.minLat) {
        Config.minLat = content[dataItem].lat;
      }
      if(content[dataItem].lat > Config.maxLat) {
        Config.maxLat = content[dataItem].lat;
      }
      if(content[dataItem].lng < Config.minLng) {
        Config.minLng = content[dataItem].lng;
      }
      if(content[dataItem].lng > Config.maxLng) {
        Config.maxLng = content[dataItem].lng;
      }
      Config.path.push(new google.maps.LatLng(content[dataItem].lat / 100000 + 34.0635014, content[dataItem].lng / 100000 - 118.445516));
    }
    Config.map.setCenter({lat : (Config.minLat + Config.maxLat) / 200000 + 34.0635014, lng : (Config.minLng + Config.maxLng) / 200000 - 118.445516});
    Config.map.setZoom(16);
    var flightPath = new google.maps.Polyline({
      path: Config.path,
      strokeColor: "#0000FF",
      strokeOpacity: 0.8,
      strokeWeight: 2
      });
    flightPath.setMap(Config.map);

    logString("<b>Interest</b>: " + interest.getName().toUri() + " <br>");
    logString("<b>Data</b>: " + data.getName().toUri() + " <br>");
    logString("<b>Consume successful</b><br>");
  } catch (e) {
    console.log(e);
    logString("<b>Interest</b>: " + interest.getName().toUri() + " <br>");
    logString("<b>Data</b>: " + data.getName().toUri() + " <br>");
    logString("<b style=\"color:red\">Consume failed</b>: " + e.toString() + "; Content " + data.getContent().buf().toString('hex') + "<br>");
  }
}

var onAppDataTimeout = function (interest) {
  console.log("App interest times out: " + interest.getName().toUri());
}

// Calling DPU
function issueDPUInterest(username) {
  if (username == undefined) {
    username = Config.defaultUsername;
  }
  
  var parameters = Name.fromEscapedString(document.getElementById('dpu-param').value);
  console.log(parameters);
  var name = new Name(DPUPrefix).append(parameters);
  // DistanceTo
  // var name = new Name(Config.defaultPrefix).append(new Name(username)).append(new Name("data/fitness/physical_activity/genericfunctions/distanceTo/(100,100)/20160320T080030"));
  var interest = new Interest(name);
  interest.setMustBeFresh(true);
  interest.setInterestLifetimeMilliseconds(10000);

  face.expressInterest(interest, onDPUData, onDPUTimeout);
  console.log("Interest expressed: " + interest.getName().toUri());
}

function onDPUData(interest, data) {
  console.log("onDPUData: " + data.getName().toUri());
  insertToTree(data);

  var innerData = new Data();
  innerData.wireDecode(data.getContent());

  var content = innerData.getContent().toString('binary');
  var dpuObject = JSON.parse(content);
  console.log(dpuObject);

  // set the lower canvas
  var canvas = document.getElementById("plotCanvas");
  var ctx = canvas.getContext("2d");
  var centralPointLat = 100;
  var centralPointLng = 300;
  var averageLat = (dpuObject.minLat + dpuObject.maxLat) / 2;
  var averageLng = (dpuObject.minLng + dpuObject.maxLng) / 2;
  var magnitudeLat = 200 / (dpuObject.maxLat - dpuObject.minLat);
  var magnitudeLng = 600 / (dpuObject.maxLng - dpuObject.minLng);
  var magnitude = 0;
  if (magnitudeLat > magnitudeLng) {
    magnitude = magnitudeLng * 0.75;
  } else {
    magnitude = magnitudeLat * 0.75;
  }
  ctx.beginPath();
  ctx.moveTo((dpuObject.minLng - averageLng) * magnitude + centralPointLng, 200 - ((dpuObject.minLat - averageLat) * magnitude + centralPointLat));
  ctx.lineTo((dpuObject.minLng - averageLng) * magnitude + centralPointLng, 200 - ((dpuObject.maxLat - averageLat) * magnitude + centralPointLat));
  ctx.lineTo((dpuObject.maxLng - averageLng) * magnitude + centralPointLng, 200 - ((dpuObject.maxLat - averageLat) * magnitude + centralPointLat));
  ctx.lineTo((dpuObject.maxLng - averageLng) * magnitude + centralPointLng, 200 - ((dpuObject.minLat - averageLat) * magnitude + centralPointLat));
  ctx.lineTo((dpuObject.minLng - averageLng) * magnitude + centralPointLng, 200 - ((dpuObject.minLat - averageLat) * magnitude + centralPointLat));
  ctx.strokeStyle = '#ff0000';
  ctx.stroke();
  
  outline = []
  outline.push(new google.maps.LatLng(dpuObject.minLat, dpuObject.minLng));
  outline.push(new google.maps.LatLng(dpuObject.maxLat, dpuObject.minLng));
  outline.push(new google.maps.LatLng(dpuObject.maxLat, dpuObject.maxLng));
  outline.push(new google.maps.LatLng(dpuObject.minLat, dpuObject.maxLng));
  outline.push(new google.maps.LatLng(dpuObject.minLat, dpuObject.minLng));
  // set google map
  Config.map.setCenter({lat : (dpuObject.minLat + dpuObject.maxLat) / 2, lng : (dpuObject.minLng + dpuObject.maxLng) / 2});
  Config.map.setZoom(17);
  var flightPath = new google.maps.Polyline({
                                            path: outline,
                                            strokeColor: "#FF0000",
                                            strokeOpacity: 0.8,
                                            strokeWeight: 2
                                            });
  flightPath.setMap(Config.map);

  logString("<b>Interest</b>: " + interest.getName().toUri() + " <br>");
  logString("<b>Outer data</b>: " + data.getName().toUri() + " <br>");
  logString("<b>Inner data</b>: " + innerData.getName().toUri() + " <br>");
  logString("<b style=\"color:green\">Consume successful</b>");
}

function onDPUTimeout(interest) {
  console.log("onDPUTimeout: " + interest.getName().toUri());
  var interest = new Interest(interest);
  interest.refreshNonce();
  face.expressInterest(interest, onDPUData, onDPUTimeout);
}

function setMap(map) {
  Config.map = map;
}
