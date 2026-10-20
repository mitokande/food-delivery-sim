# Audio credits - Food Delivery Simulator

Everything in `assets/audio/` is either **CC0 1.0 (public domain dedication)** material from the sources below, or sounds
**synthesised in this repository** (`tools/audio/synth.py`, `tools/audio/recipes.py`, released CC0 as well).
No attribution is required; credit is given here anyway. The CC0 licence of every downloaded sound was verified on its own
source page by `tools/audio/fetch.py` (build of 2026-10-20). Freesound items are the site's HQ preview
(128 kbps MP3 decoded and re-encoded) because original downloads need a login; Kenney packs and OpenGameArt files are the originals.

Output format: MP3 (LAME via ffmpeg, 44.1 kHz, gapless header). One-shots are mono 96 kbps, engines mono 96 kbps, ambience and music stereo 128 kbps.
Loops are encoded with 2048 extra samples of their own wrap-around material before/after the loop and a LAME tag that tells gapless decoders to skip them,
so the decoded buffer is exactly the loop (`dur` in manifest.json) and the MP3 codec's start/end artefacts never reach the seam.
In manifest.json, `hz` of an engine loop is the pulse (firing) frequency of the loop in Hz (for `engine-electric`: the 110 Hz motor hum), `gain` is a suggested mix gain.
Loudness (ITU-R BS.1770 integrated): one-shots about -16 LUFS, engines -20, ambience -26, music -18; sample peaks <= -1.5 dBFS before encoding, true peak <= -1 dBFS after.

## Files

