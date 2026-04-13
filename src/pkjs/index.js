var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, {autoHandleEvents: false});

var haUrl, haToken, haEntity;

function loadSettings() {
  haUrl = localStorage.getItem("HA_URL") || "";
  haToken = localStorage.getItem("HA_TOKEN") || "";
  haEntity = localStorage.getItem("HA_ENTITY") || "";
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
  Pebble.sendAppMessage({
    COMMAND: 0,
    DATA: null,
  });
});

function normalizeCondition(c) {
  switch (c) {
    case "sunny":
      return "sunny";
    case "clear-night":
      return "clear-night";
    case "cloudy":
      return "cloudy";
    case "partlycloudy":
      return "partlycloudy";
    case "fog":
      // return "fog";
      return "cloudy"; // drop this for space reasons
    case "windy":
    case "windy-variant":
      return "cloudy";
    case "rainy":
    case "pouring":
    case "lightning":
    case "lightning-rainy":
    case "hail":
      return "rainy";
    // case "snowy":
    //   return "snowy";
    // case "snowy-rainy":
    //   return "snowy-rainy";
    case "snowy":
    case "snowy-rainy":
      return "rainy"; // drop this for space reasons
    case "exceptional":
      return "unknown";
    default:
      return "unknown";
  }
}

function formatTime(hours, minutes, hour12) {
  if (hours === null || hours === undefined) {
    return "";
  }

  var showMinutes = (minutes !== null && minutes !== undefined);
  var minsStr = showMinutes ? ":" + (minutes < 10 ? "0" : "") + minutes : "";

  if (!hour12) {
    var hoursStr = (hours < 10 ? "0" : "") + hours;
    var force24hMins = !showMinutes ? ":00" : minsStr;
    return hoursStr + force24hMins;
  }

  // 12-hour logic
  var suffix = hours >= 12 ? "pm" : "am";
  var h = hours % 12;
  if (h === 0) h = 12;

  // returns "7pm" if minutes is null, or "7:15pm" if minutes is 15
  return h + minsStr + suffix;
}

function getWeather(url, token, entity, hour12, timezoneOffset) {
  var baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  var fullUrl = baseUrl + "/api/services/weather/get_forecasts?return_response=true";

  var xhr = new XMLHttpRequest();
  xhr.open("POST", fullUrl, true);
  xhr.setRequestHeader("Authorization", "Bearer " + token);
  xhr.setRequestHeader("Content-Type", "application/json");

  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        var raw = data.service_response[entity] ? data.service_response[entity].forecast : [];
        
        if (raw && raw.length > 0) {
          var BUFFER_COUNT = 2; 
          var COLUMNS_PER_BUFFER = 4;
          var HOUR_INTERVAL = 3;
          
          // Calculate current hour on the watch
          var nowOnWatch = new Date(Date.now() - (timezoneOffset * 60000));
          var currentHour = nowOnWatch.getUTCHours();
          
          var flat = [Date.now()]; // Timestamp for stale-checking

          // Search helper for specific future hours
          var findForecast = function(targetHour) {
            for (var j = 0; j < raw.length; j++) {
              var fDateUTC = new Date(raw[j].datetime);
              var fDateWatchLocal = new Date(fDateUTC.getTime() - (timezoneOffset * 60000));
              if (fDateWatchLocal.getUTCHours() === targetHour) return raw[j];
            }
            return null;
          };

          for (var b = 0; b < BUFFER_COUNT; b++) {
            // baseHour for this buffer's future jumps
            var baseHour = (currentHour + b) % 24;
            
            for (var c = 0; c < COLUMNS_PER_BUFFER; c++) {
              var match;
              var label;

              if (c === 0) {
                // First column of a buffer is ALWAYS 'now' 
                // We use raw[0] for buffer 0, and raw[1] for buffer 1
                match = raw[b] || null;
                label = "now";
              } else {
                // Future jumps (e.g., +3h, +6h, +9h)
                var offset = c * HOUR_INTERVAL;
                var target = (baseHour + offset) % 24;
                match = findForecast(target);
                label = formatTime(target, null, hour12);
              }

              flat.push(label);
              // Math.round keeps the UI clean on small screens
              flat.push(match ? Math.round(match.temperature) + "°" : "--");
              flat.push(match ? normalizeCondition(match.condition) : "unknown");
            }
          }

          Pebble.sendAppMessage({
            'COMMAND': 2,
            'DATA': JSON.stringify(flat)
          });
        }
      } catch (e) {
        console.log("Weather Error: " + e);
      }
    }
  };

  xhr.send(JSON.stringify({ entity_id: entity, type: "hourly" }));
}

function getSunData(url, token, callback, hour12, timezoneOffset) {
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
        var localRise = new Date(nextRise.getTime() - (timezoneOffset * 60000));
        var localSet = new Date(nextSet.getTime() - (timezoneOffset * 60000));

        Pebble.sendAppMessage({
          'COMMAND': 1,
          'DATA': JSON.stringify({
            r: nextRise.getTime(),
            rl: formatTime(localRise.getUTCHours(), localRise.getUTCMinutes(), hour12),
            s: nextSet.getTime(),
            sl: formatTime(localSet.getUTCHours(), localSet.getUTCMinutes(), hour12)
          })
        });
        done();
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
  const hour12 = e.payload.HOUR12 === 1;
  const timezoneOffset = e.payload.OFFSET;

  switch (command) {
    case 1:
      console.log("sunrise command received");
      getSunData(haUrl, haToken, null, hour12, timezoneOffset);
      break;
    case 2:
      console.log("weather command received");
      getWeather(haUrl, haToken, haEntity, hour12, timezoneOffset);
      break;
    case 3:
      console.log("double sync started");
      // 1. Fetch Sun Data first
      getSunData(haUrl, haToken, function() {
        // 2. This callback runs ONLY after Sun Data is sent to the watch
        console.log("Sun data sent, now fetching weather...");
        getWeather(haUrl, haToken, haEntity, hour12, timezoneOffset);
      }, hour12, timezoneOffset);
      break;
    default:
      console.log("Unknown command, you muppet!");
  }
});
