// Colores de los bloques: el nombre se guarda, el hex solo se usa al pintar.

export const COLORS = {
  cyan: '#4fc3f7', amber: '#ffb74d', red: '#ef5350', green: '#66bb6a',
  violet: '#b39ddb', pink: '#f48fb1', teal: '#4db6ac', gray: '#8b94a1',
};
export const DEFAULT_COLOR = 'cyan';

export const colorHex = (name, fallback = DEFAULT_COLOR) => COLORS[name] || COLORS[fallback];
