#!/bin/sh
# PROTOTYPE: copies game renders (captured earlier) into prototype/office/img.
S=/private/tmp/claude-501/-Users-dk-Developer-game-portolan/93f45fd9-7a13-491d-a683-b23cf8682569/scratchpad
D=prototype/office/img
for f in biome-palmKeys-orbit biome-volcanicArc-orbit biome-coralAtolls-orbit biome-palmKeys-sea biome-basaltFjords-sea; do cp "$S/bio3/$f.png" "$D/"; done
for f in rookery-overview rookery-foundry-3 rookery-drawingLoft-3 rookery-factory-3; do cp "$S/cap/$f.png" "$D/"; done
ls "$D"
