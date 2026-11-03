// Camera spike (BUILD_PLAN SC1; SPEC §3, §7.4): `/spike` is a bare TV that shows every photo it
// receives; `/spike?code=ABCD` is a bare phone that shoots them. Throwaway: SC5 deletes it.
import '../styles/brand.css';
import '../styles/base.css';
import './spike.css';
import { relayUrl } from '@pcg/game-kit';
import { runHost } from './host';
import { runPhone } from './phone';

const root = document.getElementById('spike') ?? document.body;
const url = relayUrl(import.meta.env.VITE_RELAY_URL as string | undefined);
const code = new URLSearchParams(location.search).get('code');

if (code) runPhone(root, url, code.toUpperCase());
else runHost(root, url);
