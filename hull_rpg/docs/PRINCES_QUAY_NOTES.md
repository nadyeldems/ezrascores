# PRINCES QUAY NOTES

## Layout Decisions
- Exterior uses boardwalk + water edge to emphasize over-water massing and approach.
- Interior uses broad concourse tiles, central void/atrium strip, and railing tiles overlooking the void.
- Escalator prop tiles and scene gates provide level connection to Top Deck.
- Top Deck includes storefront banding plus a seating/food zone and cinema-facing signage.

## Required Cultural Cues Included
- Top deck directional sign
- Food court dialogue/signage
- Cinema signage
- Water below notice at atrium rail
- Meeting point sign/NPC line

## Adjusting Toward Real-Life Memory
- Edit map scripts:
  - `scripts/maps/PrincesQuay_Exterior.gd`
  - `scripts/maps/PrincesQuay_Interior.gd`
  - `scripts/maps/PrincesQuay_TopDeck.gd`
- Adjust `fill_rect` coordinates for corridor widths and storefront spacing.
- Move/add `T_RAIL` cells to reshape atrium edge.
- Reposition `add_gate(...)` escalator points if level transition positions should align to remembered entrances.
