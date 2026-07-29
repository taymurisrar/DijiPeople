import { BadRequestException, Injectable } from '@nestjs/common';
import { PayComponentCalculationMethod, Prisma } from '@prisma/client';

const FUNCTIONS = new Set(['MIN', 'MAX', 'ROUND', 'CEIL', 'FLOOR']);
const VARIABLES = new Set([
  'BASIC',
  'BASIC_SALARY',
  'BASICSALARY',
  'BASE',
  'GROSS',
  'WORKING_DAYS',
  'CALENDAR_DAYS',
  'PAID_DAYS',
  'UNPAID_DAYS',
  'APPROVED_HOURS',
  'OVERTIME_HOURS',
]);

type Token =
  | { type: 'number'; value: string }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '%' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma'; value: ',' };

type OperatorTokenValue = Extract<Token, { type: 'operator' }>['value'];

export type FormulaComponentInput = {
  id: string;
  payComponentId: string;
  code: string;
  name?: string | null;
  calculationMethod: PayComponentCalculationMethod;
  fixedAmount?: Prisma.Decimal | string | number | null;
  percentage?: Prisma.Decimal | string | number | null;
  percentageBaseComponentId?: string | null;
  formulaExpression?: string | null;
  minimumAmount?: Prisma.Decimal | string | number | null;
  maximumAmount?: Prisma.Decimal | string | number | null;
  roundingMethod?: string | null;
};

export type FormulaContext = {
  basic?: Prisma.Decimal | string | number | null;
  gross?: Prisma.Decimal | string | number | null;
  workingDays?: Prisma.Decimal | string | number | null;
  calendarDays?: Prisma.Decimal | string | number | null;
  paidDays?: Prisma.Decimal | string | number | null;
  unpaidDays?: Prisma.Decimal | string | number | null;
  approvedHours?: Prisma.Decimal | string | number | null;
  overtimeHours?: Prisma.Decimal | string | number | null;
};

export type FormulaResolvedComponent = FormulaComponentInput & {
  calculatedAmount: Prisma.Decimal;
};

@Injectable()
export class CompensationFormulaService {
  validateFormula(expression: string, allowedComponentCodes: Iterable<string>) {
    parseExpression(expression, new Set(allowedComponentCodes));
  }

  resolveComponents(
    components: readonly FormulaComponentInput[],
    context: FormulaContext,
  ): FormulaResolvedComponent[] {
    const byReference = buildComponentReferenceMap(components);
    const values = new Map<string, Prisma.Decimal>();
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const variables = variableMap(context);

    const resolve = (component: FormulaComponentInput) => {
      const key = normalizeReference(component.code);
      if (values.has(key)) return values.get(key)!;
      if (visiting.has(key)) {
        throw new BadRequestException(
          `Circular formula dependency detected for ${component.code}.`,
        );
      }
      visiting.add(key);

      let amount = new Prisma.Decimal(0);
      if (component.calculationMethod === 'FIXED') {
        amount = decimal(component.fixedAmount);
      } else if (component.calculationMethod === 'PERCENTAGE') {
        amount = resolvePercentageBaseAmount(
          component,
          context,
          byReference,
          resolve,
        )
          .mul(decimal(component.percentage))
          .div(100);
      } else if (component.calculationMethod === 'FORMULA') {
        if (!component.formulaExpression?.trim()) {
          throw new BadRequestException(
            `Formula expression is required for ${component.code}.`,
          );
        }
        const ast = parseExpression(
          component.formulaExpression,
          byReference.keys(),
        );
        amount = evaluate(ast, {
          variables,
          componentValue(reference) {
            const referenced = byReference.get(normalizeReference(reference));
            if (!referenced) {
              throw new BadRequestException(
                `Unknown formula component reference ${reference}.`,
              );
            }
            return resolve(referenced);
          },
        });
      }

      amount = applyBounds(amount, component);
      amount = applyRounding(amount, component.roundingMethod);
      values.set(key, amount);
      visiting.delete(key);
      visited.add(key);
      return amount;
    };

    return components.map((component) => ({
      ...component,
      calculatedAmount: visited.has(normalizeReference(component.code))
        ? values.get(normalizeReference(component.code))!
        : resolve(component),
    }));
  }
}

