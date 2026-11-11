import { api } from './api.js';
import { toast, toastError, withBusy } from './ui.js';

/** Запрашивает у API краткоживущую подписанную ссылку и начинает скачивание. */
export async function downloadOrder(orderId, button) {
  await withBusy(button, async () => {
    try {
      const { data } = await api.download(orderId);
      const a = document.createElement('a');
      a.href = data.url;
      a.rel = 'noopener';
      a.download = data.fileName ?? '';
      document.body.append(a);
      a.click();
      a.remove();
      toast(`Загрузка началась. Ссылка действует ${Math.round(data.expiresIn / 60) || 1} мин.`);
    } catch (err) {
      toastError(err);
    }
  });
}
