# Chess Crossing. Visual specification

Internal document. Governs the frame, the room, the board and the page. Where this file and `docs/bible.md` differ, the bible is right and this file is corrected. Three points depart from the working brief in the bible's favour; each is marked *(canon)*.

Units. The stage is designed at 1600 by 900 reference pixels ("rpx") and scales with the viewport. `1rem` is the root font size, which the frame module sets to stage height ÷ 50 (18 px on a 900-px stage). Percentages are of stage width (x) and stage height (y).

---

## 1. Composition laws

1. **Planimetric only.** The camera stands square to the north wall of Room 1 at a seated man's eye height. Every object is drawn in true elevation, or, for the two inserts, in true plan. No three-quarter view, no isometric, no vanishing point. A `rotateX`, `perspective` or `skew` in the code means the frame is broken.
2. **The stage is 16:9** *(canon; the brief offered 16:10 or 3:2)*. Reasons to hold it: the page needs 30 per cent of the width for six typed columns and a move list at readable size; 16:9 letterboxes with the thinnest bars on the screens most players own; and it is the shape of the intertitle the game imitates. The stage scales uniformly (`min(vw/1600, vh/900)`), centred, on a matte of Iron Gall `#202834`: a made thing on an inked ground. It never crops, reflows or stretches, at any viewport.
3. **Centred subject.** The scene (x 0–70) has one axis, x = 35. The Tariff Board, desk, board, both chairs and Mr Halm sit on it. The page (x 70–100) has its own axis at x = 85, used by its head only.
4. **Symmetry with one asymmetry.** Room 1 is symmetrical about the Tariff Board except for the greatcoat on the west hook. No object, indicator, cursor or notice may add a second asymmetry.
5. **Transitions are lateral moves and whip pans, nothing else.** A lateral move is a horizontal translate of the scene plane; a whip pan is a fast one. No fades, dissolves, zooms or wipes between shots. Cards cut. Inserts cut. In phase one the only pan is from the chapter card into Room 1 (section 11).
6. **Inserts.** Two, both overhead, orthogonal, framed by a 1-rpx Iron Gall hairline, no shadow: the board while play is on; the tray for two seconds when a piece is placed in it, and while it is hovered. Nothing else is seen from above. Dossiers are cards laid on the page, not inserts.
7. **Rendering.** Flat fills. A uniform 1-rpx Iron Gall outline on every object. One flat shadow per object, cast straight down: a 1-rpx Iron Gall line along its lower edge, hard, and nothing deeper. No gradients except paper grain: SVG `feTurbulence` (baseFrequency 0.9, 2 octaves) over Boxwood at 4 per cent opacity, on the page and index cards only. No blur, no glow, no translucency except the ink tints in section 2.

---

## 2. Palette

### Room 1

Six colours, each carried by an object, and no others, including hover, focus, selection and error states.

| Token | Name | Hex | Carries |
|---|---|---|---|
| `--c-wall` | Service Green No. 3 | `#6E7D69` | wall; greatcoat; tin tray; steel cabinet; Mr Halm's tunic |
| `--c-wood` | Marle Oak | `#5A4530` | desk, floor, doors and frames, chairs, the board's frame |
| `--c-light` | Boxwood | `#D8BE8C` | light squares, white pieces, index cards, page ground, Tariff Board face, clock faces, labels, and all brass (rail, line, hooks, buttons, ring, stamped letters) |
| `--c-dark` | Macassar Ebony | `#2B1F19` | dark squares, black pieces, stove, typewriter body |
| `--c-wax` | Seal Wax | `#A0281E` | the six NILs, tray stencil, DETAINED stamp, stove grate, chapter-card ground, index-card head rule |
| `--c-ink` | Iron Gall | `#202834` | all type, clock hands, every outline and shadow line, the matte, night in the window |

Brass is Boxwood outlined. Glass shows what is behind it. Mr Halm's head is Boxwood, without features.

**Ink tints.** The only translucency permitted is Iron Gall over Boxwood at a stated opacity: the faint lower-case *e* (section 9), the last sentence of a locked door's caption (12), the input placeholder (10), pencil additions on dossiers (8), card rules. Wear is Boxwood over Marle Oak at 18 per cent (path S-4). No tints of Seal Wax or Service Green.

**Contrast (WCAG 2).**