type AstNode =
  | { type: 'number'; value: Prisma.Decimal }
  | { type: 'reference'; name: string }
  | { type: 'unary'; operator: '-'; value: AstNode }
  | {
      type: 'binary';
      operator: '+' | '-' | '*' | '/' | '%';
      left: AstNode;
      right: AstNode;
    }
  | { type: 'call'; name: string; args: AstNode[] };

function parseExpression(
  expression: string,
  allowedComponentCodes: Iterable<string>,
) {
  const allowedCodes = new Set(allowedComponentCodes);
  const parser = new Parser(
    tokenize(
      normalizePercentageLiterals(
        canonicalizeExpression(expression, allowedCodes),
      ),
    ),
    allowedCodes,
  );
  const ast = parser.parseExpression();
  parser.expectEnd();
  return ast;
}

class Parser {
  private index = 0;
  private readonly allowedCodes: Set<string>;

  constructor(
    private readonly tokens: Token[],
    allowedComponentCodes: Iterable<string>,
  ) {
    this.allowedCodes = new Set(
      Array.from(allowedComponentCodes, normalizeReference),
    );
  }

  parseExpression(): AstNode {
    return this.parseAdditive();
  }

  expectEnd() {
    if (this.peek()) {
      throw new BadRequestException(
        'Formula expression contains invalid syntax.',
      );
    }
  }

  private parseAdditive(): AstNode {
    let node = this.parseMultiplicative();
    while (this.matchOperator('+') || this.matchOperator('-')) {
      const operator = this.previous().value as '+' | '-';
      node = {
        type: 'binary',
        operator,
        left: node,
        right: this.parseMultiplicative(),
      };
    }
    return node;
  }

  private parseMultiplicative(): AstNode {
    let node = this.parseUnary();
    while (
      this.matchOperator('*') ||
      this.matchOperator('/') ||
      this.matchOperator('%')
    ) {
      const operator = this.previous().value as '*' | '/' | '%';
      node = {
        type: 'binary',
        operator,
        left: node,
        right: this.parseUnary(),
      };
    }
    return node;
  }

  private parseUnary(): AstNode {
    if (this.matchOperator('-')) {
      return { type: 'unary', operator: '-', value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const token = this.advance();
    if (!token)
      throw new BadRequestException('Formula expression is incomplete.');

    if (token.type === 'number') {
      return { type: 'number', value: new Prisma.Decimal(token.value) };
    }

    if (token.type === 'identifier') {
      const name = normalizeReference(token.value);
      if (this.matchParen('(')) {
        if (!FUNCTIONS.has(name)) {
          throw new BadRequestException(
            `Unsupported formula function ${name}.`,
          );
        }
        const args: AstNode[] = [];
        if (!this.matchParen(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.matchComma());
          this.consumeParen(')');
        }
        validateFunctionArity(name, args.length);
        return { type: 'call', name, args };
      }
      if (!VARIABLES.has(name) && !this.allowedCodes.has(name)) {
        throw new BadRequestException(
          `Unknown formula reference ${token.value}.`,
        );
      }
      return { type: 'reference', name };
    }

    if (token.type === 'paren' && token.value === '(') {
      const node = this.parseExpression();
      this.consumeParen(')');
      return node;
    }

    throw new BadRequestException(
      'Formula expression contains invalid syntax.',
    );
  }

  private matchOperator(value: OperatorTokenValue) {
    const token = this.peek();
    if (token?.type !== 'operator' || token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private matchParen(value: '(' | ')') {
    const token = this.peek();
    if (token?.type !== 'paren' || token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private consumeParen(value: '(' | ')') {
    if (!this.matchParen(value)) {
      throw new BadRequestException(`Formula expression expected "${value}".`);
    }
  }

  private matchComma() {
    const token = this.peek();
    if (token?.type !== 'comma') return false;
    this.index += 1;
    return true;
  }

  private advance() {
    const token = this.peek();
    if (token) this.index += 1;
    return token;
  }

  private previous() {
    return this.tokens[this.index - 1];
  }

  private peek() {
    return this.tokens[this.index];
  }
}

function tokenize(expression: string) {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const start = index;
      index += 1;
      while (/[0-9.]/.test(expression[index] ?? '')) index += 1;
      const value = expression.slice(start, index);
      if (!/^\d+(\.\d+)?$/.test(value)) {
        throw new BadRequestException(
          'Formula expression contains invalid number.',
        );
      }
      tokens.push({ type: 'number', value });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_]/.test(expression[index] ?? '')) index += 1;
      tokens.push({
        type: 'identifier',
        value: expression.slice(start, index),
      });
      continue;
    }
    if ('+-*/%'.includes(char)) {
      tokens.push({ type: 'operator', value: char as OperatorTokenValue });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: ',' });
      index += 1;
      continue;
    }
    throw new BadRequestException(
      'Formula expression contains unsupported tokens.',
    );
  }
  return tokens;
}

