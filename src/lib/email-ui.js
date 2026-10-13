/*
  Piezas de HTML para los correos (chofer y pasajero) con la identidad de la marca: negro, dorado y crema.
  Tablas y estilos en línea, porque los clientes de correo no entienden CSS moderno. Todo valor variable
  pasa por escapeHtml.
*/
import { escapeHtml as e } from './validate.js';
import { qrCid } from './qr.js';
import { mapsSearchUrl, mapsRouteUrl, staticMapUrl } from './maps.js';

export const C = { bg: '#000000', panel: '#111111', line: '#2B2417', gold: '#C9A24B', cream: '#F3EBDD', muted: '#9C9384' };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Arial,Helvetica,sans-serif';

export const goldButton = (href, label) =>
  `<a href="${e(href)}" style="display:inline-block;background:${C.gold};color:#000000;text-decoration:none;font:bold 14px ${SANS};padding:13px 22px;border-radius:999px;margin:0 8px 10px 0">${e(label)}</a>`;

export const ghostButton = (href, label) =>
  `<a href="${e(href)}" style="display:inline-block;color:${C.gold};text-decoration:none;font:bold 13px ${SANS};padding:11px 20px;border-radius:999px;border:1px solid ${C.gold};margin:0 8px 10px 0">${e(label)}</a>`;

export const eyebrow = (text) =>
  `<p style="margin:0 0 10px;font:bold 11px ${SANS};letter-spacing:.22em;text-transform:uppercase;color:${C.gold}">${e(text)}</p>`;

export const heading = (text, size = 30) =>
  `<h1 style="margin:0 0 6px;font:normal ${size}px/1.2 ${SERIF};color:${C.cream}">${e(text)}</h1>`;

export const paragraph = (text, extra = '') =>
  `<p style="margin:0 0 14px;font:15px/1.6 ${SANS};color:${C.cream};${extra}">${e(text)}</p>`;

export const muted = (text) => `<p style="margin:0 0 12px;font:13px/1.5 ${SANS};color:${C.muted}">${e(text)}</p>`;

export const sectionTitle = (text) =>
  `<p style="margin:28px 0 12px;padding-top:18px;border-top:1px solid ${C.line};font:bold 11px ${SANS};letter-spacing:.22em;text-transform:uppercase;color:${C.gold}">${e(text)}</p>`;

/** Tabla de datos [[etiqueta, valor], …]. */
export const detailRows = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows
    .map(
      ([k, v]) =>
        `<tr><td valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid ${C.line};width:34%;font:11px ${SANS};letter-spacing:.1em;text-transform:uppercase;color:${C.muted}">${e(k)}</td><td valign="top" style="padding:10px 0;border-bottom:1px solid ${C.line};font:15px/1.5 ${SANS};color:${C.cream};white-space:pre-wrap">${e(v)}</td></tr>`,
    )
    .join('')}</table>`;

/** Bloque destacado (la tarifa, la fecha…). */
export const highlight = (label, value) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:18px 20px"><p style="margin:0 0 4px;font:11px ${SANS};letter-spacing:.18em;text-transform:uppercase;color:${C.muted}">${e(label)}</p><p style="margin:0;font:normal 30px/1.2 ${SERIF};color:${C.gold}">${e(value)}</p></td></tr></table>`;

