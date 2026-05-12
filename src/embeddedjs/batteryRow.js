import Battery from "embedded:sensor/Battery";
import {iconSkin, styles} from "./theme";

const BATTERY_THRESHOLDS = Object.freeze([20, 50, 80]);

export const batteryRow = new Row(null, {
  top: 125,
  contents: [
    new Content(null, {
      skin: iconSkin,
      left: 20,
      variant: 5, // placeholder; onSample paints the real value
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
      visible: watch.connected.pebblekit,
    }),
  ]
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

paintBattery(battery.sample().percent);

watch.addEventListener("connected", () => {
  batteryRow.content(2).visible = watch.connected.pebblekit;
});
