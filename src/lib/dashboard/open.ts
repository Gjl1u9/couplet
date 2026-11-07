export const DASHBOARD_PATH = '/dashboard.html';

const OPEN_DASHBOARD_TYPE = 'open-dashboard';

/** Video pages cannot open extension pages themselves, so they ask the background script. */
export const OPEN_DASHBOARD_MESSAGE = { type: OPEN_DASHBOARD_TYPE } as const;

export function isOpenDashboardMessage(message: unknown): boolean {
  return (message as { type?: unknown } | null)?.type === OPEN_DASHBOARD_TYPE;
}
