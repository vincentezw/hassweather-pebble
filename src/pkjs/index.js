var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, {autoHandleEvents: false});

var haUrl, haToken, haEntity;
var WEATHER_RETRY_COUNT = 2;
var WEATHER_RETRY_DELAY_MS = 30000;

function loadSettings() {
  haUrl = localStorage.getItem("HA_URL") || "";
  haToken = localStorage.getItem("HA_TOKEN") || "";
  haEntity = localStorage.getItem("HA_ENTITY") || "";
  haEntity = 'weather.home';
}

Pebble.addEventListener('showConfiguration', function(e) {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;

  const decoded = decodeURIComponent(e.response);
  const dict = JSON.parse(decoded);

  haUrl = (dict.HAUrl && dict.HAUrl.value) || "";
  haToken = (dict.HAToken && dict.HAToken.value) || "";
  haEntity = (dict.HAEntity && dict.HAEntity.value) || "";

  localStorage.setItem("HA_URL", haUrl);
  localStorage.setItem("HA_TOKEN", haToken);
  localStorage.setItem("HA_ENTITY", haEntity);

  loadSettings();
});

Pebble.addEventListener('ready', function (e) {
  loadSettings();
  if (!haUrl || !haToken || !haEntity) {
    return;
  }
  
  getWeather(haUrl, haToken, haEntity);
});

function normalizeCondition(c) {
  const map = {
    "clear-night": 0,
    "cloudy": 1,
    "fog": 2,
    "hail": 3,
    "lightning-rainy": 4,
    "lightning": 5,
    "partlycloudy-night": 6,
    "partlycloudy": 7,
    "pouring": 8,
    "rainy": 9,
    "snowy-rainy": 10,
    "snowy": 11,
    "sunny": 12,
    "windy-variant": 13,
    "windy": 14
  };
  return map[c];
}

function retryWeather(url, token, entity, retriesRemaining) {
  if (retriesRemaining <= 0) return;

  setTimeout(function() {
    getWeather(url, token, entity, retriesRemaining - 1);
  }, WEATHER_RETRY_DELAY_MS);
}

function getWeather(url, token, entity, retriesRemaining) {
  if (retriesRemaining === undefined) {
    retriesRemaining = WEATHER_RETRY_COUNT;
  }

  var RETURN_SIZE = 11;
  var baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  var fullUrl = baseUrl + "/api/services/weather/get_forecasts?return_response=true";

  var xhr = new XMLHttpRequest();
  xhr.open("POST", fullUrl, true);
  xhr.setRequestHeader("Authorization", "Bearer " + token);
  xhr.setRequestHeader("Content-Type", "application/json");

  xhr.onload = function() {
    if (xhr.status !== 200) {
      retryWeather(url, token, entity, retriesRemaining);
      return;
    }

    try {
      var data = JSON.parse(xhr.responseText);
      var raw = data.service_response[entity] ? data.service_response[entity].forecast : [];
      if (!raw.length) {
        retryWeather(url, token, entity, retriesRemaining);
        return;
      }

      var now = Date.now();
      var forecast = [now];
      for (let i = 0; i < RETURN_SIZE; i++) {
        const item = raw[i];
        if (!item) break;
        forecast.push(normalizeCondition(item.condition));
        forecast.push(Math.round(item.temperature));
      }

      Pebble.sendAppMessage({
        'COMMAND': 2,
        'DATA': JSON.stringify(forecast)
      }, function() {}, function() {
        retryWeather(url, token, entity, retriesRemaining);
      });
    } catch (e) {
      console.log("Weather Error: " + e);
      retryWeather(url, token, entity, retriesRemaining);
    }
  };

  xhr.onerror = function() {
    console.error("Weather XHR Network Error occurred");
    retryWeather(url, token, entity, retriesRemaining);
  };

  xhr.send(JSON.stringify({ entity_id: entity, type: "hourly" }));
}

function getSunData(url, token, callback) {
  var baseUrl = url.endsWith("/")
    ? url.slice(0, -1)
    : url;
  var requestUrl = baseUrl + "/api/states/sun.sun";
  var xhr = new XMLHttpRequest();
  var done = function() {
    if (callback) {
      callback();
      callback = null; // Prevent double-execution
    }
  };

  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var data = JSON.parse(xhr.responseText);
        var nextRise = new Date(data.attributes.next_rising);
        var nextSet = new Date(data.attributes.next_setting);

        Pebble.sendAppMessage({
          'COMMAND': 1,
          'DATA': JSON.stringify({
            r: nextRise.getTime(),
            s: nextSet.getTime(),
          })
        }, done, done);
      } catch (e) {
        console.error("JSON Parse error: " + e);
        done();
      }
    } else {
      console.error("Fetch failed with status: " + xhr.status);
      done();
    }
  };

  xhr.onerror = function() {
    console.error("XHR Network Error occurred");
    done();
  };

  xhr.open("GET", requestUrl, true);
  xhr.setRequestHeader("Authorization", "Bearer " + token);
  xhr.setRequestHeader("Content-Type", "application/json");

  xhr.send();
}

Pebble.addEventListener('appmessage', function (e) {
  if (!haUrl || !haToken || !haEntity) {
    console.log("Missing HA configuration, cannot process command");
    return;
  }

  const command = e.payload.COMMAND;

  switch (command) {
    case 1:
      getSunData(haUrl, haToken, null);
      break;
    case 2:
      getWeather(haUrl, haToken, haEntity);
      break;
    case 3:
      // 1. Fetch Sun Data first
      getSunData(haUrl, haToken, function() {
        // 2. This callback runs ONLY after Sun Data is sent to the watch
        getWeather(haUrl, haToken, haEntity);
      });
      break;
    default:
      console.log("Unknown command, you muppet!");
  }
});
