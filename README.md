# Pin High Golf

A 3D golf game that runs in the browser: five 9-hole courses (including the Georgia-pines-and-azaleas Azalea Pines National), a full 14-club bag from five fictional club makers, outfit and ball customisation, four times of day, wind, a three-click swing meter with a perfect-power bar, shot shaping, in-flight spin, EA-style putt reads, fans in the stands and a broadcast-style score bug.

## Play

Open the GitHub Pages link for this repository, or run it locally (browsers block audio and scripts when `index.html` is opened straight from disk):

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Controls

- **Space / tap**: start the swing, lock power, then hit on the white line
- **← →**: aim · **↑ ↓**: change club (move the putt marker when putting)
- **Q / E, Z / X** or the shape box: draw/fade and low/high
- **Space + arrows in flight**: add spin
- **T** target view · **M** map zoom · **C** scorecard · **R** reset a stuck shot · **Esc** pause

## Credits

- Morning birdsong: Freesound community recording "morning birdsong (Spain)", via Pixabay.
- Ball strike: "Golf ball hit" by Mixkit (Mixkit free sound effects license).
- 3D rendering: [three.js](https://threejs.org) r128 (MIT).
- Fonts: Saira and Saira Condensed (SIL Open Font License), via Google Fonts.

All course names, club brands and players are fictional.