| Pair | Ratio | Verdict |
|---|---|---|
| Iron Gall on Boxwood (text on paper) | 8.25 : 1 | AAA at all sizes |
| Iron Gall on Service Green (text on wall) | 3.39 : 1 | large type only; therefore **no type is ever set directly on the wall**. Labels, the hours card and the Tariff Board carry type on Boxwood. |
| Boxwood on Ebony (board light on dark, solid; coordinates on frame) | 8.89 : 1 | passes |
| Boxwood on the hatched dark square (section 6) | 2.14 : 1 | acceptable for a white piece, which also has its outline (3.86 : 1 against the hatch) |
| Ebony piece on the hatched dark square | 4.15 : 1 | passes for a shape |
| Seal Wax on Boxwood (NIL, stamp) | 4.14 : 1 | passes at 0.6rem and above |
| Form White on Seal Wax (cards) | 6.67 : 1 | passes |
| Iron Gall outline on Marle Oak | 1.65 : 1 | weak; oak objects read by silhouette against the wall (2.06 : 1) and the hover outline. Accepted. |

### Global ink and paper

`--ink` Iron Gall `#202834`, every room, every outline, the matte. `--paper` Form White `#F5F2EB`, the Ministry's stock: title-card type, the page in rooms without Boxwood, the line on the bridge deck. Not used inside Room 1.

### Later chapters, proposed, six to a room, Iron Gall always the sixth

- **II. Kitchen.** Service Green `#6E7D69`, Range Iron `#2B1F19`, Cup Enamel `#E8E1D2` (Cups, 4. Saucers, 3.), Kettle Copper `#9C5A33`, Dresser Oak `#5A4530`.
- **III. Keeper's Office.** Service Green, Marle Oak, Ledger Buff `#C9B99A` (28 volumes), Keeper's Ink `#35507A` (the Daily Traffic Ledger, in ink), Ruling Red `#A0281E`.
- **IV. Stair and Landing.** Service Green dado, Distemper Cream `#DDD4BE` above it, Tread Oak `#5A4530`, Hook Brass `#D8BE8C` (A., I., T., M.), Barometer Glass `#9AA5A8`.
- **V. Parlour.** Service Green, Marle Oak, Bakelite `#3D2A22` (wireless, gramophone), Sleeve Yellow `#D6B24C` (5-11), Cloth Grey-Blue `#7C8C99` (5-14, 1943).
- **VI. Children's Room.** Service Green (the chalk line under it, a 1-rpx Iron Gall hairline), Bed Enamel `#E6E0D1`, Card Buff `#D8BE8C`, Pencil `#6E6C66`, Marle Oak.
- **VII. Sickroom.** Service Green, Walnut `#4A2F26` (wardrobe, contents none), Bottle Brown `#5C3A1E` (fourteen), Sheet `#EFEAE0`, Boxwood (pocket set).
- **VIII. Lookout.** Limewash `#D7D2C4` (the tower is not distempered), Lamp Brass `#D8BE8C`, Suitcase Leather `#7A4A2A` (S-1), Field Grey `#9AA5A8`, Seal Wax (the lens).
- **IX. Bonded Store.** Cellar Stone `#6F6A60`, Crate Deal `#B89A6A` (1931/4), Boxwood, Macassar Ebony (the billets), Bond Wax `#A0281E`.
- **X. Bridge.** Bridge Stone `#8C857A`, Form White (the line), Deck Grass `#7B8A4E`, March Sky `#B9BFC0`, Marle Oak (the nailed door outside).
- **XI. Field.** Cleared Ground `#A08F6C`, Sign Enamel `#3F5F82`, Hedge `#5D6E45`, Stone Grey `#8E8B80` (Stone 0), March Sky.
- **XII. River, Where It Is Now.** Lisk `#4F6B73`, Prefab Grey `#C4C7C3`, Gauge White `#F5F2EB` with Seal Wax graduations, Reed `#8A8F5C`, March Sky.

---

## 3. Typography

**Jost** (Google Fonts), 400, 500 and 400 italic only: `Jost:ital,wght@0,400;0,500;1,400`. `font-feature-settings: "tnum"` wherever figures align. No 300, no 700, no synthetic bold.

| Use | Weight | Size | Tracking | Case | Alignment |
|---|---|---|---|---|---|
| Card line 1 (REPUBLIC OF VARDENNE) | 500 | 2.0rem | 0.24em | upper | centred |
| Card ministry line | 500 | 1.1rem | 0.20em | upper | centred |
| Card form line | 500 | 1.4rem | 0.18em | upper | centred |
| Card body | 400 (labels 500) | 0.9rem | 0.02em | sentence | centred, max 34em |
| Chapter numeral | 500 | 3.2rem | 0.10em | upper | centred |
| Chapter room line (ROOM 1) | 500 | 1.1rem | 0.30em | upper | centred |
| Chapter title | 500 | 1.6rem | 0.20em | upper | centred |
| Chapter one-line | 400 | 0.9rem | 0.02em | sentence | centred, max 30em |
| Page head | 500 | 0.7rem | 0.12em | upper | left |
| Column heads | 500 | 0.6rem | 0.10em | upper | left |
| Caption columns | 400 | 0.7rem | 0 | as typed | left, ragged |
| Annotation, ledger rows | 400 | 0.8rem | 0 | as typed | left, ragged, tnum |
| Narrator | 400 | 0.85rem | 0 | as typed | left, ragged |
| Player's words | 400 italic | 0.85rem | 0 | as typed | left |
| Dossier title / body / roster line | 500 / 400 / 500 | 0.85 / 0.75 / 0.55rem | 0 / 0 / 0.14em | as typed / as typed / upper | left |
| Board coordinates | 500 | 0.55rem | 0.05em | a–h, 1–8 | centred in band |
| NIL / stencil / stamp | 500 | 1.0 / 0.75 / 0.6rem | 0.12em | upper | as placed |
| Cabinet labels, hours card | 400 | 0.5rem | 0.02em | as typed | left |