function evaluate(
  node: AstNode,
  context: {
    variables: Map<string, Prisma.Decimal>;
    componentValue: (reference: string) => Prisma.Decimal;
  },
): Prisma.Decimal {
  if (node.type === 'number') return node.value;
  if (node.type === 'reference') {
    return (
      context.variables.get(node.name) ?? context.componentValue(node.name)
    );
  }
  if (node.type === 'unary') return evaluate(node.value, context).neg();
  if (node.type === 'call') {
    const args = node.args.map((arg) => evaluate(arg, context));
    if (node.name === 'MIN') return Prisma.Decimal.min(...args);
    if (node.name === 'MAX') return Prisma.Decimal.max(...args);
    if (node.name === 'ROUND') {
      return args[0].toDecimalPlaces(args[1]?.toNumber() ?? 0);
    }
    if (node.name === 'CEIL') return args[0].ceil();
    if (node.name === 'FLOOR') return args[0].floor();
  }
  if (node.type !== 'binary') {
    throw new BadRequestException(
      'Formula expression contains invalid syntax.',
    );
  }
  const left = evaluate(node.left, context);
  const right = evaluate(node.right, context);
  if ((node.operator === '/' || node.operator === '%') && right.isZero()) {
    throw new BadRequestException('Formula division by zero is not allowed.');
  }
  if (node.operator === '+') return left.plus(right);
  if (node.operator === '-') return left.minus(right);
  if (node.operator === '*') return left.mul(right);
  if (node.operator === '/') return left.div(right);
  return left.mod(right);
}

function validateFunctionArity(name: string, count: number) {
  if ((name === 'MIN' || name === 'MAX') && count < 2) {
    throw new BadRequestException(`${name} requires at least two arguments.`);
  }
  if ((name === 'CEIL' || name === 'FLOOR') && count !== 1) {
    throw new BadRequestException(`${name} requires one argument.`);
  }
  if (name === 'ROUND' && (count < 1 || count > 2)) {
    throw new BadRequestException('ROUND requires one or two arguments.');
  }
}

function variableMap(context: FormulaContext) {
  return new Map([
    ['BASIC', decimal(context.basic)],
    ['BASIC_SALARY', decimal(context.basic)],
    ['BASICSALARY', decimal(context.basic)],
    ['BASE', decimal(context.basic)],
    ['GROSS', decimal(context.gross ?? context.basic)],
    ['WORKING_DAYS', decimal(context.workingDays)],
    ['CALENDAR_DAYS', decimal(context.calendarDays)],
    ['PAID_DAYS', decimal(context.paidDays)],
    ['UNPAID_DAYS', decimal(context.unpaidDays)],
    ['APPROVED_HOURS', decimal(context.approvedHours)],
    ['OVERTIME_HOURS', decimal(context.overtimeHours)],
  ]);
}

