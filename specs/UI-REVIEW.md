# UI-Review — WhatsApp-Vorlagen Kunden-Plattform

**Auditiert:** 2026-06-01
**Grundlage:** Code (`webui/index.html`, `app.js`, `styles.css`) + 5 Live-Screenshots (Login, Galerie, Modal, Labels, Admin)
**Zielgruppe:** Nicht-technische Versicherungs-/Finanzkunden, die Vorlagen ansehen und 1:1 in Superchat nachbauen
**Live:** https://vorlagen.voelkergroup.cloud/

---

## Score-Tabelle

| # | Säule | Note (1–4) | Kernbefund |
|---|-------|:----------:|------------|
| 1 | Copywriting | **3** | Klar und deutsch, aber technische Leak-Begriffe (`quick_reply`, `slug`) und schwache Leerzustände |
| 2 | Visuals | **3** | WhatsApp-Look überzeugt, aber leere graue Cover-Flächen dominieren und Textüberlauf wird hart abgeschnitten |
| 3 | Color | **3** | Konsistentes Grün-System & gut differenzierte Badges, aber Button-Blau im Bubble bricht die Palette, Kontrast grenzwertig |
| 4 | Typography | **3** | Saubere Hierarchie, System-Font, aber sehr kleine Karten-Schrift (12px) und unklare Lesbarkeit der Variablen-Chips |
| 5 | Spacing | **2** | Desktop ordentlich, aber Mobile/Tablet kaum getestet, Login vertikal mittig, Karten-Höhen springen |
| 6 | Experience Design | **2** | Funktional, aber kein Onboarding, fehlende Lade-/Fehlerzustände, Passwort im Klartext via `alert()`, kein Copy-Button |

**Gesamt: 16 / 24**

Solide, ehrliche Basis mit klarem WhatsApp-Charakter — aber für eine nicht-technische Zielgruppe, die hier bezahlt, fehlen Onboarding, Robustheit der Zustände und einige Profi-Schliffe. Die größten Hebel liegen in **Experience Design** und **Spacing/Mobile**.

---

## Säule 1 — Copywriting (3/4)

**Stärken:** Durchgehend Deutsch, freundlich-direkt ("Bitte mit deinem Kundenzugang anmelden"), gute Fehlermeldung beim Login ("Anmeldung fehlgeschlagen. Bitte E-Mail/Passwort prüfen."). Die deutschen Header-/Button-Labels (`HEADER_LABEL`, `BTN_LABEL` in `app.js:87,95`) sind genau richtig für die 1:1-Übertragung in Superchat.

**Befunde:**

1. **Technische Begriffe leaken in die UI.** Im Modal-Screenshot ui-3 stehen die Button-Typen als roher Code `quick_reply` (`app.js:164` rendert `btnTypeLabel(b.type)` — der greift zwar auf `BTN_LABEL` zu, aber ui-3 zeigt trotzdem `quick_reply`, ui-4 zeigt korrekt `Schnellantwort`). Das ist ein **Inkonsistenz-/Mapping-Befund**: Mindestens ein Render-Pfad zeigt der nicht-technischen Zielgruppe Rohwerte. Prüfen, ob alle Typen (`static_url`, `dynamic_url`, `phone_number`) im `BTN_LABEL`-Mapping abgedeckt sind — `btnTypeLabel` fällt sonst auf den Rohwert zurück (`app.js:96`).

2. **Leerzustände zu knapp.** `"Keine Vorlagen gefunden."` (`index.html:36`) und `"Noch keine Kunden."` (`app.js:253`) sind reine Tatsachen ohne Hilfestellung. Besser: "Keine Vorlage passt zu deiner Suche. Tipp: Suchbegriff kürzen oder Filter zurücksetzen." Für eine nicht-technische Zielgruppe ist die Handlungsanweisung wichtiger als die Feststellung.

