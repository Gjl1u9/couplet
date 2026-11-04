import { startPageAgent } from '../lib/youtube/page-agent';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    startPageAgent();
  },
});
