import {} from "piu/MC";
import Message from "pebble/message";

const colours = Object.freeze({ // TODO: check "invert" from config and swap these if needed
  black: "#000000",
  white: "#FFFFFF",
  grey: "#888888",
});

const texturesMap = Object.freeze({
  "clear-night": 3,
  cloudy: 4,
  // fog: 5,
  partlycloudy: 6,
  rainy: 7,
  // snowy: 8,
  // snowyRainy: 9,
  sunny: 10,
  unknown: 11,
});

const sunIcons = Object.freeze({
  sunrise: new Skin({texture: new Texture(1), width: 20, height: 20, fill: colours.white}),
  sunset: new Skin({texture: new Texture(2), width: 20, height: 20, fill: colours.white}),
});

// we create skins on demand and cache them since creating too many causes memory issues
const skinCache = {};
const textureCache = {};
function getSkin(key) {
  if (!textureCache[key]) {
    textureCache[key] = new Texture(texturesMap[key]);
  }
  if (!skinCache[key]) {
    skinCache[key] = new Skin({
      texture: textureCache[key],
      width: 40,
      height: 30,
      fill: colours.white
    });
  }
  return skinCache[key];
}

const styles = Object.freeze({
  small: new Style({
    color: colours.black,
    font: "14px Gothic",
  }),
  boldSmall: new Style({
    color: colours.black,
    font: "bold 18px Gothic",
  }),
  clock: new Style({
    color: colours.black,
    font: "bold 49px Roboto",
  }),
});

let pendingCommand = null;
let appMessage = new Message({
  keys: ["COMMAND", "DATA", "HOUR12", "OFFSET"],
  onReadable() {
    const msg = this.read();
    const command = msg.get("COMMAND");
    const data = msg.get("DATA");

    if (command === 1 && data) {
      try {
        sunData = JSON.parse(data);
        localStorage.setItem("sunData", data);
        application.distribute("onSunDataChanged");
      } catch (e) {
        console.log("JSON Error (Sun):", e);
      }
    } 
    else if (command === 2 && data) {
      try {
        forecastData = JSON.parse(data);
        localStorage.setItem("forecastData", data);
        application.distribute("onForecastChanged");
      } catch (e) {
        console.log("JSON Error (Forecast):", e);
      }
    }
  },
  onWritable() {
    appMessageWritable = true;

    if (pendingCommand) {
      const cmd = pendingCommand;
      pendingCommand = null;
      const timezoneOffset = new Date().getTimezoneOffset();
      this.write(new Map([
        ["COMMAND", cmd],
        ["HOUR12", watch.hour12 ? 1 : 0],
        ["OFFSET", timezoneOffset]
      ]));
    }
  },
  onSuspend() {
    appMessageWritable = false;
  },
});
let appMessageWritable = false;

let [sunData, forecastData] = (function() {
  const sRaw = localStorage.getItem("sunData");
  const fRaw = localStorage.getItem("forecastData");
  
  return [
    sRaw ? JSON.parse(sRaw) : null,
    fRaw ? JSON.parse(fRaw) : null
  ];
})();

class ForecastColumn extends Column {
  constructor(hour, temp, condition) {
    super(null, {
      top: 0, bottom: 0, left: 0, right: 0,
      contents: [
        new Label(null, {
          string: hour,
          horizontal: "center",
          style: styles.boldSmall,
        }),
        new Content(null, {
          left: 10,
          top: 0,
          skin: getSkin(condition),
        }),
        new Label(null, {
          string: temp,
          horizontal: "center",
          style: styles.small,
        }),
      ],
    });
  }
}

