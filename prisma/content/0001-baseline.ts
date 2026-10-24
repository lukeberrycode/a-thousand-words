// The baseline content file (ADR 0026): the 37 paintings and 7 collections the old seed
// (prisma/seed.ts) loaded, from public-domain files on Wikimedia Commons. Regions are fractions
// (0–1) of each image (ADR 0005), placed against the exact file listed. Facts are kept to
// well-established art history. It predates the cap of 25 paintings a file and the rule that every
// annotation names its sources, so this file alone is exempt from both (src/lib/content/check.ts).
//
// Applied, this file is never edited: a correction is a new file. Each annotation's key is its
// painting's key and its place in the list, such as arnolfini-1 for the convex mirror.

import type { Region } from "@/lib/regions";
import type { Operation } from "@/lib/content/operations";

type Artwork = {
  /** The painting's content key: its R2 object is images/seed/<slug>.jpg. */
  slug: string;
  title: string;
  description: string;
  /** Wikimedia Commons file page, for credit and to find the file. */
  source: string;
  annotations: { region: Region; body: string }[];
};

const artworks: Artwork[] = [
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
    source:
      "https://commons.wikimedia.org/wiki/File:Hans_Holbein_the_Younger_-_The_Ambassadors_-_Google_Art_Project.jpg",
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
    source:
      "https://commons.wikimedia.org/wiki/File:Pieter_Brueghel_the_Elder_-_The_Dutch_Proverbs_-_Google_Art_Project.jpg",
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
    source:
      "https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder_-_Hunters_in_the_Snow_(Winter)_-_Google_Art_Project.jpg",
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
    description: "Diego Velázquez, 1656. Oil on canvas. Museo del Prado, Madrid. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:Las_Meninas,_by_Diego_Vel%C3%A1zquez,_from_Prado_in_Google_Earth.jpg",
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
    source:
      "https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg",
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

  // Northern Renaissance
  {
    slug: "ghent-altarpiece",
    title: "The Ghent Altarpiece",
    description:
      "Hubert and Jan van Eyck, completed 1432. Oil on oak panels. St Bavo's Cathedral, Ghent. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Lamgods_open.jpg",
    annotations: [
      {
        region: { x: 0.46, y: 0.67, w: 0.07, h: 0.08 },
        body: "The **Lamb of God** stands on an altar, blood flowing from its breast into a golden chalice. Angels kneel around it, and crowds of the faithful converge from all sides: the scene that gives the lower panels their name, *The Adoration of the Mystic Lamb*.",
      },
      {
        region: { x: 0.005, y: 0.17, w: 0.08, h: 0.4 },
        body: "**Adam**, almost life-size, is among the first large nudes in Northern European painting. Van Eyck paints him from below, as a viewer would have seen him on the altar, and his foot seems to step out of the niche.",
      },
      {
        region: { x: 0, y: 0.585, w: 0.125, h: 0.41 },
        body: "The *Just Judges* panel was stolen in 1934 and has never been found. What hangs in its place is a copy by the restorer Jef Van der Veken.",
      },
    ],
  },
  {
    slug: "moneylender",
    title: "The Moneylender and His Wife",
    description: "Quentin Matsys, 1514. Oil on panel. Musée du Louvre, Paris. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Quentin_Massys_001.jpg",
    annotations: [
      {
        region: { x: 0.5, y: 0.79, w: 0.125, h: 0.19 },
        body: "A small **convex mirror** on the table reflects a window and a man in a red hat, reading: someone standing just outside the picture. It's a nod to Jan van Eyck, who used the same device in *The Arnolfini Portrait*.",
      },
      {
        region: { x: 0.61, y: 0.68, w: 0.35, h: 0.25 },
        body: "His wife turns the pages of a devotional book illuminated with the Virgin and Child, but her eyes have drifted to the money. The picture is often read as a quiet warning about worldly distraction.",
      },
      {
        region: { x: 0.29, y: 0.55, w: 0.18, h: 0.3 },
        body: 'He weighs coins on a fine **balance**, checking that they hold their full weight of gold. A 17th-century description records a line from Leviticus on the original frame: "Let the balance be just and the weights equal."',
      },
    ],
  },
  {
    slug: "childrens-games",
    title: "Children's Games",
    description:
      "Pieter Bruegel the Elder, 1560. Oil on oak panel. Kunsthistorisches Museum, Vienna. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder_-_Children’s_Games_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.51, y: 0.84, w: 0.2, h: 0.15 },
        body: "Two boys bowl **hoops** along with sticks. Scholars have identified around eighty different games in the painting, played by more than two hundred children.",
      },
      {
        region: { x: 0.645, y: 0.69, w: 0.1, h: 0.2 },
        body: "A boy sits astride a **barrel** as if riding a horse, while another clambers up beside him.",
      },
      {
        region: { x: 0.14, y: 0.17, w: 0.2, h: 0.13 },
        body: "The games spill out into the countryside: in the distance, children **swim** and play in the river.",
      },
    ],
  },
  {
    slug: "tower-of-babel",
    title: "The Tower of Babel",
    description:
      "Pieter Bruegel the Elder, 1563. Oil on oak panel. Kunsthistorisches Museum, Vienna. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder_-_The_Tower_of_Babel_(Vienna)_-_Google_Art_Project_-_edited.jpg",
    annotations: [
      {
        region: { x: 0.13, y: 0.76, w: 0.14, h: 0.17 },
        body: "**King Nimrod**, traditionally the builder of the tower, inspects the work with his retinue. Stonemasons kneel before him.",
      },
      {
        region: { x: 0.44, y: 0, w: 0.15, h: 0.1 },
        body: "The unfinished top already pierces the clouds. In Genesis, God halts the building by confusing the builders' language.",
      },
      {
        region: { x: 0.28, y: 0.5, w: 0.38, h: 0.25 },
        body: "Tiers of arches recall the **Colosseum**, which Bruegel would have seen on his journey to Rome in the 1550s. The tower is built in rings around a rocky outcrop.",
      },
      {
        region: { x: 0.72, y: 0.6, w: 0.07, h: 0.12 },
        body: "A **treadwheel crane**, powered by men walking inside the wheel, hoists stone. The building methods are those of Bruegel's own day.",
      },
    ],
  },

  // Italian Renaissance
  {
    slug: "primavera",
    title: "Primavera",
    description:
      "Sandro Botticelli, late 1470s or early 1480s. Tempera on panel. Uffizi Gallery, Florence. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Botticelli-primavera.jpg",
    annotations: [
      {
        region: { x: 0.45, y: 0.2, w: 0.15, h: 0.6 },
        body: "**Venus** stands at the centre of her garden, framed by an arch of myrtle, a plant sacred to her.",
      },
      {
        region: { x: 0.43, y: 0, w: 0.17, h: 0.13 },
        body: "Above her, a blindfolded **Cupid** aims a flaming arrow at the Three Graces.",
      },
      {
        region: { x: 0.71, y: 0.17, w: 0.28, h: 0.75 },
        body: "Blue-skinned **Zephyrus**, the west wind, seizes the nymph **Chloris**. Flowers spill from her mouth as she turns into **Flora**, the goddess of spring, who stands beside her in a flowered dress. The story comes from Ovid's *Fasti*.",
      },
      {
        region: { x: 0.03, y: 0.17, w: 0.15, h: 0.78 },
        body: "**Mercury** raises his staff, the caduceus, to stir the clouds, keeping the garden in eternal spring.",
      },
    ],
  },
  {
    slug: "last-supper",
    title: "The Last Supper",
    description:
      "Leonardo da Vinci, about 1495–1498. Tempera and oil on plaster. Santa Maria delle Grazie, Milan. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Última_Cena_-_Da_Vinci_5.jpg",
    annotations: [
      {
        region: { x: 0.45, y: 0.48, w: 0.13, h: 0.22 },
        body: "**Christ** sits at the centre, framed by the bright window behind him. The lines of the ceiling and walls all converge on his head.",
      },
      {
        region: { x: 0.26, y: 0.5, w: 0.18, h: 0.2 },
        body: "**Judas**, in shadow, recoils and clutches a small bag, perhaps the thirty pieces of silver. Peter leans in behind him, a knife in hand, to speak to John.",
      },
      {
        region: { x: 0.555, y: 0.49, w: 0.06, h: 0.1 },
        body: '**Thomas** raises an index finger. Each apostle reacts in his own way to Christ\'s words: "One of you will betray me."',
      },
      {
        region: { x: 0.39, y: 0.8, w: 0.24, h: 0.2 },
        body: "In 1652 a **doorway** was cut through the wall, removing Christ's feet. Leonardo had painted on dry plaster rather than in true fresco, and the work began flaking within his lifetime.",
      },
    ],
  },

  // Baroque
  {
    slug: "calling-of-st-matthew",
    title: "The Calling of Saint Matthew",
    description:
      "Caravaggio, 1599–1600. Oil on canvas. Contarelli Chapel, San Luigi dei Francesi, Rome. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:The_Calling_of_Saint_Matthew-Caravaggo_(1599-1600).jpg",
    annotations: [
      {
        region: { x: 0.61, y: 0.4, w: 0.08, h: 0.06 },
        body: "Christ's pointing **hand** is often compared to Adam's in Michelangelo's *Creation of Adam* on the Sistine Chapel ceiling.",
      },
      {
        region: { x: 0.21, y: 0.4, w: 0.13, h: 0.17 },
        body: 'The bearded man points, apparently at himself: "Me?" He is usually taken to be **Matthew**, the tax collector, though some scholars argue that he is pointing at the young man hunched over the coins beside him.',
      },
      {
        region: { x: 0.6, y: 0.3, w: 0.4, h: 0.12 },
        body: "A shaft of **light** enters from the upper right, above Christ, and falls across the faces at the table. The window in the picture stays dim.",
      },
    ],
  },
  {
    slug: "anatomy-lesson",
    title: "The Anatomy Lesson of Dr Nicolaes Tulp",
    description: "Rembrandt, 1632. Oil on canvas. Mauritshuis, The Hague. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg",
    annotations: [
      {
        region: { x: 0.5, y: 0.6, w: 0.14, h: 0.15 },
        body: "Dr Tulp lifts the muscles of the forearm with forceps. Dissections usually began with the abdomen, which decays first; Rembrandt chose the arm, perhaps working partly from an anatomy book.",
      },
      {
        region: { x: 0.56, y: 0.25, w: 0.17, h: 0.2 },
        body: "**Dr Nicolaes Tulp**, official anatomist of the Amsterdam Guild of Surgeons, is the only figure wearing a hat.",
      },
      {
        region: { x: 0.25, y: 0.62, w: 0.6, h: 0.25 },
        body: "The body is that of **Aris Kindt**, a criminal hanged for armed robbery in January 1632. Public dissections were held in winter, when the cold slowed decay.",
      },
      {
        region: { x: 0.31, y: 0.08, w: 0.14, h: 0.05 },
        body: "The signature reads *Rembrandt f[ecit] 1632*. Around this time he stopped signing with his monogram and began using his first name alone.",
      },
    ],
  },
  {
    slug: "surrender-of-breda",
    title: "The Surrender of Breda",
    description:
      "Diego Velázquez, 1634–1635. Oil on canvas. Museo del Prado, Madrid. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Velázquez_-_de_Breda_o_Las_Lanzas_(Museo_del_Prado,_1634-35).jpg",
    annotations: [
      {
        region: { x: 0.38, y: 0.45, w: 0.3, h: 0.45 },
        body: "**Justin of Nassau**, the Dutch commander, hands the keys of Breda to the Spanish general **Ambrogio Spinola**. Spinola lays a hand on his shoulder, stopping him from kneeling: a gesture of courtesy to a defeated enemy.",
      },
      {
        region: { x: 0.61, y: 0.04, w: 0.39, h: 0.33 },
        body: "The upright **lances** of the Spanish army give the painting its nickname in Spain: *Las Lanzas*, the Lances.",
      },
      {
        region: { x: 0.935, y: 0.39, w: 0.065, h: 0.1 },
        body: "The man in the large hat at the far right, looking out at us, is often thought to be a self-portrait of **Velázquez**.",
      },
      {
        region: { x: 0.915, y: 0.88, w: 0.07, h: 0.07 },
        body: "A blank sheet of paper lies on the ground, where a signature or inscription might be expected.",
      },
    ],
  },

  // Revolution and Empire
  {
    slug: "oath-of-the-horatii",
    title: "Oath of the Horatii",
    description:
      "Jacques-Louis David, 1784. Oil on canvas. Musée du Louvre, Paris. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Jacques-Louis_David,_Le_Serment_des_Horaces.jpg",
    annotations: [
      {
        region: { x: 0.4, y: 0.29, w: 0.11, h: 0.33 },
        body: "The father raises **three swords** for his sons to swear on. They will fight the three Curiatii brothers of Alba Longa to settle a war between the two cities.",
      },
      {
        region: { x: 0.08, y: 0.34, w: 0.36, h: 0.6 },
        body: "The **brothers** salute with outstretched arms, legs braced: a tight, sculptural group of straight lines.",
      },
      {
        region: { x: 0.62, y: 0.55, w: 0.38, h: 0.38 },
        body: "The **women** slump in grief, all curves, in contrast with the men. Camilla, the brothers' sister, is engaged to one of the Curiatii; Sabina, a Curiatii sister, is married to one of the Horatii. Whatever the outcome, they will lose someone.",
      },
      {
        region: { x: 0.1, y: 0.04, w: 0.8, h: 0.2 },
        body: "Three **arches**, three groups: each arch frames one part of the scene: the sons, the father, the women.",
      },
    ],
  },
  {
    slug: "death-of-marat",
    title: "The Death of Marat",
    description:
      "Jacques-Louis David, 1793. Oil on canvas. Royal Museums of Fine Arts of Belgium, Brussels. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Death_of_Marat_by_David.jpg",
    annotations: [
      {
        region: { x: 0.66, y: 0.52, w: 0.2, h: 0.09 },
        body: 'Marat still holds the **letter** his killer used to get in. It reads: *Du 13 juillet 1793. Marie anne Charlotte Corday au citoyen Marat. Il suffit que je sois bien malheureuse pour avoir droit à votre bienveillance*: "It is enough that I am very unhappy to have a right to your kindness."',
      },
      {
        region: { x: 0.6, y: 0.89, w: 0.25, h: 0.1 },
        body: "A plain wooden crate becomes a tombstone: *À Marat, David*. Below, *L'an deux*, Year Two of the new Revolutionary calendar. David was Marat's friend and a fellow member of the National Convention.",
      },
      {
        region: { x: 0.07, y: 0.94, w: 0.22, h: 0.05 },
        body: "The bloodstained **knife** lies on the floor. Charlotte Corday stabbed Marat in his bath on 13 July 1793.",
      },
      {
        region: { x: 0.07, y: 0.41, w: 0.22, h: 0.15 },
        body: "Marat suffered from a painful skin disease and worked from a medicinal bath, his head wrapped in a vinegar-soaked cloth.",
      },
    ],
  },
  {
    slug: "coronation-of-napoleon",
    title: "The Coronation of Napoleon",
    description:
      "Jacques-Louis David, 1805–1807. Oil on canvas. Musée du Louvre, Paris. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Jacques-Louis_David,_The_Coronation_of_Napoleon_edit.jpg",
    annotations: [
      {
        region: { x: 0.53, y: 0.56, w: 0.1, h: 0.32 },
        body: "**Napoleon** raises the crown over Josephine. He had already crowned himself; David's early sketches showed that moment, but he chose this gentler scene for the final painting.",
      },
      {
        region: { x: 0.43, y: 0.68, w: 0.1, h: 0.25 },
        body: "**Josephine** kneels to receive her crown.",
      },
      {
        region: { x: 0.635, y: 0.57, w: 0.08, h: 0.22 },
        body: "**Pope Pius VII** sits behind Napoleon, his hand raised in blessing. He had come from Rome for the ceremony, held in Notre-Dame de Paris on 2 December 1804.",
      },
      {
        region: { x: 0.415, y: 0.52, w: 0.06, h: 0.11 },
        body: "In the central box sits Napoleon's mother, **Letizia**. She didn't attend the ceremony, but Napoleon had her painted in.",
      },
    ],
  },
  {
    slug: "third-of-may",
    title: "The Third of May 1808",
    description: "Francisco Goya, 1814. Oil on canvas. Museo del Prado, Madrid. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:El_Tres_de_Mayo,_by_Francisco_de_Goya,_from_Prado_thin_black_margin.jpg",
    annotations: [
      {
        region: { x: 0.2, y: 0.37, w: 0.22, h: 0.4 },
        body: "The man in the white shirt flings his arms wide, like a figure on a cross. Some see a mark like a stigma on his right palm.",
      },
      {
        region: { x: 0.6, y: 0.38, w: 0.4, h: 0.52 },
        body: "The French **firing squad** turns its back to us. We never see the soldiers' faces: they are a single, mechanical line of rifles.",
      },
      {
        region: { x: 0.57, y: 0.65, w: 0.1, h: 0.15 },
        body: "A large **lantern** on the ground is the only light source, throwing its glare on the victims.",
      },
    ],
  },
  {
    slug: "raft-of-the-medusa",
    title: "The Raft of the Medusa",
    description:
      "Théodore Géricault, 1818–1819. Oil on canvas. Musée du Louvre, Paris. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:JEAN_LOUIS_THÉODORE_GÉRICAULT_-_La_Balsa_de_la_Medusa_(Museo_del_Louvre,_1818-19).jpg",
    annotations: [
      {
        region: { x: 0.64, y: 0.08, w: 0.16, h: 0.42 },
        body: "At the top of a pyramid of bodies, a man waves a cloth at a distant ship, the *Argus*, barely visible on the horizon. It would rescue the survivors.",
      },
      {
        region: { x: 0.13, y: 0.5, w: 0.3, h: 0.4 },
        body: "An old man sits with the body of a young man across his lap, turned away from the hope at the other end of the raft. Of some 150 people set adrift, only 15 were alive when the raft was found 13 days later.",
      },
    ],
  },
  {
    slug: "liberty-leading-the-people",
    title: "Liberty Leading the People",
    description: "Eugène Delacroix, 1830. Oil on canvas. Musée du Louvre, Paris. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:Eugène_Delacroix_-_Le_28_Juillet._La_Liberté_guidant_le_peuple.jpg",
    annotations: [
      {
        region: { x: 0.46, y: 0.08, w: 0.2, h: 0.62 },
        body: "**Liberty**, bare-breasted and wearing a Phrygian cap, a symbol of freedom since the Revolution, strides over the barricade with a bayonetted musket.",
      },
      {
        region: { x: 0.32, y: 0, w: 0.29, h: 0.2 },
        body: "She holds up the **tricolour**, banned under the restored Bourbon monarchy. The July Revolution of 1830 brought it back as the national flag.",
      },
      {
        region: { x: 0.18, y: 0.25, w: 0.16, h: 0.45 },
        body: "The man in the **top hat** has often been taken for Delacroix himself, though that's disputed.",
      },
      {
        region: { x: 0.66, y: 0.2, w: 0.17, h: 0.55 },
        body: "A boy with a pistol in each hand is often said to have inspired Gavroche, the street urchin in Victor Hugo's *Les Misérables*.",
      },
      {
        region: { x: 0.84, y: 0.36, w: 0.06, h: 0.1 },
        body: "Through the smoke rise the towers of **Notre-Dame**, placing the scene in Paris.",
      },
    ],
  },

  // Battles
  {
    slug: "battle-of-san-romano",
    title: "The Battle of San Romano",
    description:
      "Paolo Uccello, about 1438–1440. Egg tempera with walnut oil on poplar. National Gallery, London. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:San_Romano_Battle_(Paolo_Uccello,_London)_01.jpg",
    annotations: [
      {
        region: { x: 0.4, y: 0.32, w: 0.15, h: 0.4 },
        body: "**Niccolò da Tolentino**, the Florentine commander, rides into battle in a vast red-and-gold hat instead of a helmet. This panel is one of three: the others are in the Uffizi, Florence, and the Louvre, Paris.",
      },
      {
        region: { x: 0.2, y: 0.8, w: 0.7, h: 0.2 },
        body: "Broken lances and fallen armour are laid out on the ground along lines of perspective, and a fallen soldier is sharply foreshortened. Uccello was famously obsessed with perspective.",
      },
    ],
  },
  {
    slug: "battle-of-issus",
    title: "The Battle of Alexander at Issus",
    description:
      "Albrecht Altdorfer, 1529. Oil on panel. Alte Pinakothek, Munich. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:Albrecht_Altdorfer_-_Schlacht_bei_Issus_(Alte_Pinakothek,_München)_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.35, y: 0, w: 0.28, h: 0.16 },
        body: "The Latin tablet tells the story: Alexander the Great defeats the last Darius, killing 100,000 Persian foot soldiers and more than 10,000 horsemen; Darius flees with no more than 1,000 horsemen, and his mother, wife and children are captured.",
      },
      {
        region: { x: 0.76, y: 0.27, w: 0.22, h: 0.12 },
        body: "The **sun** blazes through the clouds, while a crescent **moon** hangs in the top-left corner. Painted in 1529, the year the Ottoman Turks besieged Vienna, the battle between Greeks and Persians was also read as one between Christian Europe and the East.",
      },
      {
        region: { x: 0.22, y: 0.665, w: 0.13, h: 0.045 },
        body: "In the middle of the crush, **Darius** turns to flee in his chariot. Its plaque bears his name.",
      },
    ],
  },
  {
    slug: "scotland-forever",
    title: "Scotland Forever!",
    description:
      "Elizabeth Thompson, Lady Butler, 1881. Oil on canvas. Leeds Art Gallery. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Scotland_Forever!.jpg",
    annotations: [
      {
        region: { x: 0.39, y: 0.42, w: 0.15, h: 0.55 },
        body: "The **Royal Scots Greys**, named for their grey horses, charge at Waterloo in 1815. Butler shows them head-on, as if they're about to ride out of the canvas.",
      },
      {
        region: { x: 0.4, y: 0.18, w: 0.12, h: 0.25 },
        body: "*Scotland Forever!* was the cry as the Greys charged alongside the Highland regiments. Butler painted the scene in 1881, without ever having seen a battle.",
      },
    ],
  },

  // Modern life
  {
    slug: "derby-day",
    title: "The Derby Day",
    description:
      "William Powell Frith, 1856–1858. Oil on canvas. Tate Britain, London. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:William_Powell_Frith_-_The_Derby_Day_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.44, y: 0.68, w: 0.13, h: 0.3 },
        body: "An **acrobat** prepares to perform, but his son is distracted by the food being unpacked nearby.",
      },
      {
        region: { x: 0.11, y: 0.58, w: 0.17, h: 0.3 },
        body: "On the left, a crowd gathers around a **thimble-rig**, a gambling swindle like the shell game. Among the onlookers is a countryman in a smock.",
      },
      {
        region: { x: 0.3, y: 0.35, w: 0.12, h: 0.15 },
        body: "The **grandstand** at Epsom Downs. Frith worked from sketches and from photographs commissioned from Robert Howlett. At the Royal Academy in 1858 the painting drew such crowds that a rail was put up to protect it.",
      },
    ],
  },
  {
    slug: "moulin-de-la-galette",
    title: "Bal du moulin de la Galette",
    description:
      "Pierre-Auguste Renoir, 1876. Oil on canvas. Musée d'Orsay, Paris. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Pierre-Auguste_Renoir,_Le_Moulin_de_la_Galette.jpg",
    annotations: [
      {
        region: { x: 0.15, y: 0.05, w: 0.3, h: 0.13 },
        body: "The Moulin de la Galette was an open-air dance hall in Montmartre, named after a windmill and the *galettes* it sold. Renoir painted much of the picture on the spot, with friends helping carry the large canvas.",
      },
      {
        region: { x: 0.6, y: 0.45, w: 0.2, h: 0.4 },
        body: "Patches of **dappled sunlight** fall through the trees onto jackets, hats and the ground. Some critics at the time thought they looked like stains.",
      },
      {
        region: { x: 0.8, y: 0.42, w: 0.2, h: 0.35 },
        body: "At the table sit some of Renoir's friends, among them the painters Norbert Goeneutte and Pierre-Franc Lamy, and the writer Georges Rivière.",
      },
    ],
  },
  {
    slug: "paris-street-rainy-day",
    title: "Paris Street; Rainy Day",
    description:
      "Gustave Caillebotte, 1877. Oil on canvas. Art Institute of Chicago. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:Gustave_Caillebotte_-_Paris_Street;_Rainy_Day_-_Google_Art_Project.jpg",
    annotations: [
      {
        region: { x: 0.47, y: 0, w: 0.06, h: 0.74 },
        body: "The green **lamppost** splits the picture in two, and the horizon cuts across it, dividing the canvas into quarters.",
      },
      {
        region: { x: 0.5, y: 0.35, w: 0.36, h: 0.63 },
        body: "A fashionable couple stroll under one umbrella. The setting is the Place de Dublin, a new crossroads in the wide boulevards of Haussmann's rebuilt Paris.",
      },
      {
        region: { x: 0.06, y: 0.955, w: 0.11, h: 0.035 },
        body: "Signed *G. Caillebotte 1877*. He showed the painting at the third Impressionist exhibition that year.",
      },
    ],
  },
  {
    slug: "folies-bergere",
    title: "A Bar at the Folies-Bergère",
    description:
      "Édouard Manet, 1882. Oil on canvas. The Courtauld Gallery, London. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Edouard_Manet,_A_Bar_at_the_Folies-Bergère.jpg",
    annotations: [
      {
        region: { x: 0.43, y: 0.03, w: 0.15, h: 0.27 },
        body: "The **barmaid** was a real employee of the Folies-Bergère, known as Suzon. She posed behind a bar set up in Manet's studio.",
      },
      {
        region: { x: 0.69, y: 0, w: 0.31, h: 0.66 },
        body: "Behind her is a **mirror**, but its reflection doesn't add up: her reflected back is shifted far to the right, and the man in the top hat talking to her should be standing where we are.",
      },
      {
        region: { x: 0.02, y: 0, w: 0.06, h: 0.06 },
        body: "At the top left, a pair of legs in green boots: a **trapeze artist** performing above the crowd.",
      },
      {
        region: { x: 0.025, y: 0.65, w: 0.1, h: 0.28 },
        body: "Manet signed and dated the painting on a bottle label: *Manet 1882*. The red triangle beside it marks a bottle of Bass Pale Ale.",
      },
    ],
  },

  // Japanese prints
  {
    slug: "red-fuji",
    title: "Fine Wind, Clear Morning",
    description:
      "Katsushika Hokusai, about 1831. Colour woodblock print from the series Thirty-six Views of Mount Fuji. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Red_Fuji_southern_wind_clear_morning.jpg",
    annotations: [
      {
        region: { x: 0.55, y: 0.19, w: 0.45, h: 0.5 },
        body: "Early-morning sun turns **Mount Fuji** red, as can happen in late summer and early autumn. The print is often called *Red Fuji*.",
      },
      {
        region: { x: 0.06, y: 0.09, w: 0.09, h: 0.26 },
        body: "The cartouche gives the series, *Thirty-six Views of Mount Fuji*, and the title, *South Wind, Clear Sky*. Beside it Hokusai signs himself *Hokusai aratame Iitsu hitsu*.",
      },
      {
        region: { x: 0.15, y: 0.03, w: 0.55, h: 0.3 },
        body: "Rows of small, high **clouds** fill the sky, of a kind seen on fine autumn days.",
      },
    ],
  },
  {
    slug: "takiyasha",
    title: "Takiyasha the Witch and the Skeleton Spectre",
    description:
      "Utagawa Kuniyoshi, about 1844. Colour woodblock print triptych. Public domain, via Wikimedia Commons.",
    source: "https://commons.wikimedia.org/wiki/File:Takiyasha_the_Witch_and_the_Skeleton_Spectre.jpg",
    annotations: [
      {
        region: { x: 0.35, y: 0.02, w: 0.3, h: 0.5 },
        body: "A **giant skeleton spectre**, summoned by Takiyasha, leans in through a torn blind. Kuniyoshi draws its bones in unusual anatomical detail.",
      },
      {
        region: { x: 0, y: 0.2, w: 0.23, h: 0.58 },
        body: "**Takiyasha**, daughter of the rebel warlord Taira no Masakado, reads a spell from a scroll in the ruins of her father's palace.",
      },
      {
        region: { x: 0.34, y: 0.43, w: 0.2, h: 0.47 },
        body: "The warrior **Ōya no Tarō Mitsukuni**, sent to hunt down the last of Masakado's followers, stands his ground. His name is written in the cartouche between the two warriors.",
      },
    ],
  },
  {
    slug: "sudden-shower",
    title: "Sudden Shower over Shin-Ōhashi Bridge and Atake",
    description:
      "Utagawa Hiroshige, 1857. Colour woodblock print from the series One Hundred Famous Views of Edo. Public domain, via Wikimedia Commons.",
    source:
      "https://commons.wikimedia.org/wiki/File:Hiroshige,_Sudden_shower_over_Shin-Ōhashi_bridge_and_Atake,_1857.jpg",
    annotations: [
      {
        region: { x: 0.18, y: 0.55, w: 0.6, h: 0.21 },
        body: "Travellers hurry across the Shin-Ōhashi bridge, caught in a sudden summer **shower**. Vincent van Gogh copied this print in oils in 1887.",
      },
      {
        region: { x: 0.1, y: 0.49, w: 0.41, h: 0.05 },
        body: "A lone raftsman poles a **log raft** down the Sumida River through the rain.",
      },
      {
        region: { x: 0.73, y: 0.05, w: 0.2, h: 0.18 },
        body: "The red cartouche names the series, *One Hundred Famous Views of Edo*; the smaller one gives this print's title.",
      },
    ],
  },
];

