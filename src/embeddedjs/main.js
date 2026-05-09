import {} from "piu/MC";
import Message from "pebble/message";
import Battery from "embedded:sensor/Battery";

import {ForecastRowBehavior} from "./forecastRowBehavior";
import {colours, iconSkin, styles} from "./theme";

let sunTargetTime = null;

const application = new Application(null, {
  skin: new Skin({fill: colours.white}),
  Behavior: class extends Behavior {
    onCreate(app, _data) {
      const sRaw = localStorage.getItem("sunData");
      const fRaw = localStorage.getItem("forecastData");
      
      app.sunData = sRaw ? JSON.parse(sRaw) : null;
      app.forecastData = fRaw ? JSON.parse(fRaw) : null;

      watch.addEventListener('connected', () => {
        console.log("uh", watch.connected.pebblekit);
        batteryRow.content(2).visible = watch.connected.pebblekit;
      });

      watch.addEventListener("minutechange", (e) => {
        timeLabel.string = formatClockTime(e.date, watch.hour12);
        if (sunTargetTime && e.date.getTime() >= sunTargetTime) {
          sunTargetTime = null;
          app.distribute("onSunDataChanged");
        }
      });  

      watch.addEventListener("hourchange", (e) => {
        dateLabel.string = getDateString(e.date);
        app.distribute("onForecastChanged");

        // attempt to get fresh data
        const c = getDataCommand();
        if (c !== 0) {
          trySend(c);
        }
      });
    }
  }
});

let pendingCommand = null;
const appMessage = new Message({
  keys: ["COMMAND", "DATA"],
  onReadable() {
    const msg = this.read();
    const command = msg.get("COMMAND");
    const data = msg.get("DATA");

    if (command === 1 && data) {
      try {
        application.sunData = JSON.parse(data);
        try {
          localStorage.setItem("sunData", data);
        } catch (e) {
          console.log("Error saving sun data to localStorage:", e);
        }
        application.distribute("onSunDataChanged");
      } catch (e) {
        console.log("JSON Error (Sun):", e);
      }
    } 
    else if (command === 2 && data) {
      try {
        application.forecastData = JSON.parse(data);
        try {
          localStorage.setItem("forecastData", data);
        } catch (e) {
          console.log("Error saving forecast data to localStorage:", e);
        }
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
      this.write(new Map([
        ["COMMAND", cmd],
      ]));
    }
  },
  onSuspend() {
    appMessageWritable = false;
  },
});
let appMessageWritable = false;

const battery = new Battery({
  onSample() {
    const level = this.sample().percent;
    const label = batteryRow.content(1);
    label.string = `${level}%`;
    label.style = level <= 20 ? styles.smallRed : styles.small;
  
    const v = [20, 50, 80].findIndex(t => level <= t);
    batteryRow.content(0).variant = ((v === -1) ? 3 : v) + 2; // first two icons are sun
  }
});

const DAY_MS = 86400000;

function formatSundata() {
  const data = application.sunData;
  if (!data || !data.r || !data.s) {
    return {i: 0, l: "", ts: null, p: 0};
  }

  const now = Date.now();
  let nextT, prevT, icon;

  if (data.r < data.s) {
    // 1. nighttime
    nextT = data.r;
    prevT = data.s - DAY_MS;
    icon = 0;
  } else {
    // day time
    nextT = data.s;
    prevT = data.r - DAY_MS;
    icon = 1;
  }

  let percent = (((now - prevT) * 100) / (nextT - prevT)) | 0;
  
  if (percent < 0) { percent = 0; }
  if (percent > 100) { percent = 100; }

  return {
    i: icon,
    l: formatSunTime(nextT),
    ts: nextT,
    p: percent
  };
}

function formatSunTime(timestamp) {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = date.getMinutes();
  const minStr = m < 10 ? "0" + m : m;

  if (watch.hour12) {
    const period = h >= 12 ? "pm" : "am";
    let h12 = h % 12;
    h12 = h12 === 0 ? 12 : h12;
    return h12 + ":" + minStr + period;
  } else {
    return h + ":" + minStr;
  }
}

function getDataCommand() {
  const now = Date.now();
  const dateNow = new Date();
  
  const sunStale = !application.sunData || !application.sunData.ts || (now > sunData.ts);
  let weatherStale = !application.forecastData || !application.forecastData[0];
  
  if (!weatherStale) {
    const lastSync = new Date(application.forecastData[0]);
    const minsOld = (now - application.forecastData[0]) / 60000;
    
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
    ]));
  } else {
    pendingCommand = command;
  }
}


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

const batteryRow = (function() {
  const p = battery.sample().percent;
  const v = [20, 50, 80].findIndex(t => p <= t);
  const iv = ((v === -1) ? 3 : v) + 2; // first two icons are sun

  return new Row(null, {
    top: 125,
    contents: [
      new Content(null, {
        skin: iconSkin,
        left: 20,
        variant: iv,
        top: 2,

      }),
      new Label(null, {
        left: 2,
        string: `${p}%`,
        style: p <= 20 ? styles.smallRed : styles.small,
      }),
      new Content(null, {
        skin: iconSkin,
        variant: 6,
        top: 1,
        visible: watch.connected.pebblekit,
      }),
    ]
  });
})();


const forecastRow = new Row(null, {
  Behavior: ForecastRowBehavior,
  top: isTime2 ? 155: 130,
  bottom: 10,
  left: 0,
  right: 0,
});

class SunDataRowRowBehavior extends Behavior {
  onDisplaying(row) {
    this.onSunDataChanged(row);
  }

  onSunDataChanged(row) {
    const formattedSunData = formatSundata();
    sunTargetTime = formattedSunData.ts ?? null;
    const icon = row.content(0);
    const line = row.content(1);
    const label = row.content(2);
    icon.variant = formattedSunData.i;
    label.string = formattedSunData.l;
    line.behavior.percent = formattedSunData.p;
    line.invalidate();
  }
}

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
      skin: iconSkin,
    }),
    new Port(0, {
      top: 8,
      right: 2,
      height: 3,
      width: isTime2 ? 120 : 90,
      skin: new Skin({fill: colours.grey}),
      Behavior: SunLineBehavior,
    }),
    new Label(null, {
      string: "--:--",
      style: styles.boldSmall,
    })
  ],
});

application.add(sunRow);
application.add(timeLabel);
application.add(dateLabel);
application.add(batteryRow);
application.add(forecastRow);

// this is our check to see if we need to kick of a fetch
// getDataCommand returns the command number or null
const sendCommand = getDataCommand();
if (sendCommand !== 0) {
  trySend(sendCommand);
}

export default application;
