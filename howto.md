# How to add media (note to self)

## Categories

Under `assets/ezreal/skins/[skin]/` add folders for the categories. Available:

- splash
- icon
- emote
- promo
- concept
- loading
- model
- model-face
- chroma
- ingame
- tenor (links)
- video
- youtube (links)

> [!NOTE]
> **Chroma** automatially applies a tag.

Those can also be set via subfolders:
Example: `assets/ezreal/Battle Acadmia/icon/chroma/...`

## Tags

Currently there are tags for `tft`, `wr`(Wild Rift) and `lor`(Legends of Runeterra) aswell as the tag `chroma`.

You can set them by doing one of the things listed:

1. One (or more) subfolder(s) under the category (`assets/ezreal/skins/classic/promo/lor/art.png`)
2. Via the filenames by using `[]` or `__` (`art [lor].png` or `art__lor.png`)
3. By putting a file named `tags.json` into the category folder (`assets/ezreal/skins/classic/promo/tags.json`) using key-values (`"art.png": ["lor"],`)

## Links

Put a new line with the link in the `youtube.txt` or `tenor.txt` file in the skins folder.
