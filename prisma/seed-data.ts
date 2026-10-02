// Seed content: public-domain paintings from Wikimedia Commons, with annotations.
// Regions are fractions (0–1) of each image (ADR 0005), placed against the exact file listed.
// Used by prisma/seed.ts. Facts are kept to well-established art history.

import type { Region } from "@/lib/regions";

export type SeedArtwork = {
  /** Stable key: the R2 object is images/seed/<slug>.jpg, so re-running the seed doesn't duplicate. */
  slug: string;
  title: string;
  description: string;
  /** Wikimedia Commons file page, for credit and to find the file. */
  source: string;
  annotations: { region: Region; body: string }[];
};

export const artworks: SeedArtwork[] = [
  {
    slug: "great-wave",
    title: "The Great Wave off Kanagawa",
    description:
      "Katsushika Hokusai, about 1831. Colour woodblock print from the series Thirty-six Views of Mount Fuji. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg",
    annotations: [
      {
        region: { x: 0.583, y: 0.635, w: 0.09, h: 0.09 },
        body: "**Mount Fuji**, Japan's highest mountain, looks tiny here. Hokusai sets it low and far away, so the wave in the foreground dwarfs it. This print opens his series *Thirty-six Views of Mount Fuji*.",
      },
      {
        region: { x: 0.0, y: 0.06, w: 0.1, h: 0.275 },
        body: "The cartouche names the series, *Thirty-six Views of Mount Fuji*, and this print, *Under the Wave off Kanagawa*. Beside it Hokusai signs himself *Hokusai aratame Iitsu hitsu*: from the brush of Hokusai, who has changed his name to Iitsu.",
      },
      {
        region: { x: 0.42, y: 0.12, w: 0.18, h: 0.24 },
        body: "The crest breaks into **claw-like fingers of foam**, about to fall on the boats below. Hokusai was about seventy when he made the print.",
      },
      {
        region: { x: 0.4, y: 0.755, w: 0.36, h: 0.2 },
        body: "Three *oshiokuri-bune*, fast boats that rushed fresh fish to market in Edo (now Tokyo). The rowers crouch low and hold on as the swell lifts them.",
      },
      {
        region: { x: 0.24, y: 0.3, w: 0.15, h: 0.24 },
        body: "Much of the deep blue is **Prussian blue**, a synthetic pigment newly available in Japan. It was stronger and longer-lasting than the plant-based blues printmakers had used before.",
      },
    ],
  },
  {
    slug: "arnolfini",
    title: "The Arnolfini Portrait",
    description:
      "Jan van Eyck, 1434. Oil on oak panel. National Gallery, London. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Van_Eyck_-_Arnolfini_Portrait.jpg",
    annotations: [
      {
        region: { x: 0.425, y: 0.235, w: 0.165, h: 0.12 },
        body: "The **convex mirror** shows the room from behind: the couple's backs, and two more figures in the doorway, one of whom may be van Eyck himself. Its frame holds ten tiny scenes from the Passion of Christ.",
      },
      {
        region: { x: 0.44, y: 0.19, w: 0.14, h: 0.04 },
        body: "Above the mirror, in ornate script: *Johannes de eyck fuit hic 1434*, \"Jan van Eyck was here, 1434\". It reads more like a witness's signature than a painter's.",
      },
      {
        region: { x: 0.37, y: 0.05, w: 0.28, h: 0.14 },
        body: "A **single candle** burns in the chandelier in broad daylight. What it means is still debated: a sign of God's presence, a marriage custom, or, in one reading, a memorial to a wife who had died.",
      },
      {
        region: { x: 0.37, y: 0.82, w: 0.2, h: 0.14 },
        body: "The little **dog** is often read as a symbol of fidelity. It's also a luxury: a lapdog, of a kind seen as an early ancestor of the Brussels griffon.",
      },
      {
        region: { x: 0.0, y: 0.86, w: 0.16, h: 0.12 },
        body: "A pair of wooden **pattens**, overshoes for muddy streets, lies kicked off on the floor. They may mark the room as a solemn space, or simply be a piece of everyday life.",
      },
      {
        region: { x: 0.06, y: 0.51, w: 0.07, h: 0.04 },
        body: "**Oranges** were costly imports in 15th-century Bruges. Left casually by the window, they quietly show off the household's wealth.",
      },
      {
        region: { x: 0.5, y: 0.38, w: 0.11, h: 0.07 },
        body: "He holds her hand in his open palm. Whether this shows a marriage, a betrothal or something else entirely has been argued over for well over a century.",
      },
    ],
  },
  {
    slug: "ambassadors",
    title: "The Ambassadors",
    description:
      "Hans Holbein the Younger, 1533. Oil on oak. National Gallery, London. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Hans_Holbein_the_Younger_-_The_Ambassadors_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.21, y: 0.76, w: 0.51, h: 0.23 },
        body: "This smear across the floor is a **skull** painted in extreme perspective. Viewed from the lower right, close to the picture's surface, it snaps into shape: a *memento mori* hidden in plain sight.",
      },
      {
        region: { x: 0.16, y: 0.09, w: 0.13, h: 0.13 },
        body: "**Jean de Dinteville**, the French ambassador to England, who commissioned the painting. His dagger is inscribed with his age, 29.",
      },
      {
        region: { x: 0.79, y: 0.1, w: 0.1, h: 0.13 },
        body: "**Georges de Selve**, Bishop of Lavaur and Dinteville's friend. The book under his elbow gives his age as 25.",
      },
      {
        region: { x: 0.38, y: 0.17, w: 0.11, h: 0.13 },
        body: "The upper shelf holds a **celestial globe** and instruments for measuring the heavens and telling the time: the world of learning and the sky.",
      },
      {
        region: { x: 0.515, y: 0.55, w: 0.245, h: 0.12 },
        body: "One of the **lute's** strings has snapped, often read as a symbol of discord, such as the religious divisions of the Reformation.",
      },
      {
        region: { x: 0.54, y: 0.63, w: 0.16, h: 0.07 },
        body: "An open **hymn book** shows Lutheran hymns in German, including Luther's version of *Veni Creator Spiritus*. Next to the broken lute, it's read as a hope for harmony between Catholics and Protestants.",
      },
      {
        region: { x: 0, y: 0, w: 0.025, h: 0.08 },
        body: "In the top-left corner, half hidden behind the curtain, is a small silver **crucifix**.",
      },
    ],
  },
  {
    slug: "proverbs",
    title: "Netherlandish Proverbs",
    description:
      "Pieter Bruegel the Elder, 1559. Oil on oak panel. Gemäldegalerie, Berlin. More than a hundred proverbs acted out in one village. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Pieter_Brueghel_the_Elder_-_The_Dutch_Proverbs_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.035, y: 0.375, w: 0.06, h: 0.075 },
        body: "An **upside-down globe**, its cross pointing at the ground, hangs from the inn: *the world turned upside down*. It sets the theme for the whole scene, a catalogue of human folly.",
      },
      {
        region: { x: 0.4, y: 0.65, w: 0.11, h: 0.2 },
        body: "A wife hangs a **blue cloak** on her husband: she's deceiving him. The painting's other title, *The Blue Cloak*, comes from this pair.",
      },
      {
        region: { x: 0.13, y: 0.03, w: 0.13, h: 0.16 },
        body: "**The roof is tiled with tarts**: a household with plenty, and more than it needs.",
      },
      {
        region: { x: 0.69, y: 0.59, w: 0.07, h: 0.12 },
        body: "A monk ties a **flaxen beard on Christ**: deceit dressed up as piety.",
      },
      {
        region: { x: 0.55, y: 0.73, w: 0.17, h: 0.13 },
        body: "**Casting roses before swine**: wasting good things on those who can't appreciate them, like the Bible's pearls before swine.",
      },
      {
        region: { x: 0.595, y: 0.865, w: 0.065, h: 0.12 },
        body: "A man **crawls through a globe**: to get on in the world, you have to stoop.",
      },
      {
        region: { x: 0.675, y: 0.425, w: 0.05, h: 0.045 },
        body: "**Big fish eat little fish**: the powerful prey on the weak.",
      },
    ],
  },
  {
    slug: "hunters",
    title: "Hunters in the Snow",
    description:
      "Pieter Bruegel the Elder, 1565. Oil on oak panel. Kunsthistorisches Museum, Vienna. One of a series of paintings of the seasons. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder_-_Hunters_in_the_Snow_(Winter)_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.24, y: 0.55, w: 0.18, h: 0.36 },
        body: "Three **hunters** trudge home with their dogs, heads down and footsore. They have little to show for the day: a single fox hangs over one man's back.",
      },
      {
        region: { x: 0.02, y: 0.54, w: 0.15, h: 0.12 },
        body: "Outside the inn, a family has built a **straw fire** to singe the bristles off a pig before butchering it.",
      },
      {
        region: { x: 0.085, y: 0.345, w: 0.04, h: 0.07 },
        body: "The **inn sign** hangs crookedly, half off its bracket. It shows a stag and a kneeling saint, Eustace or Hubert, patrons of hunters.",
      },
      {
        region: { x: 0.66, y: 0.53, w: 0.32, h: 0.17 },
        body: "Down on the **frozen ponds**, villagers skate, play an early form of ice hockey and curl.",
      },
      {
        region: { x: 0.8, y: 0.14, w: 0.2, h: 0.15 },
        body: "Flanders is flat. These **jagged peaks** are imagined, probably remembered from Bruegel's journey across the Alps to Italy in the 1550s.",
      },
      {
        region: { x: 0.68, y: 0.22, w: 0.05, h: 0.08 },
        body: "A lone **bird** glides out over the valley, carrying your eye from the hunters on the hill down into the wide landscape.",
      },
    ],
  },
  {
    slug: "meninas",
    title: "Las Meninas",
    description:
      "Diego Velázquez, 1656. Oil on canvas. Museo del Prado, Madrid. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Las_Meninas,_by_Diego_Vel%C3%A1zquez,_from_Prado_in_Google_Earth.jpg",
    annotations: [
      {
        region: { x: 0.17, y: 0.5, w: 0.14, h: 0.2 },
        body: "**Velázquez** paints himself at work, brush in hand, looking out at us, or at whoever stands where we do. The red cross of the Order of Santiago on his chest was added later: he only joined the order in 1659, three years after finishing the painting.",
      },
      {
        region: { x: 0.4, y: 0.635, w: 0.16, h: 0.28 },
        body: "The **Infanta Margarita Teresa**, the five-year-old daughter of King Philip IV, is the centre of attention, with her attendants gathered round.",
      },
      {
        region: { x: 0.385, y: 0.52, w: 0.065, h: 0.085 },
        body: "The **mirror** on the back wall shows the king and queen, Philip IV and Mariana of Austria. Are they standing where we are, watching the scene, or is the mirror reflecting the canvas Velázquez is painting? The puzzle is a large part of the painting's fame.",
      },
      {
        region: { x: 0.545, y: 0.525, w: 0.08, h: 0.14 },
        body: "In the bright doorway, **José Nieto Velázquez**, the queen's chamberlain, pauses on the stairs. Whether he's coming or going is left open.",
      },
      {
        region: { x: 0.27, y: 0.62, w: 0.12, h: 0.18 },
        body: "A maid of honour, **María Agustina Sarmiento**, kneels to offer the princess a drink in a small red clay cup. The painting's title means *the ladies-in-waiting*.",
      },
      {
        region: { x: 0.8, y: 0.6, w: 0.2, h: 0.25 },
        body: "**Maribárbola**, a dwarf of the court, looks straight out at us. Beside her, **Nicolasito Pertusato** prods the dog with his foot.",
      },
      {
        region: { x: 0.6, y: 0.85, w: 0.33, h: 0.13 },
        body: "A large **mastiff** dozes on the floor, unbothered by the boy nudging it.",
      },
      {
        region: { x: 0, y: 0.14, w: 0.16, h: 0.84 },
        body: "The **back of a huge canvas** fills the left edge. We never get to see what Velázquez is painting.",
      },
    ],
  },
  {
    slug: "night-watch",
    title: "The Night Watch",
    description:
      "Rembrandt van Rijn, 1642. Oil on canvas. Rijksmuseum, Amsterdam. A group portrait of an Amsterdam civic militia company. The nickname came later, when darkened varnish made the daytime scene look like night. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:The_Night_Watch_-_HD.jpg",
    annotations: [
      {
        region: { x: 0.41, y: 0.46, w: 0.13, h: 0.5 },
        body: "**Captain Frans Banninck Cocq**, in black with a red sash, gives the order to march. His outstretched hand casts a shadow across his lieutenant's coat.",
      },
      {
        region: { x: 0.555, y: 0.49, w: 0.12, h: 0.46 },
        body: "**Lieutenant Willem van Ruytenburch**, in pale gold, listens to his captain. Rembrandt sets the two side by side, dark against light.",
      },
      {
        region: { x: 0.27, y: 0.57, w: 0.09, h: 0.27 },
        body: "A glowing **girl with a dead chicken** hanging from her belt. Its claws (*klauw*) play on the company's name, the *kloveniers* or musketeers, and she's often read as a kind of living mascot.",
      },
      {
        region: { x: 0.15, y: 0.48, w: 0.13, h: 0.4 },
        body: "A **musketeer** in red loads his gun. He's one of several figures that show the steps of handling a musket.",
      },
      {
        region: { x: 0.85, y: 0.5, w: 0.14, h: 0.33 },
        body: "A **drummer** beats the call to march. The noise and movement are what set this group portrait apart from the stiff rows of earlier ones.",
      },
    ],
  },
  {
    slug: "art-of-painting",
    title: "The Art of Painting",
    description:
      "Johannes Vermeer, about 1666–1668. Oil on canvas. Kunsthistorisches Museum, Vienna. Also known as The Allegory of Painting. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Jan_Vermeer_-_The_Art_of_Painting_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.25, y: 0.39, w: 0.29, h: 0.28 },
        body: "The model poses as **Clio**, the Muse of history: a laurel wreath for honour, a trumpet for fame and a book of history.",
      },
      {
        region: { x: 0.57, y: 0.42, w: 0.3, h: 0.5 },
        body: "The **painter** is seen only from behind, in a fashionable slashed doublet. He's often taken to be Vermeer himself, though nothing confirms it. He has only just started: the canvas shows the beginnings of the laurel wreath.",
      },
      {
        region: { x: 0.38, y: 0.19, w: 0.6, h: 0.33 },
        body: "A large **map of the Seventeen Provinces** of the Netherlands, bordered by views of its cities. A crease runs down it close to the line that came to divide the Dutch Republic in the north from the Spanish Netherlands in the south.",
      },
      {
        region: { x: 0.52, y: 0.05, w: 0.28, h: 0.2 },
        body: "The brass **chandelier** is topped by a double-headed eagle, emblem of the Habsburgs, who once ruled the Netherlands. It holds no candles, often read as a sign of their faded power.",
      },
      {
        region: { x: 0.27, y: 0.59, w: 0.11, h: 0.07 },
        body: "A plaster **mask** lies on the table, perhaps standing for sculpture or theatre, arts that compete with painting.",
      },
      {
        region: { x: 0, y: 0, w: 0.4, h: 0.85 },
        body: "A heavy **tapestry** is drawn back like a stage curtain, inviting us into the room. Vermeer kept this painting until he died, and his widow tried to keep it from his creditors.",
      },
    ],
  },
  {
    slug: "venus",
    title: "The Birth of Venus",
    description:
      "Sandro Botticelli, about 1484–1486. Tempera on canvas. Uffizi Gallery, Florence. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg",
    annotations: [
      {
        region: { x: 0.45, y: 0.08, w: 0.17, h: 0.78 },
        body: "**Venus**, goddess of love, arrives on the shore fully grown, born from the sea foam. Her modest pose follows a classical statue type, the *Venus Pudica*. Her long neck and sloping shoulders are anatomically impossible, stretched for elegance.",
      },
      {
        region: { x: 0.03, y: 0.02, w: 0.36, h: 0.7 },
        body: "**Zephyr**, the west wind, blows her ashore, wrapped in the arms of a female companion, usually identified as the nymph Chloris or the breeze Aura.",
      },
      {
        region: { x: 0.63, y: 0.1, w: 0.35, h: 0.82 },
        body: "One of the **Horae**, goddesses of the seasons, waits on the shore with a flowered cloak to cover her. Her dress is patterned with cornflowers, and she wears a garland of myrtle.",
      },
      {
        region: { x: 0.25, y: 0.69, w: 0.4, h: 0.24 },
        body: "A **scallop shell** carries her in. The picture is painted on canvas, unusual for a large work in 1480s Florence, where wooden panels were the norm.",
      },
      {
        region: { x: 0.37, y: 0.25, w: 0.08, h: 0.15 },
        body: "**Roses** tumble on the wind. In one ancient story, roses came into being at the moment of Venus's birth.",
      },
    ],
  },
  {
    slug: "grande-jatte",
    title: "A Sunday on La Grande Jatte",
    description:
      "Georges Seurat, 1884–1886. Oil on canvas. Art Institute of Chicago. Seurat later added the painted border of dots. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg",
    annotations: [
      {
        region: { x: 0.76, y: 0.12, w: 0.2, h: 0.68 },
        body: "A **couple** in their Sunday best. Seurat exaggerates the profile of her bustle, the height of 1880s fashion.",
      },
      {
        region: { x: 0.62, y: 0.82, w: 0.08, h: 0.08 },
        body: "She has a **monkey** on a leash, an exotic and fashionable pet. Some read it as a sly comment on her: *singesse*, 'female monkey', was French slang for a prostitute.",
      },
      {
        region: { x: 0.07, y: 0.3, w: 0.07, h: 0.29 },
        body: "A woman **fishing** at the water's edge. Critics have long suspected a pun: *pêcher*, to fish, sounds like *pécher*, to sin.",
      },
      {
        region: { x: 0.43, y: 0.38, w: 0.045, h: 0.2 },
        body: "At the centre, a little **girl in white** faces us head-on, while almost everyone else is seen in profile.",
      },
      {
        region: { x: 0.45, y: 0.6, w: 0.12, h: 0.1 },
        body: "Up close, the grass is built from **small dabs of separate colours** that blend in the eye at a distance. Seurat called his method chromoluminarism; today it's usually called pointillism.",
      },
      {
        region: { x: 0.17, y: 0.17, w: 0.24, h: 0.13 },
        body: "Rowing boats and sailboats on the **Seine**. La Grande Jatte is an island in the river on the edge of Paris, a favourite Sunday escape.",
      },
    ],
  },
  {
    slug: "garden",
    title: "The Garden of Earthly Delights",
    description:
      "Hieronymus Bosch, about 1490–1510. Oil on oak panels, a triptych. Museo del Prado, Madrid. Left: Eden. Centre: a garden of earthly pleasures. Right: Hell. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:The_Garden_of_earthly_delights.jpg",
    annotations: [
      {
        region: { x: 0.07, y: 0.62, w: 0.13, h: 0.21 },
        body: "In the left panel, the Garden of Eden: **God presents Eve to Adam**. God looks out at us; Adam gazes at Eve.",
      },
      {
        region: { x: 0.1, y: 0.17, w: 0.06, h: 0.35 },
        body: "The pink **Fountain of Life** rises from the lake. In the hollow at its base an owl peers out, a creature often linked with evil or folly, even here in Paradise.",
      },
      {
        region: { x: 0.06, y: 0.27, w: 0.14, h: 0.1 },
        body: "An **elephant** and a **giraffe** wander through Eden. Bosch is unlikely to have seen either; he probably worked from travellers' descriptions and drawings.",
      },
      {
        region: { x: 0.38, y: 0.3, w: 0.32, h: 0.22 },
        body: "In the centre panel, naked riders on horses, camels, pigs and imaginary beasts circle a **pool of bathing women**. Whether the garden is a warning or a celebration is still argued over.",
      },
      {
        region: { x: 0.815, y: 0.29, w: 0.11, h: 0.23 },
        body: "The **Tree-Man**: a hollow, broken eggshell body standing on tree-trunk legs, with a tavern inside. The pale face looking back over its shoulder is sometimes thought to be Bosch himself.",
      },
      {
        region: { x: 0.805, y: 0.255, w: 0.06, h: 0.075 },
        body: "A pair of **giant ears** pierced by an arrow, with a knife blade between them, rolls through Hell like a war machine.",
      },
      {
        region: { x: 0.77, y: 0.54, w: 0.13, h: 0.2 },
        body: "**Musical Hell**: sinners tortured by instruments, a harp, a lute and a hurdy-gurdy among them. Nearby, a few bars of music are painted on a sinner's backside; they've since been transcribed and performed.",
      },
      {
        region: { x: 0.92, y: 0.6, w: 0.075, h: 0.18 },
        body: "The **Prince of Hell**, a bird-headed monster on a high chair, devours sinners and passes them out below.",
      },
    ],
  },
  {
    slug: "school-of-athens",
    title: "The School of Athens",
    description:
      "Raphael, 1509–1511. Fresco in the Stanza della Segnatura, Apostolic Palace, Vatican City. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:%22The_School_of_Athens%22_by_Raffaello_Sanzio_da_Urbino.jpg",
    annotations: [
      {
        region: { x: 0.47, y: 0.42, w: 0.1, h: 0.18 },
        body: "**Plato and Aristotle** stand at the centre, framed by the arch. Plato points upward and holds his *Timaeus*; Aristotle holds his *Ethics* and holds his hand out level with the ground. The gestures are often read as Plato's ideal forms against Aristotle's observable world. Plato is commonly said to have Leonardo da Vinci's face.",
      },
      {
        region: { x: 0.4, y: 0.6, w: 0.12, h: 0.19 },
        body: "The brooding figure leaning on the block is usually identified as **Heraclitus**, with the features of Michelangelo. He doesn't appear in Raphael's full-size preparatory drawing, so he was probably added late, perhaps after Raphael had seen Michelangelo's work on the Sistine Chapel ceiling.",
      },
      {
        region: { x: 0.545, y: 0.57, w: 0.12, h: 0.12 },
        body: "**Diogenes** the Cynic sprawls across the steps, alone and paying no attention to anyone around him.",
      },
      {
        region: { x: 0.23, y: 0.6, w: 0.1, h: 0.14 },
        body: "**Pythagoras** writes in a book while a boy holds up a small slate. Its diagram is usually read as the ratios of musical harmony, which Pythagoras was credited with discovering.",
      },
      {
        region: { x: 0.72, y: 0.62, w: 0.11, h: 0.17 },
        body: "Bending over a slate with a pair of compasses is **Euclid** (some say Archimedes), demonstrating a geometric proof to his students. He is often said to have the features of the architect Donato Bramante.",
      },
      {
        region: { x: 0.81, y: 0.52, w: 0.09, h: 0.15 },
        body: "**Ptolemy**, wearing a crown and seen from behind, holds a globe of the Earth. Facing him, **Zoroaster** holds a globe of the stars.",
      },
      {
        region: { x: 0.888, y: 0.528, w: 0.03, h: 0.055 },
        body: "Raphael painted **himself** among the astronomers at the far right, in a dark cap. He is one of the few figures looking straight out at us.",
      },
    ],
  },
];
