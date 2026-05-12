import {colours, iconSkin, styles} from "./theme";

const DAY_MS = 86400000;

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

function formatSundata(sunData) {
  if (!sunData || !sunData.r || !sunData.s) {
    return {i: 0, l: "", ts: null, p: 0};
  }

  const now = Date.now();
  let nextT, prevT, icon;

  if (sunData.r < sunData.s) {
    // nighttime
    nextT = sunData.r;
    prevT = sunData.s - DAY_MS;
    icon = 0;
  } else {
    // daytime
    nextT = sunData.s;
    prevT = sunData.r - DAY_MS;
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

class SunDataRowBehavior extends Behavior {
  onDisplaying(row) {
    this.onSunDataChanged(row);
  }

  onSunDataChanged(row) {
    const app = row.container;
    const formatted = formatSundata(app.sunData);
    app.sunTargetTime = formatted.ts ?? null;
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

export function createSunRow({isTime2}) {
  return new Row(null, {
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
}