type Collection = {
  slug: string;
  name: string;
  blurb: string;
  /** Artwork slugs, in the order they appear in the row. A painting can be in several collections. */
  artworks: string[];
};

/** Home page rows, top to bottom (ADR 0014). */
const collections: Collection[] = [
  {
    slug: "northern-renaissance",
    name: "Northern Renaissance",
    blurb: "Flanders and the Low Countries, where oil paint made every detail count.",
    artworks: [
      "ghent-altarpiece",
      "arnolfini",
      "garden",
      "moneylender",
      "ambassadors",
      "proverbs",
      "childrens-games",
      "tower-of-babel",
      "hunters",
    ],
  },
  {
    slug: "italian-renaissance",
    name: "Italian Renaissance",
    blurb: "Florence, Milan and Rome rediscover the ancient world.",
    artworks: ["primavera", "venus", "last-supper", "school-of-athens"],
  },
  {
    slug: "baroque",
    name: "The Golden Age",
    blurb: "Seventeenth-century Italy, Spain and the Dutch Republic.",
    artworks: [
      "calling-of-st-matthew",
      "anatomy-lesson",
      "surrender-of-breda",
      "night-watch",
      "meninas",
      "art-of-painting",
    ],
  },
  {
    slug: "revolution-and-empire",
    name: "Art of Revolution and Empire",
    blurb: "France and Spain from the eve of the Revolution to the July Revolution of 1830.",
    artworks: [
      "oath-of-the-horatii",
      "death-of-marat",
      "coronation-of-napoleon",
      "third-of-may",
      "raft-of-the-medusa",
      "liberty-leading-the-people",
    ],
  },
  {
    slug: "battles",
    name: "Battle Paintings",
    blurb: "Armies, sieges and charges, from the Renaissance to the Victorians.",
    artworks: ["battle-of-san-romano", "battle-of-issus", "surrender-of-breda", "third-of-may", "scotland-forever"],
  },
  {
    slug: "modern-life",
    name: "Modern Life",
    blurb: "Crowds, cafés and boulevards in the second half of the 19th century.",
    artworks: ["derby-day", "moulin-de-la-galette", "paris-street-rainy-day", "folies-bergere", "grande-jatte"],
  },
  {
    slug: "japanese-prints",
    name: "Japanese Woodblock Prints",
    blurb: "Ukiyo-e, pictures of the floating world, from Edo-period Japan.",
    artworks: ["great-wave", "red-fuji", "takiyasha", "sudden-shower"],
  },
];

export const operations: Operation[] = [
  ...artworks.flatMap(({ slug, title, description, source, annotations }): Operation[] => [
    { op: "addPainting", key: slug, title, description, source },
    ...annotations.map(({ region, body }, i): Operation => ({
      op: "annotate",
      painting: slug,
      key: `${slug}-${i + 1}`,
      region,
      body,
      sources: [],
    })),
  ]),
  ...collections.flatMap(({ slug, name, blurb, artworks: paintings }): Operation[] => [
    { op: "addCollection", slug, name, blurb },
    { op: "addToCollection", collection: slug, paintings },
  ]),
];
