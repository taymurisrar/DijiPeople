import { BadRequestException } from '@nestjs/common';

import { ConnectorConfigurationValidator } from './connector-configuration.validator';
import { AttendanceConnectorRegistry } from './connector.registry';

describe('ConnectorConfigurationValidator', () => {
  let validator: ConnectorConfigurationValidator;

  beforeEach(() => {
    validator = new ConnectorConfigurationValidator(
      new AttendanceConnectorRegistry(),
    );
  });

  const validZkteco = {
    host: '192.168.18.53',
    port: 4370,
    machineNumber: 1,
    commKey: 0,
  };

  describe('schema validation', () => {
    it('accepts a valid ZKTeco configuration and separates the secret', () => {
      const result = validator.validate('zkteco-legacy-tcp', validZkteco);

      expect(result.plain).toEqual({
        host: '192.168.18.53',
        port: 4370,
        machineNumber: 1,
      });
      expect(result.secret).toEqual({ commKey: 0 });
      // The secret must never reach the readable column.
      expect(result.plain).not.toHaveProperty('commKey');
    });

    it('rejects a missing required field', () => {
      expect(() =>
        validator.validate('zkteco-legacy-tcp', {
          port: 4370,
          machineNumber: 1,
        }),
      ).toThrow(BadRequestException);
    });

    it('reports every offending field at once rather than only the first', () => {
      try {
        validator.validate('zkteco-legacy-tcp', {
          port: 99999,
          machineNumber: 900,
        });
        fail('expected validation to throw');
      } catch (error) {
        const response = (error as BadRequestException).getResponse() as {
          errors: Array<{ field: string }>;
        };
        const fields = response.errors.map((issue) => issue.field);
        expect(fields).toEqual(
          expect.arrayContaining(['host', 'port', 'machineNumber']),
        );
      }
    });

    it('rejects an out-of-range port', () => {
      expect(() =>
        validator.validate('zkteco-legacy-tcp', {
          ...validZkteco,
          port: 70000,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects unknown settings instead of silently storing them', () => {
      expect(() =>
        validator.validate('zkteco-legacy-tcp', {
          ...validZkteco,
          sneakyField: 'value',
        }),
      ).toThrow(BadRequestException);
    });

    it('treats an optional blank field as absent', () => {
      const result = validator.validate('zkteco-legacy-tcp', {
        ...validZkteco,
        expectedSerialNumber: '   ',
      });
      expect(result.plain).not.toHaveProperty('expectedSerialNumber');
    });
  });

  describe('poll interval floor', () => {
    it('rejects an interval below the connector minimum with an actionable message', () => {
      expect(() =>
        validator.validatePollIntervalMinutes('zkteco-legacy-tcp', 5),
      ).toThrow(
        /Minimum supported interval for ZKTeco Legacy Terminal is 15 minutes/,
      );
    });

    it('accepts the minimum and above', () => {
      expect(
        validator.validatePollIntervalMinutes('zkteco-legacy-tcp', 15),
      ).toBe(15);
      expect(
        validator.validatePollIntervalMinutes('zkteco-legacy-tcp', 60),
      ).toBe(60);
    });

    it('rejects a non-positive interval', () => {
      expect(() =>
        validator.validatePollIntervalMinutes('zkteco-legacy-tcp', 0),
      ).toThrow(BadRequestException);
    });
  });

  describe('secret masking', () => {
    it('reports presence without revealing the value', () => {
      const described = validator.describeSecrets('zkteco-legacy-tcp', {
        commKey: 987654,
      });

      expect(described.commKey.configured).toBe(true);
      expect(described.commKey.masked).toBe('••••••');
      // The mask must not encode the real value in any way.
      expect(described.commKey.masked).not.toContain('9');
      expect(JSON.stringify(described)).not.toContain('987654');
    });

    it('reports an unset secret as not configured', () => {
      const described = validator.describeSecrets('zkteco-legacy-tcp', {});
      expect(described.commKey).toEqual({ configured: false, masked: null });
    });

    it('describes only secret fields', () => {
      const described = validator.describeSecrets('zkteco-legacy-tcp', {
        commKey: 1,
      });
      expect(Object.keys(described)).toEqual(['commKey']);
    });
  });
});