Line-height 1.5 for running text, 1.2 on cards. Uppercase only where the table says so. The narrator, captions, ledger and dossiers are never uppercased. No small caps. Nothing is justified: a typewriter cannot, and the cards are centred.

**Serif for letters and books: Libre Caslon Text** (400, 400 italic). It appears only inside objects: Ida's note in the pantry book, the 1943 Sallenau edition, correspondence in later rooms. A Vardenne book of 1943 would be set in a Continental text face; a Caslon reads as printed matter, holds at 0.85rem on screen, and is not a magazine face. Didot-likes would be caricature. Nothing in Room 1 uses it *(canon)*.

**Typewriter face** *(canon)*. The bible sets the typed columns in Jost regular; the typewriter is a behaviour (character-by-character arrival, tabular figures, the faint *e*, the stamp), not a font. Ledger and dossiers are Jost 400. A monospaced face is chosen and reserved: **Courier Prime** (400), for later rooms where archived typescript is shown as an object (a 1963 ledger page in Room 3, the Club charter in Room 6). It is an undistressed Courier of even weight; "distressed typewriter" fonts are the pastiche the brief forbids. Not loaded in phase one.

---

## 4. Title sequence

Ground Seal Wax, full stage. Type Form White. Each card is held for a count of four: 4000 ms. Cards cut in and out except the first, which fades up from the matte over 600 ms, the only fade in the game. A click or key advances. Nothing on a card moves.

**Card 1.** Two blocks, vertically centred, 0.8rem apart.

> REPUBLIC OF VARDENNE
> MINISTRY OF WAYS AND FRONTIERS. FRONTIER PROPERTY DIVISION
>
> FORM F.P. 22. SCHEDULE OF CONTENTS
> Taken under Regulation 40 on the vacation of a hereditary post, before the property is let, sold or demolished.

**Card 2.** Body lines, labels in 500, a block 34em wide centred on the stage, lines left-aligned within it.

> Property: Frontier Post No. 7 (Marle-on-Lisk), known locally as the Crossing.
> Post vacated: 2 March 1977.
> Schedule taken: 11 to 14 March 1977.
> Taken by: E. Prell, Inspector of Frontier Property, Grade II.
> Present: M. Ostrow, for the Household, reading item numbers. W. Halm, Customs Officer Second Class, Helder Confederation Frontier Guard, by invitation of the Household. Mrs I. Ostrow, Sallenau, written to. Did not attend.
> Rooms scheduled: 11, in the order the form requires, cellar excepted. Items: 611.
> Schedule B (Bonded Store): not located.
> Supplementary Schedule (S-1 onward): open.
> Disposition of property: Pending. Let from 15 March 1977 to E. Prell under Regulation 44.

Card 2 cannot be read in four seconds. Accepted: the header is repeated at the head of the page, where it can be read at leisure. The header's Columns line becomes the page's column heads; the third-hand line ("Persons present, continued …") is typed onto the page as the first annotation when the room arrives.

**Card 3.**

> I.
> ROOM 1
> THE DECLARATIONS ROOM
>
> Goods were declared here until 1961; chess has been played here since 1949. The board sits on the desk across the declarations line.

Held 4000 ms, then the whip pan into the room. 12.6 s in all, or three clicks.

---

## 5. Room one layout

Scene x 0–70 (0–1120 rpx). Page x 70–100. A 1-rpx Iron Gall hairline at x = 70 is the page's edge.

