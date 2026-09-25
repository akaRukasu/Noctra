export const secretIndexerField = field => /password|apikey|secret|token|cookie|passkey/i.test(`${field.name} ${field.privacy}`);

export function publicIndexer(item, schemaId = '') {
  return {
    id: item.id || null, schemaId, name: item.name, implementation: item.implementation,
    protocol: item.protocol, enable: item.enable !== false, priority: item.priority || 25,
    appProfileId: item.appProfileId || 0, downloadClientId: item.downloadClientId || 0,
    fields: (item.fields || []).filter(field => !field.hidden && !['info', 'captcha'].includes(field.type)).map(field => ({
      name: field.name, label: field.label || field.name, type: field.type, advanced: Boolean(field.advanced),
      secret: secretIndexerField(field), hasValue: field.value !== undefined && field.value !== null && field.value !== '',
      value: secretIndexerField(field) ? '' : field.value ?? '',
      options: (field.selectOptions || []).map(option => ({ value: option.value, name: option.name }))
    }))
  };
}

export function updateIndexer(original, changes) {
  if (!changes || typeof changes !== 'object') throw new Error('Configuration invalide.');
  const name = String(changes.name || '').trim();
  if (!name || name.length > 150) throw new Error('Nom d’indexeur invalide.');
  const priority = Number(changes.priority ?? original.priority ?? 25);
  if (!Number.isInteger(priority) || priority < 1 || priority > 50) throw new Error('La priorité doit être comprise entre 1 et 50.');
  const updates = changes.fields || {};
  const fields = (original.fields || []).map(field => {
    if (field.hidden || !Object.hasOwn(updates, field.name)) return { ...field };
    const value = updates[field.name];
    if (secretIndexerField(field) && (value === '' || value == null)) return { ...field };
    if (typeof value === 'object' && !Array.isArray(value)) throw new Error('Valeur de champ invalide.');
    if (String(value).length > 8192) throw new Error('Valeur de champ trop longue.');
    if (field.type === 'number' && value !== '' && !Number.isFinite(Number(value))) throw new Error(`Nombre invalide : ${field.label || field.name}`);
    return { ...field, value: field.type === 'number' ? (value === '' ? null : Number(value)) : field.type === 'checkbox' ? value === true : value };
  });
  return { ...original, name, enable: changes.enable !== false, priority,
    appProfileId: Number(changes.appProfileId ?? original.appProfileId),
    downloadClientId: Number(changes.downloadClientId ?? original.downloadClientId ?? 0), fields };
}
