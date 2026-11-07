import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from '../../lib/dashboard/Popup';
import { createDashboardServices } from '../../lib/dashboard/services';
import '../../lib/ui/tokens.css';
import '../../lib/ui/lookup-panel.css';
import '../../lib/ui/settings-menu.css';
import '../../lib/dashboard/dashboard.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Popup
        services={createDashboardServices()}
        productName={browser.runtime.getManifest().short_name ?? 'Couplet'}
        openDashboard={(path) => {
          // Closing first could cancel the request along with this page.
          void browser.tabs
            .create({
              url: browser.runtime.getURL(`/dashboard.html#${path}`),
            })
            .then(() => {
              window.close();
            });
        }}
      />
    </StrictMode>,
  );
}