```
x%  0    5    10   15   20   25   30   35   40   45   50   55   60   65   70   75   80   85   90   95  100
    +----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+  0
    |D13 |W|c|d|      CLK-L      [   TARIFF BOARD   ]      CLK-R      |h|  D14  | D15 || HEAD  property / date |  5
    |    |I|o|1|                 [ spirits     NIL  ]                 |k|       |     || ----------------------- |
    |    |N|a|2|                 [ tobacco     NIL  ]                 | |       |     || CAPTION   six columns   | 10
    |    | |t| |                 [ timber      NIL  ]      [ CAB  ]   | |       |     || No Desc Mat Cond Own Dis| 15
    |    | | | |                 [ salt        NIL  ]      [ 1    ]   | |       |     || -- annotation ...       | 20
    |    | | | |                 [ printed     NIL  ]      [ 2    ]   | |       |     ||                         | 25
    |    | | | |                 [ live        NIL  ]      [ 3    ]   | |       |     || ----------------------- | 30
    |    | | | |                                          [ 4 ex ]   | |       |     || RECORD OF PLAY          |
    |    | | | |                        (o)  Halm                    | |       |     || No  Time Dir Art  Rem   | 35
    |    | | | |    ________________________|_______________________|_|       |     || 1   -    W   e4         | 40
    |    | | | |    |1-17                                                     |     || 1   -    E   c5         |
    |    | | | |    |[tray] [ BOARD across the brass line ] [typewr] [stamp]  |     || ...                     | 50
    |    | | | |    |======================================================| |STOVE|| ----------------------- |
    |    | | | |    |                  [ visitor's chair ]                 | |  o  || REMARKS                 | 60
    |    | | | |    |                                                      | |     || of any length, provided |
    +-------------------------------------------------------------------------------++ it is true              | 66
    |  floor, Marle Oak, boards                         [ trap 1-16 ]  . . path . . || narrator text ...       | 76
    |                                                                               || --                      |
    |                                                                               || Visitor (1). _          | 96
    +----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+ 100
```

| Item | x (%) | y (%) | Notes |
|---|---|---|---|
| Wall | 0–70 | 0–76 | one fill; 1-rpx skirting line at y 76 |
| Floor | 0–70 | 76–100 | boards 3 per cent tall, joints 1-rpx Iron Gall |
| 1-13 Door to Room 3 | 0.0–4.9 | 14–76 | four panels, closed, knob at y 46, escutcheon |
| 1-11 Window | 4.9–8.4 | 20–48 | six panes 2×3, lower-left cracked (1-rpx zigzag); panes Iron Gall, the bridge's eleven arches and grass in Boxwood line |
| 1-03 Greatcoat, west hook | 8.4–9.8 | 18–76 | hook at y 18; coat to floor; eleven Boxwood buttons in one row, twelfth position empty |
| 1-12 Door to deck | 9.8–11.2 | 14–76 | narrow, no knob, 14 nail heads in two columns of seven, y 30–70 |
| 1-04 Clock, left | 15.4–23.8 | 12–27 | Boxwood face, Iron Gall hands, reads 21.20 |
| 1-05 Tariff Board | 23.8–46.2 | 8–36 | Boxwood face, Marle Oak frame, six rows Iron Gall 0.7rem, each struck NIL in Seal Wax 1.0rem |
| 1-04 Clock, right | 46.2–54.6 | 12–27 | reads 21.08 |
| 1-08 Filing cabinet | 47.5–53.5 | 32–56 | Service Green, four drawers, Boxwood labels, the fourth "Correspondence. Exempt." |
| 1-03a East hook | 58.8–60.2 | 18–20 | Boxwood, empty |
| 1-14 Door to stair | 60.2–65.1 | 14–76 | four panels, knob, escutcheon |
| 1-15 Door to Room 2 | 65.1–70.0 | 14–76 | four panels, knob, no escutcheon |
| 1-09 Stove | 66.0–69.5 | 56–76 | Ebony; Seal Wax grate 67.2–68.3, 66–70 |
| 1-01 Desk | 21–49 | 58–76 | Boxwood rail y 58–58.5; oak front panel to 74; legs to 76 |
| Mr Halm, chair and figure | 31–39 | 38–58 | seated, facing camera, hands on the rail |
| 1-17 Hours card | 40.5–42.5 | 55.5–58 | Boxwood, four lines 18.00 / 20.00 / 22.00 / After; chosen hour underlined 1-rpx |
| 1-06 Tray, elevation | 22.5–26.0 | 56–58 | Service Green edge |
| 1-10 Board, elevation | 32.4–37.6 | 57–58 | a band; play is in the insert |
| 1-07 Typewriter | 39.5–44.0 | 51–58 | Ebony, Boxwood sheet standing in it |
| 1-18 Date-stamp and pad | 45.0–47.5 | 55.5–58 | oak handle, Iron Gall pad |
| 1-02 Visitor's chair | 32–38 | 62–76 | back to camera, empty |
| 1-16 Trap | 52–58 | 78–84 | Boxwood ring, Iron Gall padlock |
| S-4 Path | 62.5,76 → 35,84 | — | 4 per cent wide band of wear, no joints drawn |
| Board insert | 18.125–51.875 | 14–74 | section 6 |
| Tray insert | 18.125–30.0 | 44–60 | section 6 |
| Page head | 71.5–98.5 | 2–8 | property line and date |
| Caption block | 71.5–98.5 | 9–30 | |
| Record of Play | 71.5–98.5 | 31–65 | heads at 31–33.5 |
| Remarks (narrator) | 71.5–98.5 | 66–94 | |
| Input line | 71.5–98.5 | 95–98.5 | |

