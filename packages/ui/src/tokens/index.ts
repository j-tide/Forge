import values from './values.json';
import darkValues from './dark.json';

/** CSS variables are generated from the light and dark token sources. */
export const forgeTokens = Object.freeze(values);
export const forgeDarkTokens = Object.freeze(darkValues);
export type ForgeTokenName = keyof typeof forgeTokens;
