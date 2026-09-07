import type { Quote } from './quotes';

const PRIDE_AND_PREJUDICE = 'https://www.gutenberg.org/files/1342/1342-h/1342-h.htm';
const EMMA = 'https://www.gutenberg.org/files/158/158-h/158-h.htm';
const PERSUASION = 'https://www.gutenberg.org/files/105/105-h/105-h.htm';
const JANE_EYRE = 'https://www.gutenberg.org/files/1260/1260-h/1260-h.htm';
const WUTHERING_HEIGHTS = 'https://www.gutenberg.org/files/768/768-h/768-h.htm';
const GREAT_EXPECTATIONS = 'https://www.gutenberg.org/files/1400/1400-h/1400-h.htm';
const TALE_OF_TWO_CITIES = 'https://www.gutenberg.org/files/98/98-h/98-h.htm';
const DAVID_COPPERFIELD = 'https://www.gutenberg.org/files/766/766-h/766-h.htm';
const MOBY_DICK = 'https://www.gutenberg.org/files/2701/2701-h/2701-h.htm';
const HUCK_FINN = 'https://www.gutenberg.org/files/76/76-h/76-h.htm';
const DORIAN_GRAY = 'https://www.gutenberg.org/files/174/174-h/174-h.htm';
const WALDEN = 'https://www.gutenberg.org/files/205/205-h/205-h.htm';
const LEAVES_OF_GRASS = 'https://www.gutenberg.org/files/1322/1322-h/1322-h.htm';
const GREAT_GATSBY = 'https://www.gutenberg.org/cache/epub/64317/pg64317.txt';
const ANNA_KARENINA = 'https://www.gutenberg.org/cache/epub/1399/pg1399.txt';
const CRIME_AND_PUNISHMENT = 'https://www.gutenberg.org/cache/epub/2554/pg2554.txt';
const BROTHERS_KARAMAZOV = 'https://www.gutenberg.org/cache/epub/28054/pg28054.txt';
const MIDDLEMARCH = 'https://www.gutenberg.org/cache/epub/145/pg145.txt';
const FRANKENSTEIN = 'https://www.gutenberg.org/cache/epub/84/pg84.txt';
const ALICE_IN_WONDERLAND = 'https://www.gutenberg.org/cache/epub/11/pg11.txt';
const LITTLE_WOMEN = 'https://www.gutenberg.org/cache/epub/514/pg514.txt';
const HEART_OF_DARKNESS = 'https://www.gutenberg.org/cache/epub/219/pg219.txt';

