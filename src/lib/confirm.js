/*
  Confirmación con tarifa y QR de pago para el pasajero.
  1) El chofer abre el enlace de su correo (api/confirm?t=…), escribe la tarifa y pulsa Enviar.
  2) El servidor manda al pasajero un correo con la marca (en su idioma) con los QR de Venmo y Cash App
     generados desde las variables de entorno, y le deja una copia (BCC) al chofer.
  Sin base de datos: los datos de la reserva viajan cifrados dentro del enlace (src/lib/token.js).
*/
import { escapeHtml as e } from './validate.js';
import { openToken, secretOk, siteUrl } from './token.js';
import { payQrs, qrAttachments } from './qr.js';
import { layout, eyebrow, goldButton, mapBlock, confirmedBadge, tripTicket, heading, paragraph, muted, sectionTitle, detailRows, highlight, paymentCards } from './email-ui.js';
import { paymentOptions, confirmationMessage, sendWithResend, rateLimited, clock } from './reservation.js';

/** Tarifa escrita por el chofer → "$85.00", o null si no es un monto válido (hasta 5 cifras, 2 decimales). */
export function parseFare(input) {
  const m = /^\$?\s*(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(String(input ?? '').trim());
  if (!m) return null;
  const cents = (m[2] ?? '').padEnd(2, '0');
  const amount = Number(`${m[1]}.${cents || '00'}`);
  if (!(amount > 0)) return null;
  return `$${Number(m[1]).toLocaleString('en-US')}.${cents || '00'}`;
}

const COPY = {
  en: {
    locale: 'en-US',
    mapAlt: 'Map of your route',
    mapRoute: 'Open route',
    mapPickup: 'View pickup',
    mapDrop: 'View drop-off',
    declineSubject: 'About your ride request – AR Airport Rides',
    declineEyebrow: 'About your request',
    declineTitle: (n) => `Thank you, ${n}.`,
    declineIntro: 'Unfortunately we can’t take your ride at the requested time. We’d love to help you on another date or time.',
    declineCta: 'Choose another time',
    declineNote: 'Send a new request on our website and we’ll get back to you.',
    declineYours: 'Your request',
    subject: 'Your ride is confirmed – AR Airport Rides',
    eyebrow: 'Ride confirmed',
    title: (n) => `See you soon, ${n}.`,
    intro: 'Your ride with AR Airport Rides is confirmed. Here are your details.',
    when: 'When',
    pickup: 'Pickup',
    dropoff: 'Drop-off',
    passengers: 'Passengers',
    fare: 'Fare',
    payTitle: 'Payment options',
    payNote: 'Choose whichever is easiest for you: scan a code with your phone’s camera or tap the button.',
    openVenmo: 'Open Venmo',
    openCashApp: 'Open Cash App',
    qrAlt: (n) => `${n} QR code`,
    close: 'Questions or changes? Just reply to this email.',
    footer: 'AR Airport Rides · Private rides across Austin & Central Texas',
  },
  es: {
    locale: 'es-US',
    mapAlt: 'Mapa de tu ruta',
    mapRoute: 'Ver ruta',
    mapPickup: 'Ver recogida',
    mapDrop: 'Ver destino',
    declineSubject: 'Sobre tu solicitud de traslado – AR Airport Rides',
    declineEyebrow: 'Sobre tu solicitud',
    declineTitle: (n) => `Gracias, ${n}.`,
    declineIntro: 'Lamentablemente no podemos atender tu traslado en la fecha y hora solicitadas. Con gusto te ayudamos en otra fecha u horario.',
    declineCta: 'Elegir otra fecha',
    declineNote: 'Envía una nueva solicitud en nuestra página y te respondemos.',
    declineYours: 'Tu solicitud',
    subject: 'Tu traslado está confirmado – AR Airport Rides',
    eyebrow: 'Traslado confirmado',
    title: (n) => `Nos vemos pronto, ${n}.`,
    intro: 'Tu traslado con AR Airport Rides está confirmado. Estos son tus datos.',
    when: 'Cuándo',
    pickup: 'Recogida',
    dropoff: 'Destino',
    passengers: 'Pasajeros',
    fare: 'Tarifa',
    payTitle: 'Formas de pago',
    payNote: 'Elige la que te resulte más cómoda: escanea un código con la cámara del teléfono o toca el botón.',
    openVenmo: 'Abrir Venmo',
    openCashApp: 'Abrir Cash App',
    qrAlt: (n) => `Código QR de ${n}`,
    close: '¿Dudas o cambios? Responde a este correo.',
    footer: 'AR Airport Rides · Traslados privados en Austin y el centro de Texas',
  },
};

/** Correo de confirmación para el pasajero: { subject, text, html, attachments }. */
export function buildConfirmationEmail(data, fare, pay = {}, qr = {}, { mapKey } = {}) {
  const lang = data.lang === 'es' ? 'es' : 'en';
  const t = COPY[lang];
  const first = String(data.name).split(' ')[0];
  const day = new Intl.DateTimeFormat(t.locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${data.date}T12:00:00Z`),
  );
  const when = `${day}, ${clock(data.time, lang)}`;
  const hasPay = Boolean(pay.venmo || pay.cashapp || pay.zelle);

  const body = [
    confirmedBadge(t.eyebrow),
    heading(t.title(first)),
    paragraph(t.intro, 'margin-bottom:20px'),
    tripTicket({
      day: String(Number(data.date.slice(8, 10))),
      month: new Intl.DateTimeFormat(t.locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`)).replace('.', ''),
      weekday: new Intl.DateTimeFormat(t.locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`)),
      time: clock(data.time, lang),
      from: data.origin,
      to: data.destination,
      fromLabel: t.pickup,
      toLabel: t.dropoff,
      extra: data.passengers ? `${t.passengers}: ${data.passengers}` : '',
    }),
    '<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>',
    mapBlock({ from: data.origin, to: data.destination, key: mapKey, t }),
    '<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>',
    highlight(t.fare, fare),
    hasPay ? sectionTitle(t.payTitle) + muted(t.payNote) + paymentCards(pay, qr, t) : '',
    '<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>',
    paragraph(t.close),
    paragraph('— AR Airport Rides', 'color:#C9A24B'),
  ].join('\n');

  return {
    subject: t.subject,
    text: confirmationMessage(data, pay, fare).body,
    html: layout({ title: t.subject, preheader: `${when} · ${fare}`, lang, body, footer: e(t.footer) }),
    attachments: qrAttachments(qr),
  };
}

/** Correo de rechazo cortés para el pasajero, con enlace para reservar otra fecha: { subject, text, html }. */
export function buildDeclineEmail(data, siteLink = '') {
  const lang = data.lang === 'es' ? 'es' : 'en';
  const t = COPY[lang];
  const first = String(data.name).split(' ')[0];
  const day = new Intl.DateTimeFormat(t.locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${data.date}T12:00:00Z`),
  );
  const when = `${day}, ${clock(data.time, lang)}`;

  const body = [
    eyebrow(t.declineEyebrow),
    heading(t.declineTitle(first)),
    paragraph(t.declineIntro, 'margin-bottom:20px'),
    sectionTitle(t.declineYours),
    detailRows([
      [t.when, when],
      [t.pickup, data.origin],
      [t.dropoff, data.destination],
    ]),
    '<div style="height:22px;line-height:22px;font-size:0">&nbsp;</div>',
    siteLink ? goldButton(siteLink, t.declineCta) : '',
    muted(t.declineNote),
    paragraph(t.close),
    paragraph('— AR Airport Rides', 'color:#C9A24B'),
  ].join('\n');

  const text = [
    `${t.declineTitle(first)}`,
    '',
    t.declineIntro,
    '',
    `${t.when}: ${when}`,
    `${t.pickup}: ${data.origin}`,
    `${t.dropoff}: ${data.destination}`,
    '',
    ...(siteLink ? [`${t.declineCta}: ${siteLink}`, ''] : []),
    t.declineNote,
    t.close,
    '— AR Airport Rides',
  ].join('\n');

  return {
    subject: t.declineSubject,
    text,
    html: layout({ title: t.declineSubject, preheader: t.declineIntro, lang, body, footer: e(t.footer) }),
  };
}

