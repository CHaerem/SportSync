#!/usr/bin/env python3
"""generate-display-font.py — bygger Sportivistas display-/tallfont (WP-183).

DESIGN.md § Typografi: systemfont (San Francisco) overalt UNNTATT tre flater —
ordmerket, agendaens tidskolonne og delekortene. Der bruker vi ÉN distinkt
display-font. Dette skriptet er den reproduserbare veien fra oppstrøms-kilden
til de innsjekkede assetene, i samme ånd som `generate-icons.swift` og
`generate-og-image.swift`.

KILDE
    Space Grotesk (Florian Karsten), variabel `wght` 300–700, SIL Open Font
    License 1.1. Oppstrøms: google/fonts `ofl/spacegrotesk/SpaceGrotesk[wght].ttf`.
    Copyright-linja erklærer INGEN "Reserved Font Name", så OFL tillater at
    modifiserte (instansierte + subsettede) filer beholder familienavnet.
    Lisensen er sjekket inn ved siden av assetene (`OFL.txt`).

HVA SKRIPTET GJØR
    1. Instansierer den variable fonten på tre faste vekter (500/600/700).
    2. BAKER INN tabulære sifre: `tnum`-substitusjonen løses opp og cmap peker
       rett på `.tf`-glyfene. Da er sifrene tabulære SOM STANDARD på begge
       flater — ingen avhengighet av `font-variant-numeric` (som canvas i
       delekortet ikke har) eller av at CoreText mapper `.monospacedDigit()`
       til `tnum` på en custom font. Verifiseres mekanisk i steg 4.
    3. Subsetter til det faktiske tegnbehovet (se CHARSET) og skriver
       .woff2 (web) + .ttf (iOS, `UIAppFonts` tar ikke woff2).
    4. Verifiserer hver utfil: æøåÆØÅ finnes, alle ti sifre har LIK bredde,
       og ordmerkets bokstaver + «:» finnes. Feiler hardt ellers.

BRUK
    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python design/brand/generate-display-font.py path/to/SpaceGrotesk[wght].ttf

    Utdata: docs/fonts/*.woff2 (web) og design/brand/fonts/*.ttf (iOS-bundle,
    referert av ios/project.yml — samme mønster som docs/config/lens-config.json).
"""

import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WEB_OUT = os.path.join(ROOT, "docs", "fonts")
IOS_OUT = os.path.join(ROOT, "design", "brand", "fonts")

# Vektene vi faktisk bruker (DesignTokens.swift `SportivistaDisplayWeight` /
# `--display-*`-rollene i base.css). Ingen flere — hver vekt er bytes.
WEIGHTS = {500: "Medium", 600: "SemiBold", 700: "Bold"}
# Web bruker bare to av dem (ordmerket 600 + kolonet/delekortets tid 700, og
# tidskolonnen 600). Medium finnes kun for iOS' flerdagsvindu, så vi skriver
# ikke en .woff2 ingen side ber om.
WEB_WEIGHTS = {600, 700}

# Tegnbehovet. Bevisst litt bredere enn dagens strenger (ordmerket, HH:MM,
# flerdagsvinduer med norske månedsnavn, delekortets tid) — Basic Latin er
# billig og gjør fonten robust mot en ny streng i tidskolonnen i morgen.
CHARSET = (
    [c for c in range(0x20, 0x7F)]          # Basic Latin (siffer, «:», «.», A–Z, a–z)
    + [ord(c) for c in "æøåÆØÅéèüöäÉÜÖÄ"]   # norsk + de nordiske nabotegnene
    + [0x00A0, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x00B7, 0x2026]
)

DIGITS = "0123456789"
NORDIC = "æøåÆØÅ"
WORDMARK = "SPORTIVISTA:"


def tnum_substitutions(font):
    """{glyph: tabular-glyph} fra fontens egen `tnum`-feature."""
    out = {}
    gsub = font.get("GSUB")
    if gsub is None:
        return out
    table = gsub.table
    for record in table.FeatureList.FeatureRecord:
        if record.FeatureTag != "tnum":
            continue
        for index in record.Feature.LookupListIndex:
            for sub in table.LookupList.Lookup[index].SubTable:
                if hasattr(sub, "mapping"):
                    out.update(sub.mapping)
    return out


def bake_tabular_digits(font):
    """Peker cmap for 0–9 på fontens tabulære sifferglyfer (steg 2 over)."""
    mapping = tnum_substitutions(font)
    best = font.getBestCmap()
    swapped = 0
    for digit in DIGITS:
        glyph = best.get(ord(digit))
        tabular = mapping.get(glyph)
        if not tabular:
            continue
        for table in font["cmap"].tables:
            if ord(digit) in table.cmap:
                table.cmap[ord(digit)] = tabular
        swapped += 1
    return swapped


def set_names(font, weight, style_name):
    """Navner instansen eksplisitt. (Oppstrøms' STAT-tabell har ingen Axis Value
    for 600, så `updateFontNames` kan ikke gjøre det for oss.)"""
    family = "Space Grotesk"
    full = f"{family} {style_name}"
    postscript = f"SpaceGrotesk-{style_name}"
    name = font["name"]
    for name_id, value in (
        (1, family if style_name == "Regular" else full),
        (2, "Regular"),
        (3, f"{postscript}; Sportivista subset"),
        (4, full),
        (6, postscript),
        (16, family),
        (17, style_name),
    ):
        name.setName(value, name_id, 3, 1, 0x409)
        name.setName(value, name_id, 1, 0, 0)
    font["OS/2"].usWeightClass = weight


def build(source, weight, style_name):
    font = instancer.instantiateVariableFont(
        TTFont(source), {"wght": weight}, updateFontNames=False, inplace=False
    )
    set_names(font, weight, style_name)
    swapped = bake_tabular_digits(font)
    if swapped != 10:
        raise SystemExit(f"{style_name}: bare {swapped}/10 sifre fikk tabulær glyf")

    options = subset.Options()
    options.layout_features = ["kern", "ccmp", "locl", "mark", "mkmk"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=CHARSET)
    subsetter.subset(font)

    written = []
    targets = [(IOS_OUT, None, "ttf")]
    if weight in WEB_WEIGHTS:
        targets.insert(0, (WEB_OUT, "woff2", "woff2"))
    for directory, flavor, ext in targets:
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, f"SpaceGrotesk-{style_name}-subset.{ext}")
        font.flavor = flavor
        font.save(path)
        written.append(path)
    verify(written[-1], style_name)
    return written


def verify(path, style_name):
    font = TTFont(path)
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    missing = [c for c in NORDIC + WORDMARK + DIGITS if ord(c) not in cmap]
    if missing:
        raise SystemExit(f"{style_name}: mangler glyfer {missing}")
    widths = {hmtx[cmap[ord(d)]][0] for d in DIGITS}
    if len(widths) != 1:
        raise SystemExit(f"{style_name}: sifrene er IKKE tabulære — bredder {sorted(widths)}")
    print(f"  ✓ {style_name}: æøå ok, ordmerke ok, tabulære sifre (bredde {widths.pop()}/em {font['head'].unitsPerEm})")


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    source = sys.argv[1]
    for weight, style_name in WEIGHTS.items():
        for path in build(source, weight, style_name):
            print(f"{os.path.relpath(path, ROOT)}  {os.path.getsize(path):,} bytes")


if __name__ == "__main__":
    main()
