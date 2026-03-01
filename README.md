# GHGdle

**Errate täglich ein BastiGHG-Video!**

GHGdle ist ein kleines Tagesrätsel im Stil von Wordle: Jeden Tag gilt es, ein bestimmtes Video vom YouTube-Kanal [BastiGHG](https://www.youtube.com/@BastiGHG) zu erraten. Du gibst Vermutungen ab und erhältst Hinweise zu Upload-Datum, Aufrufen, Länge, Zickzack-Version, Projekt und Gästen – bis du das richtige Video triffst.

## Spielen

**Live-Version:** [https://spurblick.github.io/GHGdle/](https://spurblick.github.io/GHGdle/)

- Über die Suchleiste ein Video auswählen und als Tipp abgeben.
- **Grün** = exakter Treffer, **Orange** = teilweise (z. B. einige Gäste stimmen), **Rot** = daneben.
- Pfeile (▲ ▼) zeigen bei Datum, Aufrufen und Länge die Richtung an (höher/neuer vs. niedriger/älter).
- Nur die beiden nächsten Tipps ober- und unterhalb des Ziels bleiben kräftig rot
- Nach dem Rätsel kannst du mit „Neues Video“ ein weiteres Zufallsvideo spielen, ohne auf den nächsten Tag zu warten.

## Technik

- Statische Seite (HTML, CSS, JavaScript), keine Backend-Anforderungen.
- Tägliches Zielvideo über seed-basierte Zufallsauswahl (gleich für alle Nutzer, wechselt um Mitternacht Europe/Berlin).
- Videodaten in `data/videos.json` (Aufrufe, Länge, Upload-Datum, Gäste aus Beschreibung, manuell ergänzt: Zickzack-Version, Projekt).

## Lizenz & Credits

- Spielidee und Umsetzung: [Spurblick Studio](https://github.com/spurblick) – Data & Analytics Consulting.
- Videodaten stammen von YouTube (BastiGHG). Zickzack-Version und Projekt wurden manuell ergänzt.
