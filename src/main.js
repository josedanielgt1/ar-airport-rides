import { initI18n } from './i18n/index.js';
import { initWhatsApp } from './whatsapp.js';
import { initSms } from './sms.js';
import { initHero } from './hero.js';
import { initContent } from './content.js';
import { initRoad } from './road.js';
import { initArea } from './area.js';
import { initWhy } from './why.js';
import { initRef } from './ref.js';
import { initForm } from './form.js';

const still = document.documentElement.classList.contains('still');

initI18n();
initRef();
initWhatsApp();
initSms();
initContent();
initHero({ still });
initRoad({ still });
initArea({ still });
initWhy({ still });
initForm();
