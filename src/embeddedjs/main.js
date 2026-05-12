import {} from "piu/MC";

import * as pebble from "./pebble";
import {batteryRow} from "./batteryRow";
import {ForecastRowBehavior} from "./forecastRowBehavior";
import {createSunRow} from "./sunRow";
import {colours, styles} from "./theme";

const DAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

const application = new Application(null, {
  skin: new Skin({fill: colours.white}),
  Behavior: class extends Behavior {
    onCreate(app, _data) {
      pebble.bind(app);

      watch.addEventListener("minutechange", (e) => {
        timeLabel.string = formatClockTime(e.date, watch.hour12);
        if (app.sunTargetTime && e.date.getTime() >= app.sunTargetTime) {
          app.sunTargetTime = null;
          app.distribute("onSunDataChanged");
        }
      });

      watch.addEventListener("hourchange", (e) => {
        dateLabel.string = getDateString(e.date);
        app.distribute("onForecastChanged");

        const c = getDataCommand(e.date);
        if (c !== 0) {
          pebble.send(c);
        }
      });
    }
  }
});

function getDataCommand(dateNow = new Date()) {
  const now = Date.now();

  const sd = application.sunData;
  const sunStale = !sd || !sd.ts || (now > sd.ts);

  let weatherStale = !application.forecastData || !application.forecastData[0];

  if (!weatherStale) {
    const lastSync = new Date(application.forecastData[0]);
    const minsOld = (now - application.forecastData[0]) / 60000;

    if (minsOld >= 60 || dateNow.getHours() !== lastSync.getHours()) {
      weatherStale = true;
    }
  }

  if (sunStale && weatherStale) return 3; // get both
  if (weatherStale) return 2;
  if (sunStale) return 1;
  return 0;
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

function getDateString(date) {
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
});

const sunRow = createSunRow({isTime2});

application.add(sunRow);
application.add(timeLabel);
application.add(dateLabel);
application.add(batteryRow);
application.add(forecastRow);

const sendCommand = getDataCommand();
if (sendCommand !== 0) {
  pebble.send(sendCommand);
}

export default application;
