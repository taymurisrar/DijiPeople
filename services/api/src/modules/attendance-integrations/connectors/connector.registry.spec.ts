import { NotFoundException } from '@nestjs/common';
import { AttendanceProvider } from '@prisma/client';

import { AttendanceConnectorRegistry } from './connector.registry';
import { ATTENDANCE_CONNECTOR_CAPABILITIES } from './connector.types';

describe('AttendanceConnectorRegistry', () => {
  let registry: AttendanceConnectorRegistry;

  beforeEach(() => {
    registry = new AttendanceConnectorRegistry();
  });

  describe('lookup', () => {
    it('resolves the ZKTeco legacy connector by its stored connector type', () => {
      const definition = registry.require('zkteco-legacy-tcp');

      expect(definition.provider).toBe(AttendanceProvider.ZKTECO);
      expect(definition.connectionMode).toBe('LOCAL_GATEWAY');
      expect(definition.requiresGateway).toBe(true);
    });

    it('throws a NotFoundException for an unknown connector', () => {
      expect(() => registry.require('does-not-exist')).toThrow(
        NotFoundException,
      );
    });

    it('filters by provider', () => {
      expect(registry.listByProvider(AttendanceProvider.ZKTECO)).toHaveLength(
        1,
      );
      expect(registry.listByProvider(AttendanceProvider.SUPREMA)).toHaveLength(
        0,
      );
    });
  });

  describe('capabilities', () => {
    it('reports the capabilities proven against the physical K50', () => {
      expect(registry.supports('zkteco-legacy-tcp', 'READ_USERS')).toBe(true);
      expect(registry.supports('zkteco-legacy-tcp', 'READ_ATTENDANCE')).toBe(
        true,
      );
      expect(registry.supports('zkteco-legacy-tcp', 'POLL_EVENTS')).toBe(true);
    });

    it('does not claim capabilities the device family lacks', () => {
      // The installed SDK exposes neither ReadTimeGLogData nor ReadNewGLogData,
      // so there is no push/realtime path for this connector.
      expect(registry.supports('zkteco-legacy-tcp', 'REALTIME_EVENTS')).toBe(
        false,
      );
      expect(registry.supports('zkteco-legacy-tcp', 'CLOUD_DIRECT')).toBe(
        false,
      );
      expect(registry.supports('zkteco-legacy-tcp', 'DELETE_USERS')).toBe(
        false,
      );
    });

    it('exposes no biometric capability anywhere in the contract', () => {
      const biometricish = ATTENDANCE_CONNECTOR_CAPABILITIES.filter((flag) =>
        /BIOMETRIC|TEMPLATE|FINGERPRINT|FACE|ENROL/i.test(flag),
      );
      expect(biometricish).toEqual([]);
    });

    it('treats the unproven write path as experimental, so automation skips it', () => {
      // Declared, so the UI can show it...
      expect(registry.supports('zkteco-legacy-tcp', 'WRITE_USERS')).toBe(true);
      expect(registry.isExperimental('zkteco-legacy-tcp', 'WRITE_USERS')).toBe(
        true,
      );
      // ...but automatic provisioning must not use it until Phase 2 validates it.
      expect(
        registry.supportsAutomatically('zkteco-legacy-tcp', 'WRITE_USERS'),
      ).toBe(false);
    });

    it('allows automation for capabilities that were actually validated', () => {
      expect(
        registry.supportsAutomatically('zkteco-legacy-tcp', 'READ_ATTENDANCE'),
      ).toBe(true);
    });

    it('reports false rather than throwing for unknown connectors', () => {
      expect(registry.supports('nope', 'READ_USERS')).toBe(false);
      expect(registry.supportsAutomatically('nope', 'READ_USERS')).toBe(false);
    });
  });

  describe('poll interval floor', () => {
    it('clamps an interval below the connector minimum', () => {
      const result = registry.clampPollIntervalMinutes('zkteco-legacy-tcp', 1);

      expect(result.clamped).toBe(true);
      expect(result.minutes).toBe(15);
      expect(result.minimumMinutes).toBe(15);
    });

    it('leaves an acceptable interval untouched', () => {
      const result = registry.clampPollIntervalMinutes('zkteco-legacy-tcp', 60);

      expect(result.clamped).toBe(false);
      expect(result.minutes).toBe(60);
    });

    it('recommends 30 minutes for the legacy connector', () => {
      const definition = registry.require('zkteco-legacy-tcp');

      expect(definition.recommendedSyncPolicy.recommendedIntervalValue).toBe(
        30,
      );
      expect(definition.recommendedSyncPolicy.recommendedIntervalUnit).toBe(
        'MINUTES',
      );
    });
  });

  describe('configuration partitioning', () => {
    it('routes the comm key to the secret bucket and nothing else', () => {
      expect(registry.secretKeys('zkteco-legacy-tcp')).toEqual(['commKey']);

      const { plain, secret } = registry.partitionConfiguration(
        'zkteco-legacy-tcp',
        {
          host: '192.168.18.53',
          port: 4370,
          machineNumber: 1,
          commKey: 123456,
          expectedSerialNumber: 'A2QO221160250',
        },
      );

      expect(secret).toEqual({ commKey: 123456 });
      expect(plain).toEqual({
        host: '192.168.18.53',
        port: 4370,
        machineNumber: 1,
        expectedSerialNumber: 'A2QO221160250',
      });
      // The readable column must never carry the secret.
      expect(plain).not.toHaveProperty('commKey');
    });

    it('declares every required connection field the K50 needs', () => {
      const keys = registry
        .require('zkteco-legacy-tcp')
        .configurationSchema.fields.map((field) => field.key);

      expect(keys).toEqual(
        expect.arrayContaining([
          'host',
          'port',
          'machineNumber',
          'commKey',
          'expectedSerialNumber',
          'timezone',
        ]),
      );
    });
  });
});
