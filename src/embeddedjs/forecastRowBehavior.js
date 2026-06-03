import {colours, styles} from "./theme";

// forecastData layout: [timestamp, c0, t0, c1, t1, ..., c10, t10]
// timestamp = ms when fetched; ci = condition variant index; ti = rounded temperature.

const weatherSkin = new Skin({
  texture: new Texture(2),
  width: 30,
  height: 30,
  fill: colours.white,
  variants: 30,
});

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
          left: 8,
          top: 8,
          skin: weatherSkin,
          variant: condition,
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

export class ForecastRowBehavior extends Behavior {
  onDisplaying(row) {
    for (let i = 0; i < 4; i++) {
      row.add(new ForecastColumn("", "", 15));
    }

    this.onForecastChanged(row);
  }

  onForecastChanged(row) {
    const application = row.container;
    if (!application.forecastData || application.forecastData.length < 3) {
      this.clearForecast(row);
      return;
    }

    const currentHour = new Date().getHours();
    const serverHour = new Date(application.forecastData[0]).getHours();
    const hoursElapsed = (currentHour - serverHour + 24) % 24;
    const startIndex = (hoursElapsed * 2) + 1;
    const hourOffsets = [0, 3, 6, 9];

    for (let i = 0; i < 4; i++) {
      const column = row.content(i);
      if (!column) {
        continue;
      }

      const base = startIndex + (hourOffsets[i] * 2);
      if (base + 1 >= application.forecastData.length) {
        this.clearColumn(column);
        continue;
      }

      const hourLabel = column.content(0);
      const icon = column.content(1);
      const temperatureLabel = column.content(2);

      const condition = application.forecastData[base];
      const temp = application.forecastData[base + 1];

      hourLabel.string = this.formatHourLabel(currentHour + hourOffsets[i], i === 0); 
      icon.variant = condition;
      temperatureLabel.string = temp + "°";
    }
  }

  formatHourLabel(hour, isFirst) {
    if (isFirst) {
      return "now";
    }

    const h = (hour + 24) % 24;
    if (watch.hour12) {
      const period = h >= 12 ? "pm" : "am";
      let h12 = h % 12;
      h12 = h12 === 0 ? 12 : h12;
      return h12 + period;
    } else {
      return h + "h";
    }
  }

  clearColumn(column) {
    column.content(0).string = "";
    column.content(1).variant = 15;
    column.content(2).string = "";
  }

  clearForecast(row) {
    for (let i = 0; i < 4; i++) {
      const column = row.content(i);
      if (!column) {continue;}

      this.clearColumn(column);
    }
  }
}