3. **Unerklärte Fachbegriffe in der Detailansicht.** Begriffe wie "Statische URL" / "Dynamische URL" (`app.js:95`) sind aus Superchat übernommen, aber ein Versicherungskunde versteht den Unterschied nicht. Ein kurzer Tooltip/Hinweis ("Dynamische URL = Teil der Adresse wird automatisch eingesetzt") würde den 1:1-Nachbau erleichtern.

4. **Inkonsistente Anrede-Form bei Variablen-Chips.** Galerie zeigt Chips wie "Vorname", "Informelle Grußformel", "Freitext" (ui-2). "Freitext" und "Informelle Grußformel" sind keine Variablen-Namen im klassischen Sinn, sondern Meta-Beschreibungen — für den Kunden uneinheitlich, weil er nicht erkennt, was er konkret eintragen soll.

---

## Säule 2 — Visuals (3/4)

**Stärken:** Der WhatsApp-Look ist authentisch und sofort wiedererkennbar — grüne Bubble (`#d9fdd3`), abgeschnittene obere linke Ecke (`border-top-left-radius:0`, `styles.css:68`), blaue Buttons im WA-Stil, Footer-Zeitstempel im Vorschaubild. Variablen-Chips (`.var`, hellblau) heben Platzhalter klar hervor. Badge-System (Marketing/Verwaltung/Authentifizierung/Buttons/bearbeitet/ausgeblendet) ist visuell sauber differenziert (`styles.css:48–54`).

**Befunde:**

1. **Leere graue Cover-Flächen dominieren die Galerie.** In ui-2 haben fast alle Karten ein leeres graues `card-cover` (`aspect-ratio:1/1`, `styles.css:41`) — das Vorschaubild fehlt offenbar bei vielen Templates, der Fallback ist nur ein blasses `💬`-Icon (`app.js:134`). Effekt: ~50% jeder Karte ist visuell tote Fläche. Empfehlung: Bei fehlendem Bild eine kompakte Text-Vorschau der Bubble im Cover rendern statt 1:1-Leerquadrat, oder Cover-Höhe bei fehlendem Bild stark reduzieren.

2. **Karten-Text wird hart abgeschnitten.** In ui-2 enden Texte wie "Herzliche Grüße" und "wir hoffen, es geht so aus…" abrupt mitten im Wort/Zeile ohne Ellipsis-Fade. `.card-text` nutzt `max-height:3.4em;overflow:hidden` (`styles.css:46`) — das schneidet ohne `text-overflow`/Gradient hart ab und wirkt unfertig. Ein Fade-out-Verlauf oder sauberes `-webkit-line-clamp` mit Ellipsis würde professioneller wirken.

3. **Emoji als Brand-Mark.** Das `💬`-Emoji als Logo (`index.html:14,26`) rendert je nach OS/Browser unterschiedlich (Apple vs. Windows vs. Android) und wirkt für ein bezahltes B2B-Produkt etwas improvisiert. Ein schlankes Inline-SVG-Icon wäre konsistenter und markenfähiger.

4. **Icon-Buttons ohne sichtbares Label-Backup.** `👤 Kunden` und `💬` sind Emoji-getragen; immerhin haben Modal-Close-Buttons `aria-label` (`index.html:42,50`). Die `↩︎`/`🔗`/`📞`-Button-Icons (`BTN_ICON`, `app.js:94`) sind nur dekorativ neben dem Text — okay, aber das `↩︎` für Schnellantwort ist semantisch unklar.

---

## Säule 3 — Color (3/4)

**Stärken:** Klares Token-System in `:root` (`styles.css:1–4`): WhatsApp-Grün `#25d366`/`#128c7e`, WhatsApp-typischer Beige-Hintergrund `#eae6df`, definierte `--muted`/`--line`/`--shadow`. Topbar, aktive Chips, Save-Buttons und Login-Button nutzen konsistent `--wa-dark`. Badge-Farbcodierung ist durchdacht (Marketing orange, Verwaltung blau, Auth violett, bearbeitet grün).

