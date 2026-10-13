# Pixel Glyph Editor

En webbapp för att rita pixelbaserade typsnitt, med vektorformer ovanpå pixlarna, och exportera dem som SVG, PNG, UFO, TTF och WOFF. Varje tecken ritas på ett rutnät. Spacing justeras som i Glyphs, och text kan provas direkt i förhandsgranskningen medan du ritar.

Projektet är byggt utan ramverk. Det består av Web Components, ES-moduler och ren logik som går att testa utan webbläsare. Det enda beroendet är Vite, och bara som dev-server.

Målet är att vara det snabbaste sättet att börja på ett nytt pixeltypsnitt, och att på sikt kunna stå på egna ben utan Glyphs.

---

## Innehåll

1. [Kom igång](#1-kom-igång)
2. [Så använder du editorn](#2-så-använder-du-editorn)
3. [Grundbegrepp](#3-grundbegrepp)
4. [Arkitektur](#4-arkitektur)
5. [Filreferens](#5-filreferens)
6. [Exportformat i detalj](#6-exportformat-i-detalj)
7. [Algoritmer i korthet](#7-algoritmer-i-korthet)
8. [Lagring och backup](#8-lagring-och-backup)
9. [Tester](#9-tester)
10. [Kodkonventioner](#10-kodkonventioner)
11. [Utöka projektet](#11-utöka-projektet)
12. [Designbeslut](#12-designbeslut)
13. [Kända begränsningar](#13-kända-begränsningar)
14. [Felsökning](#14-felsökning)
15. [Idéer framåt](#15-idéer-framåt)

---

## 1. Kom igång

**Krav**

- Node 18 eller nyare (testerna använder `node --test`).
- En modern webbläsare. WOFF-komprimeringen använder `CompressionStream`, som finns i Chrome, Edge, Safari 16.4+ och Firefox 113+. Saknas den sparas WOFF-filen utan komprimering, vilket också är giltigt.

**Kommandon**

```bash
npm install        # installerar Vite (och Prettier)
npm run dev        # startar dev-servern, porten står i vite.config.js
npm test           # kör alla tester med node --test
```

**Produktion**

Det finns inget build-steg. Filerna fungerar som de är med `<script type="module">`. De måste serveras över HTTP, eftersom webbläsare blockerar ES-moduler från `file://`. Valfri statisk server räcker. `vite.config.js` sätter `base: './'`, så att relativa sökvägar fungerar var projektet än ligger.

**Mappar**

```
glyph-editor/
├── index.html
├── package.json            # "type": "module", skripten dev och test
├── vite.config.js          # endast dev-server
├── src/
│   ├── main.js             # importerar komponenterna i rätt ordning
│   ├── metrics.js          # UPM, guider, enheter per pixel
│   ├── components/         # Web Components (vyer och editorn)
│   ├── core/               # ren logik, inga DOM-beroenden
│   └── utils/              # kod som behöver webbläsar-API:er
└── tests/                  # tester för core/ och exportformaten
```

Mapparna `glyphs/` och `fonts/` fanns i den ursprungliga planen men används inte.

---

## 2. Så använder du editorn

### 2.1 Layout

Skärmen har tre kolumner:

| Kolumn | Innehåll |
|---|---|
| Vänster (glyphpanelen) | En ruta per tecken, 204 tecken i sju grupper. Ritade tecken visas som miniatyr. Kan stängas med `G` eller `close`. |
| Mitten | Verktygsraden (verktyg, former, brush, zoom), rutnätet, förklaring av guiderna, en notisrad, textförhandsgranskningen och spacing-panelen. |
| Höger (inställningar) | Rutnätsstorlek, aktuell glyph, export (margin och enskild fil) och projekt (fontnamn, UFO, SVG-zip, TTF, WOFF, webbpaket, backup). |

### 2.2 Verktyg

| Verktyg | Beskrivning |
|---|---|
| **pen** (`B`) | Drag ritar. Högerklick eller Shift suddar. Borsten är en kvadrat på 1–32 celler, och en grå markör visar var den hamnar. |
| **eraser** (`E`) | Suddar med vänsterklick. Suddgummit påverkar inte former. |
| **select** (`M`) | Klicka på en form för att markera den. Dra en rektangel för att markera pixlar och alla former som ligger helt inuti. |
| **shapes** (`S`) | Placerar rektangel, ellips, kvartscirkel, konkav hörnform eller triangel. Klick ger en cell, drag väljer storlek. Dras åt vänster eller uppåt speglas formen. |
| **clear** | Tömmer den aktuella glyphen: pixlar, former och spacing. Går att ångra. |
| **guides** | Visar eller döljer guidelinjerna. |

**Markeringar** (select-verktyget och formerna)

- Dra inuti en markering för att flytta den. Markeringen lyfts först vid första rörelsen, så ett vanligt klick ändrar ingenting.
- Dra i ett handle för att ändra storlek. Utan Shift är det fritt, med Shift behålls proportionerna. Dras handlet förbi motsatt sida speglas innehållet.
- Dra strax utanför ett hörn (18 px) för att rotera. Utan Shift är vinkeln fri, med Shift snappar den till 45°.
- Flytande pixlar är blå tills de placeras med Enter eller ett klick utanför. Esc återställer allt som det var.
- Pixlar och former i samma rektangel flyttas, skalas och roteras som en grupp. Hela ändringen är ett steg i ångra.

### 2.3 Genvägar

| Tangent | Funktion |
|---|---|
| `B` `E` `M` `S` | Pen, suddgummi, select, former |
| `[` `]` eller `-` `+` | Mindre och större borste |
| `,` och `.` | Föregående och nästa glyph |
| `G` | Visa eller dölj glyphpanelen |
| `T` | Flytta till textförhandsgranskningen (Esc lämnar den) |
| `F` | Anpassa rutnätet till fönstret |
| ⌘ eller Ctrl + scroll, eller nyp | Zooma rutnätet |
| ⌘Z, ⌘⇧Z (eller Ctrl+Y) | Ångra, gör om |
| ⌘C, ⌘V | Kopiera och klistra in markerade pixlar och former |
| Enter, Esc | Placera eller avbryt flytande markering. Esc avmarkerar också. |
| Delete eller Backspace | Ta bort markeringen |
| Piltangenter | Flytta markeringen en cell |
| `R` (Shift: motsols) | Rotera markeringen 90° |
| Shift vid placering av form | Kvadrat eller cirkel |

I fälten i spacing-panelen steppar ↑ och ↓ en hel pixel, med Shift en fontenhet. Enter bekräftar och Esc ångrar fältet.

På svenskt Mac-tangentbord kräver `[` och `]` Alt. Därför går borststorleken också att ändra med `-` och `+`.

### 2.4 Arbetsflöden

**Rita ett typsnitt**

1. Välj rutnätsstorlek i högerpanelen. Välj en storlek för hela teckensnittet, eftersom varje storlek har en egen uppsättning glyphs.
2. Välj en glyph i vänsterpanelen, eller stega med `,` och `.`.
3. Rita mot guiderna: baseline (röd), x-height (grön), cap-height (blå) och ascender och descender (grå).
4. Använd `copy to…` för att kopiera en ritning som bas till en annan glyph (`n` till `h`, `m` och `r`).
5. Följ resultatet i textförhandsgranskningen, som uppdateras medan du ritar.

**Spaca**

1. Skriv text med bokstäverna i förhandsgranskningen (`T`).
2. Klicka på en bokstav i texten. Den väljs, får en blå ruta och visas i spacing-panelen.
3. Ändra vänster och höger sidebearing, eller width, tills avstånden ser jämna ut. Förhandsgranskningen följer varje ändring.
4. En sida utan eget värde är automatisk och följer `margin`-inställningen. `reset` återställer en sida.

**Till Glyphs**

1. Klicka `save ufo`. Du får en zip.
2. Packa upp zippen och öppna mappen `<Namn>.ufo` i Glyphs (File → Open).

**Till webben**

1. Klicka `web font`. Du får en zip med `.woff`, `.ttf`, en `.css`-fil och en testsida.
2. Öppna `index.html` för att se fonten, eller kopiera filerna och CSS-regeln till ditt projekt.

**Säkerhetskopiera**

Allt sparas automatiskt i webbläsarens `localStorage`, men det försvinner om du rensar webbplatsdata. Klicka `backup` regelbundet. `restore` läser tillbaka en fil och ersätter allt i editorn.

---

## 3. Grundbegrepp

### 3.1 Rutnät och em-ruta

Rutnätet är hela em-rutan. Fem storlekar finns, och varje storlek har samma höjder i fontenheter.

| Rutnät | Fontenheter per pixel | Standardstorlek på skärmen (px per cell) | Mörkare linje var |
|---|---|---|---|
| 8×8 | 256 | 64 | 4 celler |
| 16×16 | 128 | 32 | 4 |
| 32×32 | 64 | 20 | 8 |
| 64×64 | 32 | 12 | 8 |
| 128×128 | 16 | 7 | 8 |

Zoomen ändrar bara visningen. Cellstorleken är ett helt antal CSS-pixlar mellan 4 och 128, och canvas blir aldrig större än 8192 bildpunkter. Varje rutnätsstorlek kommer ihåg sin zoom.

### 3.2 Metrics

UPM (units per em) är 2048. Guiderna är definierade i åttondelar av em-rutan, räknat uppifrån, så att de alltid hamnar på en radgräns.

| Guide | Åttondel | Fontenheter |
|---|---|---|
| ascender | 0 | 1792 |
| cap-height | 1 | 1536 |
| x-height | 3 | 1024 |
| baseline | 7 | 0 |
| descender | 8 | −256 |

Om du ändrar metrics i Glyphs måste `GUIDES_IN_EIGHTHS` i `src/metrics.js` ändras med dem. Font Info i Glyphs ska vara UPM 2048 med samma värden för att guiderna ska stämma.

### 3.3 Koordinatsystem

- **I editorn** räknas allt i rutnätsceller med origo uppe till vänster och y nedåt. En position är ett hörn mellan celler, från 0 till rutnätsstorleken.
- **I fontfilerna** är y uppåt med y = 0 på baseline. Omvandlingen är `y_font = (baselineRad − y) × enhet` och `x_font = x × enhet + förskjutning`.
- **Riktning på konturer:** spårade konturer är medurs på skärmen för yttre former. SVG och UFO vänder dem till moturs (PostScript-riktning). TTF behåller dem, och efter y-vändningen blir de medurs, som TrueType vill.

### 3.4 Glyph

En glyph har tre delar: `{ grid, shapes, spacing }`.

- `grid`: pixlarna, en `Uint8Array` (0 eller 1) per cell, `{ size, pixels }`.
- `shapes`: en lista med vektorformer.
- `spacing`: `{ left, right }`, sidebearings i fontenheter. `null` på en sida betyder automatisk.

I editorn har varje glyph dessutom en egen ångra-historik, som inte sparas.

### 3.5 Former

En form är `{ type, cx, cy, w, h, angle }`: centrum, storlek i celler och vinkel i radianer (medurs). Ett negativt `w` eller `h` speglar formen. Samma transform används för flytande pixlar.

| Typ | Utseende (i enhetskvadraten) |
|---|---|
| `rect` | Rektangel |
| `ellipse` | Ellips, fyra kubiska kurvor |
| `quarter` | Utbuktande kvartscirkel, rät vinkel uppe till vänster |
| `concave` | Rutan minus en kvartscirkel, så att bågen går inåt |
| `triangle` | Rät triangel, rät vinkel uppe till vänster |

Formerna ligger ovanpå pixlarna. De flyttas och ändras i hela celler, och bara rotationen är fri. Alla konturer går medurs på skärmen, så att överlappande konturer läggs ihop av nonzero-regeln. Suddgummit påverkar inte former. De tas bort med Delete.

### 3.5 Spacing

Alla exporter och förhandsgranskningen räknar spacing med samma funktion (`effectiveSpacing`):

```
bredd på glyphen (ink) = bredden på pixlar och former, i fontenheter
left   = eget värde, annars round(margin × enhet)
right  = eget värde, annars round(margin × enhet)
advance width = left + ink + right
```

Var bokstaven ritas i sidled i rutnätet spelar ingen roll. Exporten flyttar vänsterkanten till `left`. `margin` är en inställning per rutnätsstorlek (standard `max(1, storlek / 16)` pixlar, alltså 128 fontenheter).

Negativa sidebearings är tillåtna.

### 3.6 Urval, flytande markering och grupper

Select-verktyget arbetar med två sorters markering:

- **En form** (klick) har en egen ram som följer formens rotation. Formen ändras direkt, och ändringen är ett steg i ångra.
- **En rektangel** (drag) markerar pixlarna i den och alla former som ligger helt inuti. Vid flytt, storleksändring eller rotation lyfts pixlarna ut ur rutnätet och blir en **flytande markering** (`floating`). Formerna ligger kvar i glyphens lista och uppdateras från sitt ursprungliga läge varje gång ramen ändras (`transformShape`). Vid placering skrivs pixlarna tillbaka. Vid avbryt återställs hela glyphen från en ögonblicksbild.

Pixlar flyttas, skalas och roteras med inverterad avbildning (nearest-neighbor) från de ursprungliga pixlarna, så att ingen kvalitet går förlorad under pågående operation. Rotation i steg om 90° och heltalsskalning är förlustfria.

### 3.7 Ångra

Historiken lagrar ögonblicksbilder `{ pixels, shapes, spacing }` per glyph, högst 100 steg. Ett penndrag, en ny form, en ändring av en form, en placering och en spacing-ändring är ett steg var. Historiken sparas inte och försvinner vid omladdning.

### 3.8 Uppsättningar per rutnätsstorlek

Varje rutnätsstorlek har en egen uppsättning glyphs, en egen `margin`, ett eget fontnamn och en egen zoom. Att byta storlek byter uppsättning, och ingenting skalas om. Exporterna gäller den storlek som är vald.

### 3.9 Teckenuppsättningen

204 tecken i sju grupper (`glyph-set.js`), alltså ASCII utan mellanslag, `å ä ö`, accentbokstäver i Latin-1 och vanliga symboler:

| Grupp | Antal |
|---|---|
| Versaler A–Z | 26 |
| Gemener a–z | 26 |
| Siffror | 10 |
| Skiljetecken och symboler i ASCII | 32 |
| `å ä ö Å Ä Ö` | 6 |
| Accentbokstäver (`é ü ñ ç æ ø ß þ ÿ` m.fl.) | 56 |
| Fler symboler och skiljetecken (`€ £ ¿ ° « » – — ‘ ’ “ ” …` m.fl.) | 48 |

Mellanslag ingår inte, eftersom det saknar pixlar. Det läggs till automatiskt i UFO och fontfilerna med en tredjedels em som bredd.

Varje tecken har ett AGLFN-namn (`a`, `zero`, `aring`, `Euro`).

---

## 4. Arkitektur

### 4.1 Tre lager

| Lager | Mapp | Regel |
|---|---|---|
| Ren logik | `src/core/` | Inga DOM-beroenden. Allt går att köra och testa i Node. |
| Webbläsar-API:er | `src/utils/` | Canvas, `localStorage`, nedladdning, komprimering. |
| Gränssnitt | `src/components/` | Web Components med shadow DOM. |

### 4.2 Dataflöde

Editorn (`glyph-editor`) äger allt tillstånd. Övriga komponenter är vyer: de visar det de får via attribut eller en `source`-funktion, och skickar händelser tillbaka.

```
 användaren
    │
    ▼
 glyph-toolbar, glyph-settings, glyph-panel, glyph-preview, glyph-spacing
    │  CustomEvent (tool-change, size-change, glyph-pick, spacing-change, ...)
    ▼
 glyph-editor   ← tillståndet: uppsättningar, aktuell glyph, markering, historik
    │
    ├─► attribut på toolbar och settings
    ├─► source()-funktioner för panel, preview och spacing
    └─► canvas (draw)
    │
    ├─► core/  (rutnät, spårning, former, spacing, export)
    └─► utils/ (lagring, nedladdning, PNG, komprimering)
```

**När något ändras** anropar editorn `markChanged()`:

1. Glyphen noteras som ändrad.
2. Efter 300 ms sparas den i `localStorage` (`flushSaves`), och dess ruta i panelen ritas om.
3. På nästa animationsbild ritas förhandsgranskningen och spacing-panelen om (`requestPreview`).

### 4.3 Komponenter: attribut, anrop och händelser

| Komponent | Tar emot | Skickar |
|---|---|---|
| `glyph-toolbar` | Attribut: `tool`, `shape`, `guides`, `brush`, `zoom` | `tool-change`, `shape-change`, `brush-step`, `zoom-step`, `zoom-fit`, `clear`, `guides-toggle` |
| `glyph-settings` | Attribut: `size`, `glyph`, `glyph-name`, `panel`, `copy`, `margin`, `png-bg`, `font-name` | `size-change`, `glyph-step`, `panel-toggle`, `copy-start`, `margin-step`, `export` (svg, png), `png-bg-toggle`, `name-change`, `export-all` (ufo, svg, ttf, woff, web), `backup`, `restore` |
| `glyph-panel` | `source()` ger `{ current, copyMode, size, getGlyph }`. Metoder: `rebuild`, `refreshGlyph`, `highlight` | `glyph-pick`, `panel-close` |
| `glyph-preview` | `source()` ger `{ size, margin, current, getGlyph }`. Metoder: `refresh`, `getText`, `setText`, `focusText`, `blurText` | `glyph-pick` |
| `glyph-spacing` | `source()` ger `{ char, name, effective }`. Metoder: `refresh`, `blurInputs` | `spacing-change` |

Toolbaren och inställningspanelen har inget eget tillstånd. De ritar om sig själva när ett attribut ändras.

### 4.3 Editorns tillstånd (urval)

| Fält | Betydelse |
|---|---|
| `sets` | `Map` från rutnätsstorlek till `{ margin, name, glyphs: Map(tecken → { grid, shapes, spacing, history }) }`, laddas från `localStorage` första gången en storlek används |
| `size`, `currentChar` | Aktiv rutnätsstorlek och aktuell glyph |
| `tool`, `shapeType`, `brushSize` | Verktyg, vald form och borste |
| `selection`, `selectedShapes` | Markerad rektangel och index till markerade former |
| `floating` | Den lyfta markeringen (pixlar, former, ram, ursprungsläge och en ögonblicksbild att återgå till) |
| `clipboard`, `shapeClipboard` | Det senast kopierade |
| `dragMode`, `dragStart`, … | Pågående drag |
| `dirty`, `saveTimer` | Glyphs som väntar på att sparas |
| `cellSizes` | Zoom per rutnätsstorlek |

### 4.4 Sparande

Se [avsnitt 8](#8-lagring-och-backup).

---

## 5. Filreferens

### 5.1 Rot

| Fil | Innehåll |
|---|---|
| `index.html` | Sidan: `<glyph-editor>` och skriptet `src/main.js`. |
| `package.json` | `"type": "module"`, skripten `dev` och `test`, beroendet Vite. |
| `vite.config.js` | Dev-server och `base: './'`. |
| `.gitignore` | `node_modules`, `dist`, `.DS_Store`, `glyphs/`. |

### 5.2 `src/`

| Fil | Innehåll |
|---|---|
| `main.js` | Importerar komponenterna i rätt ordning, så att de är registrerade innan editorn skapar dem. |
| `metrics.js` | `UPM`, `unitsPerPixel(size)`, `getMetrics(size)` (guider som radgränser), `defaultMargin(size)`. |

### 5.3 `src/core/` (ren logik)

| Fil | Innehåll |
|---|---|
| `grid.js` | Rutnätet: `SIZES`, `createGrid`, `getPixel`, `setPixel` (säker utanför kanterna), `clearGrid`, `cloneGrid`, `isEmpty`, `resizeGrid`, `serializeGrid` och `deserializeGrid` (1 bit per pixel, base64), `stampBrush`, `drawLine` (Bresenham med borste), `extractRegion`, `pasteRegion` (lägger bara till), `clearRegion`, `pixelsEqual`. `resizeGrid` och `cloneGrid` används inte av editorn nu men är testade. |
| `history.js` | Ångra: `createHistory`, `pushState`, `undoState`, `redoState`. Hanterar ögonblicksbilder med pixlar, former och spacing. |
| `trace.js` | `traceGrid(grid)`: pixlar till slutna polygoner längs pixelkanterna, med hörnpunkter, area och en flagga för hål. |
| `transform.js` | Transformen `{ cx, cy, w, h, angle }`: `snapAngle`, `alignedCenter`, `toLocal`, `fromLocal`, `transformCorners`, `renderTransformed` (pixlar genom en transform), `resizeTransform`, `rotatedAngle`. |
| `shapes.js` | Formerna: `SHAPE_TYPES`, `shapeContour`, `reverseContour`, `flattenContour`, `shapeBounds`, `shapeContains`, `transformShape` (formen följer sin grupp). |
| `glyph.js` | Glyph-modellen: `noSpacing`, `cloneSpacing`, `sanitizeSpacing`, `inkBounds`, `asGlyph`, `glyphIsEmpty`, `glyphBounds`, `cloneShapes`, `sanitizeShapes`, `serializeGlyph`, `deserializeGlyph`. |
| `spacing.js` | `effectiveSpacing(glyph, size, margin)`: vänster, höger, bredd på glyphen och advance width. |
| `layout.js` | Textförhandsgranskningens layout: `spaceWidth`, `missingWidth`, `layoutText`. |
| `glyph-set.js` | `GLYPH_GROUPS` och `ALL_GLYPHS`. |
| `glyph-names.js` | `glyphName(tecken)` (AGLFN, annars `uniXXXX`) och `exportFileName(namn, ändelse)`. |
| `export-svg.js` | `buildSvg(grid, { margin, origin, shapes, spacing })`. |
| `export-ufo.js` | `buildUfo(glyphs, { familyName, size, margin })` och `safeFileName`. |
| `export-ttf.js` | `buildFont(glyphs, options)` (TrueType), `outlineGlyph`, `assembleSfnt`. |
| `quad.js` | `cubicToQuads`: kubiska kurvor till kvadratiska, för TrueType. |
| `binary.js` | `Writer` (skriver big-endian) och `checksum`. |
| `woff.js` | `buildWoff(tables, compress)`. |
| `web-font.js` | `fontBaseName`, `buildCss` och `buildSpecimen` (CSS och testsida för webbpaketet). |
| `zip.js` | `createZip` (utan komprimering) och `crc32`. |
| `backup.js` | `createBackup` och `parseBackup` (säkerhetskopia som JSON). |

### 5.4 `src/utils/` (webbläsar-API:er)

| Fil | Innehåll |
|---|---|
| `storage.js` | `localStorage` med felhantering: glyphs, margin, fontnamn, zoom, förhandsgranskningstext, panelens läge, `clearAll`. |
| `download.js` | `downloadBlob` och `downloadText`. |
| `export-png.js` | `gridToPngBlob`: pixlar och former till en PNG. |
| `paint-shapes.js` | `traceShapes` och `paintShapes`: former på en canvas. |
| `compress.js` | `deflate`: zlib via `CompressionStream` för WOFF. |

### 5.5 `src/components/`

| Fil | Innehåll |
|---|---|
| `glyph-editor.js` | Huvudkomponenten: rutnätet, all pekarlogik, urval, flytande markering, tangentbordsgenvägar, glyph-modellen, autosave, kopiering, zoom och alla exportanrop. Den största filen. |
| `glyph-toolbar.js` | Raden ovanför rutnätet: verktyg, formmenyn, brush och zoom. |
| `glyph-settings.js` | Högerpanelen: rutnätsstorlek, glyph, export och projekt. |
| `glyph-panel.js` | Vänsterpanelen med en ruta per tecken och miniatyrer. |
| `glyph-preview.js` | Textrutan och canvas med den formsatta texten. Ett klick på en bokstav väljer glyphen. |
| `glyph-spacing.js` | Spacing-panelen med vänster, höger och bredd. |

### 5.6 `tests/`

| Fil | Testar |
|---|---|
| `grid.test.js` | Rutnätet, borste, linjer, regioner, serialisering |
| `history.test.js` | Ångra och gör om, ögonblicksbilder |
| `metrics.test.js` | Guider och enheter |
| `trace.test.js` | Konturspårning: hål, flera delar, diagonala pixlar, slumpade rutnät |
| `transform.test.js` | Transformer, storleksändring, rotation |
| `shapes.test.js` | Formernas konturer, begränsningar och gruppnedskalning |
| `glyph.test.js` | Glyph-modellen och spacing i sparad data |
| `spacing.test.js` | Spacing-beräkningen |
| `layout.test.js` | Textlayouten |
| `glyph-names.test.js` | AGLFN-namn och filnamn |
| `glyph-set.test.js` | Teckenuppsättningen, att varje tecken har ett namn och att filnamn är unika |
| `export-svg.test.js` | SVG-exporten |
| `export-ufo.test.js` | UFO-exporten |
| `export-ttf.test.js` | TTF: tabeller, checksummor, cmap, bredder, konturer, kurvor, namn |
| `quad.test.js` | Kurvkonverteringen |
| `woff.test.js` | WOFF-behållaren |
| `web-font.test.js` | CSS och testsida |
| `zip.test.js` | Zip-skrivaren |
| `backup.test.js` | Säkerhetskopian |
| `font-reader.js` | Hjälpfil (ingen test): läser tillbaka tabeller ur de fonter testerna bygger |

---

## 6. Exportformat i detalj

| Format | Knapp | Innehåll |
|---|---|---|
| **SVG** | `save svg`, `all svg` | En fil per glyph, `fill-rule="nonzero"`, vänsterkant på vänster sidebearing, bredd = advance width. |
| **PNG** | `save png` | Pixlar och former, utan guider. Varje cell blir ett helt antal bildpunkter (`floor(512 / storlek)`), transparent eller vit bakgrund. |
| **UFO** | `save ufo` | Zip med en `<Namn>.ufo`-mapp (UFO 3). |
| **TTF** | `save ttf` | TrueType-font för alla ritade glyphs. |
| **WOFF** | `save woff` | Samma font som WOFF 1.0. |
| **Webbpaket** | `web font` | Zip med `.woff`, `.ttf`, `.css` och `index.html`. |

**Filnamn.** Glyphnamnet blir filnamnet. Stora bokstäver får ett understreck efter sig (`A_.svg`, `A_dieresis.svg`), eftersom `A` och `a` annars är samma fil på macOS.

### SVG

- `viewBox="0 -1792 W 2048"`: origo ligger på baseline och allt ovanför har negativt y. `buildSvg` har också alternativet `origin: 'top'`, som editorn inte använder.
- Konturer från pixlar skrivs med `M`, `H`, `V` och `Z`. Former skrivs med `C` (kurvor) och `L`.
- Koordinaterna är avrundade heltal i fontenheter.

### UFO

- Filer: `metainfo.plist`, `fontinfo.plist` (UPM, metrics, familjenamn), `layercontents.plist`, `lib.plist` (glyph-ordning), `glyphs/contents.plist` och en `.glif`-fil per glyph.
- Pixlar blir punkter med typen `line`. Former blir `line` och `curve`, med `smooth` för ellipsens övergångar.
- `space` läggs till som en tom glyph.
- Y är uppåt, och yttre konturer går moturs.

### TTF

- **Tabeller:** `OS/2` (version 4), `cmap`, `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name`, `post`.
- **Glyphs:** `.notdef` (en ruta), `space`, och alla ritade glyphs. Hårt mellanslag (U+00A0) pekar på `space`.
- **cmap:** format 4, med både Unicode- och Windows-kodningen. Alla tecken ligger i det grundläggande planet.
- **Outlines:** pixlar är räta linjer. Former konverteras från kubiska till kvadratiska kurvor med högst en halv fontenhets avvikelse. Första flaggan i varje glyph markerar överlappande konturer.
- **Namn:** familj, `Regular`, unikt namn, fullt namn, version och ett PostScript-namn av bokstäver och siffror. Bara Windows-namn skrivs.
- **Metrics:** ascender 1792 och descender −256 i både `hhea` och `OS/2` (med flaggan "use typo metrics"), `lineGap` 0, x-height 1024 och cap-height 1536.
- **Unicode-block** i `OS/2` sätts efter vilka tecken som finns.
- **Inte med:** hinting, kerning och OpenType-funktioner.

### WOFF

Samma tabeller som TTF, var och en zlib-komprimerad om det blir mindre. Komprimeringen skickas in som en funktion: webbläsaren använder `CompressionStream('deflate')` och testerna använder Nodes `zlib`.

### Webbpaket

`buildCss` skriver `@font-face` med WOFF först och TTF som reserv, `font-display: swap`, och klassen `.pixel-font`. Kommentaren i CSS-filen förklarar att `font-size` bör vara en multipel av rutnätet (32px, 64px, 96px på 32×32), så att varje pixel täcker ett helt antal skärmpixlar och kanterna blir skarpa. `buildSpecimen` bygger en testsida som visar texten i tre storlekar.

---

## 7. Algoritmer i korthet

**Konturspårning** (`trace.js`). Varje fylld pixel bidrar med de sidor som gränsar mot en tom pixel, riktade medurs runt pixeln. Kanterna länkas sedan till slutna loopar. Eftersom filled-sidan alltid är på samma hand blir yttre konturer medurs och hål moturs. Vid hörn där två pixlar bara möts diagonalt väljer spårningen alltid högersväng, vilket gör att de blir separata former. Räta sträckor slås ihop, så konturerna har bara hörnpunkter.

**Transformer** (`transform.js`). En ram är `{ cx, cy, w, h, angle }`. Pixlar renderas genom den med inverterad avbildning: varje målpixel slår upp sin källpixel (nearest-neighbor). Om ramen får ett helt antal celler (vinklarna 0°, 90°, 180°, 270°) flyttas centrum upp till en halv cell, så att ramen hamnar exakt på rutnätet. Då blir de rotationerna förlustfria.

**Storleksändring** (`resizeTransform`). Kanten mittemot handlet ligger still. Dras handlet förbi den vänds innehållet. Längderna avrundas till hela celler. Med Shift skalas båda sidor lika mycket.

**Former i grupper** (`transformShape`). Gruppens ram går från sitt ursprung till sitt nya läge: skalning kring centrum, rotation, flytt. En form får nytt centrum, nya längder längs sina axlar och ny vinkel. Det är exakt för former som är vridna i steg om 90°. För andra vinklar kan en ojämn skalning inte representeras, eftersom formen skulle bli sned, så formen sträcks längs sina egna axlar.

**Textlayout** (`layout.js`). Varje glyph flyttar skrivpositionen med sin advance width. Mellanslag är en tredjedels rutnät, och tecken utan ritning blir en grå ruta på halva rutnätet. En ny rad börjar vid x = 0 med rutnätshöjden plus en åttondel som radavstånd.

**Kurvkonvertering** (`quad.js`). En kubisk kurva ersätts av en kvadratisk vars kontrollpunkt är `(3(c1 + c2) − p0 − p3) / 4`. Är avvikelsen större än toleransen delas kurvan på mitten och varje halva konverteras för sig. En kvartscirkel blir fyra kvadratiska kurvor vid vanliga storlekar.

**TTF-sammansättning** (`export-ttf.js`). Tabellerna byggs med `Writer`, sorteras efter tagg och paddas till hela ord. Tabellkatalogen får varje tabells checksumma, och `checkSumAdjustment` i `head` räknas ut så att hela filen summerar till `0xB1B0AFBA`.

**Zip** (`zip.js`). Filer lagras utan komprimering. Rubriker och checksummor (CRC-32) skrivs för hand. Filnamnen är UTF-8.

---

## 8. Lagring och backup

Allt som ändras sparas i `localStorage` efter 300 ms, när sidan lämnas och när editorn tas bort ur sidan. Tomma glyphs sparas inte. Nycklarna börjar med `glyph-editor:v1:`.

| Nyckel (efter prefixet) | Innehåll |
|---|---|
| `<storlek>:<tecken>` | En glyph som JSON: `{ size, bits, shapes?, spacing? }`. Former och spacing skrivs bara om de finns. |
| `<storlek>:margin` | Automatisk marginal i pixlar |
| `<storlek>:name` | Fontnamnet |
| `<storlek>:zoom` | Cellstorlek på skärmen |
| `text` | Texten i förhandsgranskningen |
| `panel-open` | Om glyphpanelen är öppen |

**Storlek:** ett alfabet på 128×128 blir ungefär 570 KB av de ca 5 MB som webbläsaren ger. Misslyckas en sparning visar notisraden ett meddelande.

**Äldre data** utan former eller spacing läses som glyphs utan dem.

**Backup** (`backup.js`) är en JSON-fil:

```json
{
  "format": "pixel-glyph-editor-backup",
  "version": 1,
  "savedAt": "2026-10-12T10:00:00.000Z",
  "text": "Hamburgefonstiv",
  "sets": {
    "32": {
      "margin": 2,
      "name": "Pixel Font",
      "glyphs": { "a": { "size": 32, "bits": "…", "shapes": [], "spacing": { "left": 150, "right": null } } }
    }
  }
}
```

Backupen innehåller alla rutnätsstorlekar, men inte ångra-historik, zoom eller panelens läge. Vid återställning kontrolleras formatet, och glyphs som är skadade, har fel storlek eller inte hör till teckenuppsättningen hoppas över. Allt som fanns i editorn ersätts efter en bekräftelse.

---

## 9. Tester

```bash
npm test                              # alla tester
node --test tests/export-ttf.test.js  # en fil
```

Testerna använder `node:test` och `node:assert/strict`, utan externa beroenden. Allt i `core/` testas utan webbläsare. Komponenterna och `utils/` testas inte automatiskt, eftersom de kräver en webbläsare.

Mönster som återkommer:

- **Slumpade rutnät** med fast frö, som kontrollerar invarianter (till exempel att konturernas areor summerar till antalet pixlar).
- **Läs tillbaka det som skrevs.** Fontfilerna läses av `font-reader.js`, och zip-filen av en liten läsare i `zip.test.js`.
- **Samma regler i alla exporter.** SVG, UFO och TTF testas mot samma exempel: vänsterkant, bredd och riktning.

**Extern kontroll.** Fontfilerna har dessutom kontrollerats utanför projektet med fontTools (läser alla tabeller, ritar alla glyphs) och OpenType Sanitizer (OTS, det som Chrome och Firefox använder för att godkänna webbfonter). Du kan göra samma sak:

```bash
pip install fonttools opentype-sanitizer
python3 -c "from fontTools.ttLib import TTFont; f = TTFont('Pixel-Font.ttf'); print(f.getGlyphOrder())"
python3 -c "import ots; print(ots.sanitize('Pixel-Font.ttf', '/tmp/out.ttf', capture_output=True, check=False).stdout)"
```

---

## 10. Kodkonventioner

- Inga ramverk och inga runtime-beroenden.
- Formatering med Prettier (se `.prettierrc`).
- JSDoc på varje funktion och metod, med `@param` och `@returns`. Kommentarer i koden är på engelska.
- Web Components: `class X extends HTMLElement`, `attachShadow({ mode: 'open' })`, `connectedCallback()` anropar `render()` och `setUpEventListeners()`, och `customElements.define(...)` sist i filen. Mallen och stilarna ligger i en sträng i `render()`.
- Komponenter utanför editorn har inget eget tillstånd. De visar attribut eller `source()`-funktioner och skickar `CustomEvent`.
- `core/` får inte importera något från `components/` eller `utils/`, och inget som kräver `window` eller `document`.
- Samma beräkning på ett ställe. Spacing räknas bara i `spacing.js`, enheter i `metrics.js`, glyphnamn i `glyph-names.js`.
- Tester ligger i `tests/` med samma namn som filen de testar.

---

## 11. Utöka projektet

**Lägga till en rutnätsstorlek**

1. Lägg storleken i `SIZES` i `grid.js`.
2. Lägg till standardstorlek på skärmen i `CELL_PX` och mörkare linjer i `MAJOR_EVERY` i `glyph-editor.js`.
3. Kontrollera att `2048 / storlek` är ett heltal (annars blir fontenheterna bråktal) och att storleken är delbar med 8, eftersom guiderna är åttondelar.
4. Lägg en knapp i `glyph-settings.js`.

**Lägga till tecken**

Lägg dem i rätt grupp i `glyph-set.js` och ett AGLFN-namn i `glyph-names.js`. `glyph-set.test.js` fångar tecken som saknar namn eller ger dubbla filnamn. TTF-exporten klarar bara tecken i det grundläggande Unicode-planet (upp till U+FFFF).

**Lägga till en form**

1. Lägg typen i `SHAPE_TYPES` och dess kontur i `UNIT_CONTOURS` i `shapes.js` (medurs på skärmen, i enhetskvadraten).
2. Lägg till träfftestet i `shapeContains`.
3. Lägg en knapp med en liten SVG-ikon i `SHAPES` i `glyph-toolbar.js`.
4. Exporterna och förhandsgranskningen följer med automatiskt, eftersom de bara använder `shapeContour`.

**Lägga till ett exportformat**

1. Skriv en ren funktion i `core/` som tar glyphs (`{ char, grid, shapes, spacing }`) och inställningarna (`size`, `margin`) och returnerar text eller bytes. Använd `effectiveSpacing` för bredd och position.
2. Lägg ett anrop i `exportAll` i `glyph-editor.js` och en knapp i `glyph-settings.js`.
3. Skriv tester som läser tillbaka resultatet.

**Lägga till ett fält i en glyph**

Följ vägen som `spacing` tog: `glyph.js` (klona, kontrollera, serialisera), `history.js` och `snapshot` i editorn (ångra), `backup.js`, och sedan visningen.

---

## 12. Designbeslut

| Beslut | Skäl |
|---|---|
| Inget ramverk | Editorn är en canvas och en exportfunktion, inte komplex tillståndshantering. Ett ramverk skulle bara tillföra overhead. |
| Ren logik i `core/` | Den känsligaste koden (spårning, transformer, fontformat) går att testa utan webbläsare. |
| En uppsättning glyphs per rutnätsstorlek | Rutnäten är ritytor. Det finns ingen sund omräkning mellan dem, och en font ritas på en storlek. |
| Bokstavens position i sidled spelar ingen roll | Exporterna normaliserar vänsterkanten till vänster sidebearing. Det tar bort allt mätande i editorn. |
| Spacing i fontenheter | Samma tal som i Glyphs. Piltangenter steppar en hel pixel, eftersom det är det som oftast är rätt i en pixelfont. |
| Former som vektorlager ovanpå pixlarna | De får exakta kurvor i exporten och kan flyttas, skalas och roteras utan att förlora något. |
| Nonzero-regeln och överlappande konturer | Pixlar och former kan läggas på varandra utan att hål uppstår. Rent överlapp kan tas bort i Glyphs. |
| UFO som väg in i Glyphs | Hela fonten på ett klick. SVG per glyph fungerar men kräver att varje fil dras in för sig. |
| Egen zip- och fontskrivare | Håller projektet beroendefritt. |
| WOFF 1.0, inte WOFF2 | WOFF2 kräver Brotli, som webbläsarna inte har inbyggt för det här. Skillnaden i storlek är liten för en pixelfont. |
| TTF före OTF | Kvadratiska kurvor med en halv fontenhets avvikelse är osynliga, och en CFF-skrivare är mycket ny kod. OTF är uppskjutet. |

---

## 13. Kända begränsningar

- **Ingen kerning och inga OpenType-funktioner** (ligaturer och liknande). Spacing är bara sidebearings. Kerning görs i Glyphs.
- **Ingen hinting.** Skarpa kanter fås genom att välja en `font-size` som är en multipel av rutnätet.
- **Fasta teckenuppsättningen.** 204 tecken. Ett tecken utanför den kan inte ritas.
- **Mellanslagets bredd** är fast (en tredjedels rutnät). Den går att justera i Glyphs.
- **Radavstånd och version** i fonten har ingen knapp. `lineGap` och `version` finns som alternativ i `buildFont`.
- **Gruppskalning av vridna former.** Se avsnitt 7: exakt i steg om 90°, annars approximativ vid ojämn skalning.
- **Formerna väljs bara om de ligger helt inuti markeringsrektangeln.**
- **En kvadratisk borste.** Det finns ingen rund borste.
- **Lagringen är bara webbläsarens `localStorage`.** Den försvinner om webbplatsdata rensas. Använd `backup`.
- **Ångra sparas inte.**
- **Pixlar utanför rutnätet klipps** när en flytande markering placeras.
- **Mycket små markeringar** (en eller två celler på 128×128) har handles som täcker nästan hela ytan. Använd piltangenterna.
- **Svenskt tangentbord:** `[` och `]` kräver Alt, så borsten har även `-` och `+`.

---

## 14. Felsökning

| Problem | Orsak och lösning |
|---|---|
| Sidan är helt vit | Ett fel i en modul. Öppna konsolen. Vanliga orsaker är en dubbel import (`Identifier … has already been declared`) eller en import som saknas. |
| `this.spacingPanel.refresh is not a function` | `glyph-spacing.js` är inte importerad i `src/main.js`, före editorn. |
| `favicon.ico` 404 | Ofarligt. |
| Allt är borta efter att jag rensat webbplatsdata | Återställ från en backup. Spara en backup efter varje arbetspass. |
| Genvägarna fungerar inte efter att jag skrivit i ett fält | Klicka på rutnätet. Fälten släpper tangentbordet vid klick, Enter och Esc. |
| WOFF-filen är lika stor som TTF-filen | Webbläsaren saknar `CompressionStream`, och tabellerna sparades utan komprimering. Filen är ändå giltig. |
| Fonten laddas inte på en webbsida | Kontrollera i Nätverk-fliken att `.woff` hämtas, att sökvägen i CSS stämmer och att servern skickar rätt filer. En ogiltig font ignoreras tyst av webbläsare. Kontrollera filen med OTS (se avsnitt 9). |
| Kanterna ser ojämna ut i webbläsaren | `font-size` är inte en multipel av rutnätet. |
| Guiderna stämmer inte med Glyphs | Font Info i Glyphs är inte UPM 2048 med metrics enligt avsnitt 3.2. |

---

## 15. Idéer framåt

- **OTF (CFF)**: exakta kubiska kurvor. Bedömt som överkurs eftersom TTF och WOFF räcker för användningen.
- **Kerning** och OpenType-funktioner, så att fonten kan användas utan Glyphs.
- **Inställningar för radavstånd, version och mellanslagets bredd** i gränssnittet.
- **Subtract-form:** en form som klipper bort pixlar och andra former.
- **Fler former** 
