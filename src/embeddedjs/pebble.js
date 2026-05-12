import Message from "pebble/message";

let _app = null;
let _writable = false;
let _pending = 0;

const appMessage = new Message({
  keys: ["COMMAND", "DATA"],
  onReadable() {
    const msg = this.read();
    const cmd = msg.get("COMMAND");
    const data = msg.get("DATA");
    if (!_app || !data) return;

    if (cmd === 1) {
      try {
        _app.sunData = JSON.parse(data);
        try {
          localStorage.setItem("sunData", data);
        } catch (e) {
          console.log("Error saving sun data:", e);
        }
        _app.distribute("onSunDataChanged");
      } catch (e) {
        console.log("JSON Error (Sun):", e);
      }
    } else if (cmd === 2) {
      try {
        _app.forecastData = JSON.parse(data);
        try {
          localStorage.setItem("forecastData", data);
        } catch (e) {
          console.log("Error saving forecast data:", e);
        }
        _app.distribute("onForecastChanged");
      } catch (e) {
        console.log("JSON Error (Forecast):", e);
      }
    }
  },
  onWritable() {
    _writable = true;
    if (_pending) {
      const c = _pending;
      _pending = 0;
      this.write(new Map([["COMMAND", c]]));
    }
  },
  onSuspend() {
    _writable = false;
  },
});

export function bind(application) {
  _app = application;

  const sRaw = localStorage.getItem("sunData");
  try {
    application.sunData = sRaw ? JSON.parse(sRaw) : null;
  } catch (e) {
    console.log("Stored sun data corrupt, clearing:", e);
    application.sunData = null;
  }

  const fRaw = localStorage.getItem("forecastData");
  try {
    application.forecastData = fRaw ? JSON.parse(fRaw) : null;
  } catch (e) {
    console.log("Stored forecast data corrupt, clearing:", e);
    application.forecastData = null;
  }
}

export function send(command) {
  if (_writable) {
    appMessage.write(new Map([["COMMAND", command]]));
  } else {
    _pending |= command;
  }
}
