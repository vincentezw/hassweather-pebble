import {} from "piu/MC";
import Message from "pebble/message";
import Battery from "embedded:sensor/Battery";

import {ForecastRowBehavior} from "./forecastRowBehavior";
import {colours, iconSkin, styles} from "./theme";

const DAY_MS = 86400000;
const BATTERY_THRESHOLDS = Object.freeze([20, 50, 80]);

let sunTargetTime = null;
let backgroundColourIndex = (Math.random() * colours.bg.length) | 0;

const application = new Application(null, {
  skin: new Skin({
    fill: colours.bg[backgroundColourIndex],
  }),
  Behavior: class extends Behavior {
    onCreate(app, _data) {
      const sRaw = localStorage.getItem("sunData");
      try {
        app.sunData = sRaw ? JSON.parse(sRaw) : null;
      } catch (e) {
        console.log("Stored sun data corrupt, clearing:", e);
        app.sunData = null;
      }

      const fRaw = localStorage.getItem("forecastData");
      try {
        app.forecastData = fRaw ? JSON.parse(fRaw) : null;
      } catch (e) {
        console.log("Stored forecast data corrupt, clearing:", e);
        app.forecastData = null;
      }

      watch.addEventListener("connected", () => {
        batteryRow.content(2).visible = !watch.connected.pebblekit;
      });

      watch.addEventListener("minutechange", (e) => {
        timeLabel.string = formatClockTime(e.date, watch.hour12);
        if (sunTargetTime && e.date.getTime() >= sunTargetTime) {
          sunTargetTime = null;
          app.distribute("onSunDataChanged");
        }

        const currentMinute = e.date.getMinutes();
        if (currentMinute % 5 === 0) {
          const c = getDataCommand(e.date.getTime());
          if (c !== 0) {
            trySend(c);
          }
        }
      });

      watch.addEventListener("hourchange", (e) => {
        dateLabel.string = getDateString(e.date);
        app.distribute("onForecastChanged");
      });
    }
  }
});

let pendingCommand = 0;
let appMessageWritable = false;

const appMessage = new Message({
  keys: ["COMMAND", "DATA"],
  onReadable() {
    const msg = this.read();
    const command = msg.get("COMMAND");
    const data = msg.get("DATA");

    if (command === 1 && data) {
      try {
        application.sunData = JSON.parse(data);
        localStorage.setItem("sunData", data);
        application.distribute("onSunDataChanged");
      } catch (e) {
        console.log("JSON Error (Sun):", e);
      }
    } else if (command === 2 && data) {
      try {
        application.forecastData = JSON.parse(data);
        localStorage.setItem("forecastData", data);
        application.distribute("onForecastChanged");

        backgroundColourIndex = (backgroundColourIndex + 1) % colours.bg.length;
        application.skin = new Skin({fill: colours.bg[backgroundColourIndex]});
      } catch (e) {
        console.log("JSON Error (Forecast):", e);
      }
    }
  },
  onWritable() {
    appMessageWritable = true;

    if (pendingCommand) {
      const cmd = pendingCommand;
      pendingCommand = 0;
      this.write(new Map([
        ["COMMAND", cmd],
      ]));
    }
  },
  onSuspend() {
    appMessageWritable = false;
  },
});

function paintBattery(level) {
  const label = batteryRow.content(1);
  label.string = level + "%";
  label.style = level <= 20 ? styles.smallRed : styles.small;

  const v = BATTERY_THRESHOLDS.findIndex(t => level <= t);
  batteryRow.content(0).variant = ((v === -1) ? 3 : v) + 2; // first two icons are sun
}

const battery = new Battery({
  onSample() {
    paintBattery(this.sample().percent);
  }
});