**Where the eye goes.** First to the six NILs: the only red, on the brightest object, on the axis. Second to the clocks flanking them, which disagree. Third down the axis to Mr Halm and the desk. Fourth, because the balance is off by one object, to the greatcoat, and to the empty hook that answers it. Last to the page, where the text has meanwhile been typed. When play begins the board insert covers the Tariff Board, and the eye goes where the NIL was.

---

## 6. The board

**Insert.** 540 by 540 rpx (x 18.125–51.875, y 14–74), centred on the axis, hairline-framed. Cuts in when Mr Halm says "Please"; cuts out when the pieces have gone back. Inside: a 30-rpx border band in Marle Oak, then eight ranks of 60-rpx squares. The declarations line crosses as a 4-rpx Boxwood strip (12 mm at 45 cm) between the fourth and fifth ranks, outlined 1 rpx, drawn over the square edges. White at the bottom; if the visitor takes black the board flips and the strip stays.

**Square tones** *(a rendering decision the bible does not make)*. Light squares are solid Boxwood. Dark squares are Ebony drawn as the Survey draws it: a 45° hatch of Ebony lines, 3 rpx on, 2 off, over Boxwood (60 per cent). Black pieces and dark squares share one colour by canon; a hatch keeps six colours and separates an ebony piece from its square at 4.15 : 1. SVG `pattern`, `shape-rendering: crispEdges`, allowed to soften into a tone under scaling. The board reads as a printed diagram: white pieces in line, black filled, on open and hatched squares.

**Coordinates.** Files a–h in the lower band, ranks 1–8 in the left band, Jost 500 0.55rem, Boxwood on oak (stamped brass), one per square, centred, not repeated on the other sides.

**Selection.** A 1-rpx Iron Gall square inset 3 rpx in the selected square. No fill, no colour.

**Legal moves.** An Iron Gall disc, 11 rpx diameter, at the centre of each legal destination; on an occupied destination, a 1-rpx Iron Gall ring of 52 rpx around the piece instead. Shown and removed at once.

**Last move.** From- and to-squares carry corner ticks: four L-marks, 2 rpx thick, 8 rpx long, in the corners, like crop marks. They persist until the next move.

**Check.** The king's square gets a doubled hairline, inset 2 and 5 rpx. No red. The ledger takes check as a remark; so does the board.

**Promotion.** An index card 168 by 100 rpx, Boxwood, hairline frame, Seal Wax head rule, appears at the promotion square's inner edge (section 11). Roster line RE-ENTERED AS, then queen, rook, bishop, knight silhouettes 44 rpx tall in the mover's tone, each a button with the selection frame on hover. No default; the card waits.

**Tray.** The insert is 190 by 144 rpx overhead: a Service Green tin with a rolled edge (a second hairline 3 rpx inside), HELD PENDING DUTY in Seal Wax 0.75rem along the top inner edge with stencil bridges drawn as 1-rpx gaps (not a stencil font). Captured pieces lie left to right in order of capture, white in the top row, black in the second, each silhouette 34 rpx tall on a face-down Boxwood card 28 by 18. A tally card, Boxwood 60 by 22, lower right, Jost 400 0.55rem: "Detained. W 2. E 3." Lower left, half under the first card, a Boxwood disc of 6 rpx: the twelfth button, never moved. The insert holds two seconds after a piece enters; hovering the tray in the scene shows it for as long as the hover lasts.

---

## 7. The pieces

Turned bodies with carved heads, each head an object of a frontier post. No face, eye, mouth or crown. White is Boxwood filled, black is Ebony filled. **Outline: 1 rpx Iron Gall on every piece** *(decided; canon says every outline)*. Carved marks (numeral, window, slot, bridle, lid line, shade rim) are 1-rpx lines in the opposite wood. No shading, no highlights, no felt. The b1 knight is pearwood; the palette has no pearwood, so its difference is carried by shape.

Pieces are drawn in elevation on the overhead board, as a diagram draws them. Each is designed on a 100-unit box, baseline at 100, centre at x 50, scaled so its height is the fraction of the square below. Turned pieces stand on a base ellipse 46 by 6 on the baseline; its lower edge is the shadow line.

| Piece | Real | Height / square |
|---|---|---|
| King | 96 mm | 0.88 |
| Queen | 88 mm | 0.83 |
| Bishop | 78 mm | 0.76 |
| Knight | 74 mm | 0.73 |
| Rook | 70 mm | 0.71 |
| Pawn | 48 mm | 0.56, no base disc |