**Befunde:**

1. **Button-Blau bricht die Palette.** Die WA-Buttons in der Bubble sind blau (`#1c8fd6`, `styles.css:74`) — das ist zwar WhatsApp-authentisch, aber es ist die einzige Stelle mit Blau im sonst grün-geprägten System und kollidiert farblich mit dem Variablen-Chip-Blau (`#cfe9ff`/`#1c5fa8`, `styles.css:57`). Im Modal (ui-3) konkurrieren zwei verschiedene Blautöne nebeneinander.

2. **Kontrast grenzwertig bei Muted-Text.** `--muted:#667781` auf weißem Grund ist okay (~4.5:1), aber die Karten-Subtexte mit 12px in `--muted` (`styles.css:46`) und die `.placeholder` (`#9aa6ad`, `styles.css:95`) liegen unter WCAG-AA für Kleintext. Für eine ältere Finanz-/Versicherungs-Zielgruppe relevant.

3. **Login-Button im Hover hardcodiert.** `#0f7568` (`styles.css:19,93`) ist ein nicht-tokenisierter Hover-Wert — kleiner Konsistenzbruch, sollte als `--wa-darker`-Token geführt werden. Gleiches gilt für die vielen Badge-Hardcodes (`#fff0e0`, `#e7f0ff` …), die zwar funktionieren, aber außerhalb des Token-Systems leben.

4. **Disabled-Zustände ohne visuelle Abschwächung.** Buttons werden per JS `disabled` gesetzt und nur der Text ändert sich ("Speichert…", `app.js:195`), aber es gibt kein `button:disabled`-CSS — der Button sieht weiter voll-aktiv aus, was Nutzer zu Doppelklicks verleitet.

---

## Säule 4 — Typography (3/4)

**Stärken:** Saubere System-Font-Stack (`-apple-system, …`, `styles.css:6`), klare Größenhierarchie: Brand 20px/700, h2 19px, Karten-Name 14px/600, Subtext 12–13px. Gruppentitel mit `text-transform:uppercase` + `letter-spacing` (`styles.css:38`) gliedert die Galerie gut. Zeilenhöhen sind durchdacht (Bubble `line-height:1.45`).

**Befunde:**

1. **Karten-Beschreibungstext zu klein.** `.card-text` mit 12px (`styles.css:46`) ist für die nicht-technische, tendenziell ältere Zielgruppe grenzwertig klein — und es ist genau der Text, der den Vorlagen-Inhalt zeigt. 13–14px wäre angemessener. Gleiches bei `.badge` (11px) und `.placeholder` (12px).

2. **Variablen-Chips reduzieren Lesbarkeit im Fließtext.** `.var` mit `font-size:.92em` (`styles.css:57`) verkleinert Wörter mitten im Satz; in ui-3 unterbricht "Hallo [Vorname] ," den Lesefluss zusätzlich durch das Komma außerhalb des Chips. Inline-Chips brechen den natürlichen Satzrhythmus — funktional korrekt, aber typografisch unruhig.

3. **Keine Begrenzung der Zeilenlänge im Modal.** Bubble-Body (`max-width:680px` Modal, `styles.css:61`) kann auf breiten Screens lange Zeilen erzeugen; für Lesbarkeit wären ~60–70 Zeichen ideal — bei einer Textvorlagen-App ein relevanter Punkt.

4. **Fett-Auszeichnung uneinheitlich.** Header-Text in der Bubble ist `font-weight:700` (`styles.css:69`), Karten-Name `600`, Button-Label `600`, btn-label im Detail `600` — viele nah beieinander liegende Gewichte (600/700) ohne klaren Bedeutungsunterschied.

---

## Säule 5 — Spacing (2/4)