/* ---------- Página del chofer (inglés, sin JavaScript) ---------- */

const CSS = `body{margin:0;background:#000;color:#F3EBDD;font:16px/1.6 Arial,Helvetica,sans-serif}main{max-width:520px;margin:0 auto;padding:32px 20px}
.brand{color:#C9A24B;font:28px Georgia,serif;margin:0 0 6px}.rule{height:2px;background:#C9A24B;margin:0 0 28px}.eyebrow{color:#C9A24B;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:bold;margin:0 0 10px}
h1{font:normal 30px/1.2 Georgia,serif;margin:0 0 8px}dl{margin:18px 0}dt{color:#9C9384;font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-top:12px}dd{margin:2px 0 0}
label{display:block;color:#9C9384;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:22px 0 6px}input{width:100%;box-sizing:border-box;background:#111;border:1px solid #6b5c33;color:#F3EBDD;border-radius:10px;padding:14px;font-size:22px}
button{margin-top:18px;width:100%;background:#C9A24B;color:#000;border:0;border-radius:999px;padding:15px;font-weight:bold;font-size:16px;cursor:pointer}.ghost{background:transparent;color:#C9A24B;border:1px solid #C9A24B;margin-top:12px}.err{color:#E07B6A;margin:8px 0 0}.muted{color:#9C9384;font-size:13px}`;