**King, "The Lamp."** A column 8 wide rises from the disc to y 36; a socket collar 12 by 6; then the shade, a truncated cone 44 wide at y 30 narrowing to 24 at y 6, with a rim line at y 24; a finial 8 by 6 on top. Black, "Lamp, East": a tin shade, 50 wide and 12 tall, no rim line, a 3-unit hole at the apex. The flared shade is what the eye reads.

**Queen, "Inkstand."** Disc; stem 14 by 10; the well, a rectangle 40 wide with 6-unit rounded shoulders, y 46–84; a domed lid, half-ellipse 34 by 14, with a 6-unit knob. White: lid carved shut, one seam line. Black, "Inkstand, East": the same lid rotated 60° back about its right-hand hinge, the mouth open as a 1-unit line across the body's top.

**Bishop, "Seal."** Disc; a column tapering from 16 to 10 wide up to y 34; a round head, circle of diameter 30 centred at y 22, with a vertical slot 3 by 14 through it. Black, "Seal, Helder": the head a square 28 by 28, corners rounded 2, the slot a square 8 by 8. Round against square is the whole distinction.

**Knight, "Ferry."** Disc; a neck, a curved band 22 wide, rising and leaning forward-right to y 30; two triangular ears 6 tall at the poll; the head an elongated block angled 45° down and forward, the muzzle ending at y 60, x 78, so the piece is taller at the back than the front. Bridle: one line across the nose, one down the cheek, meeting. One line along the neck's back edge; no eye. White and black are the same horse. The b1 replacement: 4 units shorter, neck 2 units thicker, ears rounded. Nothing else differs.

**Rook, "Home Tower."** Disc; a shaft 34 wide to y 12; a flat parapet 40 by 5; a window 8 by 10 at y 32–42, offset 6 units right of centre on white (it faces the bridge); a door line 10 tall at the foot. Black, "East Tower": an isosceles roof 40 by 10 in place of the parapet; window on the axis. No crenellations on either.

**Pawn, "Stone."** A shaft 26 wide from the baseline to y 14; a bevelled cap narrowing over 8 units to 18 wide, then flat. A numeral in the opposite wood, 12 units tall, 1-unit strokes, centred at y 34: V on white, H on black. Black Stone 7 (g7) has a 4-unit notch out of the cap's right corner. White Stone 4 (d2) is not marked.

**How a piece moves.** A straight slide, centre to centre, `translate` only, 240 ms, `cubic-bezier(0.4, 0, 0.2, 1)`. No arc, lift, scale or rotation; a knight slides through what it passes. Castling slides both pieces together. Nothing bounces at the end.

**How a captured piece leaves.** It slides straight from its square to a point 20 rpx beyond the frame on the a-file side (toward the tray), 320 ms, same easing, and is removed; the capturing piece starts 80 ms later. The tray insert cuts in with the piece in place, and the date-stamp sounds as "Detained." finishes typing.

---

## 8. Captions and dossiers

**Captions do not appear in the scene.** Hovering an object, or focusing it (every captioned object is a focusable button), types its entry into the caption block on the page. In the scene the hover response is one thing: the outline goes from 1 to 2 rpx. Cursor: the default arrow everywhere; no pointer hand.

**Caption block** (x 71.5–98.5, y 9–30). Column heads, Jost 500 0.6rem upper, a 1-rpx rule beneath, values in 0.7rem. Widths as fractions of the block: No. 0.10, Description 0.38, Material 0.16, Condition 0.14, Own. 0.06, Disposition 0.16. Description wraps; the rest do not. A 0.4rem gap, then the annotation full width at 0.8rem, beginning with an em dash and a space, typed at the ledger rate; the columns appear at once, as a form is printed before it is filled. On hover-out the entry stays until the next; the page is never blank. No rule above a caption, no small caps, no tracking.

**Dossiers.** Clicking a piece raises its card (item 6-09), laid over the caption block, centred: 400 by 240 rpx, Boxwood with grain, hairline frame, a 1-rpx Seal Wax head rule 22 rpx below the top, ruled lines beneath in Iron Gall at 12 per cent every 1.25rem. Above the rule, left: MARLE CHESS CLUB. ROSTER. Right: 6-09 and the card's number of 32. Below: the title exactly as the bible gives it, "White King, e1. "The Lamp."", then the body. Pencil additions in Jost 400 italic, Iron Gall at 70 per cent, on their own line, introduced as the bible does ("In pencil:"). The card holds until a click elsewhere or a move. A captured piece's card, raised from the tray, is face down: the same card, blank, ruled, roster line only.

**Hairline frames.** Every frame is 1 rpx Iron Gall, square-cornered, no shadow: inserts, cards, the page edge. Never doubled except for check, never rounded except the stamp, never coloured.

---

## 9. The ledger