**Stärken:** Desktop-Galerie hat ein sauberes auto-fill-Grid (`minmax(260px,1fr)`, `gap:16px`, `styles.css:37`), konsistente Innenabstände in Karten und Modal (12–24px). Filter-Chips haben angenehmes `gap:8px` mit `flex-wrap`.

**Befunde:**

1. **Mobile/Tablet praktisch ungetestet.** Es gibt genau **eine** Media-Query im gesamten CSS (`@media(max-width:520px)`, `styles.css:109`) — und die regelt nur Suchfeld-Breite und blendet `.who` aus. Topbar, Filter-Chip-Reihe (in ui-2 bereits 3 Zeilen lang!), Modal-Padding und Galerie-Grid haben keine eigenen Mobile-Regeln. Für eine Zielgruppe, die das wahrscheinlich oft am Handy öffnet, ist das die größte Schwäche dieser Säule. Tablet (768px) fällt komplett zwischen die Stühle.

2. **Filter-Chip-Wand überfordert.** In ui-2 belegen die Ordner-Filter 3 volle Zeilen (über 20 Chips, bis 40 erlaubt, `app.js:114`). Ohne Scroll-Container oder Collapse dominiert die Navigation die obere Bildschirmhälfte und drängt den eigentlichen Inhalt nach unten. Auf Mobile wird das zur halben Seite Chips.

3. **Login vertikal mittig statt optisch ausbalanciert.** `place-items:center` + `min-height:100vh` (`styles.css:11`) zentriert die Karte exakt mittig (ui-1); konventionell wirkt eine leicht nach oben versetzte Position (ca. 40vh) ruhiger und professioneller.

4. **Karten unterschiedlicher Höhe springen.** Durch variable Textlänge + `flex:1` Card-Body und `margin-top:auto` bei Badges (`styles.css:47`) sind die Badge-Reihen zwar unten ausgerichtet, aber die Cover-Quadrate sind fix und der Body variabel — im Grid entstehen unruhige Höhenstufen (in ui-2 sichtbar). Eine einheitliche Card-Min-Höhe oder Clamp auf feste Zeilenzahl würde das Raster beruhigen.

---

## Säule 6 — Experience Design (2/4)

**Stärken:** Kernflüsse funktionieren: Login → Galerie → Detail → eigene Anpassung speichern/zurücksetzen. Destruktive Aktionen sind durch `confirm()` abgesichert (`app.js:206,288,293`). Beim Anlegen eines Kunden gibt es ein sauberes **Rollback** des Mandanten, falls die User-Erstellung scheitert (`app.js:282`) — das ist solide Datenintegrität. 401 führt automatisch zum Logout (`app.js:21`). Save-Button zeigt "Speichert…"-Zwischenzustand.

**Befunde:**

1. **Kein Onboarding / keine Erklärung des Kernnutzens.** Ein neuer Kunde landet nach Login direkt in einer Galerie ohne jede Einführung, *was* er hier tut ("Vorlagen ansehen und in Superchat nachbauen"). Es fehlt der entscheidende Kontext-Satz und idealerweise ein "So überträgst du eine Vorlage"-Hinweis. Für die Zielgruppe ist das der wichtigste fehlende Baustein.

2. **Kein Copy-Button — der Kern-Use-Case ist umständlich.** Der ganze Sinn ist 1:1-Nachbau in Superchat. Aber es gibt **keinen** "Text kopieren"-Button für Body, Footer oder Button-Titel. Der Kunde muss markieren und Strg+C — fehleranfällig, besonders mit Variablen-Chips (kopiert er "Vorname" oder `{{1}}`?). Ein "In Zwischenablage kopieren"-Button pro Komponente (mit Roh-`{{1}}`-Ausgabe) wäre der höchste Einzel-Mehrwert.

3. **Lade- und Fehlerzustände fehlen weitgehend.** Beim Boot (`loadData`, `app.js:43`) gibt es keinen Skeleton/Spinner — der Nutzer sieht potenziell eine leere Seite, bis 500 Records geladen sind. Fehler beim Datenladen haben gar keinen sichtbaren Zustand (nur Admin hat ein "Fehler:"-Markup, `app.js:227`). Galerie-Ladefehler = weißer Bildschirm.