function decimal(value: Prisma.Decimal | string | number | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function resolvePercentageBaseAmount(
  component: FormulaComponentInput,
  context: FormulaContext,
  byReference: Map<string, FormulaComponentInput>,
  resolve: (component: FormulaComponentInput) => Prisma.Decimal,
) {
  if (!component.percentageBaseComponentId) {
    return decimal(context.basic);
  }
  const referenced = byReference.get(
    normalizeReference(component.percentageBaseComponentId),
  );
  return referenced ? resolve(referenced) : decimal(context.basic);
}

function applyBounds(
  value: Prisma.Decimal,
  component: Pick<FormulaComponentInput, 'minimumAmount' | 'maximumAmount'>,
) {
  let result = value;
  const minimum = component.minimumAmount;
  const maximum = component.maximumAmount;
  if (minimum !== null && minimum !== undefined && result.lt(minimum)) {
    result = new Prisma.Decimal(minimum);
  }
  if (maximum !== null && maximum !== undefined && result.gt(maximum)) {
    result = new Prisma.Decimal(maximum);
  }
  return result;
}

function applyRounding(value: Prisma.Decimal, method?: string | null) {
  const normalized = normalizeReference(method ?? 'NONE');
  if (normalized === 'CEIL' || normalized === 'UP') return value.ceil();
  if (normalized === 'FLOOR' || normalized === 'DOWN') return value.floor();
  if (normalized === 'ROUND' || normalized === 'NEAREST') {
    return value.toDecimalPlaces(0);
  }
  return value.toDecimalPlaces(2);
}

function normalizeReference(value: string) {
  return value.trim().toUpperCase();
}

function buildComponentReferenceMap(
  components: readonly FormulaComponentInput[],
) {
  const map = new Map<string, FormulaComponentInput>();
  for (const component of components) {
    for (const alias of componentAliases(component)) {
      if (!alias || map.has(alias)) continue;
      map.set(alias, component);
    }
  }
  return map;
}

function componentAliases(component: FormulaComponentInput) {
  return [
    component.id,
    component.payComponentId,
    component.code,
    component.name,
    stripGeneratedCodeSuffix(component.code),
  ].flatMap((value) => referenceAliases(value));
}

function referenceAliases(value: string | null | undefined) {
  if (!value?.trim()) return [];
  const normalized = normalizeReference(value);
  const compact = compactReference(value);
  return normalized === compact ? [normalized] : [normalized, compact];
}

function stripGeneratedCodeSuffix(value: string | null | undefined) {
  return value?.replace(/_[A-Z0-9]{6}$/i, '');
}

function compactReference(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/_/g, '');
}

function canonicalizeExpression(
  expression: string,
  allowedReferences: ReadonlySet<string>,
) {
  let result = expression.replace(
    /\{([^{}]+)\}/g,
    (_match, reference: string) => compactReference(reference),
  );
  const displayReferences = Array.from(allowedReferences)
    .filter((reference) => /[^A-Z0-9_]/i.test(reference))
    .sort((left, right) => right.length - left.length);

  for (const reference of displayReferences) {
    const token = compactReference(reference);
    if (!token) continue;
    const pattern = escapeRegExp(reference).replace(/\\ /g, '\\s+');
    result = result.replace(
      new RegExp(`(^|[^A-Za-z0-9_])(${pattern})(?=$|[^A-Za-z0-9_])`, 'gi'),
      (_match, prefix: string) => `${prefix}${token}`,
    );
  }
  return result;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePercentageLiterals(expression: string) {
  return expression.replace(
    /(\d+(?:\.\d+)?)\s*%/g,
    (_match, value: string) => `(${value} / 100)`,
  );
}