class ForecastRowBehavior extends Behavior {
  onForecastChanged(row) {
    if (!forecastData || forecastData.length < 13) {
      this.clearForecast(row);
      return;
    }

    const currentHour = new Date().getHours();
    const serverTimestamp = forecastData[0];
    const serverHour = new Date(serverTimestamp).getHours();
    const hourDiff = (currentHour - serverHour + 24) % 24;
    const startIndex = 1 + (hourDiff * 12);

    if (startIndex + 11 >= forecastData.length) {
      console.log("Forecast data is too stale!");
      this.clearForecast(row);
      return;
    }

    for (let i = 0; i < 4; i++) {
      const column = row.content(i);
      if (!column) { continue; }

      const base = startIndex + (i * 3);

      const hourLabel = column.content(0);
      const icon = column.content(1);
      const temperatureLabel = column.content(2);

      hourLabel.string = forecastData[base];
      temperatureLabel.string = forecastData[base+1];
      icon.skin = getSkin(forecastData[base+2]);
    }
  }

  clearForecast(row) {
    for (let i = 0; i < 4; i++) {
      const column = row.content(i);
      if (!column) {continue;}
      column.content(0).string = "";
      column.content(2).string = "";
      column.content(1).skin = getSkin("unknown");
    }
  }
}

function getInitialForecastColumns() {
  const data = forecastData ?? [
    null,
    "", "", "unknown",
    "", "", "unknown",
    "", "", "unknown",
    "", "", "unknown",
  ];
  const timestamp = data[0];
  let startIndex = 1;

  if (timestamp) {
    const currentHour = new Date().getHours();
    const serverHour = new Date(timestamp).getHours();
    const hourDiff = (currentHour - serverHour + 24) % 24;
    
    const calculatedIndex = 1 + (hourDiff * 12);
    if (calculatedIndex + 11 < data.length) {
      startIndex = calculatedIndex;
    }
  }

  const columns = [];
  for (let i = 0; i < 4; i++) {
    const base = startIndex + (i * 3);
    columns.push(new ForecastColumn(
      data[base],
      data[base + 1],
      data[base + 2]
    ));
  }
  return columns;
}

const DAY_MS = 86400000;

function formatSundata() {
  if (!sunData || !sunData.r || !sunData.s) {
    return { i: sunIcons.sunrise, l: "", ts: null, p: 0 };
  }

  const now = Date.now();
  let nextT, prevT, icon, label;

  if (sunData.r < sunData.s) {
    // 1. nighttime
    nextT = sunData.r;
    prevT = sunData.s - DAY_MS;
    icon = sunIcons.sunrise;
    label = sunData.rl;
  } else {
    // day time
    nextT = sunData.s;
    prevT = sunData.r - DAY_MS;
    icon = sunIcons.sunset;
    label = sunData.sl;
  }

  let percent = (((now - prevT) * 100) / (nextT - prevT)) | 0;
  
  if (percent < 0) { percent = 0; }
  if (percent > 100) { percent = 100; }

  return {
    i: icon,
    l: label,
    ts: nextT,
    p: percent
  };
}

function getDataCommand() {
  const now = Date.now();
  const dateNow = new Date();
  
  const sunStale = !sunData || !sunData.ts || (now > sunData.ts);
  let weatherStale = !forecastData || !forecastData[0];
  
  if (!weatherStale) {
    const lastSync = new Date(forecastData[0]);
    const minsOld = (now - forecastData[0]) / 60000;
    
    if (minsOld >= 60 || dateNow.getHours() !== lastSync.getHours()) {
      weatherStale = true;
    }
  }

  if (sunStale && weatherStale) {
    return 3; // get both
  } else if (weatherStale) {
    return 2; // get weather
  } else if (sunStale) {
    return 1; // get sun
  }

  return 0;
}

function trySend(command) {
  if (appMessageWritable) {
    appMessage.write(new Map([
      ["COMMAND", command],
      ["HOUR12", watch.hour12 ? 1 : 0],
      ["OFFSET", new Date().getTimezoneOffset()]
    ]));
  } else {
    pendingCommand = command;
  }
}