4. **Sicherheits-/UX-Befund: Passwörter im Klartext via `alert()`.** Generierte Kundenpasswörter werden per `confirm()`/`alert()` (`app.js:288–289`) und als Plaintext im Erfolgs-Markup angezeigt ("✓ Kunde angelegt: … / Passwort: …", `app.js:277`). `alert()` ist nicht kopierbar-freundlich, der Hinweis "wird nur einmal angezeigt" stimmt nicht (steht im DOM). Besser: ein gestyltes Feld mit Copy-Button + klarer Sicherheitswarnung. (Verstößt zudem gegen die Projektregel, sensible Daten zu maskieren.)

5. **Fehler-Feedback über `alert()`.** Speichern-/Lösch-Fehler (`app.js:202,290,298`) nutzen native `alert()` — bricht den WhatsApp-Look, ist nicht stylebar und auf Mobile unangenehm. Inline-Fehlermeldungen (wie beim Login bereits vorhanden) wären konsistenter.

6. **Keine Tastatur-/Escape-Bedienung im Modal.** Modal schließt nur per Klick auf Overlay/×-Button (`app.js:322–323`), kein `Esc`-Listener, kein Fokus-Trap. Für ein häufig geöffnetes Detail-Modal ein spürbarer Komfort-/A11y-Mangel.

---

## Top-5-Prioritäten (höchster Impact zuerst)

1. **"Text kopieren"-Buttons einbauen** (Body / Footer / Button-Titel, mit Roh-`{{1}}`-Ausgabe).
   *Impact: Trifft den eigentlichen Kern-Use-Case (1:1-Nachbau in Superchat) — aktuell muss der Kunde fehleranfällig manuell markieren. Größter Nutzen-Hebel bei kleinem Aufwand.*
   → `app.js` `bubbleHtml`/`openModal`, neue Copy-Handler.

2. **Mobile/Tablet responsiv machen.**
   *Impact: Nur eine triviale Media-Query existiert; Zielgruppe nutzt das vermutlich oft am Handy. Topbar, Filter-Chip-Wand und Modal müssen Breakpoints für ~768px und ~375px bekommen; Filter in scrollbaren/einklappbaren Container.*
   → `styles.css` (Media-Queries ab `styles.css:109` erweitern), evtl. Filter-Collapse in `app.js:115`.

3. **Passwort-Handling fixen (Sicherheit + UX).**
   *Impact: Klartext-Passwörter via `alert()`/DOM verstoßen gegen Projektregeln und sind unbrauchbar zu handhaben. Ersetzen durch gestyltes Copy-to-Clipboard-Feld mit Warnhinweis.*
   → `app.js:277, 288–289`.

4. **Lade- & Fehlerzustände ergänzen** (Skeleton beim Boot, sichtbarer Galerie-Ladefehler, Inline-Fehler statt `alert()`).
   *Impact: Verhindert "weißer Bildschirm bei Fehler" und macht die App robust und vertrauenswürdig für zahlende, nicht-technische Kunden.*
   → `app.js:43 (loadData)`, `boot` `app.js:303`, Fehler-Handler `app.js:202,290,298`.

5. **Galerie-Visuals aufräumen** (Text-Hard-Cut beheben, leere Cover bei fehlendem Bild reduzieren/durch Text-Vorschau ersetzen, Karten-Höhen vereinheitlichen) **+ Button-Label-Mapping prüfen**, damit nie `quick_reply` roh erscheint.
   *Impact: Macht die zentrale Galerie-Ansicht professionell und behebt den Code-Leak-Befund aus ui-3.*
   → `styles.css:41,46`, `card()` `app.js:132`, `BTN_LABEL`-Vollständigkeit `app.js:95–96`.