Heads at y 31–33.5: No. | Time | Direction | Article | Remarks, ruled beneath; widths 0.09, 0.11, 0.10, 0.22, 0.48. Rows Jost 400 0.8rem, line-height 1.5, tnum. One row per half-move.

- **No.** The move number on the white row only; plain figures, no stop.
- **Time.** Always a typed em dash. The ledger does not record time.
- **Direction.** W or E.
- **Article.** SAN as chess.js gives it, letters not symbols: Nf3, O-O, exd5, e8=Q. Check and mate suffixes are not typed here.
- **Remarks.** "Detained." for a capture, followed after 300 ms by the stamp: DETAINED in Seal Wax, Jost 500 0.6rem, tracking 0.12em, in a 1-rpx Seal Wax rounded rectangle (radius 2), rotated −3°, with a date band beneath in 0.5rem: day and month of the session in the game's year, "14 III 90". "Re-entered as Queen." for a promotion. "Check." for check. A result is its own row across Article and Remarks: "1–0", "0–1" or "½–½", with the date, and no remark.

**Typing.** 55 ms per character (18 per second), columns left to right, 120 ms between columns. Every lower-case *e* in the ledger and in the narrator's column is set at 72 per cent opacity: the machine strikes it faintly, and the ledgers can be dated by the e. The caret is a 1-rpx vertical line; it disappears when the row is complete.

**Scrolling.** The region (y 33.5–65, about 15 rows) keeps the newest row at the bottom and steps up one row height, unanimated, when a row is added, as the platen turns. Wheel-scroll back is allowed; a new row returns the view. The head reads "RECORD OF PLAY. ENTRIES: 120." and counts as it types.

**At 60 moves.** 120 rows and a result. The region shows moves 53 to 60; the rest continue above. A dozen stamps at −3° interrupt a column of grey-blue type. No page breaks, sheet numbers or row shading.

---

## 10. The narrator panel

The Remarks column, y 66–94: head REMARKS, beneath it in 0.6rem sentence case "Of any length, provided it is true.", a rule. The column is Edmund Prell's, in the same face as the first hand. Text arrives character by character at 36 ms (28 per second), pausing 180 ms after a full stop and 90 ms after a comma or semicolon. The stream is buffered and typed at that rate; if the model is faster the typing continues after the stream closes, if slower the caret waits. A click in the column completes the current message. Messages are separated by one blank line; older text scrolls up and can be wheeled back to.

**The silence mark.** A silent answer types a single em dash on its own line, at the ordinary rate, and stops. Not centred, not dimmed, not styled. During play most events are answered this way.

**The input.** One line at the foot, y 95–98.5. Left: "Visitor (1)." in Jost 500 0.85rem. Right: the field, with no border, background or box; a 1-rpx Iron Gall rule under the whole line is its only furniture. Caret: a block 1ch wide, Iron Gall, 1000-ms step blink. Placeholder when empty and unfocused: "Ask." in Iron Gall at 45 per cent. No send button; Enter submits, Shift+Enter breaks a line. The field is never disabled, during play or after mate; the narrator's rules decide what he says, not the interface.

**The player's words** appear in the column at once (the machine did not type them), Jost 400 italic 0.85rem, on a line beginning "Visitor (1). " in 500 upright; the reply follows in upright. They are never edited or capitalised.

**The "ask" affordance** is the word "Ask." and the caret. Nothing pulses, no suggested questions, no chips, no thinking indicator.

**Mr Halm's words** are not the narrator's. "Please." and "Thank you." appear in the Record of Play's Remarks on the start row and the result row, in upright 400, as a clerk enters what was said. When he has lost, "Thank you." appears twice, the first in Helder.

---

## 11. Motion

| Event | Duration | Easing | Notes |
|---|---|---|---|
| Matte to Card 1 | 600 ms | ease-out | the only fade |
| Card hold | 4000 ms | — | click or key advances |
| Card to card | 0 ms | cut | |
| Card 3 to Room 1, whip pan | 380 ms | `cubic-bezier(0.65, 0, 0.35, 1)` | the room lies to the right of the card on one plane; the plane translates left one stage width. No motion blur; the eye supplies it. The page arrives blank and its head types over 1.4 s. |
| Board insert in / out | 0 ms | cut | |
| Tray insert in | 0 ms | cut | holds 2000 ms |
| Piece slide | 240 ms | `cubic-bezier(0.4, 0, 0.2, 1)` | translate only |
| Captured piece exit | 320 ms | same | captor starts 80 ms later |
| Pieces return at game end | 600 ms | same | all at once, after "Thank you." |
| Dossier, promotion card appear | 160 ms | ease-out | translateY 6 rpx to 0, opacity 0 to 1 |
| Card dismiss | 0 ms | cut | |
| Hover, focus outline 1 to 2 rpx | 0 ms | — | no transition |
| Ledger scroll step | 0 ms | — | one row |
| Ledger typing | 55 ms / char | — | |
| Narrator typing | 36 ms / char | — | pauses per section 10 |
| Caret blink | 1000 ms | steps(2) | |
| Later: lateral move between rooms | 700 ms | `cubic-bezier(0.65, 0, 0.35, 1)` | one room width |
| Later: held frame of the empty room before a card | 3000 ms | — | |
| Later: uncaptioned object between rooms | 2000 ms | — | cut in, cut out |

