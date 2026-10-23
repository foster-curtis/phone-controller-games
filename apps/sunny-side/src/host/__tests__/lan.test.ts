import { describe, expect, it } from 'vitest';
import { hostUrl, isLoopbackHost, joinUrl, lanBanner, pickLanAddress } from '../lan';

const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal });

describe('pickLanAddress', () => {
  it('prefers the physical Wi-Fi adapter over WSL/Hyper-V virtual adapters', () => {
    expect(
      pickLanAddress({
        'vEthernet (WSL (Hyper-V firewall))': [v4('172.24.160.1')],
        'Wi-Fi': [{ address: 'fe80::1', family: 'IPv6', internal: false }, v4('10.0.0.52')],
        'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
      }),
    ).toBe('10.0.0.52');
  });

  it('ranks 192.168 before 10 before 172.16/12, and skips link-local and internal', () => {
    expect(
      pickLanAddress({
        a: [v4('172.20.0.5')],
        b: [v4('10.1.2.3')],
        c: [v4('192.168.1.23')],
        d: [v4('169.254.10.10')],
        lo: [v4('127.0.0.1', true)],
      }),
    ).toBe('192.168.1.23');
    expect(pickLanAddress({ a: [v4('172.20.0.5')], b: [v4('10.1.2.3')] })).toBe('10.1.2.3');
  });

  it('accepts the numeric family (Node 18.0–18.3) and returns null when nothing fits', () => {
    expect(pickLanAddress({ eth0: [{ address: '192.168.0.9', family: 4, internal: false }] })).toBe(
      '192.168.0.9',
    );
    expect(pickLanAddress({ lo: [v4('127.0.0.1', true)], none: undefined })).toBeNull();
  });
});

describe('URL formatting', () => {
  it('formats the host URL and the dev:lan banner line', () => {
    expect(hostUrl('192.168.1.23', 5173)).toBe('http://192.168.1.23:5173/');
    expect(lanBanner('192.168.1.23', 5173)).toContain('http://192.168.1.23:5173/');
    expect(lanBanner(null, 5173)).toMatch(/No LAN IPv4 address/);
  });

  it('builds the QR join URL', () => {
    expect(joinUrl('http://192.168.1.23:5173', 'ABCD')).toBe(
      'http://192.168.1.23:5173/play?code=ABCD',
    );
  });

  it('detects loopback hosts (useless QR)', () => {
    for (const h of ['localhost', 'app.localhost', '127.0.0.1', '[::1]', '::1']) {
      expect(isLoopbackHost(h)).toBe(true);
    }
    for (const h of ['192.168.1.23', 'sunny.example.com', '10.0.0.52']) {
      expect(isLoopbackHost(h)).toBe(false);
    }
  });
});
