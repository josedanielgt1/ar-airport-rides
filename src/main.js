import { initI18n } from './i18n/index.js';
import { initWhatsApp } from './whatsapp.js';
import { initHero } from './hero.js';
import { initContent } from './content.js';
import { initRoad } from './road.js';
import { initArea } from './area.js';

const still = document.documentElement.classList.contains('still');

initI18n();
initWhatsApp();
initContent();
initHero({ still });
initRoad({ still });
initArea({ still });
