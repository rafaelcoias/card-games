# Card artwork — credits

All artwork in this folder (the 52 cards, the two jokers `JK1`/`JK2`, the back `BACK`
and `sprite.svg`) is **original work created for this project**. It is generated
deterministically by [`../scripts/generate-cards.ts`](../scripts/generate-cards.ts),
and the SVG files here are that script's output.

- There are no third-party assets. Suit symbols, pip layouts, court figures, jokers and
  the back pattern are all drawn from scratch as SVG paths in the generator.
- There are no raster images and no embedded or external fonts. The indices use the
  system serif stack (`'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', Georgia, serif`).
- The artwork is released under the same license as the rest of this repository.

To regenerate (run from the repository root):

```sh
npx tsx packages/ui/scripts/generate-cards.ts
```

Do not edit the SVG files by hand. Change the generator and run it again.
