/*
  Origen de la visita: la tarjeta con QR lleva a /r, que redirige a /?ref=card (vercel.json).
  Se guarda en sessionStorage (dentro de try/catch) para incluirlo en el correo aunque el visitante
  navegue o recargue. Valores cerrados: "card" o "" (el servidor lo convierte en "direct").
*/
const KEY = 'ar-ref';
let current = '';

export function initRef() {
  let fromUrl = null;
  try {
    fromUrl = new URLSearchParams(location.search).get('ref');
  } catch {
    /* URL sin parámetros legibles */
  }
  if (fromUrl) current = fromUrl === 'card' ? 'card' : '';

  try {
    if (fromUrl) sessionStorage.setItem(KEY, current);
    else current = sessionStorage.getItem(KEY) ?? '';
  } catch {
    /* almacenamiento bloqueado: vale solo para esta carga */
  }

  document.querySelectorAll('input[name="ref"]').forEach((input) => (input.value = current));
}

export const getRef = () => current;
