import { initI18n } from './i18n/index.js';
import { initWhatsApp } from './whatsapp.js';
import { initHero } from './hero.js';

initI18n();
initWhatsApp();
initHero({ still: document.documentElement.classList.contains('still') });