/** Sello de "confirmado": círculo dorado con visto + etiqueta. */
export const confirmedBadge = (label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td align="center" valign="middle" width="34" height="34" style="width:34px;height:34px;background:${C.gold};border-radius:50%;font:bold 18px/34px ${SANS};color:#000000;text-align:center">&#10003;</td><td valign="middle" style="padding-left:12px;font:bold 11px ${SANS};letter-spacing:.22em;text-transform:uppercase;color:${C.gold}">${e(label)}</td></tr></table>`;

const dot = (filled) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td width="12" height="12" style="width:12px;height:12px;font-size:0;line-height:0;border-radius:50%;background:${filled ? C.gold : C.bg};border:2px solid ${C.gold}">&nbsp;</td></tr></table>`;

/**
 * Fila del vehículo dentro del boleto: etiqueta pequeña ("Your ride") y debajo la descripción en serif crema con la
 * placa en dorado espaciado. Sin descripción ni placa no hay fila.
 * @param {{label:string, description?:string, plateLabel?:string, plate?:string}} [v]
 */
const vehicleRow = (v) => {
  if (!v || (!v.description && !v.plate)) return '';
  const desc = v.description ? `<span style="font:normal 19px/1.35 ${SERIF};color:${C.cream}">${e(v.description)}</span>` : '';
  const sep = v.description && v.plate ? `<span style="color:${C.gold};padding:0 8px">&middot;</span>` : '';
  const plate = v.plate
    ? `<span style="white-space:nowrap;font:12px ${SANS};letter-spacing:.08em;color:${C.muted}">${e(v.plateLabel)}&nbsp;<span style="font:bold 13px ${SANS};letter-spacing:.18em;color:${C.gold}">${e(v.plate)}</span></span>`
    : '';
  return `<tr><td colspan="2" style="padding:6px 22px 4px"><p style="margin:10px 0 0;padding-top:14px;border-top:1px solid ${C.line};font:11px ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.muted}">${e(v.label)}</p><p style="margin:4px 0 0;line-height:1.5">${desc}${sep}${plate}</p></td></tr>`;
};

/**
 * "Boleto" del viaje: bloque dorado con el día, fecha y hora, y debajo la ruta (recogida → destino) como línea de tiempo.
 * @param {{day:string, month:string, weekday:string, time:string, from:string, to:string, fromLabel:string, toLabel:string, extra?:string,
 *          vehicle?:{label:string, description?:string, plateLabel?:string, plate?:string}}} p
 */
export const tripTicket = (p) => {
  const label = (text) => `<p style="margin:0 0 2px;font:11px ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.muted}">${e(text)}</p>`;
  const place = (text) => `<p style="margin:0;font:16px/1.4 ${SANS};color:${C.cream}">${e(text)}</p>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border:1px solid ${C.gold};border-radius:16px;border-collapse:separate"><tr>
<td width="104" align="center" valign="middle" style="width:104px;background:${C.gold};border-radius:15px 0 0 0;padding:20px 8px"><p style="margin:0;font:normal 44px/1 ${SERIF};color:#000000">${e(p.day)}</p><p style="margin:4px 0 0;font:bold 12px ${SANS};letter-spacing:.2em;text-transform:uppercase;color:#000000">${e(p.month)}</p></td>
<td valign="middle" style="padding:20px 22px;border-radius:0 15px 0 0"><p style="margin:0 0 4px;font:11px ${SANS};letter-spacing:.18em;text-transform:uppercase;color:${C.muted}">${e(p.weekday)}</p><p style="margin:0;font:normal 30px/1.1 ${SERIF};color:${C.cream}">${e(p.time)}</p></td></tr>
<tr><td colspan="2" style="padding:22px 22px 6px;border-top:1px solid ${C.line}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td width="28" valign="top" style="padding-top:4px">${dot(true)}</td><td valign="top">${label(p.fromLabel)}${place(p.from)}</td></tr>
<tr><td width="28" align="center" style="height:26px"><table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td width="0" height="26" style="height:26px;border-left:2px dashed #6b5c33;font-size:0;line-height:0">&nbsp;</td></tr></table></td><td></td></tr>
<tr><td width="28" valign="top" style="padding-top:4px">${dot(false)}</td><td valign="top">${label(p.toLabel)}${place(p.to)}</td></tr>
</table></td></tr>
${vehicleRow(p.vehicle)}
${p.extra ? `<tr><td colspan="2" style="padding:6px 22px 20px"><p style="margin:12px 0 0;padding-top:12px;border-top:1px solid ${C.line};font:13px ${SANS};color:${C.muted}">${e(p.extra)}</p></td></tr>` : '<tr><td colspan="2" style="padding:0 0 14px;font-size:0;line-height:0">&nbsp;</td></tr>'}
</table>`;
};

/**
 * Mapa del viaje: imagen con las marcas A/B (solo si hay clave de Google Maps) y botones que abren la app de
 * mapas: recogida, destino y ruta. `t` trae los textos en el idioma del lector.
 */
export function mapBlock({ from, to, key, t }) {
  const img = staticMapUrl(from, to, key);
  const image = img
    ? `<a href="${e(mapsRouteUrl(from, to))}"><img src="${e(img)}" width="600" height="260" alt="${e(t.mapAlt)}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:14px;border:1px solid ${C.line};background:${C.panel}"></a><div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>`
    : '';
  return `${image}<div>${goldButton(mapsRouteUrl(from, to), t.mapRoute)}${ghostButton(mapsSearchUrl(from), t.mapPickup)}${ghostButton(mapsSearchUrl(to), t.mapDrop)}</div>`;
}

/**
 * Tarjetas de pago: QR de Venmo y Cash App lado a lado (imagen en línea) + botón de respaldo con el enlace,
 * y Zelle como texto. `t` trae los textos en el idioma del lector.
 */
export function paymentCards(pay, qr, t) {
  const cards = [
    pay.venmo && { key: 'venmo', name: 'Venmo', url: pay.venmo, open: t.openVenmo },
    pay.cashapp && { key: 'cashapp', name: 'Cash App', url: pay.cashapp, open: t.openCashApp },
  ].filter(Boolean);

  const cell = (c) => {
    const img = qr?.[c.key]
      ? `<img src="cid:${qrCid(c.key)}" width="168" height="168" alt="${e(t.qrAlt(c.name))}" style="display:block;margin:0 auto 12px;width:168px;height:168px;border-radius:10px;background:#FFFFFF">`
      : '';
    return `<td valign="top" align="center" width="50%" style="padding:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:18px 12px"><p style="margin:0 0 12px;font:bold 12px ${SANS};letter-spacing:.2em;text-transform:uppercase;color:${C.gold}">${e(c.name)}</p>${img}<a href="${e(c.url)}" style="display:inline-block;color:${C.gold};text-decoration:none;font:bold 13px ${SANS};padding:10px 18px;border-radius:999px;border:1px solid ${C.gold}">${e(c.open)}</a></td></tr></table></td>`;
  };

  const grid = cards.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px"><tr>${cards.map(cell).join('')}${cards.length === 1 ? '<td width="50%"></td>' : ''}</tr></table>`
    : '';
  const zelle = pay.zelle
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr><td style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:16px 20px"><p style="margin:0 0 4px;font:bold 12px ${SANS};letter-spacing:.2em;text-transform:uppercase;color:${C.gold}">Zelle</p><p style="margin:0;font:16px ${SANS};color:${C.cream}">${e(pay.zelle)}</p></td></tr></table>`
    : '';
  return grid + zelle;
}

/** Estructura común: cabecera con la marca, contenido y pie. `preheader` es el texto de vista previa. */
export function layout({ title, preheader = '', lang = 'en', body, footer = '' }) {
  return `<!doctype html><html lang="${e(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${e(title)}</title></head><body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 4px 18px"><span style="font:normal 28px ${SERIF};color:${C.gold};letter-spacing:.04em">AR</span> <span style="font:12px ${SANS};letter-spacing:.3em;text-transform:uppercase;color:${C.cream}">&nbsp;Airport Rides</span></td></tr>
<tr><td style="height:2px;line-height:2px;font-size:0;background:${C.gold}">&nbsp;</td></tr>
<tr><td style="padding:30px 4px 8px">${body}</td></tr>
<tr><td style="padding:24px 4px 0;border-top:1px solid ${C.line};font:12px/1.6 ${SANS};color:${C.muted}">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}
