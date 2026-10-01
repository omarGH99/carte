# Screenshots

Captured from the running app in real Chrome. Stills are taken with reduced motion on, so no dish is caught half-plated. Mobile shots are 390×844 at 2× (an iPhone-sized screen); desktop shots are 1440×900.

Regenerate them all after any design change:

```sh
python -m http.server 8099
node tools/shot.mjs tools/screenshots.json
```

## Mobile

| Brand | Shots |
|---|---|
| **Kumo** (izakaya, dark) | `kumo-1-cover` · `kumo-2-menu` · `kumo-3-dish` · `kumo-4-arabic` · `kumo-5-kurdish-cover` · `kumo-6-search` · `kumo-7-info-hours` · `kumo-8-contents` |
| **Fico** (osteria, paper) | `fico-1-cover` · `fico-2-menu` · `fico-3-dish-sizes` · `fico-4-arabic` · `fico-5-filters` · `fico-6-allergy-marked` · `fico-7-search-arabic` |
| **Juniper** (café, bright) | `juniper-1-cover` · `juniper-2-menu` · `juniper-3-dish` · `juniper-4-kurdish` · `juniper-5-my-list` · `juniper-6-show-server` · `juniper-7-show-server-kurdish` |
| Landing page | `landing-page-full` |

## Motion (animated WebP)

`motion/kumo-plating` · `motion/fico-plating` · `motion/juniper-plating` · `motion/juniper-add-to-list`

Record and stitch them again with:

```sh
node tools/shot.mjs tools/motion.json
python tools/frames_to_webp.py screenshots/motion/kumo-plating   # once per clip
```

## Desktop

`landing-page-top` · `landing-page-full` · `kumo-cover` · `kumo-menu` · `fico-cover` · `fico-menu` · `fico-dish` · `juniper-cover` · `juniper-menu` · `juniper-arabic`

Kumo, Fico and Juniper are fictional restaurants. Every name, address, phone number and wi-fi password shown is a placeholder.
