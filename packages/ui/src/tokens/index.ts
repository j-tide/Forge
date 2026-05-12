import values from './values.json';

/** The CSS file is generated from this one source by build-tokens.mjs. */
export const forgeTokens = Object.freeze(values);
export type ForgeTokenName = keyof typeof forgeTokens;