| File | Source(s) | Author | Licence | What was changed |
|---|---|---|---|---|
| `engine-moped.mp3` | [Gilera Runner 2007 revs backfire cold idle](https://freesound.org/people/lovretta/sounds/140384/) (Freesound #140384; 3.4-8.4 s steady cold idle) | lovretta | CC0 1.0 | cut a steady 5 s idle stretch, high-passed 35 Hz, found the best seamless loop (1.9 s, 36 firings) and cross-faded its seam. |
| `engine-electric.mp3` | synthesised (synth.py, engine_electric) | generated in this repo | own work, released CC0 | synthesised: 110 Hz motor hum with harmonics + 1.1 kHz / 2.2 kHz whine with slow vibrato; all frequencies are integer multiples of 1/2 s so the 2 s loop is sample-exact. |
| `engine-scooter.mp3` | [Motorcycle - Benelli](https://freesound.org/people/Vrymaa/sounds/737778/) (Freesound #737778; 14.2-29.0 s steady idle) | Vrymaa | CC0 1.0 | cut a steady 15 s idle stretch, high-passed 35 Hz, found the best seamless loop (1.25 s, 38 firings), cross-faded its seam. |
| `engine-sport.mp3` | [KawasakiZX6RStart.wav](https://freesound.org/people/Sclolex/sounds/211668/) (Freesound #211668; 8.0-11.4 s steady idle) | Sclolex | CC0 1.0 | cut a steady 3.4 s idle stretch of an inline-four sport bike, high-passed 35 Hz, found the best seamless loop (1.7 s), cross-faded its seam. |
| `engine-cargo.mp3` | [TukTuk_Drive_Transport.wav](https://freesound.org/people/uniuniversal/sounds/658928/) (Freesound #658928; 17.2-19.6 s steady chug) | uniuniversal | CC0 1.0 | cut a steady low chugging stretch of a tuk-tuk, high-passed 35 Hz, found the best seamless loop (0.68 s, 20 pulses), cross-faded its seam. |
| `amb-city.mp3` | [City ambience - Berlin](https://freesound.org/people/vdr3/sounds/393701/) (Freesound #393701; most stationary 30 s of 100 s) | vdr3 | CC0 1.0 | picked the calmest 30 s stretch automatically (lowest level wobble + best head/tail match), cross-faded 3 s of the following material into the head (equal-power) for a seamless loop, then flattened slow traffic swells with gentle circular gain riding (max +-4 dB). |
| `amb-night.mp3` | [Night time crickets, distant dogs and traffic ambience.WAV](https://freesound.org/people/SukritSen/sounds/482687/) (Freesound #482687; most stationary 24 s of 70 s) | SukritSen | CC0 1.0 | picked the calmest 24 s stretch and cross-faded a 3 s pre-roll (equal-power) for a seamless loop. |
| `amb-rain.mp3` | [SuburbRain_OutdoorLoop.wav](https://freesound.org/people/PhilllChabbb/sounds/238431/) (Freesound #238431; most stationary 20 s of 50 s) | PhilllChabbb | CC0 1.0 | picked the most stationary 20 s of an outdoor suburban rain recording and cross-faded 3 s (equal-power) for a seamless loop. |
| `music-hub.mp3` | [happy lofi day](https://opengameart.org/content/happy-lofi-day) (OpenGameArt; rhodes.mp3 13.3-110.3 s) | Tarush Singhal | CC0 1.0 | cut a 97 s (160-beat, 99 bpm) loop between two musically matching points of the track, chosen by search: chroma/timbre similarity 0.94 before and after the seam and the smallest spectral jump across the join; end point refined by waveform correlation, 0.2 s equal-power cross-fade at the seam, loudness-normalised. |
| `music-ride.mp3` | [Wednesday Night [Funk Fusion]](https://opengameart.org/content/wednesday-night-funk-fusion) (OpenGameArt; wednesday_night.wav 68.1-143.6 s) | Zane Little Music | CC0 1.0 | cut a 75 s (176-beat, 140 bpm) loop between two musically matching points of the track, chosen by search: chroma/timbre similarity 0.93 before and after the seam and almost no spectral/level jump across the join; end point refined by waveform correlation, 0.2 s equal-power cross-fade at the seam, loudness-normalised. |
| `ui-tap.mp3` | synthesised (synth.py, ui_tap) | generated in this repo | own work, released CC0 | synthesised: soft pitched 'tok' (sine glide + second partial + 2 ms click). |
| `ui-back.mp3` | synthesised (synth.py, ui_back) | generated in this repo | own work, released CC0 | synthesised: short falling two-partial blip. |
| `ui-open.mp3` | synthesised (synth.py, ui_open) | generated in this repo | own work, released CC0 | synthesised: band-passed noise swoosh rising into a soft marimba 'tok' (panel slide). |
| `ui-error.mp3` | synthesised (synth.py, ui_error) | generated in this repo | own work, released CC0 | synthesised: two low, rounded square-wave 'bonk-bonk' blips (not harsh). |
| `ui-purchase.mp3` | [Cash Register Purchase](https://freesound.org/people/Zott820/sounds/209578/) (Freesound #209578; 0-1.9 s) | Zott820 | CC0 1.0 | trimmed to the ratchet + bell 'ka-ching' (first 1.9 s), fade-out, loudness-normalised. |
| `ui-coins.mp3` | [Doudar41 light coin shower](https://freesound.org/people/Sadiquecat/sounds/728430/) (Freesound #728430; densest 1.7 s of a 68 s coin shower)<br>[RPG Audio · Kenney](https://kenney.nl/assets/rpg-audio) (Kenney; handleCoins.ogg) | Sadiquecat, Kenney (kenney.nl) | CC0 1.0 | picked the densest 1.7 s of a coin-shower recording, layered the first clinks of Kenney handleCoins, fades in/out. |
| `ui-levelup.mp3` | synthesised (synth.py, ui_levelup) | generated in this repo | own work, released CC0 | synthesised: C-major marimba run into a bell chord with sparkle and light room. |
| `ui-unlock.mp3` | synthesised (synth.py, ui_unlock) | generated in this repo | own work, released CC0 | synthesised: lock 'ka-chunk' followed by a rising bell sparkle. |
| `notif-order.mp3` | synthesised (synth.py, notif_order) | generated in this repo | own work, released CC0 | synthesised: two-note (G5, D6) phone-style bell ping. |
| `countdown-tick.mp3` | synthesised (synth.py, countdown_tick) | generated in this repo | own work, released CC0 | synthesised: woody clock-like tick. |
| `horn-moped.mp3` | synthesised (synth.py, horn_moped) | generated in this repo | own work, released CC0 | synthesised: weak, tinny single-tone parp (392 Hz buzzy pulse, band-limited). |
| `horn-scooter.mp3` | [Car horn beep beep two beeps honk honk](https://freesound.org/people/AmishRob/sounds/423990/) (Freesound #423990; 0-0.62 s) | AmishRob | CC0 1.0 | trimmed to the two beeps ('beep-beep'), short fade-out. |
| `horn-sport.mp3` | [Beep Beep.mp3](https://freesound.org/people/DigPro120/sounds/394655/) (Freesound #394655; 0-0.75 s) | DigPro120 | CC0 1.0 | kept the single long two-tone car-horn beep (0.7 s), short fade-out and a little room. |
| `boost.mp3` | synthesised (synth.py, recipes._boost)<br>[whoosh_short_mid.wav](https://freesound.org/people/DJT4NN3R/sounds/449996/) (Freesound #449996; whoosh layer) | generated in this repo, DJT4NN3R | CC0 1.0 / own work, released CC0 | synthesised: rising engine rev (saw, 80->300 Hz, pulsed) + band-passed noise whoosh sweep, layered with a real whoosh. |
| `hop.mp3` | [Boing 2](https://freesound.org/people/magnuswaker/sounds/540790/) (Freesound #540790; 0-0.7 s) | magnuswaker | CC0 1.0 | used the first 0.7 s of a 'boing' spring (fade-out). |
| `land.mp3` | synthesised (synth.py, land)<br>[Impact Sounds · Kenney](https://kenney.nl/assets/impact-sounds) (Kenney; impactSoft_heavy_001.ogg) | generated in this repo, Kenney (kenney.nl) | CC0 1.0 / own work, released CC0 | synthesised low thud layered with a low-passed Kenney soft impact. |
| `bump.mp3` | [Impact Sounds · Kenney](https://kenney.nl/assets/impact-sounds) (Kenney; impactPlate_heavy_000.ogg)<br>[Impact Sounds · Kenney](https://kenney.nl/assets/impact-sounds) (Kenney; impactMetal_light_001.ogg)<br>synthesised (synth.py, land) | Kenney (kenney.nl), generated in this repo | CC0 1.0 / own work, released CC0 | pothole clunk: low-passed Kenney heavy plate impact + synthesised thump + a small metal rattle 90 ms later. |
| `crash.mp3` | [Crash.wav](https://freesound.org/people/CogFireStudios/sounds/420356/) (Freesound #420356; 0-1.3 s)<br>[Impact Sounds · Kenney](https://kenney.nl/assets/impact-sounds) (Kenney; impactMetal_heavy_000/003, impactPunch_heavy_000, impactGlass_heavy_000, impactPlate_heavy_001, impactGlass_light_001, impactTin_medium_002)<br>synthesised (synth.py, boing) | CogFireStudios, Kenney (kenney.nl), generated in this repo | CC0 1.0 / own work, released CC0 | cartoon crash: real crash burst (first 1.3 s) layered with Kenney metal/plate/glass impacts, a staggered tinkle of debris and a very quiet spring 'boing' tail; light room. |
| `skid.mp3` | [Tires Squeaking.aif](https://freesound.org/people/RutgerMuller/sounds/104026/) (Freesound #104026; 0.1-1.1 s) | RutgerMuller | CC0 1.0 | trimmed to the strongest second of a tyre squeal, fade in/out. |
| `brake.mp3` | [Braking on gravel (bike)](https://freesound.org/people/prsvl/sounds/437537/) (Freesound #437537; 0.55-1.65 s) | prsvl | CC0 1.0 | trimmed the braking/skid-on-gravel noise burst of a bike stop, fade in/out. |
| `pickup-bonus.mp3` | synthesised (synth.py, bell_note)<br>[Casino Audio · Kenney](https://kenney.nl/assets/casino-audio) (Kenney; chips-handle-3.ogg) | generated in this repo, Kenney (kenney.nl) | CC0 1.0 / own work, released CC0 | cash pickup: Kenney chip clink + two quick synthesised bell notes (B5, E6). |
| `splash.mp3` | [PuddleSplash.wav](https://freesound.org/people/ahill86/sounds/207139/) (Freesound #207139; 0.38-1.55 s) | ahill86 | CC0 1.0 | trimmed to the first plop + splash of a puddle recording, fade-out. |
| `dog-bark.mp3` | [Dog Bark](https://freesound.org/people/aunrea/sounds/495658/) (Freesound #495658; three barks re-spaced) | aunrea | CC0 1.0 | cut the three barks of a recording and re-spaced them closer (0 / 0.43 / 0.92 s) with slight pitch and level changes. |
| `siren-short.mp3` | [Siren.ogg](https://freesound.org/people/egomassive/sounds/536773/) (Freesound #536773; whole 0.9 s) | egomassive | CC0 1.0 | kept the two rising 'whoop' sweeps, added a short room tail. |
| `doorbell.mp3` | [DoorBell Shortened](https://freesound.org/people/jwheeler91/sounds/442280/) (Freesound #442280; 0-2.6 s) | jwheeler91 | CC0 1.0 | trimmed to the 'ding-dong' and its ring-out (2.6 s), long fade-out. |
| `door-open.mp3` | [RPG Audio · Kenney](https://kenney.nl/assets/rpg-audio) (Kenney; doorOpen_1.ogg) | Kenney (kenney.nl) | CC0 1.0 | used as is (trimmed, normalised). |
| `crowd-cheer.mp3` | [BerlinGameScene.com Crowd Cheer 1](https://freesound.org/people/BerlinGameScene/sounds/267249/) (Freesound #267249; 0-3.0 s) | BerlinGameScene | CC0 1.0 | trimmed to the swell and first ring-out of a small crowd cheer, fade-out. |
| `qte-good.mp3` | synthesised (synth.py, qte_good) | generated in this repo | own work, released CC0 | synthesised: bright two-note rising marimba+bell 'ding-ding' (C6 -> G6). |
| `qte-bad.mp3` | synthesised (synth.py, qte_bad) | generated in this repo | own work, released CC0 | synthesised: low falling 'womp' with a soft thud. |
| `event-pop.mp3` | synthesised (synth.py, event_pop) | generated in this repo | own work, released CC0 | synthesised: bubble pop + bright two-note bell sting with sparkle. |
| `engine-stall.mp3` | [Gilera Runner 2007 revs backfire cold idle](https://freesound.org/people/lovretta/sounds/140384/) (Freesound #140384; single firing pulses of the idle, re-timed)<br>[Impact Sounds · Kenney](https://kenney.nl/assets/impact-sounds) (Kenney; impactMetal_light_000.ogg) | lovretta, Kenney (kenney.nl) | CC0 1.0 | built from real single firing pulses of the moped idle recording: spacing grows (53 -> 420 ms), pitch/level fall, plus a low shudder and a last metallic clunk -- a sputter that dies. |
| `engine-start.mp3` | [Jerry Honda 125 Kickstart & ride off.wav](https://freesound.org/people/3bagbrew/sounds/574322/) (Freesound #574322; 11.4-13.9 s) | 3bagbrew | CC0 1.0 | trimmed to the successful kick-start (kick, engine catches, settles into idle), fade-out. |
| `tire-pop.mp3` | [Tire Puncture Pop Hit Punch](https://freesound.org/people/JohnsonBrandEditing/sounds/243375/) (Freesound #243375; first pop 0-0.8 s) | JohnsonBrandEditing | CC0 1.0 | trimmed to the first pop and its air-hiss tail, fade-out. |
| `pump.mp3` | [Pumping bicycle air pump](https://freesound.org/people/13GPanska_Lakota_Jan/sounds/378359/) (Freesound #378359; one stroke) | 13GPanska_Lakota_Jan | CC0 1.0 | cut one stroke (push whoosh + click) of a bicycle pump, fade in/out. |
| `rain-start.mp3` | [Short_Thunder_Mid.wav](https://freesound.org/people/SholeColtis/sounds/683421/) (Freesound #683421; 0-4.5 s) | SholeColtis | CC0 1.0 | trimmed a distant thunder rumble (4.5 s), low-passed at 1.5 kHz so it stays soft, long fade in/out. |
| `camera-shutter.mp3` | [Camera shutter.wav](https://freesound.org/people/jdaniel1999/sounds/376205/) (Freesound #376205; shutter click) | jdaniel1999 | CC0 1.0 | cut the shutter click out of the recording, short fades. |
| `bag-rustle.mp3` | [Plastic bags rustling.mp3](https://freesound.org/people/Caitlin_100/sounds/365520/) (Freesound #365520; 1.1 s of crinkling) | Caitlin_100 | CC0 1.0 | picked the most active 1.1 s of plastic-bag rustling, fades in/out (food bag handover). |
| `order-complete.mp3` | synthesised (synth.py, order_complete) | generated in this repo | own work, released CC0 | synthesised: upbeat G-major marimba run (G4 B4 D5 G5) into a bell chord. |
| `order-late.mp3` | [wah wah sad trombone.wav](https://freesound.org/people/kirbydx/sounds/175409/) (Freesound #175409; four wah notes, tightened) | kirbydx | CC0 1.0 | cut the four 'wah-wah-wah-waaah' notes of a muted-trombone recording, trimmed each note to its sustain, butted them closer together and shortened the last note (about 2.7 s total). |

## Source pages

- **Tires Squeaking.aif** - RutgerMuller - <https://freesound.org/people/RutgerMuller/sounds/104026/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #104026)
- **Gilera Runner 2007 revs backfire cold idle** - lovretta - <https://freesound.org/people/lovretta/sounds/140384/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #140384)
- **wah wah sad trombone.wav** - kirbydx - <https://freesound.org/people/kirbydx/sounds/175409/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #175409)
- **PuddleSplash.wav** - ahill86 - <https://freesound.org/people/ahill86/sounds/207139/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #207139)
- **Cash Register Purchase** - Zott820 - <https://freesound.org/people/Zott820/sounds/209578/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #209578)
- **KawasakiZX6RStart.wav** - Sclolex - <https://freesound.org/people/Sclolex/sounds/211668/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #211668)
- **SuburbRain_OutdoorLoop.wav** - PhilllChabbb - <https://freesound.org/people/PhilllChabbb/sounds/238431/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #238431)
- **Tire Puncture Pop Hit Punch** - JohnsonBrandEditing - <https://freesound.org/people/JohnsonBrandEditing/sounds/243375/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #243375)
- **BerlinGameScene.com Crowd Cheer 1** - BerlinGameScene - <https://freesound.org/people/BerlinGameScene/sounds/267249/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #267249)
- **Plastic bags rustling.mp3** - Caitlin_100 - <https://freesound.org/people/Caitlin_100/sounds/365520/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #365520)
- **Camera shutter.wav** - jdaniel1999 - <https://freesound.org/people/jdaniel1999/sounds/376205/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #376205)
- **Pumping bicycle air pump** - 13GPanska_Lakota_Jan - <https://freesound.org/people/13GPanska_Lakota_Jan/sounds/378359/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #378359)
- **City ambience - Berlin** - vdr3 - <https://freesound.org/people/vdr3/sounds/393701/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #393701)
- **Beep Beep.mp3** - DigPro120 - <https://freesound.org/people/DigPro120/sounds/394655/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #394655)
- **Crash.wav** - CogFireStudios - <https://freesound.org/people/CogFireStudios/sounds/420356/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #420356)
- **Car horn beep beep two beeps honk honk** - AmishRob - <https://freesound.org/people/AmishRob/sounds/423990/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #423990)
- **Braking on gravel (bike)** - prsvl - <https://freesound.org/people/prsvl/sounds/437537/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #437537)
- **DoorBell Shortened** - jwheeler91 - <https://freesound.org/people/jwheeler91/sounds/442280/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #442280)
- **whoosh_short_mid.wav** - DJT4NN3R - <https://freesound.org/people/DJT4NN3R/sounds/449996/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #449996)
- **Night time crickets, distant dogs and traffic ambience.WAV** - SukritSen - <https://freesound.org/people/SukritSen/sounds/482687/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #482687)
- **Dog Bark** - aunrea - <https://freesound.org/people/aunrea/sounds/495658/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #495658)
- **Siren.ogg** - egomassive - <https://freesound.org/people/egomassive/sounds/536773/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #536773)
- **Boing 2** - magnuswaker - <https://freesound.org/people/magnuswaker/sounds/540790/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #540790)
- **Jerry Honda 125 Kickstart & ride off.wav** - 3bagbrew - <https://freesound.org/people/3bagbrew/sounds/574322/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #574322)
- **TukTuk_Drive_Transport.wav** - uniuniversal - <https://freesound.org/people/uniuniversal/sounds/658928/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #658928)
- **Short_Thunder_Mid.wav** - SholeColtis - <https://freesound.org/people/SholeColtis/sounds/683421/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #683421)
- **Doudar41 light coin shower** - Sadiquecat - <https://freesound.org/people/Sadiquecat/sounds/728430/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #728430)
- **Motorcycle - Benelli** - Vrymaa - <https://freesound.org/people/Vrymaa/sounds/737778/> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (Freesound #737778)
- **Casino Audio · Kenney** - Kenney (kenney.nl) - <https://kenney.nl/assets/casino-audio> - licence <https://creativecommons.org/publicdomain/zero/1.0/> (Kenney pack)
- **Impact Sounds · Kenney** - Kenney (kenney.nl) - <https://kenney.nl/assets/impact-sounds> - licence <https://creativecommons.org/publicdomain/zero/1.0/> (Kenney pack)
- **RPG Audio · Kenney** - Kenney (kenney.nl) - <https://kenney.nl/assets/rpg-audio> - licence <https://creativecommons.org/publicdomain/zero/1.0/> (Kenney pack)
- **happy lofi day** - Tarush Singhal - <https://opengameart.org/content/happy-lofi-day> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (OpenGameArt)
- **Wednesday Night [Funk Fusion]** - Zane Little Music - <https://opengameart.org/content/wednesday-night-funk-fusion> - licence <http://creativecommons.org/publicdomain/zero/1.0/> (OpenGameArt)

## Courtesy notes (not required by CC0)

- `music-hub` - the author of *happy lofi day* (Tarush Singhal) writes on the OpenGameArt page "let me know if you use this!".
- `music-ride` - *Wednesday Night [Funk Fusion]* is by Zane Little Music, who supports his free releases via Ko-Fi.
- Kenney (kenney.nl) asks for no credit but welcomes support at <https://kenney.nl/support>.