const application = new Application(null, {
  skin: new Skin({fill: colours.white}),
  Behavior: class extends Behavior {
    onCreate(_app, _data) {
      watch.addEventListener("minutechange", (e) => {
        timeLabel.string = formatClockTime(e.date, watch.hour12);
        if (sunTargetTime && e.date.getTime() >= sunTargetTime) {
          sunTargetTime = null;
          application.distribute("onSunDataChanged");
        }
      });  

      watch.addEventListener("hourchange", (e) => {
        dateLabel.string = getDateString(e.date);
        application.distribute("onForecastChanged");

        // attempt to get fresh data
        const dataCommand = getDataCommand();
        if (dataCommand !== 0) {
          const m = new Map([
            ["COMMAND", dataCommand],
            ["HOUR12", watch.hour12 ? 1 : 0],
            ["OFFSET", e.date.getTimezoneOffset()]
          ]);
          this.safeWrite(m);
        }
      });
    }

    safeWrite(map) {
      if (!appMessageWritable) {
        return;
      }
      try {
        appMessage.write(map);
      } catch (e) {
        console.log("Error writing message:", e);
      }
    }
  }
});
const isTime2 = application.width === 200;

const timeLabel = new Label(null, {
	left: 0, right: 0, top: 50,
  string: "--:--",
  style: styles.clock,
});

function formatClockTime(date, hour12) {
  const hours = date.getHours();
  const mins = ("0" + date.getMinutes()).slice(-2);
  
  if (!hour12) {
    const h = ("0" + hours).slice(-2);
    return `${h}:${mins}`;
  }

  const suffix = hours >= 12 ? "pm" : "am";
  const h = hours % 12 || 12;
  return `${h}:${mins}${suffix}`;
}

function getDateString(date) {
  const DAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  
  // Returns "Thu, Apr 12"
  return DAYS[date.getDay()] + ", " + MONTHS[date.getMonth()] + " " + date.getDate();
}

const dateLabel = new Label(null, {
	left: 0, right: 0, top: 100,
  string: getDateString(new Date()),
  style: styles.boldSmall,
});

const forecastRow = new Row(null, {
  Behavior: ForecastRowBehavior,
  top: isTime2 ? 155: 130,
  bottom: 10,
  left: 0,
  right: 0,
  contents: getInitialForecastColumns()
});

class SunDataRowRowBehavior extends Behavior {
  onSunDataChanged(row) {
    const formattedSunData = formatSundata();
    sunTargetTime = formattedSunData.ts ?? null;
    const icon = row.content(0);
    const line = row.content(1);
    const label = row.content(2);
    icon.skin = formattedSunData.i;
    label.string = formattedSunData.l;
    line.behavior.percent = formattedSunData.p;
    line.invalidate();
  }
}
const initialSunData = formatSundata();
let sunTargetTime = initialSunData.ts ?? null;

class SunLineBehavior extends Behavior {
  onCreate(_data, percent) {
    this.percent = percent;
  }
  onDraw(port) {
    const width = port.width * (this.percent / 100);
    port.fillColor(colours.black, 0, 0, width, 3);
  }
}

const sunRow = new Row(null, {
  Behavior: SunDataRowRowBehavior,
  top: isTime2 ? 5 : 30,
  contents: [
    new Content(null, {
      skin: initialSunData.i,
    }),
    new Port(initialSunData.p, {
      top: 8,
      right: 2,
      height: 3,
      width: isTime2 ? 120 : 90,
      skin: new Skin({fill: colours.grey}),
      Behavior: SunLineBehavior,
    }),
    new Label(null, {
      string: initialSunData.l,
      style: styles.boldSmall,
    })
  ],
});

application.add(sunRow);
application.add(timeLabel);
application.add(dateLabel);
application.add(forecastRow);

// this is our check to see if we need to kick of a fetch
// getDataCommand returns the command number or null
const sendCommand = getDataCommand();
if (sendCommand !== 0) {
  trySend(sendCommand);
}

export default application;
