"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = require("dotenv");
var node_path_1 = require("node:path");
var client_1 = require("@prisma/client");
var bcrypt = require("bcryptjs");
var email_util_1 = require("../src/common/utils/email.util");
(0, dotenv_1.config)({ path: (0, node_path_1.resolve)(__dirname, '../.env') });
(0, dotenv_1.config)();
var prisma = new client_1.PrismaClient();
function getBootstrapConfig() {
    var _a, _b, _c, _d, _e, _f, _g;
    var tenantName = ((_a = process.env.BOOTSTRAP_TENANT_NAME) === null || _a === void 0 ? void 0 : _a.trim()) || 'DijiPeople Demo';
    var tenantSlug = ((_b = process.env.BOOTSTRAP_TENANT_SLUG) === null || _b === void 0 ? void 0 : _b.trim().toLowerCase()) ||
        'dijipeople-demo';
    var roleName = ((_c = process.env.BOOTSTRAP_ADMIN_ROLE_NAME) === null || _c === void 0 ? void 0 : _c.trim()) || 'System Admin';
    var roleKey = ((_d = process.env.BOOTSTRAP_ADMIN_ROLE_KEY) === null || _d === void 0 ? void 0 : _d.trim().toLowerCase()) ||
        'system-admin';
    var firstName = ((_e = process.env.BOOTSTRAP_ADMIN_FIRST_NAME) === null || _e === void 0 ? void 0 : _e.trim()) || 'Taimur';
    var lastName = ((_f = process.env.BOOTSTRAP_ADMIN_LAST_NAME) === null || _f === void 0 ? void 0 : _f.trim()) || 'Israr';
    var email = (0, email_util_1.normalizeEmail)(process.env.BOOTSTRAP_ADMIN_EMAIL || 'taimur@example.com');
    var plainPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@12345';
    if (!((_g = process.env.DATABASE_URL) === null || _g === void 0 ? void 0 : _g.trim())) {
        throw new Error('DATABASE_URL is required. Set it to your Neon Postgres connection string.');
    }
    if (!plainPassword.trim() || plainPassword.length < 8) {
        throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters long.');
    }
    return {
        tenantName: tenantName,
        tenantSlug: tenantSlug,
        roleName: roleName,
        roleKey: roleKey,
        firstName: firstName,
        lastName: lastName,
        email: email,
        plainPassword: plainPassword,
        usingDefaultPassword: !process.env.BOOTSTRAP_ADMIN_PASSWORD,
    };
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var config, passwordHash, result;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = getBootstrapConfig();
                    return [4 /*yield*/, bcrypt.hash(config.plainPassword, 10)];
                case 1:
                    passwordHash = _a.sent();
                    return [4 /*yield*/, prisma.$transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var existingTenant, tenant, existingRole, role, existingUser, user, existingUserRole;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, tx.tenant.findUnique({
                                            where: { slug: config.tenantSlug },
                                            select: { id: true },
                                        })];
                                    case 1:
                                        existingTenant = _a.sent();
                                        return [4 /*yield*/, tx.tenant.upsert({
                                                where: { slug: config.tenantSlug },
                                                update: {
                                                    name: config.tenantName,
                                                    status: client_1.TenantStatus.ACTIVE,
                                                },
                                                create: {
                                                    name: config.tenantName,
                                                    slug: config.tenantSlug,
                                                    status: client_1.TenantStatus.ACTIVE,
                                                },
                                            })];
                                    case 2:
                                        tenant = _a.sent();
                                        return [4 /*yield*/, tx.role.findUnique({
                                                where: {
                                                    tenantId_key: {
                                                        tenantId: tenant.id,
                                                        key: config.roleKey,
                                                    },
                                                },
                                                select: { id: true },
                                            })];
                                    case 3:
                                        existingRole = _a.sent();
                                        return [4 /*yield*/, tx.role.upsert({
                                                where: {
                                                    tenantId_key: {
                                                        tenantId: tenant.id,
                                                        key: config.roleKey,
                                                    },
                                                },
                                                update: {
                                                    name: config.roleName,
                                                    description: 'Bootstrap administrator role',
                                                    isSystem: true,
                                                },
                                                create: {
                                                    tenantId: tenant.id,
                                                    name: config.roleName,
                                                    key: config.roleKey,
                                                    description: 'Bootstrap administrator role',
                                                    isSystem: true,
                                                },
                                            })];
                                    case 4:
                                        role = _a.sent();
                                        return [4 /*yield*/, tx.user.findUnique({
                                                where: { email: config.email },
                                                select: { id: true },
                                            })];
                                    case 5:
                                        existingUser = _a.sent();
                                        return [4 /*yield*/, tx.user.upsert({
                                                where: { email: config.email },
                                                update: {
                                                    tenantId: tenant.id,
                                                    firstName: config.firstName,
                                                    lastName: config.lastName,
                                                    passwordHash: passwordHash,
                                                    status: client_1.UserStatus.ACTIVE,
                                                    isServiceAccount: false,
                                                },
                                                create: {
                                                    tenantId: tenant.id,
                                                    firstName: config.firstName,
                                                    lastName: config.lastName,
                                                    email: config.email,
                                                    passwordHash: passwordHash,
                                                    status: client_1.UserStatus.ACTIVE,
                                                    isServiceAccount: false,
                                                },
                                            })];
                                    case 6:
                                        user = _a.sent();
                                        return [4 /*yield*/, tx.userRole.findUnique({
                                                where: {
                                                    userId_roleId: {
                                                        userId: user.id,
                                                        roleId: role.id,
                                                    },
                                                },
                                                select: { id: true },
                                            })];
                                    case 7:
                                        existingUserRole = _a.sent();
                                        if (!!existingUserRole) return [3 /*break*/, 9];
                                        return [4 /*yield*/, tx.userRole.create({
                                                data: {
                                                    tenantId: tenant.id,
                                                    userId: user.id,
                                                    roleId: role.id,
                                                },
                                            })];
                                    case 8:
                                        _a.sent();
                                        _a.label = 9;
                                    case 9: return [2 /*return*/, {
                                            tenantId: tenant.id,
                                            roleId: role.id,
                                            userId: user.id,
                                            email: config.email,
                                            actions: {
                                                tenant: existingTenant ? 'updated' : 'created',
                                                role: existingRole ? 'updated' : 'created',
                                                user: existingUser ? 'updated' : 'created',
                                                userRole: existingUserRole ? 'reused' : 'created',
                                            },
                                            usingDefaultPassword: config.usingDefaultPassword,
                                        }];
                                }
                            });
                        }); })];
                case 2:
                    result = _a.sent();
                    console.log('Bootstrap admin seed completed successfully.');
                    console.log(JSON.stringify(result, null, 2));
                    if (result.usingDefaultPassword) {
                        console.warn('Warning: default bootstrap password is in use. Set BOOTSTRAP_ADMIN_PASSWORD and re-run immediately in production.');
                    }
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (error) {
    if (error instanceof Error) {
        console.error("Bootstrap admin seed failed: ".concat(error.message));
        if (error.stack) {
            console.error(error.stack);
        }
    }
    else {
        console.error('Bootstrap admin seed failed with an unknown error.');
        console.error(error);
    }
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
