/**
 * Auth service — handles setup, login, and profile operations.
 * Uses bcryptjs for password hashing and Fastify JWT for token signing.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
// Check if any users exist — true means first-run setup is needed
export async function checkSetupStatus() {
    const count = await prisma.user.count();
    return { needsSetup: count === 0 };
}
// Create the initial organization + owner user, return JWT payload
export async function setup(orgName, fullName, email, password) {
    const existing = await prisma.user.count();
    if (existing > 0) {
        const err = new Error('Setup already completed');
        err.statusCode = 400;
        throw err;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: orgName } });
        // Tạo các nhóm quyền mặc định
        const ownerRole = await tx.role.create({
            data: {
                orgId: org.id, name: 'Chủ sở hữu', description: 'Quyền cao nhất, không thể chỉnh sửa hoặc xóa',
                permissions: { dataScope: 'all', chat: { view: true, create: true, edit: true, delete: true }, contacts: { view: true, create: true, edit: true, delete: true }, orders: { view: true, create: true, edit: true, delete: true }, appointments: { view: true, create: true, edit: true, delete: true }, settings: { view: true, create: true, edit: true, delete: true } },
                isSystem: true,
            },
        });
        const adminRole = await tx.role.create({
            data: {
                orgId: org.id, name: 'Quản trị viên', description: 'Quyền quản lý toàn bộ hệ thống',
                permissions: { dataScope: 'all', chat: { view: true, create: true, edit: true, delete: true }, contacts: { view: true, create: true, edit: true, delete: true }, orders: { view: true, create: true, edit: true, delete: true }, appointments: { view: true, create: true, edit: true, delete: true }, settings: { view: true, create: true, edit: true, delete: true } },
                isSystem: true,
            },
        });
        const memberRole = await tx.role.create({
            data: {
                orgId: org.id, name: 'Nhân viên', description: 'Quyền cơ bản, chỉ thấy dữ liệu được phân công',
                permissions: { dataScope: 'self', chat: { view: true, create: true, edit: true, delete: false }, contacts: { view: true, create: true, edit: true, delete: false }, orders: { view: true, create: true, edit: true, delete: false }, appointments: { view: true, create: true, edit: true, delete: false }, settings: { view: false, create: false, edit: false, delete: false } },
                isSystem: true,
            },
        });
        const user = await tx.user.create({
            data: {
                orgId: org.id,
                email: email.toLowerCase().trim(),
                passwordHash,
                fullName,
                role: 'owner',
                roleId: ownerRole.id, // Gán roleId cho owner
            },
        });
        return { org, user };
    });
    logger.info(`Setup complete — org=${result.org.id}, user=${result.user.id}`);
    return {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        orgId: result.org.id,
    };
}
// Verify credentials, return JWT payload
export async function login(email, password) {
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
    });
    if (!user || !user.isActive) {
        const err = new Error('Invalid email or password');
        err.statusCode = 401;
        throw err;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
        const err = new Error('Invalid email or password');
        err.statusCode = 401;
        throw err;
    }
    return { id: user.id, email: user.email, role: user.role, orgId: user.orgId };
}
// Return safe user profile (no password hash)
export async function getProfile(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            orgId: true,
            teamId: true,
            isActive: true,
            createdAt: true,
            org: { select: { id: true, name: true } },
        },
    });
    if (!user) {
        const err = new Error('User not found');
        err.statusCode = 404;
        throw err;
    }
    return user;
}
//# sourceMappingURL=auth-service.js.map