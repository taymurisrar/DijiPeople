import { analyzePackageExport } from './package-export-readiness';

/*
 * The point of this check is to fail before the download rather than after the
 * import, so the cases that matter are the ones where a package looks complete
 * and is not.
 */

describe('analyzePackageExport', () => {
  it('is ready when every dependency is carried in the package', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'table',
          objectKey: 'projects',
          moduleKey: 'projects',
        },
        {
          componentType: 'column',
          objectKey: 'projects.ownerId',
          dependencies: ['projects'],
        },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.componentCount).toBe(2);
  });

  it('blocks when a component depends on something the package does not carry', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'column',
          objectKey: 'projects.customerId',
          dependencies: ['customers'],
        },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      severity: 'error',
      componentKey: 'projects.customerId',
      missingKey: 'customers',
    });
  });

  it('treats a system module as present in the target and only warns', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'column',
          objectKey: 'projects.employeeId',
          dependencies: ['employees'],
        },
      ],
      systemKeys: ['employees'],
    });

    /* A warning must not block: system modules ship with the product. */
    expect(result.ready).toBe(true);
    expect(result.gaps[0].severity).toBe('warning');
    expect(result.gaps[0].message).toContain('employees');
  });

  it('accepts a dependency satisfied by moduleKey rather than objectKey', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'table',
          objectKey: 'tbl-1',
          moduleKey: 'projects',
        },
        {
          componentType: 'form',
          objectKey: 'projects.main',
          dependencies: ['projects'],
        },
      ],
    });

    expect(result.ready).toBe(true);
  });

  it('reports one gap per component and dependency, not one per repeat', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'form',
          objectKey: 'projects.main',
          dependencies: ['customers', 'customers', 'customers'],
        },
      ],
    });

    expect(result.gaps).toHaveLength(1);
  });

  it('still reports the same missing key for two different components', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'form',
          objectKey: 'projects.main',
          dependencies: ['customers'],
        },
        {
          componentType: 'view',
          objectKey: 'projects.active',
          dependencies: ['customers'],
        },
      ],
    });

    expect(result.gaps).toHaveLength(2);
  });

  it('lists errors before warnings so the blocking items read first', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'form',
          objectKey: 'a.form',
          dependencies: ['employees'],
        },
        {
          componentType: 'form',
          objectKey: 'b.form',
          dependencies: ['customers'],
        },
      ],
      systemKeys: ['employees'],
    });

    expect(result.gaps.map((gap) => gap.severity)).toEqual([
      'error',
      'warning',
    ]);
  });

  it('ignores blank dependency entries rather than reporting an empty gap', () => {
    const result = analyzePackageExport({
      components: [
        {
          componentType: 'form',
          objectKey: 'projects.main',
          dependencies: ['', '   '],
        },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.gaps).toEqual([]);
  });
});
