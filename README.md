# HassWeather Pebble
A clockface that shows a brief forecast and sunrise and sunset hours. What makes it unique, is that these are fetched from your own Home Assistant instance. This allows you easy acess to many weather providers with the API burden placed with Home Assistant.

The watchface also displays an indicator of your "progress" from the last sunrise/sunset to the upcoming sunrise/sunset.

## Attribution
* Icons from: https://github.com/D0-0K/Pebble-Icons/tree/main (I converted to PNG with reduced colours)

## TODO
- add "invert" color setting and pass it on in appMessage.
- optimise layout on gabbro

## Things I liked
- Piu is well thought-out and once you get it, is easy to follow
- Moddable is great and allows for all the syntax sugar and niceness. But we are limited in how we can use it.

## Things I did not like

- SVGImage doesn't allow me to dynamically change its `path`. So I can't change the image shown and would need many objects, giving me memory issues and crashes
- Fetch is broken for non-GET requests (see [issue](), fix is coming).
- I really have to watch heap memory and number of allocations, and end up avoiding some template niceness to avoid crashes. All these nice tools, but we can't use them as much as we'd like.
- Based on the above; whilst we now have `fetch` and stuff, it makes sense to do as much as possible on the phone side, as data transformations on the watch are resource heavy. But Pebblekit JS is not nice in 2026. It's completely seperate from the embeddedjs code, doesn't allow a lot of the syntax sugar and things like `fetch` and async. In an ideal world, this would be more like React or Sveltekit where what runs on the phone is SSR and "hydrates" the frontend on the watch. App messages are functional but not fantastic in 2026.
- The stack traces and error messages when things go bad are as useful as a chocolate teapot.
- Weird: when running PKJS on my machine with pypkjs the runtime uses GMT and not my local time as locale. This is a pain as I create date strings on the phone. I am not sure if this happens to on a real device, but as a workaround I'm passing the time zone offset from the watch when requesting data.
