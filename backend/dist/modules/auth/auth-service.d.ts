export interface JwtPayload {
    id: string;
    email: string;
    role: string;
    orgId: string;
}
export declare function checkSetupStatus(): Promise<{
    needsSetup: boolean;
}>;
export declare function setup(orgName: string, fullName: string, email: string, password: string): Promise<JwtPayload>;
export declare function login(email: string, password: string): Promise<JwtPayload>;
export declare function getProfile(userId: string): Promise<any>;
//# sourceMappingURL=auth-service.d.ts.map