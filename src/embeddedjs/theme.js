const colours = Object.freeze({ // TODO: check "invert" from config and swap these if needed
  black: "#000000",
  white: "#FFFFFF",
  grey: "#888888",
  red: "#ba0000",
});

const iconSkin = new Skin({
  texture: new Texture(1),
  width: 20,
  height: 20,
  fill: colours.white,
  variants: 20,
});

const styles = Object.freeze({
  small: new Style({
    color: colours.black,
    font: "14px Gothic",
  }),
  smallRed: new Style({
    color: colours.red,
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

export {colours, iconSkin, styles};
