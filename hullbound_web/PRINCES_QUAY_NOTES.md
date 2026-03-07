# PRINCES QUAY NOTES

## Layout Intent
- Exterior: waterfront approach and over-water massing cues.
- Interior: broad concourse, central atrium void with railings, storefront facades, escalator nodes.
- Top Deck: food seating zone + cinema direction signage + elevated circulation.

## Required Cues Included
- Top deck signage
- Food references
- Cinema references
- Water below references
- Meeting point references

## Tuning to local memory
- Edit map construction in `scripts/game.js` inside `buildScene("PrincesQuay_...")`.
- Adjust `fillRect(...)` dimensions for concourse width/storefront spacing.
- Move `rail` rows to reshape atrium edge.
- Move `gate(...)` coordinates to align escalator/lift transitions.
