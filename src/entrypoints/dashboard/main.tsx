import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../lib/dashboard/App';
import { createDashboardServices } from '../../lib/dashboard/services';
import '../../lib/ui/tokens.css';
import '../../lib/ui/lookup-panel.css';
import '../../lib/ui/settings-menu.css';
import '../../lib/dashboard/dashboard.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App services={createDashboardServices()} />
    </StrictMode>,
  );
}