function formatSundata() {
  const data = application.sunData;
  if (!data || !data.r || !data.s) {
    return {i: 0, l: "", ts: null, p: 0};
  }

  const now = Date.now();
  if (now > data.r && now > data.s) {
    return {i: 0, l: "", ts: null, p: 0};
  }

  let nextT, prevT, icon;

  if (data.r < data.s) {
    // nighttime
    nextT = data.r;
    prevT = data.s - DAY_MS;
    icon = 0;
  } else {
    // daytime
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
  const minStr = m < 10 ? "0" + m : "" + m;

  if (watch.hour12) {
    const h12 = h % 12 || 12;
    return h12 + ":" + minStr + (h >= 12 ? "pm" : "am");
  }
  return h + ":" + minStr;
}

function getDataCommand(nowMs = new Date().getTime()) {
  const sd = application.sunData;
  const sunStale =
    !sd ||
    !sd.r ||
    !sd.s ||
    nowMs > Math.min(sd.r, sd.s);

  let weatherStale = !application.forecastData || !application.forecastData[0];

  if (!weatherStale) {
    const minsOld = (nowMs - application.forecastData[0]) / 60000;

    if (minsOld >= 60) {
      weatherStale = true;
    }
  }

  if (sunStale && weatherStale) { return 3; }
  if (weatherStale) { return 2; }
  if (sunStale) { return 1; }
  return 0;
}

function trySend(command) {
  if (appMessageWritable) {
    appMessage.write(new Map([
      ["COMMAND", command],
    ]));
  } else {
    pendingCommand |= command;
  }
}


const isTime2 = application.width === 200;

const timeLabel = new Label(null, {
  left: 0, right: 0, top: 50,
  string: "--:--",
  style: styles.clock,
});

function formatClockTime(date, hour12) {
  const h = date.getHours();
  const m = date.getMinutes();
  const minStr = m < 10 ? "0" + m : "" + m;

  if (!hour12) {
    const hStr = h < 10 ? "0" + h : "" + h;
    return hStr + ":" + minStr;
  }
  const h12 = h % 12 || 12;
  return h12 + ":" + minStr + (h >= 12 ? "pm" : "am");
}

const dateLabel = new Label(null, {
  left: 0, right: 0, top: 100,
  string: getDateString(new Date()),
  style: styles.boldSmall,
});

const batteryRow = new Row(null, {
  top: 125,
  contents: [
    new Content(null, {
      skin: iconSkin,
      left: 20,
      variant: 5, // placeholder; paintBattery overwrites below
      top: 2,
    }),
    new Label(null, {
      left: 2,
      string: "",
      style: styles.small,
    }),
    new Content(null, {
      skin: iconSkin,
      variant: 6,
      top: 1,
      visible: !watch.connected.pebblekit,
    }),
  ]
});

paintBattery(battery.sample().percent);


const forecastRow = new Row(null, {
  Behavior: ForecastRowBehavior,
  top: isTime2 ? 155 : 130,
  bottom: 10,
  left: 0,
  right: 0,
});

class SunDataRowBehavior extends Behavior {
  onDisplaying(row) {
    this.onSunDataChanged(row);
  }

  onSunDataChanged(row) {
    const formatted = formatSundata();
    sunTargetTime = formatted.ts ?? null;
    const icon = row.content(0);
    const line = row.content(1);
    const label = row.content(2);
    icon.variant = formatted.i;
    label.string = formatted.l;
    line.behavior.percent = formatted.p;
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
  Behavior: SunDataRowBehavior,
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

function getDateString(date) {
  const days = "SunMonTueWedThuFriSat";
  const months = "JanFebMarAprMayJunJulAugSepOctNovDec";
  
  const dStr = days.substr(date.getDay() * 3, 3);
  const mStr = months.substr(date.getMonth() * 3, 3);
  
  return dStr + ", " + mStr + " " + date.getDate();
}

application.add(sunRow);
application.add(timeLabel);
application.add(dateLabel);
application.add(batteryRow);
application.add(forecastRow);

const sendCommand = getDataCommand();
if (sendCommand !== 0) {
  trySend(sendCommand);
}

export default application;