const shell = (title, inner) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${e(title)}</title><style>${CSS}</style></head><body><main><p class="brand">AR <span style="font:12px Arial;letter-spacing:.3em;text-transform:uppercase;color:#F3EBDD">&nbsp;Airport Rides</span></p><div class="rule"></div>${inner}</main></body></html>`;

const notice = (status, title, text) => ({
  status,
  html: shell(title, `<p class="eyebrow">AR Airport Rides</p><h1>${e(title)}</h1><p class="muted">${e(text)}</p>`),
});

const inlineCids = (html, qr) =>
  html.replace(/cid:(venmo|cashapp)-qr/g, (m, k) => (qr[k] ? `data:image/png;base64,${qr[k].toString('base64')}` : m));

function previewView(data, token, { heading: title, summary, fields, sendLabel, emailHtml }) {
  return shell(
    'Preview',
    `<p class="eyebrow">Preview</p><h1>${e(title)}</h1>
<p class="muted">${e(summary)}</p>
<iframe title="Email preview" sandbox srcdoc="${e(emailHtml)}" style="width:100%;height:760px;border:1px solid #2B2417;border-radius:12px;background:#000;margin-top:12px"></iframe>
<form method="post" action="/api/confirm"><input type="hidden" name="t" value="${e(token)}">${fields}<input type="hidden" name="send" value="1">
<button type="submit">${e(sendLabel)}</button></form>
<p style="text-align:center;margin:16px 0 0"><a href="/api/confirm?t=${encodeURIComponent(token)}" style="color:#C9A24B">Back</a></p>
<p class="muted" style="margin-top:12px">You get a copy (BCC) and their replies come to you.</p>`,
  );
}

const firstName = (data) => String(data.name).split(' ')[0];

const confirmPreview = (data, token, fare, emailHtml) =>
  previewView(data, token, {
    heading: `This is what ${firstName(data)} will receive`,
    summary: `To: ${data.email} · Fare: ${fare}`,
    fields: `<input type="hidden" name="fare" value="${e(fare.replace('$', ''))}">`,
    sendLabel: 'Send to passenger',
    emailHtml,
  });

const declinePreview = (data, token, emailHtml) =>
  previewView(data, token, {
    heading: `Decline ${firstName(data)}’s request`,
    summary: `To: ${data.email} · They get a polite note with a link to choose another time.`,
    fields: '<input type="hidden" name="action" value="decline">',
    sendLabel: 'Send decline note',
    emailHtml,
  });

function formView(data, token, error = '') {
  const when = `${data.date} · ${data.time}`;
  const lang = data.lang === 'es' ? 'Spanish' : 'English';
  return shell(
    'Respond to request',
    `<p class="eyebrow">Respond to request</p><h1>${e(data.name)}</h1>
