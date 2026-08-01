export const SELLER_DEPARTMENTS = Object.freeze({
  ALYNNE: '47d66252-d08d-48cd-8bd9-e06ac173221e',
  ESTER: 'f417dd60-5d4d-498e-a62d-a560fbecbe06',
  GABRIELA: '8b5d9f3c-ed1a-4496-84f3-f052e3f65109',
  KATIANA: 'd57c683f-9a4b-441e-a431-472d3054c692',
  MARINES: '619b0675-40f4-4ee0-9fd2-aa36b7dc0541',
  MONICA: 'a89f63ed-af4a-4503-974c-9a6945fdce20',
  SONIA: '716d03b8-822a-47e7-9622-761b6b4eb270',
  SUELEN: 'd81bf135-56ce-4cf1-be96-0d37f26fb1cd',
});

export const normalizeTag = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

export const selectDepartment = (tagNames, commercialDepartmentId) => {
  const normalizedTags = new Set((Array.isArray(tagNames) ? tagNames : []).map(normalizeTag));
  const matchedTag = Object.keys(SELLER_DEPARTMENTS).find((tag) => normalizedTags.has(tag));

  return {
    matchedTag: matchedTag ?? null,
    departmentId: matchedTag ? SELLER_DEPARTMENTS[matchedTag] : commercialDepartmentId,
    usedFallback: !matchedTag,
  };
};