export const en: readonly Quote[] = [
  { text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.', work: 'Pride and Prejudice', author: 'Jane Austen', source: PRIDE_AND_PREJUDICE },
  { text: 'She is tolerable: but not handsome enough to tempt me.', work: 'Pride and Prejudice', author: 'Jane Austen', source: PRIDE_AND_PREJUDICE },
  { text: 'I could easily forgive his pride, if he had not mortified mine.', work: 'Pride and Prejudice', author: 'Jane Austen', source: PRIDE_AND_PREJUDICE },
  { text: 'It shows an affection for her sister that is very pleasing.', work: 'Pride and Prejudice', author: 'Jane Austen', source: PRIDE_AND_PREJUDICE },

  { text: 'Emma Woodhouse, handsome, clever, and rich, with a comfortable home and happy disposition, seemed to unite some of the best blessings of existence.', work: 'Emma', author: 'Jane Austen', source: EMMA },
  { text: "She was not struck by any thing remarkably clever in Miss Smith's conversation, but she found her altogether very engaging.", work: 'Emma', author: 'Jane Austen', source: EMMA },

  { text: "Vanity was the beginning and the end of Sir Walter Elliot's character; vanity of person and of situation.", work: 'Persuasion', author: 'Jane Austen', source: PERSUASION },
  { text: 'He was brilliant, he was headstrong. Lady Russell had little taste for wit, and of anything approaching to imprudence a horror.', work: 'Persuasion', author: 'Jane Austen', source: PERSUASION },

  { text: 'I am not deceitful: if I were, I should say I loved you; but I declare I do not love you', work: 'Jane Eyre', author: 'Charlotte Brontë', source: JANE_EYRE },
  { text: 'I would fain exercise some better faculty than that of fierce speaking', work: 'Jane Eyre', author: 'Charlotte Brontë', source: JANE_EYRE },
  { text: 'Thus was I severed from Bessie and Gateshead; thus whirled away to unknown, and, as I then deemed, remote and mysterious regions.', work: 'Jane Eyre', author: 'Charlotte Brontë', source: JANE_EYRE },

  { text: "A perfect misanthropist's Heaven—and Mr. Heathcliff and I are such a suitable pair to divide the desolation between us.", work: 'Wuthering Heights', author: 'Emily Brontë', source: WUTHERING_HEIGHTS },
  { text: "It's a cuckoo's, sir—I know all about it: except where he was born, and who were his parents, and how he got his money at first.", work: 'Wuthering Heights', author: 'Emily Brontë', source: WUTHERING_HEIGHTS },

  { text: 'So, I called myself Pip, and came to be called Pip.', work: 'Great Expectations', author: 'Charles Dickens', source: GREAT_EXPECTATIONS },
  { text: 'Be grateful.', work: 'Great Expectations', author: 'Charles Dickens', source: GREAT_EXPECTATIONS },
  { text: "I took him. He knows it. That's enough for me.", work: 'Great Expectations', author: 'Charles Dickens', source: GREAT_EXPECTATIONS },

  { text: 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness', work: 'A Tale of Two Cities', author: 'Charles Dickens', source: TALE_OF_TWO_CITIES },
  { text: 'A wonderful fact to reflect upon, that every human creature is constituted to be that profound secret and mystery to every other.', work: 'A Tale of Two Cities', author: 'Charles Dickens', source: TALE_OF_TWO_CITIES },

  { text: 'Whether I shall turn out to be the hero of my own life, or whether that station will be held by anybody else, these pages must show.', work: 'David Copperfield', author: 'Charles Dickens', source: DAVID_COPPERFIELD },
  { text: 'I believe I can remember these two at a little distance apart, dwarfed to my sight by stooping down or kneeling on the floor, and I going unsteadily from the one to the other.', work: 'David Copperfield', author: 'Charles Dickens', source: DAVID_COPPERFIELD },

  { text: 'Call me Ishmael.', work: 'Moby-Dick', author: 'Herman Melville', source: MOBY_DICK },
  { text: 'It is the image of the ungraspable phantom of life; and this is the key to it all.', work: 'Moby-Dick', author: 'Herman Melville', source: MOBY_DICK },
  { text: 'A man can be honest in any sort of skin.', work: 'Moby-Dick', author: 'Herman Melville', source: MOBY_DICK },

  { text: 'That book was made by Mr. Mark Twain, and he told the truth, mainly.', work: 'Adventures of Huckleberry Finn', author: 'Mark Twain', source: HUCK_FINN },
  { text: 'Well, three or four months run along, and it was well into the winter now.', work: 'Adventures of Huckleberry Finn', author: 'Mark Twain', source: HUCK_FINN },

  { text: 'There is no such thing as a moral or an immoral book. Books are well written, or badly written.', work: 'The Picture of Dorian Gray', author: 'Oscar Wilde', source: DORIAN_GRAY },
  { text: 'The only excuse for making a useless thing is that one admires it intensely.', work: 'The Picture of Dorian Gray', author: 'Oscar Wilde', source: DORIAN_GRAY },
  { text: 'There is only one thing in the world worse than being talked about, and that is not being talked about.', work: 'The Picture of Dorian Gray', author: 'Oscar Wilde', source: DORIAN_GRAY },

  { text: 'The mass of men lead lives of quiet desperation.', work: 'Walden', author: 'Henry David Thoreau', source: WALDEN },
  { text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life.', work: 'Walden', author: 'Henry David Thoreau', source: WALDEN },
  { text: 'Beware of all enterprises that require new clothes, and not rather a new wearer of clothes.', work: 'Walden', author: 'Henry David Thoreau', source: WALDEN },

  { text: "One's-self I sing, a simple separate person,\nYet utter the word Democratic, the word En-Masse.", work: 'Leaves of Grass', author: 'Walt Whitman', source: LEAVES_OF_GRASS },
  { text: 'I celebrate myself, and sing myself,\nAnd what I assume you shall assume,', work: 'Leaves of Grass', author: 'Walt Whitman', source: LEAVES_OF_GRASS },

  { text: '"Whenever you feel like criticizing anyone," he told me, "just remember that all the people in this world haven\'t had the advantages that you\'ve had."', work: 'The Great Gatsby', author: 'F. Scott Fitzgerald', source: GREAT_GATSBY },
  { text: 'So we beat on, boats against the current, borne back ceaselessly into the past.', work: 'The Great Gatsby', author: 'F. Scott Fitzgerald', source: GREAT_GATSBY },
  { text: "And I hope she'll be a fool—that's the best thing a girl can be in this world, a beautiful little fool.", work: 'The Great Gatsby', author: 'F. Scott Fitzgerald', source: GREAT_GATSBY },

  { text: 'Happy families are all alike; every unhappy family is unhappy in its own way.', work: 'Anna Karenina', author: 'Leo Tolstoy', source: ANNA_KARENINA },
  { text: "Everything was in confusion in the Oblonskys' house.", work: 'Anna Karenina', author: 'Leo Tolstoy', source: ANNA_KARENINA },
  { text: '"I cannot admit it," said Sergey Ivanovitch, with his habitual clearness, precision of expression, and elegance of phrase.', work: 'Anna Karenina', author: 'Leo Tolstoy', source: ANNA_KARENINA },

  { text: 'He was hopelessly in debt to his landlady, and was afraid of meeting her.', work: 'Crime and Punishment', author: 'Fyodor Dostoevsky', source: CRIME_AND_PUNISHMENT },
  { text: "Poverty is not a vice, that's a true saying.", work: 'Crime and Punishment', author: 'Fyodor Dostoevsky', source: CRIME_AND_PUNISHMENT },

  { text: 'Alexey Fyodorovitch Karamazov was the third son of Fyodor Pavlovitch Karamazov, a land owner well known in our district.', work: 'The Brothers Karamazov', author: 'Fyodor Dostoevsky', source: BROTHERS_KARAMAZOV },
  { text: 'Every one, indeed, loved this young man wherever he went, and it was so from his earliest childhood.', work: 'The Brothers Karamazov', author: 'Fyodor Dostoevsky', source: BROTHERS_KARAMAZOV },

  { text: 'She was usually spoken of as being remarkably clever, but with the addition that her sister Celia had more common-sense.', work: 'Middlemarch', author: 'George Eliot', source: MIDDLEMARCH },
  { text: 'It is quite possible that I should think it wrong for me.', work: 'Middlemarch', author: 'George Eliot', source: MIDDLEMARCH },

  { text: 'My life had hitherto been remarkably secluded and domestic.', work: 'Frankenstein', author: 'Mary Shelley', source: FRANKENSTEIN },
  { text: 'I felt suddenly, and for the first time during many months, calm and serene joy.', work: 'Frankenstein', author: 'Mary Shelley', source: FRANKENSTEIN },

  { text: '"Curiouser and curiouser!" cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English)', work: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', source: ALICE_IN_WONDERLAND },
  { text: "We're all mad here. I'm mad. You're mad.", work: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', source: ALICE_IN_WONDERLAND },

  { text: '"Christmas won\'t be Christmas without any presents," grumbled Jo, lying on the rug.', work: 'Little Women', author: 'Louisa May Alcott', source: LITTLE_WOMEN },
  { text: '"That boy is suffering for society and fun," she said to herself.', work: 'Little Women', author: 'Louisa May Alcott', source: LITTLE_WOMEN },

  { text: 'We live, as we dream—alone.', work: 'Heart of Darkness', author: 'Joseph Conrad', source: HEART_OF_DARKNESS },
];
