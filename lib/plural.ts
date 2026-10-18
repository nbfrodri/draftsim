export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string => `${count} ${count === 1 ? singular : pluralForm}`;