<dl><dt>When</dt><dd>${e(when)}</dd><dt>Route</dt><dd>${e(data.origin)} &rarr; ${e(data.destination)}</dd><dt>Email</dt><dd>${e(data.email)}</dd></dl>
<form method="post" action="/api/confirm"><input type="hidden" name="t" value="${e(token)}">
<label for="fare">Fare (USD)</label><input id="fare" name="fare" inputmode="decimal" autocomplete="off" placeholder="85.00" required autofocus>
${error ? `<p class="err" role="alert">${e(error)}</p>` : ''}
<button type="submit">Preview confirmation</button>
<button type="submit" name="action" value="decline" class="ghost" formnovalidate>Can’t take it: ask to reschedule</button></form>
<p class="muted" style="margin-top:16px">Next you see the exact email the passenger will get, in ${e(lang)}. Confirming includes the payment QR codes; declining invites them to pick another time on the site. Nothing is sent until you confirm.</p>`,
  );
}

/**
 * Procesa GET (muestra el formulario o la vista previa del rechazo) y POST (vista previa y envío).
 * @param {{ method?: string, query?: object, body?: object, ip?: string, env?: object,
 *           send?: Function, pay?: object, now?: Date }} req
 * @returns {Promise<{status:number, html:string}>}
 */
export async function handleConfirm({ method = 'GET', query = {}, body = {}, ip, env = {}, send = sendWithResend, pay, now = new Date() } = {}) {
  if (!secretOk(env)) return notice(503, 'Not available', 'Confirmation links are not set up yet.');
  if (method !== 'GET' && method !== 'POST') return notice(405, 'Not allowed', 'This page only accepts GET and POST.');

  const token = String((method === 'POST' ? body.t : query.t) ?? '');
  const data = openToken(token, env.CONFIRM_SECRET, now.getTime());
  if (!data || !data.email) return notice(410, 'Link expired', 'This link is invalid or has expired. Reply to the passenger from the original email instead.');

  const decline = String((method === 'POST' ? body.action : query.a) ?? '') === 'decline';
  const declineEmail = () => buildDeclineEmail(data, siteUrl(env) || '');

  if (method === 'GET') {
    return { status: 200, html: decline ? declinePreview(data, token, declineEmail().html) : formView(data, token) };
  }

  if (rateLimited(`confirm:${ip}`, now.getTime())) return notice(429, 'Too many attempts', 'Please wait a few minutes and try again.');

  const config = { apiKey: env.RESEND_API_KEY, from: env.RESERVATION_FROM_EMAIL, to: data.email, bcc: env.RESERVATION_TO_EMAIL };
  const deliver = async (email) => {
    try {
      return (await send(config, { ...email, replyTo: env.RESERVATION_TO_EMAIL })) !== false;
    } catch (err) {
      console.error(`confirm: error al enviar (${err?.name ?? 'Error'})`);
      return false;
    }
  };
  const notSent = () => notice(502, 'Could not send', 'The email was not sent. Try again in a moment, or reply to the passenger from the original email.');

  if (decline) {
    if (!config.apiKey || !config.from) return notice(503, 'Not available', 'Email sending is not set up yet.');
    const email = declineEmail();
    if (!body.send) return { status: 200, html: declinePreview(data, token, email.html) };
    if (!(await deliver(email))) return notSent();
    return notice(200, 'Decline sent', `A polite note with a link to choose another time was sent to ${data.email}. You received a copy.`);
  }

  const fare = parseFare(body.fare);
  if (!fare) return { status: 422, html: formView(data, token, 'Enter the fare as a number, for example 85 or 85.50.') };
  if (!config.apiKey || !config.from) return notice(503, 'Not available', 'Email sending is not set up yet.');

  let options;
  let qr;
  let email;
  try {
    options = pay ?? paymentOptions(env);
    qr = await payQrs(options);
    email = buildConfirmationEmail(data, fare, options, qr, { mapKey: env.GOOGLE_MAPS_API_KEY });
  } catch (err) {
    console.error(`confirm: error al preparar el correo (${err?.name ?? 'Error'})`);
    return notice(500, 'Something went wrong', 'Could not build the email. Try again.');
  }

  if (!body.send) return { status: 200, html: confirmPreview(data, token, fare, inlineCids(email.html, qr)) };
  if (!(await deliver(email))) return notSent();
  return notice(200, 'Confirmation sent', `${fare} · sent to ${data.email}. You received a copy.`);
}
