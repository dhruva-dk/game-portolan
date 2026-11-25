import { rise } from '../base/sheet.ts';
import {
  createSettingsSheet,
  type LobbyRows,
  type SettingsPort,
} from '../base/settings.ts';
import { piece, screen } from '../base/ui.ts';

export function createSettingsScreen(port: SettingsPort, lobby: LobbyRows) {
  const el = screen();
  const body = piece(el, 'center', false, true);
  body.style.top = '50%';
  body.style.translate = '-50% -50%';
  const sheet = createSettingsSheet(port, lobby);
  body.style.width = `${sheet.w}px`;
  body.style.height = `${sheet.h}px`;
  body.append(sheet.el);
  return {
    el,
    open() {
      sheet.show();
      rise(el, true);
    },
    close() {
      rise(el, false);
    },
  };
}
