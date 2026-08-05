const manifest = require('./platform-runtime-schema.generated.json');

function getRuntimeSchema(moduleKey) {
  return manifest.modules[moduleKey] || null;
}

function resolveRuntimeField(moduleKey, fieldPath) {
  const module = getRuntimeSchema(moduleKey);
  if (!module || typeof fieldPath !== 'string' || !fieldPath) return null;
  let model = manifest.models[module.model];
  let field = null;
  for (const part of fieldPath.split('.')) {
    if (part === '_count') continue;
    const candidate = model?.fields?.[part] || null;
    if (!candidate && part === 'fullName' && field?.relationModel) continue;
    field = candidate;
    if (!field) return null;
    model = field.relationModel ? manifest.models[field.relationModel] : null;
  }
  return field;
}

function validateRuntimeDefinition(definition) {
  if (!definition || definition.key === 'dashboard') return [];
  const errors = [];
  const check = (fieldPath, use) => {
    const field = resolveRuntimeField(definition.key, fieldPath);
    if (!field) errors.push(`${definition.key}: ${use} references missing field ${fieldPath}`);
    else if (use === 'filter' && !field.filterable) errors.push(`${definition.key}: filter field ${fieldPath} is not filterable`);
    else if (use === 'sort' && !field.sortable) errors.push(`${definition.key}: sort field ${fieldPath} is not sortable`);
    else if (use === 'form' && !field.readable) errors.push(`${definition.key}: form field ${fieldPath} is not readable`);
  };
  for (const form of definition.forms || []) for (const field of form.fields || []) check(field.key, 'form');
  for (const view of definition.views || []) {
    for (const filter of view.filters || []) check(filter.field, 'filter');
    for (const sort of view.sort || []) check(sort.field, 'sort');
  }
  for (const column of definition.columns || []) check(column.field, 'column');
  return errors;
}

module.exports = { PLATFORM_RUNTIME_SCHEMA_MANIFEST: manifest, getRuntimeSchema, resolveRuntimeField, validateRuntimeDefinition };
