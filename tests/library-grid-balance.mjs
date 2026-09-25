import assert from 'node:assert/strict';

function chooseBalancedLibraryColumns(cardCount, maximumColumns) {
  const count = Math.max(0, Number(cardCount) || 0);
  const maximum = Math.max(1, Math.min(count || 1, Number(maximumColumns) || 1));
  if (count <= maximum || count < 3) return maximum;
  const minimum = Math.max(2, maximum - 4);
  for (let columns = maximum; columns >= minimum; columns -= 1) {
    if (count % columns !== 1) return columns;
  }
  return maximum;
}

assert.equal(chooseBalancedLibraryColumns(23, 11), 10, '23 affiches ne doivent pas produire 11 + 11 + 1.');
assert.equal(chooseBalancedLibraryColumns(22, 11), 11, 'Une grille déjà pleine doit rester dense.');
assert.equal(chooseBalancedLibraryColumns(13, 11), 11, 'Deux affiches sur la dernière ligne sont acceptées.');
assert.equal(chooseBalancedLibraryColumns(12, 11), 10, 'Une affiche seule doit faire retirer une colonne.');
assert.equal(chooseBalancedLibraryColumns(8, 11), 8, 'Moins d’éléments que de colonnes ne doit pas créer de cases vides artificielles.');
console.log('Équilibrage des grilles Noctra v88 : OK');
