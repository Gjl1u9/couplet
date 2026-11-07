import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDashboardServices } from '../../lib/dashboard/services';
import { WelcomePage } from '../../lib/dashboard/WelcomePage';
import '../../lib/ui/tokens.css';
import '../../lib/ui/lookup-panel.css';
import '../../lib/ui/settings-menu.css';
import '../../lib/dashboard/dashboard.css';
import '../../lib/dashboard/welcome.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WelcomePage
        iconUrl={browser.runtime.getURL('/icon/48.png')}
        services={createDashboardServices()}
      />
    </StrictMode>,
  );
}