**Never animates.** The wall and everything on it. The clocks, fixed at 21.20 and 21.08. The greatcoat. Mr Halm. The doors. The grain. The frame within a room: no zoom, pan or tilt. Captions, except their typed annotation. The stamp, which appears complete after its sound. Hover, focus and cursor. Nothing eases in on load; the room is there.

---

## 12. Doors

Four doors and a trap, each captioned. A door is a Marle Oak rectangle outlined 1 rpx, four inset panels with their own hairlines, a Boxwood knob 10 rpx at y 46 and, if locked with a key, a Boxwood escutcheon 6 by 10 beneath it. Closed and locked doors look the same but for the escutcheon; the difference is in the caption, which is how the house tells you things. Door 1-12 has no knob and fourteen 3-rpx nail heads in two columns of seven. The trap is a rectangle in the boards with a Boxwood ring and an Iron Gall padlock.

**Hover.** Outline to 2 rpx; the caption types onto the page, verbatim from the bible's table, for example:

> 1-13. Door to Room 3, oak. Locked. Ministry key 7/3, held at the Keys Registry, Sallenau. R. — Requested 1977 and 1979. Not located. Room 3 is typed. It is not yet annotated.

The last sentence of a locked door's caption ("Room 3 is typed. It is not yet annotated." and its variants) is set in Iron Gall at 60 per cent. When a room is annotated, the data drops that sentence and the door opens.

**Click.** Nothing moves. No shake, no turning knob, no sound. `door:tried` goes to the narrator, who may answer or type a dash. The player learns that the doors hold by the doors holding.

**Captions in Room 1:** 1-12 (deck, nailed, 14 nails), 1-13 (Room 3, key 7/3), 1-14 (stair, locked at nine by Mr Halm), 1-15 (Room 2, closed, Mr Halm prefers it shut), 1-16 (trap, padlocked, Schedule B not located). All five from the chapter table, unchanged.

---

## 13. Sound

No music, no ambience. One sound is built *(canon: the date-stamp is the only sound in Room 1)*:

1. **Date-stamp.** A rubber stamp struck once on a ledger page on a wooden desk: a short wooden knock with a soft body, about 180 ms, dry, no reverb, modest level. Played when "Detained." finishes typing. On by default; one control in the page head toggles it, remembered per browser.

Three more are described so nobody invents them differently, and are **not built** unless the bible is amended:

2. Piece set down: boxwood on wood, a light tap, 60 ms. Off.
3. Typewriter key: a Sallenau Standard No. 5 in another room, one key, muffled, 40 ms. Off.
4. A door that will not open: nothing. Silence is the decision.

---

## 14. Do-not list

1. Do not add a seventh colour to Room 1 for any state, including focus, error, disabled or loading.
2. Do not draw anything in perspective, isometric or three-quarter view, or apply a 3D transform.
3. Do not use any shadow other than the 1-rpx hard line beneath an object.
4. Do not use a gradient anywhere except the paper grain on the page and index cards.
5. Do not animate a hover, a focus ring, a caption or a card's dismissal.
6. Do not move a piece in an arc, or scale, lift or rotate it; it slides.
7. Do not colour a check, a capture, a blunder or a mate; red is the NIL, the stencil and the stamp.
8. Do not set type directly on the wall; type sits on a Boxwood label.
9. Do not use Jost 300 or 700, synthetic bold, small caps, or tracking on running text.
10. Do not justify text, anywhere.
11. Do not put a caption, tooltip, label or number in the scene; captions live on the page.
12. Do not use the pointer-hand cursor, a hover scale, a button bevel or a rounded box.
13. Do not use a distressed or "typewriter" font; the typewriter is a rhythm, not a face.
14. Do not use a serif in Room 1.
15. Do not let the clocks run, or show any live time, date or duration; the ledger does not record time.
16. Do not make a locked door shake, rattle, sound or glow when clicked.
17. Do not add a send button, suggested questions or a thinking indicator to the narrator; the caret waits.
18. Do not put a second asymmetry in the frame; the greatcoat is the one.
19. Do not invent or paraphrase a caption, dossier or door line; every word comes from the bible through the data files.
20. Do not fade, dissolve, zoom or wipe between shots; cut, or pan laterally.
